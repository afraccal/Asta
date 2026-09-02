"use client";

import { cn } from "@/lib/cn";
import { VideoTile } from "@/components/video/VideoTile";
import { ROLE_COLORS, type Team } from "@/lib/types";

/**
 * Il tavolo di una squadra (§12).
 *
 * Costruito come un tavolo vero: targhetta col nome in alto, una o due
 * postazioni per gli allenatori, e sotto i numeri che contano.
 *
 * Tre stati, tre significati, nessun colore decorativo:
 * oro = e' in testa all'offerta, verde = tocca a lei chiamare,
 * bordo chiaro = e' la tua.
 */
export function TeamTable({
  team,
  isLeader,
  isTurn,
  isMine,
  compact,
}: {
  team: Team;
  isLeader: boolean;
  isTurn: boolean;
  isMine: boolean;
  compact?: boolean;
}) {
  const seats = Math.max(1, team.members.length);
  const recent = compact ? [] : team.players.slice(0, 2);

  return (
    <article
      className={cn(
        "felt flex flex-col overflow-hidden transition-[border-color,box-shadow] duration-500",
        isLeader && "table-leader",
        !isLeader && isTurn && "table-turn",
        !isLeader && !isTurn && isMine && "table-mine",
        compact ? "min-w-[8.5rem] flex-1" : "flex-1",
      )}
    >
      <header className="nameplate flex items-center gap-2 px-2.5 py-1.5">
        <h3
          className="display min-w-0 flex-1 truncate leading-none"
          style={{ fontSize: "var(--text-table-name)" }}
          title={team.name}
        >
          <span className={isLeader ? "text-gold-400" : "text-chalk-50"}>{team.name}</span>
        </h3>
        {isTurn && (
          <span
            className="anim-turn shrink-0 font-semibold uppercase tracking-wider text-turn-400"
            style={{ fontSize: "var(--text-label)" }}
          >
            chiama
          </span>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-1.5 p-2">
        {/* Le postazioni degli allenatori */}
        <div className="flex gap-2">
          {Array.from({ length: seats }).map((_, index) => {
            const member = team.members[index];
            return (
              <div
                key={member?.profile_id ?? `posto-${index}`}
                className="h-[clamp(2.5rem,6.5vh,6.5rem)] flex-1"
              >
                {member ? (
                  <VideoTile
                    profileId={member.profile_id}
                    nome={member.display_name}
                    avatarUrl={member.avatar_url}
                    online={member.online}
                    dimensioneAvatar={compact ? 26 : 30}
                  />
                ) : (
                  <span
                    className="flex size-full items-center justify-center rounded-[var(--radius-inner)] bg-pitch-950/60 text-chalk-600 ring-1 ring-inset ring-white/[0.06]"
                    style={{ fontSize: "var(--text-label)" }}
                  >
                    posto libero
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <dl className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <dd
              className={cn(
                "display leading-none tabular",
                team.credits_remaining === 0 ? "text-alarm-400" : "text-chalk-50",
              )}
              style={{ fontSize: "var(--text-table-num)" }}
            >
              {team.credits_remaining}
            </dd>
            <dt
              className="uppercase tracking-wider text-chalk-600"
              style={{ fontSize: "var(--text-label)" }}
            >
              crediti
            </dt>
          </div>
          <div className="min-w-0 text-right">
            <dd
              className="display leading-none text-chalk-300 tabular"
              style={{ fontSize: "var(--text-table-num)" }}
            >
              {team.players_count}
            </dd>
            <dt
              className="uppercase tracking-wider text-chalk-600"
              style={{ fontSize: "var(--text-label)" }}
            >
              in rosa
            </dt>
          </div>
        </dl>

        {/* Ultimi acquisti: il tavolo racconta cosa ha gia' preso (§12) */}
        {!compact && recent.length > 0 && (
          <ul className="mt-auto space-y-0.5 border-t border-white/[0.06] pt-1.5">
            {recent.map((player) => (
              <li
                key={player.player_id}
                className="flex items-baseline gap-1.5 text-chalk-400"
                style={{ fontSize: "var(--text-label)" }}
              >
                <span
                  className="display shrink-0"
                  style={{ color: ROLE_COLORS[player.role] }}
                  aria-hidden
                >
                  {player.role}
                </span>
                <span className="min-w-0 flex-1 truncate">{player.last_name}</span>
                <span className="shrink-0 text-chalk-500 tabular">{player.price}</span>
              </li>
            ))}
            {team.players_count > recent.length && (
              <li
                className="pt-0.5 text-chalk-600"
                style={{ fontSize: "var(--text-label)" }}
              >
                e altri {team.players_count - recent.length}
              </li>
            )}
          </ul>
        )}
      </div>
    </article>
  );
}
