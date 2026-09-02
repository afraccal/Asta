"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, DownloadSimple } from "@phosphor-icons/react";
import { NicknameGate } from "@/components/NicknameGate";
import { LoadingState } from "@/components/LoadingState";
import { RoleBadge } from "@/components/player/PlayerPortrait";
import { Button } from "@/components/ui/Button";
import { useAuctionAccess } from "@/lib/useAuctionAccess";
import { useAuctionState } from "@/lib/useAuctionState";
import { cn } from "@/lib/cn";
import { downloadRosterCsv } from "@/lib/exportCsv";
import { ROLE_LABELS, type PlayerRole, type Team } from "@/lib/types";

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

/**
 * Riepilogo dell'asta: le rose complete, la spesa di ognuno, l'export.
 *
 * Vive fuori dalla sala perché lo si guarda a giochi fatti, con calma, magari
 * il giorno dopo. Funziona anche ad asta in corso: è la fotografia di com'è
 * la situazione adesso.
 */
export default function RiepilogoPage({ params }: PageProps<"/a/[code]/riepilogo">) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();

  const access = useAuctionAccess(upperCode);
  const { state, refresh, error } = useAuctionState(access.auctionId);

  const stats = useMemo(() => {
    if (!state) return null;
    const speso = state.history.reduce((sum, h) => sum + h.price, 0);
    const piuCaro = state.history.reduce<(typeof state.history)[number] | null>(
      (best, h) => (best === null || h.price > best.price ? h : best),
      null,
    );
    return { speso, piuCaro };
  }, [state]);

  if (access.phase === "need-nickname") {
    return <NicknameGate code={upperCode} error={access.error} onSubmit={(n) => access.enter(n)} />;
  }

  if (!state || !stats) {
    return <LoadingState error={error} onRetry={refresh} />;
  }

  const conclusa = state.auction.status === "completed";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/a/${upperCode}/room`}
            className="inline-flex items-center gap-1.5 text-sm text-chalk-400 transition hover:text-chalk-50"
          >
            <ArrowLeft size={14} weight="bold" /> Sala
          </Link>
          <h1 className="display mt-1 text-4xl text-chalk-50 sm:text-5xl">
            {state.auction.name}
          </h1>
          <p className="mt-1 text-sm text-chalk-400">
            {conclusa ? "Asta terminata" : "Situazione a metà asta"} ·{" "}
            {state.history.length} giocatori assegnati
          </p>
        </div>

        <Button variant="ghost" onClick={() => downloadRosterCsv(state)}>
          <DownloadSimple size={16} weight="bold" />
          Scarica CSV
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Statistica etichetta="Crediti spesi" valore={stats.speso} />
        <Statistica etichetta="Giocatori" valore={state.history.length} />
        <Statistica etichetta="Squadre" valore={state.teams.length} />
        <Statistica
          etichetta="Acquisto più caro"
          valore={stats.piuCaro?.price ?? 0}
          nota={stats.piuCaro ? `${stats.piuCaro.last_name} · ${stats.piuCaro.team_name}` : undefined}
        />
      </dl>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.teams.map((team) => (
          <RosaSquadra key={team.id} team={team} />
        ))}
      </div>
    </main>
  );
}

function Statistica({
  etichetta,
  valore,
  nota,
}: {
  etichetta: string;
  valore: number;
  nota?: string;
}) {
  return (
    <div className="felt p-3">
      <dt className="text-xs uppercase tracking-wider text-chalk-600">{etichetta}</dt>
      <dd className="display text-3xl leading-tight text-chalk-50 tabular">{valore}</dd>
      {nota && <p className="truncate text-xs text-chalk-400">{nota}</p>}
    </div>
  );
}

function RosaSquadra({ team }: { team: Team }) {
  const perRuolo = ROLES.map((role) => ({
    role,
    players: team.players.filter((p) => p.role === role),
  })).filter((g) => g.players.length > 0);

  return (
    <section className="felt flex flex-col overflow-hidden">
      <header className="nameplate px-3 py-2">
        <h2 className="display truncate text-xl text-chalk-50">{team.name}</h2>
        <p className="text-xs text-chalk-400">
          {team.members.map((m) => m.display_name).join(" e ") || "nessun allenatore"}
        </p>
      </header>

      <dl className="flex justify-between gap-2 border-b border-white/[0.06] px-3 py-2 text-center">
        <Numero etichetta="spesi" valore={team.credits_spent} />
        <Numero etichetta="residui" valore={team.credits_remaining} accento />
        <Numero etichetta="in rosa" valore={team.players_count} />
      </dl>

      {perRuolo.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-chalk-600">Rosa vuota.</p>
      ) : (
        <div className="flex-1 divide-y divide-pitch-800/60">
          {perRuolo.map((gruppo) => (
            <div key={gruppo.role} className="px-3 py-2">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-chalk-600">
                <RoleBadge role={gruppo.role} />
                {ROLE_LABELS[gruppo.role]}
              </p>
              <ul className="space-y-0.5">
                {gruppo.players.map((player) => (
                  <li key={player.player_id} className="flex items-baseline gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-chalk-200">
                      {[player.first_name, player.last_name].filter(Boolean).join(" ")}
                      <span className="ml-1.5 text-xs text-chalk-600">{player.club}</span>
                    </span>
                    <span className="shrink-0 text-gold-400 tabular">{player.price}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Numero({
  etichetta,
  valore,
  accento,
}: {
  etichetta: string;
  valore: number;
  accento?: boolean;
}) {
  return (
    <div className="flex-1">
      <dd className={cn("display text-xl leading-none tabular", accento ? "text-gold-400" : "text-chalk-200")}>
        {valore}
      </dd>
      <dt className="text-[10px] uppercase tracking-wider text-chalk-600">{etichetta}</dt>
    </div>
  );
}
