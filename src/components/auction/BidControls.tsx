"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import type { Lot, Team } from "@/lib/types";

const QUICK_STEPS = [1, 5, 10];

/**
 * Controlli di offerta (§6, §11).
 *
 * L'importo non è tenuto in stato: si deriva dall'offerta corrente. Se mentre
 * stai digitando qualcuno rilancia più alto, la tua cifra sale da sola al
 * nuovo minimo valido invece di restare un numero che il server rifiuterebbe.
 *
 * Il tetto è `max_bid`, calcolato dal server tenendo conto degli slot ancora
 * da riempire: qui serve solo a non far premere un pulsante destinato a
 * fallire, non a garantire la regola, che vive nel database.
 */
export function BidControls({
  lot,
  myTeam,
  minIncrement,
  paused,
  busy,
  onBid,
}: {
  lot: Lot;
  myTeam: Team | null;
  minIncrement: number;
  paused: boolean;
  busy: boolean;
  onBid: (amount: number) => void;
}) {
  const [typed, setTyped] = useState<number | null>(null);

  const minimum = lot.current_bid + minIncrement;
  const maxBid = myTeam?.max_bid ?? 0;
  const amount = typed !== null && typed >= minimum ? Math.min(typed, maxBid) : minimum;

  const leading = myTeam !== null && lot.current_bidder_team_id === myTeam.id;
  const affordable = minimum <= maxBid;

  const blocked =
    !myTeam
      ? "Stai guardando l'asta: non hai una squadra."
      : paused
        ? "Asta in pausa."
        : leading
          ? "Sei tu in testa all'offerta."
          : !affordable
            ? `Non ti bastano i crediti: puoi arrivare a ${maxBid}.`
            : null;

  const canBid = blocked === null && !busy;

  return (
    <div className="w-full max-w-md space-y-1.5">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label="Diminuisci"
          disabled={!canBid || amount <= minimum}
          onClick={() => setTyped(Math.max(minimum, amount - 1))}
          className="display h-12 w-12 shrink-0 rounded-[var(--radius-inner)] bg-pitch-800 text-2xl text-chalk-200 transition hover:bg-pitch-700 active:scale-95 disabled:opacity-40"
        >
          −
        </button>

        <div className="relative flex-1">
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            min={minimum}
            max={maxBid}
            disabled={!canBid}
            onChange={(e) => setTyped(Number(e.target.value))}
            className={cn(
              "display h-12 w-full rounded-[var(--radius-inner)] border border-pitch-600 bg-pitch-900",
              "text-center text-3xl text-chalk-50 tabular",
              "focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/25",
              "disabled:opacity-50 [appearance:textfield]",
              "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            )}
          />
        </div>

        <button
          type="button"
          aria-label="Aumenta"
          disabled={!canBid || amount >= maxBid}
          onClick={() => setTyped(Math.min(maxBid, amount + 1))}
          className="display h-12 w-12 shrink-0 rounded-[var(--radius-inner)] bg-pitch-800 text-2xl text-chalk-200 transition hover:bg-pitch-700 active:scale-95 disabled:opacity-40"
        >
          +
        </button>
      </div>

      <div className="flex gap-2">
        {QUICK_STEPS.map((step) => {
          const value = lot.current_bid + step;
          return (
            <button
              key={step}
              type="button"
              disabled={!canBid || value > maxBid || value < minimum}
              onClick={() => {
                setTyped(value);
                onBid(value);
              }}
              className="display h-9 flex-1 rounded-[var(--radius-inner)] bg-pitch-800 text-lg text-chalk-100 transition hover:bg-pitch-700 active:scale-95 disabled:opacity-40"
            >
              +{step}
            </button>
          );
        })}
      </div>

      <Button
        variant={blocked ? "ghost" : "gold"}
        size="lg"
        className="h-12 w-full text-xl"
        loading={busy}
        disabled={!canBid}
        onClick={() => onBid(amount)}
      >
        {blocked ? "Offerta non disponibile" : `Offri ${amount}`}
      </Button>

      <p className="min-h-[1rem] text-center text-[11px] leading-4 text-chalk-400">
        {blocked ?? (myTeam ? `Puoi arrivare a ${maxBid} crediti.` : "")}
      </p>
    </div>
  );
}
