"use client";

import { Button } from "@/components/ui/Button";
import type { Team } from "@/lib/types";

/**
 * Sedersi a un tavolo ad asta gia' iniziata.
 *
 * Serve piu' spesso di quanto sembri: l'amico che arriva a partita in corso,
 * il secondo allenatore che si aggiunge, chi ha lasciato la squadra per
 * sbaglio. Il database lo permette gia'; mancava solo il modo di chiederlo,
 * perche' la lobby a quel punto rimanda in sala.
 */
export function SeatPicker({
  teams,
  busy,
  onSit,
}: {
  teams: Team[];
  busy: boolean;
  onSit: (teamId: string) => void;
}) {
  const available = teams.filter((t) => t.members.length < 2);

  if (available.length === 0) {
    return (
      <p className="text-center text-sm text-chalk-400">
        Stai guardando l&apos;asta: tutti i tavoli sono al completo.
      </p>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-2 text-center">
      <p className="text-xs uppercase tracking-wider text-chalk-400">
        Non hai una squadra. Siediti a un tavolo:
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {available.map((team) => (
          <Button
            key={team.id}
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onSit(team.id)}
          >
            {team.name}
            <span className="text-chalk-600">
              {team.members.length === 0 ? "libero" : `con ${team.members[0].display_name}`}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
