"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { NicknameGate } from "@/components/NicknameGate";
import { InviteBar } from "@/components/lobby/InviteBar";
import { TeamSlot } from "@/components/lobby/TeamSlot";
import { useAuctionAccess } from "@/lib/useAuctionAccess";
import { useAuctionState } from "@/lib/useAuctionState";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";

export default function LobbyPage({ params }: PageProps<"/a/[code]/lobby">) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();

  const access = useAuctionAccess(upperCode);
  const { state, connection, refresh } = useAuctionState(access.auctionId);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Quando l'amministratore avvia, tutti i presenti entrano in sala insieme.
  useEffect(() => {
    const status = state?.auction.status;
    if (status && status !== "lobby") router.replace(`/a/${upperCode}/room`);
  }, [state?.auction.status, router, upperCode]);

  if (access.phase === "need-nickname") {
    return (
      <NicknameGate
        code={upperCode}
        error={access.error}
        onSubmit={(nickname) => access.enter(nickname)}
      />
    );
  }

  if (access.phase === "error") {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Alert>{access.error}</Alert>
          <Button variant="ghost" onClick={() => router.push("/")}>
            Torna alla home
          </Button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-chalk-400">Ingresso nella stanza…</p>
      </main>
    );
  }

  const { auction, teams, me } = state;
  const claimedTeams = teams.filter((t) => t.members.length > 0).length;
  const canStart = me.is_admin && auction.player_list_id !== null && claimedTeams >= 2;

  async function run(action: () => Promise<{ error: unknown }>) {
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await action();
      if (rpcError) throw rpcError;
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const supabase = getSupabaseBrowser();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-chalk-400">Lobby</p>
          <h1 className="display text-4xl text-chalk-50 sm:text-5xl">{auction.name}</h1>
        </div>
        <span
          className="flex items-center gap-2 text-xs text-chalk-400"
          title={connection === "live" ? "Sincronizzato" : "Riconnessione in corso"}
        >
          <span
            className={
              connection === "live"
                ? "size-2 rounded-full bg-turn-400"
                : "size-2 animate-pulse rounded-full bg-gold-400"
            }
          />
          {connection === "live" ? "In diretta" : "Riconnessione…"}
        </span>
      </header>

      <InviteBar code={auction.code} />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-2xl text-chalk-50">Tavoli</h2>
          <p className="text-sm text-chalk-400">
            {claimedTeams} di {teams.length} occupati
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamSlot
              key={team.id}
              team={team}
              busy={busy}
              isMine={me.team_id === team.id}
              canJoin={me.team_id === null}
              canRename={me.team_id === team.id || me.is_admin}
              onJoin={() => run(() => supabase.rpc("claim_team", { p_team_id: team.id }))}
              onLeave={() => run(() => supabase.rpc("leave_team", { p_team_id: team.id }))}
              onRename={(name) =>
                run(() => supabase.rpc("rename_team", { p_team_id: team.id, p_name: name }))
              }
            />
          ))}
        </div>
      </section>

      <Alert>{error}</Alert>

      {me.is_admin && (
        <section className="surface space-y-4 p-5">
          <h2 className="display text-2xl text-chalk-50">Pannello amministratore</h2>

          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Crediti", auction.budget_initial],
              ["Timer", `${auction.bid_timer_seconds}s`],
              ["Rosa", auction.slots_per_team ?? "libera"],
              ["Squadre", claimedTeams],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-pitch-900/60 p-3">
                <dt className="text-xs uppercase tracking-wider text-chalk-400">{label}</dt>
                <dd className="display text-2xl text-chalk-50 tabular">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-pitch-700 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-chalk-400">Listone</p>
              {auction.player_list ? (
                <p className="truncate font-medium text-chalk-50">
                  {auction.player_list.name}
                  <span className="ml-2 text-sm font-normal text-chalk-400">
                    {auction.player_list.player_count} giocatori
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gold-400">
                  Non ancora caricato: serve per iniziare.
                </p>
              )}
            </div>
            <Link href={`/a/${auction.code}/listone`}>
              <Button size="sm" variant={auction.player_list ? "ghost" : "gold"}>
                {auction.player_list ? "Cambia" : "Carica il listone"}
              </Button>
            </Link>
            {auction.player_list && (
              <Link href={`/a/${auction.code}/giocatori`}>
                <Button size="sm" variant="ghost">
                  Sfoglia
                </Button>
              </Link>
            )}
          </div>

          <Button
            size="lg"
            variant="gold"
            className="w-full"
            disabled={!canStart || busy}
            onClick={() =>
              run(() =>
                supabase.rpc("start_auction", {
                  p_auction_id: auction.id,
                  p_shuffle: true,
                }),
              )
            }
          >
            Sorteggia l&apos;ordine e inizia l&apos;asta
          </Button>
          <p className="text-center text-xs text-chalk-600">
            Le squadre rimaste vuote verranno rimosse. L&apos;ordine di chiamata viene
            sorteggiato.
          </p>
        </section>
      )}
    </main>
  );
}
