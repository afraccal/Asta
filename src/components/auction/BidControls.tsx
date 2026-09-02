"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import {
  bidFieldValue, effectiveBid, isBelowMinimum, sanitizeBidInput, type BidDraft,
} from "@/lib/bidField";
import type { Lot, Team } from "@/lib/types";

const SCATTI_RAPIDI = [1, 5, 10];

/**
 * Controlli di offerta (§6, §11).
 *
 * Regola del campo: mentre scrivi non ti tocca nessuno. Finché non hai
 * scritto niente segue da solo il minimo valido, così un rilancio altrui non
 * ti lascia con una cifra ormai inutile; appena scrivi, comanda quello che
 * hai scritto. Il pulsante mostra sempre la cifra che partirà davvero.
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
  const [draft, setDraft] = useState<BidDraft>(null);

  const minimum = lot.current_bid + minIncrement;
  const maxBid = myTeam?.max_bid ?? 0;
  const valoreCampo = bidFieldValue(draft, minimum);
  const importo = effectiveBid(draft, minimum, maxBid);
  const rimastoIndietro = isBelowMinimum(draft, minimum);

  const leading = myTeam !== null && lot.current_bidder_team_id === myTeam.id;
  const affordable = minimum <= maxBid;

  const blocked = !myTeam
    ? "Stai guardando l'asta: non hai una squadra."
    : paused
      ? "Asta in pausa."
      : leading
        ? "Sei tu in testa all'offerta."
        : !affordable
          ? `Non ti bastano i crediti: puoi arrivare a ${maxBid}.`
          : null;

  const canBid = blocked === null && !busy;

  function offri(cifra: number) {
    setDraft(null); // il campo torna a seguire il minimo
    onBid(cifra);
  }

  return (
    <div className="w-full max-w-md space-y-1.5">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label="Diminuisci di 1"
          disabled={!canBid || importo <= minimum}
          onClick={() => setDraft(String(Math.max(minimum, importo - 1)))}
          className="display h-12 w-12 shrink-0 rounded-[var(--radius-inner)] bg-pitch-800 text-2xl text-chalk-200 transition hover:bg-pitch-700 active:scale-95 disabled:opacity-40"
        >
          −
        </button>

        <input
          // type="text" e non "number": la rotellina del mouse non cambia piu'
          // la cifra per sbaglio, e su telefono compare comunque il tastierino.
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Importo dell'offerta"
          value={valoreCampo}
          disabled={!canBid}
          onChange={(e) => setDraft(sanitizeBidInput(e.target.value))}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            // Uscendo dal campo si torna a una cifra sensata invece di
            // lasciare a schermo un numero che verrebbe rifiutato.
            if (draft === "" || rimastoIndietro) setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canBid) offri(importo);
            if (e.key === "Escape") setDraft(null);
          }}
          className={cn(
            "display h-12 w-full flex-1 rounded-[var(--radius-inner)] border bg-pitch-900",
            "text-center text-3xl text-chalk-50 tabular",
            "focus:outline-none focus:ring-2 focus:ring-gold-400/25",
            "disabled:opacity-50",
            rimastoIndietro
              ? "border-alarm-400/70 text-alarm-400"
              : "border-pitch-600 focus:border-gold-400",
          )}
        />

        <button
          type="button"
          aria-label="Aumenta di 1"
          disabled={!canBid || importo >= maxBid}
          onClick={() => setDraft(String(Math.min(maxBid, importo + 1)))}
          className="display h-12 w-12 shrink-0 rounded-[var(--radius-inner)] bg-pitch-800 text-2xl text-chalk-200 transition hover:bg-pitch-700 active:scale-95 disabled:opacity-40"
        >
          +
        </button>
      </div>

      <div className="flex gap-2">
        {SCATTI_RAPIDI.map((scatto) => {
          const valore = lot.current_bid + scatto;
          return (
            <button
              key={scatto}
              type="button"
              disabled={!canBid || valore > maxBid || valore < minimum}
              onClick={() => offri(valore)}
              className="display h-9 flex-1 rounded-[var(--radius-inner)] bg-pitch-800 text-lg text-chalk-100 transition hover:bg-pitch-700 active:scale-95 disabled:opacity-40"
            >
              +{scatto}
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
        onClick={() => offri(importo)}
      >
        {blocked ? "Offerta non disponibile" : `Offri ${importo}`}
      </Button>

      <p
        className={cn(
          "min-h-[1rem] text-center text-[11px] leading-4",
          rimastoIndietro ? "text-alarm-400" : "text-chalk-400",
        )}
      >
        {blocked ??
          (rimastoIndietro
            ? `Qualcuno ha rilanciato: ora il minimo è ${minimum}.`
            : myTeam
              ? `Puoi arrivare a ${maxBid} crediti.`
              : "")}
      </p>
    </div>
  );
}
