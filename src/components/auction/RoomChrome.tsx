"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import type { ConnectionStatus } from "@/lib/useAuctionState";
import type { AuctionStatus } from "@/lib/types";

/** Avviso di connessione: l'asta va avanti sul server, qui si dice solo che
 *  questo schermo potrebbe non essere aggiornato. */
export function ConnectionBanner({ connection }: { connection: ConnectionStatus }) {
  if (connection === "live") return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 bg-gold-400/95 py-1.5 text-center text-sm font-medium text-pitch-950"
    >
      Riconnessione in corso… lo stato verrà riallineato da solo.
    </div>
  );
}

export function AdminBar({
  status,
  hasLiveLot,
  busy,
  onPause,
  onResume,
  onSkipTurn,
  onCancelLot,
  onEnd,
}: {
  status: AuctionStatus;
  hasLiveLot: boolean;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkipTurn: () => void;
  onCancelLot: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "paused" ? (
        <Button size="sm" variant="gold" onClick={onResume} disabled={busy}>
          Riprendi
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={onPause} disabled={busy || status !== "running"}>
          Pausa
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onSkipTurn} disabled={busy || hasLiveLot}>
        Salta turno
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancelLot} disabled={busy || !hasLiveLot}>
        Annulla chiamata
      </Button>
      <Button size="sm" variant="danger" onClick={onEnd} disabled={busy}>
        Chiudi asta
      </Button>
    </div>
  );
}

const STATUS_LABEL: Record<AuctionStatus, string> = {
  lobby: "In lobby",
  running: "In corso",
  paused: "In pausa",
  completed: "Terminata",
  cancelled: "Annullata",
};

export function StatusPill({
  status,
  liveLot,
}: {
  status: AuctionStatus;
  liveLot: boolean;
}) {
  const label = status === "running" && liveLot ? "Giocatore in asta" : STATUS_LABEL[status];
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider",
        status === "paused" && "bg-gold-400/15 text-gold-400",
        status === "running" && "bg-turn-400/15 text-turn-400",
        status === "completed" && "bg-pitch-700 text-chalk-400",
      )}
    >
      {label}
    </span>
  );
}
