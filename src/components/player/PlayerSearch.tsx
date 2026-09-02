"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { PlayerPortrait, RoleBadge } from "@/components/player/PlayerPortrait";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, playerFullName, type Player, type PlayerRole } from "@/lib/types";

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

/**
 * Ricerca nel listone per nome, cognome, squadra e ruolo (§5).
 *
 * La ricerca gira sul database, non su una copia del listone scaricata nel
 * browser: così i giocatori già venduti spariscono dai risultati in tempo
 * reale, senza dover tenere sincronizzata una lista lato client.
 */
export function PlayerSearch({
  auctionId,
  onSelect,
  selectedId,
  autoFocus,
}: {
  auctionId: string;
  onSelect?: (player: Player) => void;
  selectedId?: string | null;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [results, setResults] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);

  // Ogni risposta porta il numero della richiesta che l'ha generata: quelle
  // arrivate in ritardo vengono scartate invece di sovrascrivere le più recenti.
  const requestRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      const requestId = ++requestRef.current;
      setLoading(true);

      void getSupabaseBrowser()
        .rpc("search_players", {
          p_auction_id: auctionId,
          p_query: query.trim() || null,
          p_role: role,
          p_club: null,
          p_limit: 40,
        })
        .then(({ data }: { data: unknown }) => {
          if (requestId !== requestRef.current) return;
          setResults((data as Player[]) ?? []);
          setLoading(false);
        });
    }, 180);

    return () => clearTimeout(handle);
  }, [auctionId, query, role]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca per nome, cognome o squadra…"
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setRole(null)}
          className={cn(
            "h-8 rounded-lg px-3 text-sm transition",
            role === null
              ? "bg-chalk-50 font-medium text-pitch-950"
              : "bg-pitch-800 text-chalk-400 hover:text-chalk-50",
          )}
        >
          Tutti
        </button>
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(role === r ? null : r)}
            title={ROLE_LABELS[r]}
            className={cn(
              "h-8 w-9 rounded-lg text-sm font-medium transition",
              role === r
                ? "bg-chalk-50 text-pitch-950"
                : "bg-pitch-800 text-chalk-400 hover:text-chalk-50",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-pitch-700">
        {results.length === 0 ? (
          <p className="p-6 text-center text-sm text-chalk-600">
            {loading ? "Ricerca…" : "Nessun giocatore disponibile con questi criteri."}
          </p>
        ) : (
          <ul className="divide-y divide-pitch-800">
            {results.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(player)}
                  disabled={!onSelect}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left transition",
                    onSelect && "hover:bg-pitch-800",
                    selectedId === player.id && "bg-brand-500/15",
                  )}
                >
                  <PlayerPortrait player={player} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-chalk-50">
                      {playerFullName(player)}
                    </span>
                    <span className="block truncate text-xs text-chalk-400">
                      {player.club}
                      {player.role_mantra.length > 0 && ` · ${player.role_mantra.join(" ")}`}
                    </span>
                  </span>
                  <RoleBadge role={player.role} />
                  {player.quotation !== null && (
                    <span className="display w-8 text-right text-lg text-gold-400 tabular">
                      {player.quotation}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
