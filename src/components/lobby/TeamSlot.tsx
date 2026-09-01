"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Team } from "@/lib/types";

interface Props {
  team: Team;
  isMine: boolean;
  canRename: boolean;
  canJoin: boolean;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onRename: (name: string) => void;
}

export function TeamSlot({
  team,
  isMine,
  canRename,
  canJoin,
  busy,
  onJoin,
  onLeave,
  onRename,
}: Props) {
  // La bozza esiste solo durante la modifica: si inizializza al click, cosi'
  // non serve tenerla sincronizzata con il nome che arriva dal server.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const full = team.members.length >= 2;

  function commit() {
    const value = draft.trim();
    setEditing(false);
    if (value && value !== team.name) onRename(value);
    else setDraft(team.name);
  }

  return (
    <div
      className={cn(
        "surface flex flex-col gap-4 p-4 transition",
        isMine && "border-brand-500/70 bg-brand-500/[0.07]",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="display flex size-8 shrink-0 items-center justify-center rounded-lg bg-pitch-700 text-sm text-chalk-400 tabular">
          {team.turn_position}
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              value={draft}
              autoFocus
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(team.name);
                  setEditing(false);
                }
              }}
              className="h-9"
            />
          ) : (
            <button
              type="button"
              disabled={!canRename}
              onClick={() => {
                setDraft(team.name);
                setEditing(true);
              }}
              className={cn(
                "display block max-w-full truncate text-left text-xl leading-tight text-chalk-50",
                canRename ? "hover:text-gold-400" : "cursor-default",
              )}
              title={canRename ? "Clicca per rinominare" : team.name}
            >
              {team.name}
            </button>
          )}
          <p className="mt-0.5 text-xs text-chalk-400">
            {team.budget_initial} crediti · {team.members.length}/2 allenatori
          </p>
        </div>
      </div>

      <div className="flex min-h-[2.25rem] flex-wrap items-center gap-2">
        {team.members.length === 0 ? (
          <span className="text-sm text-chalk-600">Posto libero</span>
        ) : (
          team.members.map((m) => (
            <span
              key={m.profile_id}
              className="flex items-center gap-2 rounded-full bg-pitch-800 py-1 pl-1 pr-3"
            >
              <Avatar name={m.display_name} src={m.avatar_url} online={m.online} size={26} />
              <span className="max-w-[9rem] truncate text-sm text-chalk-200">
                {m.display_name}
              </span>
            </span>
          ))
        )}
      </div>

      {isMine ? (
        <Button variant="ghost" size="sm" onClick={onLeave} disabled={busy}>
          Lascia la squadra
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={onJoin}
          disabled={busy || full || !canJoin}
          title={full ? "Questa squadra ha gia' 2 allenatori" : undefined}
        >
          {full ? "Completa" : "Siediti qui"}
        </Button>
      )}
    </div>
  );
}
