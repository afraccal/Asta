"use client";

import { PlayerPortrait, RoleBadge } from "@/components/player/PlayerPortrait";
import { ROLE_LABELS, playerFullName, type Player } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Scheda del giocatore mostrata al centro della sala (§11).
 * Dimensionata per essere leggibile anche su una TV a qualche metro.
 */
export function PlayerCard({
  player,
  compact,
  className,
}: {
  player: Player;
  compact?: boolean;
  className?: string;
}) {
  const quotationLabel = Number(player.metadata?.quotazione_iniziale ?? NaN);

  return (
    <article className={cn("flex flex-col items-center text-center", className)}>
      <PlayerPortrait player={player} size={compact ? 120 : 200} />

      <h2
        className={cn(
          "display mt-4 leading-[0.95] text-chalk-50",
          compact ? "text-3xl" : "text-5xl sm:text-6xl",
        )}
      >
        {playerFullName(player)}
      </h2>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-chalk-200">
        <RoleBadge role={player.role} />
        <span className="text-chalk-400">{ROLE_LABELS[player.role]}</span>
        {player.club && (
          <>
            <span aria-hidden className="text-chalk-600">
              ·
            </span>
            <span className="font-medium">{player.club}</span>
          </>
        )}
      </div>

      {player.role_mantra.length > 0 && (
        <p className="mt-2 flex flex-wrap justify-center gap-1.5">
          {player.role_mantra.map((r) => (
            <span
              key={r}
              className="rounded-md bg-pitch-800 px-2 py-0.5 text-xs text-chalk-400"
            >
              {r}
            </span>
          ))}
        </p>
      )}

      {player.quotation !== null && (
        <p className="mt-4 flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-widest text-chalk-400">Quotazione</span>
          <span className="display text-3xl text-gold-400 tabular">{player.quotation}</span>
          {Number.isFinite(quotationLabel) && quotationLabel !== player.quotation && (
            <span className="text-xs text-chalk-600 tabular">(iniziale {quotationLabel})</span>
          )}
        </p>
      )}
    </article>
  );
}
