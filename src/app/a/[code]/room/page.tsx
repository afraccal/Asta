"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NicknameGate } from "@/components/NicknameGate";
import { PlayerPortrait, RoleBadge } from "@/components/player/PlayerPortrait";
import { CountdownRing } from "@/components/auction/CountdownRing";
import { BidControls } from "@/components/auction/BidControls";
import { TeamTable } from "@/components/auction/TeamTable";
import { NominationPanel } from "@/components/auction/NominationPanel";
import { AssignedOverlay } from "@/components/auction/AssignedOverlay";
import { AdminBar, ConnectionBanner, StatusPill } from "@/components/auction/RoomChrome";
import { Alert } from "@/components/ui/Alert";
import { useAuctionAccess } from "@/lib/useAuctionAccess";
import { useAuctionState } from "@/lib/useAuctionState";
import { useCountdown } from "@/lib/useCountdown";
import { useLotFinalizer } from "@/lib/useLotFinalizer";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { ROLE_LABELS, playerFullName, type Player } from "@/lib/types";

/**
 * Quanto resta in scena la schermata "ASSEGNATO!", contati dall'istante di
 * chiusura registrato dal server. Deve assorbire il tempo che l'evento impiega
 * ad arrivare (qualche centinaio di millisecondi, fino a un secondo se a
 * chiudere è stato il job pg_cron) e lasciare comunque il tempo di leggere
 * nome, squadra e prezzo.
 */
const CELEBRATION_MS = 5500;

