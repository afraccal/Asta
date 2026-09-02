"use client";

import { PlayerPortrait } from "@/components/player/PlayerPortrait";
import { CountdownRing } from "@/components/auction/CountdownRing";
import { ROLE_COLORS, ROLE_LABELS, playerFullName, type Lot, type Team } from "@/lib/types";

/**
 * Il palco (§11).
 *
 * Composizione a due fasce, come il sottopancia di una diretta sportiva:
 * sopra chi e' in vendita, sotto quanto manca e a quanto siamo. Il nome ha
 * una riga tutta per se' e non va mai a capo per colpa di una colonna
 * stretta, che era il difetto della disposizione a tre blocchi affiancati.
 */
export function RoomStage({
  lot,
  leaderTeam,
  remainingMs,
  totalMs,
  paused,
}: {
  lot: Lot;
  leaderTeam: Team | null;
  remainingMs: number;
  totalMs: number;
  paused: boolean;
}) {
  const roleColor = ROLE_COLORS[lot.player.role];

  return (
    <div className="stage anim-lot">
      {/* Chi e' in vendita */}
      <div className="stage-who">
        <PlayerPortrait player={lot.player} size={0} className="w-[var(--size-portrait)]" />

        <h2
          className="display mt-3 text-center leading-[0.9] text-balance text-chalk-50"
          style={{ fontSize: "var(--text-stage-name)" }}
        >
          {playerFullName(lot.player)}
        </h2>

        <p
          className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5"
          style={{ fontSize: "var(--text-stage-meta)" }}
        >
          <span className="display" style={{ color: roleColor }}>
            {lot.player.role}
          </span>
          <span className="text-chalk-400">{ROLE_LABELS[lot.player.role]}</span>
          {lot.player.club && (
            <>
              <span aria-hidden className="text-chalk-700">/</span>
              <span className="font-medium text-chalk-200">{lot.player.club}</span>
            </>
          )}
          {lot.player.quotation !== null && (
            <>
              <span aria-hidden className="text-chalk-700">/</span>
              <span className="text-chalk-400">
                qt. <span className="text-gold-400 tabular">{lot.player.quotation}</span>
              </span>
            </>
          )}
        </p>
      </div>

      {/* Quanto manca, e a quanto siamo */}
      <div className="stage-bid">
        <CountdownRing
          remainingMs={remainingMs}
          totalMs={totalMs}
          paused={paused}
          className="shrink-0"
        />

        <div className="flex min-w-0 flex-col">
          <p
            className="uppercase tracking-[0.3em] text-chalk-600"
            style={{ fontSize: "var(--text-label)" }}
          >
            offerta attuale
          </p>
          {/* La chiave sull'importo fa ripartire l'animazione a ogni rilancio:
              il numero "batte" e l'occhio ci torna sopra da solo. */}
          <p
            key={lot.current_bid}
            className="anim-punch display leading-[0.85] text-chalk-50 tabular"
            style={{ fontSize: "var(--text-stage-bid)" }}
          >
            {lot.current_bid}
          </p>
          <p
            className="display mt-1 max-w-full truncate text-gold-400"
            style={{ fontSize: "var(--text-stage-meta)" }}
            title={leaderTeam?.name}
          >
            {leaderTeam?.name ?? "nessuna offerta"}
          </p>
        </div>
      </div>
    </div>
  );
}
