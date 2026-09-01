"use client";

import { useEffect, useRef, useState } from "react";
import { serverNow, type ClockSync } from "@/lib/serverClock";

/**
 * Millisecondi mancanti a una scadenza decisa dal server.
 *
 * Il valore viene aggiornato con requestAnimationFrame in un componente
 * isolato: il ticchettio non deve ri-renderizzare l'intera sala d'asta 60
 * volte al secondo. Per lo stesso motivo si aggiorna lo stato solo quando
 * cambia il decimo di secondo mostrato.
 */
export function useCountdown(
  deadlineMs: number | null | undefined,
  clock: ClockSync,
  frozenMs?: number | null,
): number {
  const [remaining, setRemaining] = useState(0);
  const lastRef = useRef(-1);

  useEffect(() => {
    // Asta in pausa: il tempo residuo e' congelato, non scorre.
    if (frozenMs != null) {
      setRemaining(frozenMs);
      return;
    }
    if (!deadlineMs) {
      setRemaining(0);
      return;
    }

    let frame = 0;
    const tick = () => {
      const value = Math.max(0, deadlineMs - serverNow(clock));
      const decimals = Math.ceil(value / 100);
      if (decimals !== lastRef.current) {
        lastRef.current = decimals;
        setRemaining(value);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [deadlineMs, clock, frozenMs]);

  return remaining;
}
