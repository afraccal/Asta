"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  useSyncExternalStore,
} from "react";
import type { LocalParticipant, RemoteTrack, Room, RoomEvent } from "livekit-client";

/**
 * La videochiamata (§13).
 *
 * Vive completamente a parte dall'asta: non conosce offerte, crediti o timer,
 * e nessun componente dell'asta dipende da lei. Se le chiavi non sono
 * configurate, se la rete la rifiuta o se il servizio cade, qui dentro si
 * spegne una luce e basta: l'asta continua.
 *
 * La libreria viene caricata solo quando qualcuno entra davvero in
 * videochiamata, non all'apertura della sala: un'asta senza video non deve
 * pagare il peso di un SDK che non usa.
 */

export type StatoVideo = "spento" | "connessione" | "acceso" | "errore";

interface Contesto {
  stato: StatoVideo;
  errore: string | null;
  micAcceso: boolean;
  camAccesa: boolean;
  entra: () => Promise<void>;
  esci: () => Promise<void>;
  alternaMic: () => Promise<void>;
  alternaCam: () => Promise<void>;
  /** Traccia video di un partecipante, per identita' (= id del profilo). */
  traccia: (identita: string) => MediaStreamTrack | null;
  /** Numero di persone collegate al video, incluso chi guarda. */
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
  const [collegati, setCollegati] = useState(0);
  const [tracce, setTracce] = useState<Map<string, MediaStreamTrack>>(new Map());

  const roomRef = useRef<Room | null>(null);

  const aggiornaTracce = useCallback((room: Room) => {
    const mappa = new Map<string, MediaStreamTrack>();
    room.remoteParticipants.forEach((p) => {
      p.videoTrackPublications.forEach((pub) => {
        if (pub.track?.mediaStreamTrack) mappa.set(p.identity, pub.track.mediaStreamTrack);
      });
    });
    const locale: LocalParticipant = room.localParticipant;
    locale.videoTrackPublications.forEach((pub) => {
      if (pub.track?.mediaStreamTrack) mappa.set(locale.identity, pub.track.mediaStreamTrack);
    });
    setTracce(mappa);
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

      // Caricata solo adesso: chi non usa il video non se la porta dietro.
      const lk = await import("livekit-client");
      const room = new lk.Room({
        adaptiveStream: true, // riduce la qualita' dei riquadri piccoli
        dynacast: true, // smette di inviare cio' che nessuno guarda
      });

      const eventi = lk.RoomEvent as typeof RoomEvent;
      const ricalcola = () => aggiornaTracce(room);

      room
        .on(eventi.TrackSubscribed, ricalcola)
        .on(eventi.TrackUnsubscribed, (t: RemoteTrack) => {
          t.detach();
          ricalcola();
        })
        .on(eventi.LocalTrackPublished, ricalcola)
        .on(eventi.LocalTrackUnpublished, ricalcola)
        .on(eventi.ParticipantConnected, ricalcola)
        .on(eventi.ParticipantDisconnected, ricalcola)
        .on(eventi.ActiveSpeakersChanged, (attivi) => {
          parlanti.aggiorna(new Set(attivi.map((p) => p.identity)));
        })
        .on(eventi.Disconnected, () => {
          roomRef.current = null;
          setStato("spento");
          setMicAcceso(false);
          setCamAccesa(false);
          setTracce(new Map());
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
    setTracce(new Map());
    setCollegati(0);
    parlanti.aggiorna(new Set());
    await room?.disconnect().catch(() => undefined);
  }, []);

  const alternaMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const acceso = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(acceso).catch(() => undefined);
    setMicAcceso(room.localParticipant.isMicrophoneEnabled);
  }, []);

  const alternaCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const accesa = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(accesa).catch(() => undefined);
    setCamAccesa(room.localParticipant.isCameraEnabled);
    aggiornaTracce(room);
  }, [aggiornaTracce]);

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

  const valore = useMemo<Contesto>(
    () => ({
      stato, errore, micAcceso, camAccesa, collegati,
      entra, esci, alternaMic, alternaCam, traccia,
    }),
    [stato, errore, micAcceso, camAccesa, collegati, entra, esci, alternaMic, alternaCam, traccia],
  );

  return <VideoContext.Provider value={valore}>{children}</VideoContext.Provider>;
}
