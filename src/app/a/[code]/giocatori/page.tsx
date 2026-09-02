"use client";

import { use, useState } from "react";
import Link from "next/link";
import { NicknameGate } from "@/components/NicknameGate";
import { LoadingState } from "@/components/LoadingState";
import { PlayerSearch } from "@/components/player/PlayerSearch";
import { PlayerCard } from "@/components/player/PlayerCard";
import { useAuctionAccess } from "@/lib/useAuctionAccess";
import { useAuctionState } from "@/lib/useAuctionState";
import type { Player } from "@/lib/types";

/**
 * Consultazione del listone.
 *
 * Usa gli stessi componenti che finiranno al centro della sala d'asta: qui
 * servono a controllare il listone appena importato, lì a mostrare il
 * giocatore in vendita.
 */
export default function GiocatoriPage({ params }: PageProps<"/a/[code]/giocatori">) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();

  const access = useAuctionAccess(upperCode);
  const { state, refresh, error } = useAuctionState(access.auctionId);
  const [selected, setSelected] = useState<Player | null>(null);

  if (access.phase === "need-nickname") {
    return (
      <NicknameGate code={upperCode} error={access.error} onSubmit={(n) => access.enter(n)} />
    );
  }

  if (!state || !access.auctionId) {
    return <LoadingState error={error} onRetry={refresh} />;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link
          href={`/a/${upperCode}/lobby`}
          className="text-sm text-chalk-400 transition hover:text-chalk-50"
        >
          ← Lobby
        </Link>
        <h1 className="display mt-2 text-4xl text-chalk-50">
          {state.auction.player_list?.name ?? "Listone"}
          <span className="ml-3 text-2xl text-chalk-400">
            {state.auction.player_list?.player_count ?? 0} giocatori
          </span>
        </h1>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="surface flex min-h-0 flex-col p-4 lg:max-h-[70vh]">
          <PlayerSearch
            auctionId={access.auctionId}
            onSelect={setSelected}
            selectedId={selected?.id}
            autoFocus
          />
        </div>

        <div className="surface flex items-center justify-center p-6">
          {selected ? (
            <PlayerCard player={selected} />
          ) : (
            <p className="max-w-xs text-center text-sm text-chalk-600">
              Scegli un giocatore per vederne la scheda come apparirà al centro
              della sala d&apos;asta.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
