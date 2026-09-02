"use client";

import { useState } from "react";
import { PlayerSearch } from "@/components/player/PlayerSearch";
import { PlayerCard } from "@/components/player/PlayerCard";
import { Button } from "@/components/ui/Button";
import type { Player } from "@/lib/types";

/**
 * Il momento della chiamata (§5).
 *
 * Chi è di turno cerca e sceglie; tutti gli altri vedono solo di chi si sta
 * aspettando la mossa, senza una lista che li distragga.
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

  if (!isMyTurn) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="size-2.5 animate-pulse rounded-full bg-turn-400" />
        <p className="display text-3xl text-chalk-50">{turnTeamName ?? "…"}</p>
        <p className="text-sm text-chalk-400">sta scegliendo il prossimo giocatore</p>
      </div>
    );
  }

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="flex max-h-[26rem] min-h-0 flex-col">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-turn-400">
          Tocca a te: chiama un giocatore
        </p>
        <PlayerSearch
          auctionId={auctionId}
          onSelect={setSelected}
          selectedId={selected?.id}
          autoFocus
        />
      </div>

      <div className="flex flex-col items-center justify-center gap-5">
        {selected ? (
          <>
            <PlayerCard player={selected} compact />
            <Button
              variant="gold"
              size="lg"
              className="w-full max-w-xs text-lg"
              loading={busy}
              disabled={busy}
              onClick={() => onNominate(selected)}
            >
              Metti all&apos;asta
            </Button>
          </>
        ) : (
          <p className="max-w-xs text-center text-sm text-chalk-600">
            Cerca il giocatore da chiamare. L&apos;asta partirà da 1 credito e sarà
            già tua finché qualcuno non rilancia.
          </p>
        )}
      </div>
    </div>
  );
}
