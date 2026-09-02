"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ROLE_COLORS, type Player, type PlayerRole } from "@/lib/types";
import { playerInitials, resolvePlayerImage } from "@/lib/playerImage";

type PortraitPlayer = Pick<
  Player,
  "external_id" | "image_url" | "first_name" | "last_name" | "role"
>;

/**
 * Foto del giocatore, con segnaposto quando non c'e'.
 *
 * Il segnaposto non è un buco grigio: iniziali su un alone nel colore del
 * ruolo, così una scheda senza foto resta comunque leggibile e riconoscibile
 * anche da lontano. Se l'immagine remota fallisce si ricade sullo stesso
 * segnaposto invece di mostrare l'icona di errore del browser.
 */
export function PlayerPortrait({
  player,
  size = 96,
  className,
}: {
  player: PortraitPlayer;
  /** Lato in pixel. Passa 0 per dimensionarlo dal CSS (serve alla sala,
   *  dove la foto deve crescere insieme al resto su un televisore). */
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : resolvePlayerImage(player);
  const color = ROLE_COLORS[player.role as PlayerRole];

  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-[var(--radius-card)] ring-1 ring-pitch-600 [container-type:inline-size]",
        className,
      )}
      style={size > 0 ? { width: size, height: size } : undefined}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 100% at 50% 0%, ${color}38 0%, transparent 70%), var(--color-pitch-800)`,
        }}
      />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={player.last_name}
          onError={() => setFailed(true)}
          className="relative size-full object-cover"
        />
      ) : (
        <span
          className="display relative flex size-full items-center justify-center"
          style={{ color, fontSize: size > 0 ? size * 0.36 : "36cqw" }}
          aria-hidden
        >
          {playerInitials(player)}
        </span>
      )}
    </div>
  );
}

export function RoleBadge({ role, className }: { role: PlayerRole; className?: string }) {
  return (
    <span
      className={cn(
        "display inline-flex size-6 items-center justify-center rounded-md text-sm leading-none",
        className,
      )}
      style={{ background: `${ROLE_COLORS[role]}22`, color: ROLE_COLORS[role] }}
    >
      {role}
    </span>
  );
}
