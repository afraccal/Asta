"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  useSyncExternalStore,
} from "react";
import type { RemoteAudioTrack, RemoteTrack, Room, RoomEvent } from "livekit-client";
import {
  raccogliTracce, type PartecipanteLocale, type PartecipanteRemoto,
} from "@/lib/videoTracks";

/**
 * La videochiamata (§13).
 *
 * Vive completamente a parte dall'asta: non conosce offerte, crediti o timer,
 * e nessun componente dell'asta dipende da lei. Se le chiavi non sono
 * configurate, se la rete la rifiuta o se il servizio cade, qui dentro si
 * spegne una luce e basta: l'asta continua.
 *
 * L'audio richiede due attenzioni che il video non ha:
 *
 * 1. va riprodotto in elementi <audio> propri. Un <video> con l'attributo
 *    muted (necessario per il proprio riquadro, altrimenti si sente la
 *    propria voce in ritardo) non riprodurrebbe nulla;
 * 2. i browser bloccano la riproduzione automatica finche' non c'e' stata
 *    un'interazione. Se succede lo si dice e si offre un pulsante, invece di
 *    restare in silenzio senza spiegazione.
 *
 * La libreria viene caricata solo quando qualcuno entra davvero in
 * videochiamata: un'asta senza video non paga il peso di un SDK che non usa.
 */

export type StatoVideo = "spento" | "connessione" | "acceso" | "errore";

interface Contesto {
  stato: StatoVideo;
  errore: string | null;
  micAcceso: boolean;
  camAccesa: boolean;
  /** Il browser sta bloccando la riproduzione dell'audio in arrivo. */
  audioBloccato: boolean;
  entra: () => Promise<void>;
  esci: () => Promise<void>;
  alternaMic: () => Promise<void>;
  alternaCam: () => Promise<void>;
  sbloccaAudio: () => Promise<void>;
  /** Traccia video di un partecipante, per identita' (= id del profilo). */
  traccia: (identita: string) => MediaStreamTrack | null;
  /** Chi ha il microfono acceso, per identita'. */
  microfonoAperto: (identita: string) => boolean;
  collegati: number;
}

const VideoContext = createContext<Contesto | null>(null);

export function useVideo(): Contesto | null {
  return useContext(VideoContext);
}

/** Emettitore minimo per "chi sta parlando": evita di ridisegnare la sala. */
class SegnaleParlanti {
  private ascoltatori = new Set<() => void>();
  private insieme: ReadonlySet<string> = new Set();

  sottoscrivi = (fn: () => void) => {
    this.ascoltatori.add(fn);
    return () => this.ascoltatori.delete(fn);
  };
  leggi = () => this.insieme;
  aggiorna(nuovo: Set<string>) {
    this.insieme = nuovo;
    this.ascoltatori.forEach((fn) => fn());
  }
}

const parlanti = new SegnaleParlanti();
const INSIEME_VUOTO: ReadonlySet<string> = new Set();

/**
 * Solo i riquadri video si ridisegnano quando cambia chi parla: il palco e i
 * numeri dell'asta restano fermi.
 */
export function useStaParlando(identita: string): boolean {
  const insieme = useSyncExternalStore(
    parlanti.sottoscrivi,
    parlanti.leggi,
    () => INSIEME_VUOTO,
  );
  return insieme.has(identita);
}

/**
 * Riproduce la voce di un partecipante.
 *
 * Si usa attach() della libreria e non un <audio> costruito a mano: gestisce
 * da sola i capricci dei browser sulla riproduzione automatica e il riaggancio
 * quando la traccia cambia.
 */
function VoceRemota({ track }: { track: RemoteAudioTrack }) {
  const contenitore = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodo = contenitore.current;
    if (!nodo) return;
    const elemento = track.attach();
    elemento.style.display = "none";
    nodo.appendChild(elemento);
    return () => {
      track.detach(elemento);
      elemento.remove();
    };
  }, [track]);

  return <div ref={contenitore} aria-hidden />;
}

