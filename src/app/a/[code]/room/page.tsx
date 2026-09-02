"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TelevisionSimple, SignOut, ClockCounterClockwise, ListChecks,
} from "@phosphor-icons/react";
import { NicknameGate } from "@/components/NicknameGate";
import { LoadingState } from "@/components/LoadingState";
import { RoomStage } from "@/components/auction/RoomStage";
import { BidControls } from "@/components/auction/BidControls";
import { TeamTable } from "@/components/auction/TeamTable";
import { NominationPanel } from "@/components/auction/NominationPanel";
import { AssignedOverlay } from "@/components/auction/AssignedOverlay";
import { AdminBar, ConnectionBanner, StatusPill } from "@/components/auction/RoomChrome";
import { SeatPicker } from "@/components/auction/SeatPicker";
import { ThemeCycleButton } from "@/components/ui/ThemeSwitcher";
import { HistoryPanel } from "@/components/auction/HistoryPanel";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useAuctionAccess } from "@/lib/useAuctionAccess";
import { useAuctionState } from "@/lib/useAuctionState";
import { useCountdown } from "@/lib/useCountdown";
import { useLotFinalizer } from "@/lib/useLotFinalizer";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/cn";
import type { Player } from "@/lib/types";

/**
 * Quanto resta in scena la schermata "ASSEGNATO!", contati dall'istante di
 * chiusura registrato dal server. Deve assorbire il tempo che l'evento impiega
 * ad arrivare (qualche centinaio di millisecondi, fino a un secondo se a
 * chiudere è stato il job pg_cron) e lasciare comunque il tempo di leggere
 * nome, squadra e prezzo.
 */
const CELEBRATION_MS = 5500;

