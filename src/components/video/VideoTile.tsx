"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { useStaParlando, useVideo } from "@/components/video/VideoProvider";

/**
 * La postazione di un allenatore al tavolo.
 *
 * Se c'e' una traccia video la mostra, altrimenti l'avatar: e' lo stesso
 * riquadro, cambia solo cosa ci sta dentro. Fuori da una videochiamata il
 * componente si comporta esattamente come prima, quindi la lobby e le pagine
 * senza video non hanno bisogno di saperne niente.
 */
export function VideoTile({
  profileId,
  nome,
  avatarUrl,
  online,
  dimensioneAvatar = 30,
}: {
  profileId: string;
  nome: string;
  avatarUrl: string | null;
  online: boolean;
  dimensioneAvatar?: number;
}) {
  const video = useVideo();
  const staParlando = useStaParlando(profileId);
  const riferimento = useRef<HTMLVideoElement>(null);
  const traccia = video?.traccia(profileId) ?? null;

  useEffect(() => {
    const elemento = riferimento.current;
    if (!elemento || !traccia) return;

    elemento.srcObject = new MediaStream([traccia]);
    // Il video puo' rifiutarsi di partire (politiche di autoplay): non e' un
    // errore da mostrare, si ricade sull'avatar al prossimo render.
    void elemento.play().catch(() => undefined);

    return () => {
      elemento.srcObject = null;
    };
  }, [traccia]);

  return (
    <div
      className={cn(
        "relative flex size-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[var(--radius-inner)] bg-pitch-950/60 ring-1 ring-inset transition-shadow",
        staParlando
          ? "ring-turn-400 shadow-[0_0_0_2px_var(--color-turn-400)]"
          : "ring-white/[0.06]",
      )}
    >
      {traccia ? (
        <>
          <video
            ref={riferimento}
            muted
            playsInline
            autoPlay
            className="absolute inset-0 size-full object-cover"
          />
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1 pb-0.5 pt-2 text-center text-white"
                style={{ fontSize: "var(--text-label)" }}>
            {nome}
          </span>
        </>
      ) : (
        <>
          <Avatar name={nome} src={avatarUrl} online={online} size={dimensioneAvatar} />
          <span
            className="max-w-full truncate px-1.5 text-chalk-300"
            style={{ fontSize: "var(--text-label)" }}
          >
            {nome}
          </span>
        </>
      )}
    </div>
  );
}
