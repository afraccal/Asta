"use client";

import {
  VideoCamera, VideoCameraSlash, Microphone, MicrophoneSlash, PhoneX, SpeakerSimpleX,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useVideo } from "@/components/video/VideoProvider";

const BOTTONE =
  "flex size-8 items-center justify-center rounded-[var(--radius-inner)] transition";

/**
 * Comandi della videochiamata, nell'intestazione della sala.
 *
 * Si entra a telecamera accesa e microfono spento: nessuno viene ascoltato
 * senza averlo chiesto. Se il video non e' configurato o fallisce, questi
 * comandi spariscono senza rumore.
 */
export function VideoControls() {
  const video = useVideo();
  if (!video) return null;

  const { stato, errore, micAcceso, camAccesa, audioBloccato, collegati } = video;

  if (stato === "spento" || stato === "errore") {
    return (
      <div className="flex items-center gap-2">
        {/* Sempre visibile, anche su telefono: nascondere la spiegazione
            sotto una soglia di larghezza significa lasciare chi preme il
            pulsante senza sapere perche' non succede niente. */}
        {stato === "errore" && errore && (
          <span
            className="max-w-[10rem] truncate text-[11px] text-alarm-400"
            title={errore}
          >
            {errore}
          </span>
        )}
        <button
          type="button"
          onClick={() => void video.entra()}
          title="Entra in videochiamata (telecamera accesa, microfono spento)"
          className={cn(BOTTONE, "bg-pitch-800 text-chalk-400 hover:text-chalk-50")}
        >
          <VideoCamera size={18} weight="bold" />
          <span className="sr-only">Entra in videochiamata</span>
        </button>
      </div>
    );
  }

  if (stato === "connessione") {
    return (
      <span className={cn(BOTTONE, "bg-pitch-800 text-chalk-600")} title="Connessione…">
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Alcuni browser non fanno partire l'audio finche' non lo si chiede
          esplicitamente. Senza questo pulsante si resterebbe in silenzio
          senza capire perche'. */}
      {audioBloccato && (
        <button
          type="button"
          onClick={() => void video.sbloccaAudio()}
          title="Il browser sta bloccando l'audio: tocca per sentire gli altri"
          className={cn(BOTTONE, "animate-pulse bg-gold-400 text-pitch-950")}
        >
          <SpeakerSimpleX size={18} weight="bold" />
          <span className="sr-only">Attiva l&apos;audio</span>
        </button>
      )}

      {errore && (
        <span className="max-w-[10rem] truncate text-[11px] text-alarm-400" title={errore}>
          {errore}
        </span>
      )}

      {collegati > 1 && (
        <span className="hidden text-[11px] text-chalk-600 tabular sm:inline">
          {collegati} in video
        </span>
      )}

      <button
        type="button"
        onClick={() => void video.alternaMic()}
        aria-pressed={micAcceso}
        title={micAcceso ? "Spegni il microfono" : "Accendi il microfono"}
        className={cn(
          BOTTONE,
          micAcceso ? "bg-turn-400 text-pitch-950" : "bg-pitch-800 text-chalk-400 hover:text-chalk-50",
        )}
      >
        {micAcceso ? <Microphone size={18} weight="bold" /> : <MicrophoneSlash size={18} weight="bold" />}
        <span className="sr-only">Microfono</span>
      </button>

      <button
        type="button"
        onClick={() => void video.alternaCam()}
        aria-pressed={camAccesa}
        title={camAccesa ? "Spegni la telecamera" : "Accendi la telecamera"}
        className={cn(
          BOTTONE,
          camAccesa ? "bg-chalk-50 text-pitch-950" : "bg-pitch-800 text-chalk-400 hover:text-chalk-50",
        )}
      >
        {camAccesa ? <VideoCamera size={18} weight="bold" /> : <VideoCameraSlash size={18} weight="bold" />}
        <span className="sr-only">Telecamera</span>
      </button>

      <button
        type="button"
        onClick={() => void video.esci()}
        title="Esci dalla videochiamata (l'asta continua)"
        className={cn(BOTTONE, "bg-alarm-600 text-white hover:brightness-110")}
      >
        <PhoneX size={18} weight="bold" />
        <span className="sr-only">Esci dalla videochiamata</span>
      </button>
    </div>
  );
}