export default function RoomPage({ params }: PageProps<"/a/[code]/room">) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();

  const access = useAuctionAccess(upperCode);
  const { state, clock, connection, refresh, error } = useAuctionState(access.auctionId);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tvMode, setTvMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
    return <LoadingState message="Ingresso in sala…" error={error} onRetry={refresh} />;
  }

  const supabase = getSupabaseBrowser();
  const myTeam = state.teams.find((t) => t.id === state.me.team_id) ?? null;
  // Ad asta chiusa non tocca piu' a nessuno: il turno esiste solo mentre si gioca.
  const inCorso = auction.status === "running" || auction.status === "paused";
  const turnTeam = inCorso
    ? (state.teams.find((t) => t.id === auction.current_turn_team_id) ?? null)
    : null;
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

  const tables = (from: number, to: number, compact = false) =>
    state.teams.slice(from, to).map((team) => (
      <TeamTable
        key={team.id}
        team={team}
        compact={compact}
        isLeader={leaderTeam?.id === team.id}
        isTurn={turnTeam?.id === team.id}
        isMine={myTeam?.id === team.id}
      />
    ));

  return (
    <div
      className={cn(
        "room-light relative flex min-h-[100dvh] flex-col",
        tvMode && "tv-mode",
      )}
    >
      <ConnectionBanner connection={connection} />

      <header
        className={cn(
          "relative z-20 flex shrink-0 items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-5",
          tvMode && "py-1",
        )}
      >
        <h1
          className="display min-w-0 flex-1 truncate text-chalk-50"
          style={{ fontSize: "var(--text-table-name)" }}
        >
          {auction.name}
        </h1>
        <StatusPill status={auction.status} liveLot={lot !== null} />

        <div className="flex shrink-0 items-center gap-2">
          {!tvMode && state.me.is_admin && (
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

          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            title="Storico e rose"
            className="flex size-8 items-center justify-center rounded-[var(--radius-inner)] bg-pitch-800 text-chalk-400 transition hover:text-chalk-50"
          >
            <ClockCounterClockwise size={18} weight="bold" />
          </button>

          <button
            type="button"
            onClick={() => setTvMode((on) => !on)}
            aria-pressed={tvMode}
            title={tvMode ? "Esci dalla modalità TV" : "Modalità TV: più grande, senza contorno"}
            className={cn(
              "flex size-8 items-center justify-center rounded-[var(--radius-inner)] transition",
              tvMode
                ? "bg-chalk-50 text-pitch-950"
                : "bg-pitch-800 text-chalk-400 hover:text-chalk-50",
            )}
          >
            <TelevisionSimple size={18} weight="bold" />
          </button>

          {!tvMode && <ThemeCycleButton />}

          {!tvMode && (
            <>
              <Link
                href={`/a/${upperCode}/riepilogo`}
                title="Riepilogo e rose complete"
                className="flex size-8 items-center justify-center rounded-[var(--radius-inner)] bg-pitch-800 text-chalk-400 transition hover:text-chalk-50"
              >
                <ListChecks size={18} weight="bold" />
              </Link>

              {/* Porta alla home e non alla lobby: a asta iniziata la lobby
                  rimanda in sala, e il tasto indietro rimbalzava all'infinito.
                  Uscire dalla schermata non fa perdere il posto al tavolo: si
                  rientra con lo stesso link. */}
              <Link
                href="/"
                title="Esci dalla sala (resti nella tua squadra)"
                className="flex size-8 items-center justify-center rounded-[var(--radius-inner)] bg-pitch-800 text-chalk-400 transition hover:text-chalk-50"
              >
                <SignOut size={18} weight="bold" />
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="room-grid relative z-10 min-h-0 flex-1 px-3 pb-3 sm:px-5 sm:pb-5">
        <aside className="room-side area-left min-h-0 flex-col gap-3 overflow-y-auto">
          {tables(0, half)}
        </aside>

        <section className="area-stage spotlight flex min-h-0 flex-col items-center justify-center rounded-[var(--radius-card)] px-3 py-2">
          {auction.status === "completed" ? (
            <div className="flex flex-col items-center text-center">
              <h2 className="display text-chalk-50" style={{ fontSize: "var(--text-stage-name)" }}>
                Asta terminata
              </h2>
              <p className="mt-2 text-chalk-400" style={{ fontSize: "var(--text-stage-meta)" }}>
                {state.history.length} giocatori assegnati.
              </p>
              <Link href={`/a/${upperCode}/riepilogo`} className="mt-5">
                <Button variant="gold" size="lg">
                  Vedi le rose complete
                </Button>
              </Link>
            </div>
          ) : lot ? (
            <RoomStage
              lot={lot}
              leaderTeam={leaderTeam}
              remainingMs={remainingMs}
              totalMs={auction.bid_timer_seconds * 1000}
              paused={paused}
            />
          ) : (
            <div className="flex w-full flex-col items-center">
              <NominationPanel
                auctionId={access.auctionId}
                isMyTurn={isMyTurn}
                turnTeamName={turnTeam?.name ?? null}
                busy={busy}
                onNominate={handleNominate}
              />
              {isMyTurn && nominationRemaining > 0 && (
                <p
                  className="mt-3 text-chalk-600 tabular"
                  style={{ fontSize: "var(--text-label)" }}
                >
                  {Math.ceil(nominationRemaining / 1000)} secondi consigliati per scegliere
                </p>
              )}
            </div>
          )}
        </section>

        <aside className="room-side area-right min-h-0 flex-col gap-3 overflow-y-auto">
          {tables(half, state.teams.length)}
        </aside>

        {/* Su telefono i tavoli scorrono di lato, sopra i controlli: il pollice
            deve restare sul pulsante di offerta. */}
        <div className="room-strip area-strip -mx-3 gap-2.5 overflow-x-auto px-3 pb-1">
          {tables(0, state.teams.length, true)}
        </div>

        <div className="area-bid flex flex-col items-center gap-2">
          {/* Senza squadra non ci sono offerte da fare: al loro posto si offre
              il modo di prendere un posto, che altrimenti ad asta iniziata
              non esisterebbe. */}
          {myTeam === null && auction.status !== "completed" ? (
            <SeatPicker
              teams={state.teams}
              busy={busy}
              onSit={(teamId) => run(() => supabase.rpc("claim_team", { p_team_id: teamId }))}
            />
          ) : (
            lot &&
            auction.status !== "completed" && (
              <BidControls
                lot={lot}
                myTeam={myTeam}
                minIncrement={auction.min_increment}
                paused={paused}
                busy={busy}
                onBid={handleBid}
              />
            )
          )}
          <Alert className="w-full max-w-md">{message}</Alert>
        </div>
      </div>

      <div className="vignette" aria-hidden />
      <div className="grain" aria-hidden />

      <HistoryPanel
        state={state}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      {showCelebration && state.last_assigned && (
        <AssignedOverlay assigned={state.last_assigned} />
      )}
    </div>
  );
}