export function VideoProvider({
  auctionId,
  children,
}: {
  auctionId: string;
  children: React.ReactNode;
}) {
  const [stato, setStato] = useState<StatoVideo>("spento");
  const [errore, setErrore] = useState<string | null>(null);
  const [micAcceso, setMicAcceso] = useState(false);
  const [camAccesa, setCamAccesa] = useState(false);
  const [audioBloccato, setAudioBloccato] = useState(false);
  const [collegati, setCollegati] = useState(0);
  const [tracce, setTracce] = useState<Map<string, MediaStreamTrack>>(new Map());
  const [voci, setVoci] = useState<Map<string, RemoteAudioTrack>>(new Map());
  const [microfoni, setMicrofoni] = useState<Set<string>>(new Set());

  const roomRef = useRef<Room | null>(null);

  const aggiornaTracce = useCallback((room: Room) => {
    // La regola sta in lib/videoTracks.ts, dove si puo' verificare: e' il
    // punto in cui avevo dimenticato l'audio.
    const { video, voci: audio, microfoniAperti } = raccogliTracce<RemoteAudioTrack>(
      room.remoteParticipants.values() as unknown as Iterable<
        PartecipanteRemoto<RemoteAudioTrack>
      >,
      room.localParticipant as unknown as PartecipanteLocale,
    );

    setTracce(video);
    setVoci(audio);
    setMicrofoni(microfoniAperti);
    setCollegati(room.remoteParticipants.size + 1);
  }, []);

  const entra = useCallback(async () => {
    if (roomRef.current) return;
    setStato("connessione");
    setErrore(null);

    try {
      const risposta = await fetch("/api/video/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auctionId }),
      });

      if (risposta.status === 503) throw new Error("La videochiamata non è configurata.");
      if (!risposta.ok) throw new Error("Permesso negato per la videochiamata.");
      const { url, token } = (await risposta.json()) as { url: string; token: string };

      const lk = await import("livekit-client");
      const room = new lk.Room({ adaptiveStream: true, dynacast: true });

      const eventi = lk.RoomEvent as typeof RoomEvent;
      const ricalcola = () => aggiornaTracce(room);

      room
        .on(eventi.TrackSubscribed, ricalcola)
        .on(eventi.TrackUnsubscribed, (t: RemoteTrack) => {
          t.detach();
          ricalcola();
        })
        .on(eventi.TrackMuted, ricalcola)
        .on(eventi.TrackUnmuted, ricalcola)
        .on(eventi.LocalTrackPublished, ricalcola)
        .on(eventi.LocalTrackUnpublished, ricalcola)
        .on(eventi.ParticipantConnected, ricalcola)
        .on(eventi.ParticipantDisconnected, ricalcola)
        .on(eventi.ActiveSpeakersChanged, (attivi) => {
          parlanti.aggiorna(new Set(attivi.map((p) => p.identity)));
        })
        // Il browser puo' rifiutare di far partire l'audio da solo: qui lo si
        // scopre, invece di restare in silenzio senza sapere perche'.
        .on(eventi.AudioPlaybackStatusChanged, () => {
          setAudioBloccato(!room.canPlaybackAudio);
        })
        .on(eventi.Disconnected, () => {
          roomRef.current = null;
          setStato("spento");
          setMicAcceso(false);
          setCamAccesa(false);
          setAudioBloccato(false);
          setTracce(new Map());
          setVoci(new Map());
          setMicrofoni(new Set());
          setCollegati(0);
          parlanti.aggiorna(new Set());
        });

      await room.connect(url, token);
      roomRef.current = room;
      setStato("acceso");

      // Si entra con la telecamera accesa e il microfono spento: nessuno viene
      // ascoltato senza averlo chiesto.
      await room.localParticipant.setCameraEnabled(true).catch(() => undefined);
      setCamAccesa(room.localParticipant.isCameraEnabled);
      setAudioBloccato(!room.canPlaybackAudio);
      ricalcola();
    } catch (e) {
      roomRef.current = null;
      setStato("errore");
      setErrore(e instanceof Error ? e.message : "Videochiamata non disponibile.");
    }
  }, [auctionId, aggiornaTracce]);

  const esci = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    setStato("spento");
    setMicAcceso(false);
    setCamAccesa(false);
    setAudioBloccato(false);
    setTracce(new Map());
    setVoci(new Map());
    setMicrofoni(new Set());
    setCollegati(0);
    parlanti.aggiorna(new Set());
    await room?.disconnect().catch(() => undefined);
  }, []);

  const alternaMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const acceso = !room.localParticipant.isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(acceso);
      setErrore(null);
    } catch {
      // Il permesso negato va detto: prima veniva ingoiato in silenzio e il
      // microfono restava spento senza spiegazione.
      setErrore("Il browser non concede il microfono. Controlla i permessi del sito.");
    }
    setMicAcceso(room.localParticipant.isMicrophoneEnabled);
    aggiornaTracce(room);
  }, [aggiornaTracce]);

  const alternaCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const accesa = !room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(accesa);
      setErrore(null);
    } catch {
      setErrore("Il browser non concede la telecamera. Controlla i permessi del sito.");
    }
    setCamAccesa(room.localParticipant.isCameraEnabled);
    aggiornaTracce(room);
  }, [aggiornaTracce]);

  const sbloccaAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.startAudio().catch(() => undefined);
    setAudioBloccato(!room.canPlaybackAudio);
  }, []);

  // Uscendo dalla sala si chiude anche la videochiamata: una scheda chiusa non
  // deve lasciare una telecamera accesa.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect().catch(() => undefined);
      roomRef.current = null;
    };
  }, []);

  const traccia = useCallback(
    (identita: string) => tracce.get(identita) ?? null,
    [tracce],
  );
  const microfonoAperto = useCallback(
    (identita: string) => microfoni.has(identita),
    [microfoni],
  );

  const valore = useMemo<Contesto>(
    () => ({
      stato, errore, micAcceso, camAccesa, audioBloccato, collegati,
      entra, esci, alternaMic, alternaCam, sbloccaAudio, traccia, microfonoAperto,
    }),
    [stato, errore, micAcceso, camAccesa, audioBloccato, collegati,
     entra, esci, alternaMic, alternaCam, sbloccaAudio, traccia, microfonoAperto],
  );

  return (
    <VideoContext.Provider value={valore}>
      {children}
      {/* Le voci in arrivo. Fuori dal flusso della pagina: non si vedono,
          si sentono. */}
      {[...voci].map(([identita, track]) => (
        <VoceRemota key={identita} track={track} />
      ))}
    </VideoContext.Provider>
  );
}