export default function RoomPage({ params }: PageProps<"/a/[code]/room"> ) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();

  const access = useAuctionAccess(upperCode);
  const { state, clock, connection, refresh } = useAuctionState(access.auctionId);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const auction = state?.auction ?? null;
  const lot = state?.lot ?? null;
  const paused = auction?.status === "paused";

  // Il countdown del lotto: scadenza dal server, congelata durante la pausa.
  const remainingMs = useCountdown(
    lot?.bid_deadline_ms ?? null,
    clock,
    paused ? (lot?.paused_remaining_ms ?? 0) : null,
  );

  // Allo zero il client chiede la chiusura; il job pg_cron fa comunque da rete
  // di sicurezza. finalize_lot è idempotente, quindi non possono confliggere.
  useLotFinalizer(lot, remainingMs, auction?.status === "running");

  // Tempo a disposizione del banditore per scegliere.
  const nominationRemaining = useCountdown(
    !lot && auction?.turn_started_at_ms
      ? auction.turn_started_at_ms + auction.nomination_timeout_seconds * 1000
      : null,
    clock,
    paused ? 0 : null,
  );

  // La celebrazione dura fino a un istante calcolato dal server, non da un
  // timer locale: chi si ricollega a metà la vede finire insieme agli altri.
  const celebrationRemaining = useCountdown(
    state?.last_assigned ? state.last_assigned.closed_at_ms + CELEBRATION_MS : null,
    clock,
  );

  useEffect(() => {
    if (state?.auction.status === "lobby") router.replace(`/a/${upperCode}/lobby`);
  }, [state?.auction.status, router, upperCode]);

  if (access.phase === "need-nickname") {
    return <NicknameGate code={upperCode} error={access.error} onSubmit={(n) => access.enter(n)} />;
  }

  if (!state || !auction || !access.auctionId) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-chalk-400">Ingresso in sala…</p>
      </main>
    );
  }

  const supabase = getSupabaseBrowser();
  const myTeam = state.teams.find((t) => t.id === state.me.team_id) ?? null;
  const turnTeam = state.teams.find((t) => t.id === auction.current_turn_team_id) ?? null;
  const leaderTeam = state.teams.find((t) => t.id === lot?.current_bidder_team_id) ?? null;
  const isMyTurn = turnTeam !== null && (turnTeam.id === myTeam?.id || state.me.is_admin);

  const half = Math.ceil(state.teams.length / 2);
  const showCelebration = celebrationRemaining > 0 && state.last_assigned !== null;

  async function run(action: () => Promise<{ error: unknown }>) {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await action();
      if (error) throw error;
      await refresh();
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleBid(amount: number) {
    if (!lot || !myTeam) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("place_bid", {
      p_lot_id: lot.id,
      p_team_id: myTeam.id,
      p_amount: amount,
    });
    // In caso di errore lo stato vero arriva comunque dal broadcast: qui si
    // spiega solo perché l'offerta non è passata.
    if (error) setMessage(friendlyError(error));
    setBusy(false);
  }

  function handleNominate(player: Player) {
    void run(() =>
      supabase.rpc("nominate_player", {
        p_auction_id: access.auctionId!,
        p_player_id: player.id,
      }),
    );
  }

  return (
    <>
      <ConnectionBanner connection={connection} />

      <main className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-4 px-3 py-4 sm:px-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="display text-2xl text-chalk-50 sm:text-3xl">{auction.name}</h1>
            <StatusPill status={auction.status} liveLot={lot !== null} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/a/${upperCode}/lobby`}
              className="text-sm text-chalk-400 transition hover:text-chalk-50"
            >
              Lobby
            </Link>
            {state.me.is_admin && (
              <AdminBar
                status={auction.status}
                hasLiveLot={lot !== null}
                busy={busy}
                onPause={() => run(() => supabase.rpc("pause_auction", { p_auction_id: auction.id }))}
                onResume={() => run(() => supabase.rpc("resume_auction", { p_auction_id: auction.id }))}
                onSkipTurn={() => run(() => supabase.rpc("skip_turn", { p_auction_id: auction.id }))}
                onCancelLot={() => run(() => supabase.rpc("cancel_lot", { p_lot_id: lot!.id }))}
                onEnd={() => run(() => supabase.rpc("end_auction", { p_auction_id: auction.id }))}
              />
            )}
          </div>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_13rem]">
          <aside className="hidden flex-col gap-3 lg:flex">
            {state.teams.slice(0, half).map((team) => (
              <TeamTable
                key={team.id}
                team={team}
                isLeader={leaderTeam?.id === team.id}
                isTurn={turnTeam?.id === team.id}
                isMine={myTeam?.id === team.id}
                lastBid={lot?.current_bid}
              />
            ))}
          </aside>

          <section className="surface flex min-h-[26rem] flex-col items-center justify-center gap-6 p-5">
            {auction.status === "completed" ? (
              <div className="text-center">
                <h2 className="display text-4xl text-chalk-50">Asta terminata</h2>
                <p className="mt-2 text-sm text-chalk-400">
                  {state.history.length} giocatori assegnati.
                </p>
              </div>
            ) : lot ? (
              <>
                <div className="anim-lot flex flex-col items-center gap-6 md:flex-row md:gap-10">
                  <div className="flex flex-col items-center text-center">
                    <PlayerPortrait player={lot.player} size={168} />
                    <h2 className="display mt-3 text-4xl leading-none text-chalk-50 sm:text-5xl">
                      {playerFullName(lot.player)}
                    </h2>
                    <p className="mt-2 flex items-center gap-2 text-sm text-chalk-200">
                      <RoleBadge role={lot.player.role} />
                      <span className="text-chalk-400">{ROLE_LABELS[lot.player.role]}</span>
                      {lot.player.club && (
                        <>
                          <span aria-hidden className="text-chalk-600">·</span>
                          <span className="font-medium">{lot.player.club}</span>
                        </>
                      )}
                      {lot.player.quotation !== null && (
                        <>
                          <span aria-hidden className="text-chalk-600">·</span>
                          <span className="text-gold-400 tabular">
                            qt. {lot.player.quotation}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <CountdownRing
                      remainingMs={remainingMs}
                      totalMs={auction.bid_timer_seconds * 1000}
                      paused={paused}
                      size={190}
                    />
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-chalk-600">
                        Offerta attuale
                      </p>
                      {/* La chiave sull'importo fa ripartire l'animazione a ogni rilancio */}
                      <p
                        key={lot.current_bid}
                        className="anim-punch display text-6xl leading-none text-chalk-50 tabular"
                      >
                        {lot.current_bid}
                      </p>
                      <p className="display mt-1 truncate text-xl text-gold-400">
                        {leaderTeam?.name ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <BidControls
                  lot={lot}
                  myTeam={myTeam}
                  minIncrement={auction.min_increment}
                  paused={paused}
                  busy={busy}
                  onBid={handleBid}
                />
              </>
            ) : (
              <div className="w-full">
                <NominationPanel
                  auctionId={access.auctionId}
                  isMyTurn={isMyTurn}
                  turnTeamName={turnTeam?.name ?? null}
                  busy={busy}
                  onNominate={handleNominate}
                />
                {isMyTurn && nominationRemaining > 0 && (
                  <p className="mt-3 text-center text-xs text-chalk-600 tabular">
                    {Math.ceil(nominationRemaining / 1000)} secondi consigliati per scegliere
                  </p>
                )}
              </div>
            )}

            <Alert className="w-full max-w-md">{message}</Alert>
          </section>

          <aside className="hidden flex-col gap-3 lg:flex">
            {state.teams.slice(half).map((team) => (
              <TeamTable
                key={team.id}
                team={team}
                isLeader={leaderTeam?.id === team.id}
                isTurn={turnTeam?.id === team.id}
                isMine={myTeam?.id === team.id}
                lastBid={lot?.current_bid}
              />
            ))}
          </aside>
        </div>

        {/* Su telefono i tavoli scorrono sotto i controlli: il pollice deve
            restare sul pulsante di offerta. */}
        <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 lg:hidden">
          {state.teams.map((team) => (
            <TeamTable
              key={team.id}
              team={team}
              compact
              isLeader={leaderTeam?.id === team.id}
              isTurn={turnTeam?.id === team.id}
              isMine={myTeam?.id === team.id}
              lastBid={lot?.current_bid}
            />
          ))}
        </div>
      </main>

      {showCelebration && state.last_assigned && (
        <AssignedOverlay assigned={state.last_assigned} />
      )}
    </>
  );
}
