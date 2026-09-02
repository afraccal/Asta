"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Lot } from "@/lib/types";

/**
 * Chiusura del lotto allo scadere del tempo.
 *
 * È il canale "veloce" fra i due che chiudono un lotto: appena il countdown
 * tocca lo zero, il client chiede al server di assegnare. L'altro canale è il
 * job pg_cron che gira ogni secondo e chiude comunque, anche a browser tutti
 * chiusi.
 *
 * Le due strade non possono fare danni perché finalize_lot() è idempotente:
 * sotto lock verifica che il lotto sia ancora aperto e scaduto, quindi la
 * seconda chiamata non trova nulla da fare. Il ritardo casuale serve solo a
 * non far arrivare otto richieste identiche nello stesso millisecondo.
 */
export function useLotFinalizer(lot: Lot | null, remainingMs: number, enabled: boolean) {
  const firedForLot = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !lot || lot.status !== "live") return;
    if (remainingMs > 0) return;
    if (firedForLot.current === lot.id) return;

    firedForLot.current = lot.id;
    const handle = setTimeout(
      () => {
        void getSupabaseBrowser().rpc("finalize_lot", { p_lot_id: lot.id });
      },
      Math.random() * 250,
    );

    return () => clearTimeout(handle);
  }, [enabled, lot, remainingMs]);
}
