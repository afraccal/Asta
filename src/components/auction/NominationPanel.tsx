"use client";

import { useState } from "react";
import { PlayerSearch } from "@/components/player/PlayerSearch";
import { PlayerCard } from "@/components/player/PlayerCard";
import { Button } from "@/components/ui/Button";
import type { Player } from "@/lib/types";

/**
 * Il momento della chiamata (§5).
 *
 * Il listone lo vedono tutti, sempre. Prima lo vedeva solo chi era di turno e
 * gli altri restavano davanti a una scritta: non potevano controllare chi
 * fosse ancora libero, ne' prepararsi la mossa successiva. In un'asta vera
 * tutti tengono il listone sotto gli occhi; a essere riservata e' la chiamata,
 * non la consultazione.
 *
 * Chiamare resta quindi legato al turno: chi non e' di turno puo' cercare e
 * scegliere un giocatore, ma il pulsante glielo dice chiaramente che tocca a
 * un altro.
 */
export function NominationPanel({
  auctionId,
  isMyTurn,
  turnTeamName,
  busy,
  onNominate,
}: {
  auctionId: string;
  isMyTurn: boolean;
  turnTeamName: string | null;
  busy: boolean;
  onNominate: (player: Player) => void;
}) {
  const [selected, setSelected] = useState<Player | null>(null);

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="flex max-h-[26rem] min-h-0 flex-col">
        {isMyTurn ? (
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-turn-400">
            Tocca a te: chiama un giocatore
          </p>
        ) : (
          <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-chalk-400">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-turn-400" />
            Sta scegliendo {turnTeamName ?? "…"}
          </p>
        )}

        <PlayerSearch
          auctionId={auctionId}
          onSelect={setSelected}
          selectedId={selected?.id}
          autoFocus={isMyTurn}
        />
      </div>

      <div className="flex flex-col items-center justify-center gap-5">
        {selected ? (
          <>
            <PlayerCard player={selected} compact />
            <Button
              variant={isMyTurn ? "gold" : "ghost"}
              size="lg"
              className="w-full max-w-xs text-lg"
              loading={busy}
              disabled={busy || !isMyTurn}
              onClick={() => onNominate(selected)}
            >
              {isMyTurn ? "Metti all'asta" : `Tocca a ${turnTeamName ?? "un'altra squadra"}`}
            </Button>
          </>
        ) : (
          <p className="max-w-xs text-center text-sm text-chalk-600">
            {isMyTurn
              ? "Cerca il giocatore da chiamare. L'asta partirà da 1 credito e sarà già tua finché qualcuno non rilancia."
              : "Puoi guardare il listone e preparare la tua mossa: chiamare toccherà a te al tuo turno."}
          </p>
        )}
      </div>
    </div>
  );
}
