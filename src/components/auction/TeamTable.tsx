"use client";

import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import type { Team } from "@/lib/types";

/**
 * Il tavolo di una squadra (§12).
 *
 * Il bordo racconta lo stato senza bisogno di leggere: oro se la squadra è in
 * testa all'offerta, verde se tocca a lei chiamare. I due riquadri dei
 * partecipanti sono già dimensionati per ospitare le webcam della fase 7:
 * quando arriveranno prenderanno il posto degli avatar senza cambiare il
 * layout del tavolo.
 */
export function TeamTable({
  team,
  isLeader,
  isTurn,
  isMine,
  lastBid,
  compact,
}: {
  team: Team;
  isLeader: boolean;
  isTurn: boolean;
  isMine: boolean;
  lastBid?: number | null;
  compact?: boolean;
}) {
  return (
    <article
      className={cn(
        "surface flex flex-col gap-2 p-3 transition-[border-color,box-shadow] duration-300",
        isLeader && "border-gold-400/80 anim-flash",
        !isLeader && isTurn && "border-turn-400/70",
        !isLeader && !isTurn && isMine && "border-brand-500/60",
        compact && "min-w-[10.5rem]",
      )}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3
          className={cn(
            "display truncate text-lg leading-tight",
            isLeader ? "text-gold-400" : "text-chalk-50",
          )}
          title={team.name}
        >
          {team.name}
        </h3>
        {isTurn && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-turn-400">
            chiama
          </span>
        )}
      </header>

      {/* Postazioni degli allenatori: 1 o 2, con lo spazio per il video */}
      <div className="flex gap-2">
        {Array.from({ length: Math.max(1, team.members.length) }).map((_, index) => {
          const member = team.members[index];
          return (
            <div
              key={member?.profile_id ?? `vuoto-${index}`}
              className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-pitch-900/60 py-2"
            >
              {member ? (
                <>
                  <Avatar name={member.display_name} src={member.avatar_url} online={member.online} size={30} />
                  <span className="max-w-full truncate px-1 text-[11px] text-chalk-400">
                    {member.display_name}
                  </span>
                </>
              ) : (
                <span className="py-2 text-[11px] text-chalk-600">libero</span>
              )}
            </div>
          );
        })}
      </div>

      <dl className="flex items-end justify-between">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-chalk-600">Crediti</dt>
          <dd
            className={cn(
              "display text-2xl leading-none tabular",
              team.credits_remaining === 0 ? "text-alarm-400" : "text-chalk-50",
            )}
          >
            {team.credits_remaining}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-[10px] uppercase tracking-wider text-chalk-600">Rosa</dt>
          <dd className="display text-2xl leading-none text-chalk-200 tabular">
            {team.players_count}
          </dd>
        </div>
      </dl>

      {isLeader && lastBid != null && (
        <p className="rounded-lg bg-gold-400/15 py-1 text-center">
          <span className="display text-lg text-gold-400 tabular">{lastBid}</span>
          <span className="ml-1 text-[10px] uppercase tracking-wider text-gold-400/80">
            in testa
          </span>
        </p>
      )}
    </article>
  );
}
