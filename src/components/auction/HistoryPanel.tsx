"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { RoleBadge } from "@/components/player/PlayerPortrait";
import { ROLE_COLORS, type AuctionState, type PlayerRole } from "@/lib/types";

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

type View = "storico" | "rose";

/**
 * Storico e rose, consultabili senza uscire dalla sala (§15).
 *
 * E' un pannello laterale e non una pagina apposta perche' lo si apre in
 * mezzo a un'asta: uscire dalla stanza significherebbe perdere di vista il
 * timer. I dati arrivano dallo snapshot che il client ha gia', quindi il
 * pannello si aggiorna da solo a ogni aggiudicazione senza chiedere nulla.
 */
export function HistoryPanel({
  state,
  open,
  onClose,
}: {
  state: AuctionState;
  open: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("storico");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.history.filter((entry) => {
      if (role && entry.role !== role) return false;
      if (teamId && entry.team_id !== teamId) return false;
      if (!needle) return true;
      const haystack = [entry.first_name, entry.last_name, entry.club, entry.team_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [state.history, query, role, teamId]);

  const spesa = filtered.reduce((sum, entry) => sum + entry.price, 0);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Chiudi lo storico"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-pitch-950/60 backdrop-blur-[2px]"
      />

      <aside
        className="anim-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-pitch-700 bg-pitch-900 shadow-2xl"
        role="dialog"
        aria-label="Storico dell'asta"
      >
        <header className="flex items-center gap-3 border-b border-pitch-700 px-4 py-3">
          <div className="flex rounded-[var(--radius-inner)] bg-pitch-800 p-0.5">
            {(["storico", "rose"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-[calc(var(--radius-inner)-2px)] px-3 py-1.5 text-sm capitalize transition",
                  view === v ? "bg-chalk-50 font-medium text-pitch-950" : "text-chalk-400",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <span className="ml-auto text-sm text-chalk-400 tabular">
            {state.history.length} assegnati
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex size-8 items-center justify-center rounded-[var(--radius-inner)] bg-pitch-800 text-chalk-400 transition hover:text-chalk-50"
          >
            <X size={16} weight="bold" />
          </button>
        </header>

        {view === "storico" ? (
          <>
            <div className="space-y-2 border-b border-pitch-700 p-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtra per giocatore, squadra reale o fantasquadra…"
                className="h-9 text-sm"
              />
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={role === null} onClick={() => setRole(null)}>
                  Tutti
                </FilterChip>
                {ROLES.map((r) => (
                  <FilterChip
                    key={r}
                    active={role === r}
                    onClick={() => setRole(role === r ? null : r)}
                    color={ROLE_COLORS[r]}
                  >
                    {r}
                  </FilterChip>
                ))}
                <select
                  value={teamId ?? ""}
                  onChange={(e) => setTeamId(e.target.value || null)}
                  className="ml-auto h-7 rounded-lg border border-pitch-600 bg-pitch-900 px-2 text-xs text-chalk-200"
                >
                  <option value="">Tutte le squadre</option>
                  {state.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-8 text-center text-sm text-chalk-600">
                  {state.history.length === 0
                    ? "Nessun giocatore ancora assegnato."
                    : "Nessun risultato con questi filtri."}
                </p>
              ) : (
                <ul className="divide-y divide-pitch-800">
                  {filtered.map((entry) => (
                    <li key={entry.lot_id} className="flex items-center gap-3 px-4 py-2">
                      <RoleBadge role={entry.role} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-chalk-50">
                          {[entry.first_name, entry.last_name].filter(Boolean).join(" ")}
                        </span>
                        <span className="block truncate text-xs text-chalk-600">
                          {entry.club} · {entry.team_name}
                        </span>
                      </span>
                      <span className="display shrink-0 text-lg text-gold-400 tabular">
                        {entry.price}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="flex items-center justify-between border-t border-pitch-700 px-4 py-2.5 text-sm">
              <span className="text-chalk-400">
                {filtered.length} giocator{filtered.length === 1 ? "e" : "i"}
              </span>
              <span className="text-chalk-200">
                <span className="display text-lg text-gold-400 tabular">{spesa}</span> crediti
              </span>
            </footer>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {state.teams.map((team) => (
              <section key={team.id} className="border-b border-pitch-800">
                <header className="sticky top-0 z-10 flex items-baseline gap-2 bg-pitch-850 px-4 py-2">
                  <h3 className="display min-w-0 flex-1 truncate text-lg text-chalk-50">
                    {team.name}
                  </h3>
                  <span className="shrink-0 text-xs text-chalk-400 tabular">
                    {team.players_count} giocatori · {team.credits_remaining} crediti
                  </span>
                </header>

                {team.players.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-chalk-600">Rosa ancora vuota.</p>
                ) : (
                  <ul className="divide-y divide-pitch-800/60">
                    {ROLES.flatMap((r) =>
                      team.players
                        .filter((p) => p.role === r)
                        .map((player) => (
                          <li
                            key={player.player_id}
                            className="flex items-center gap-3 px-4 py-1.5"
                          >
                            <RoleBadge role={player.role} />
                            <span className="min-w-0 flex-1 truncate text-sm text-chalk-200">
                              {[player.first_name, player.last_name].filter(Boolean).join(" ")}
                              <span className="ml-1.5 text-xs text-chalk-600">{player.club}</span>
                            </span>
                            <span className="shrink-0 text-sm text-gold-400 tabular">
                              {player.price}
                            </span>
                          </li>
                        )),
                    )}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 rounded-lg px-2.5 text-xs font-medium transition",
        active ? "bg-chalk-50 text-pitch-950" : "bg-pitch-800 text-chalk-400 hover:text-chalk-50",
      )}
      style={!active && color ? { color } : undefined}
    >
      {children}
    </button>
  );
}
