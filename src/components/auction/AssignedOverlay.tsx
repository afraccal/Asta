"use client";

import { PlayerPortrait } from "@/components/player/PlayerPortrait";
import { playerFullName, type AssignedLot } from "@/lib/types";

/**
 * La schermata di aggiudicazione (§8).
 *
 * Compare per qualche secondo dopo l'assegnazione. La sua durata non dipende
 * da un timer locale ma dall'istante di chiusura registrato dal server: chi si
 * ricollega a metà animazione la vede finire insieme agli altri, e chi arriva
 * dopo non la vede affatto.
 */
export function AssignedOverlay({ assigned }: { assigned: AssignedLot }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pitch-950/92 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="anim-assigned flex flex-col items-center px-6 text-center">
        <PlayerPortrait player={assigned.player} size={180} />

        <h2 className="display mt-5 text-5xl leading-none text-chalk-50 sm:text-7xl">
          {playerFullName(assigned.player)}
        </h2>

        <p
          className="anim-rise mt-6 text-xs uppercase tracking-[0.4em] text-chalk-400"
          style={{ animationDelay: "120ms" }}
        >
          Assegnato a
        </p>

        <p
          className="anim-rise display mt-1 text-4xl text-gold-400 sm:text-5xl"
          style={{ animationDelay: "200ms" }}
        >
          {assigned.team_name}
        </p>

        <p
          className="anim-rise display mt-5 text-6xl text-chalk-50 tabular sm:text-7xl"
          style={{ animationDelay: "300ms" }}
        >
          {assigned.price}
          <span className="ml-3 text-2xl text-chalk-400">crediti</span>
        </p>
      </div>
    </div>
  );
}
