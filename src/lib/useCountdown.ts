"use client";

import { useEffect, useRef, useState } from "react";
import { serverNow, type ClockSync } from "@/lib/serverClock";

/**
 * Il calcolo puro del tempo residuo, estratto per poterlo verificare senza un
 * DOM: è la parte che deve restare esatta a prescindere da quando avviene il
 * render.
 */
export function remainingFrom(
  deadlineMs: number | null | undefined,
  clock: ClockSync,
  frozenMs?: number | null,
): number {
  if (frozenMs != null) return frozenMs;
  if (!deadlineMs) return 0;
  return Math.max(0, deadlineMs - serverNow(clock));
}

/**
 * Millisecondi mancanti a una scadenza decisa dal server.
 *
 * Il valore NON è tenuto in stato: viene ricalcolato a ogni render dalla
 * scadenza assoluta. Lo stato serve solo a provocare i render. È una
 * distinzione che conta:
 *
 * - il numero mostrato non può mai essere vecchio, nemmeno al primo render o
 *   subito dopo il cambio di lotto (con un valore in stato ci sarebbe un
 *   istante a zero, e la chiusura del lotto potrebbe partire per sbaglio);
 * - se il browser rallenta o sospende i timer, alla ripresa il numero è già
 *   quello giusto invece di dover recuperare il tempo perduto.
 *
 * Si usa setInterval e non requestAnimationFrame: rAF viene *congelato* quando
 * la scheda non è in primo piano, e un countdown fermo lascia in scena cose
 * che dovevano sparire. I timer vengono al massimo rallentati, mai fermati, e
 * con il valore ricalcolato a ogni render il rallentamento non fa danni.
 */
export function useCountdown(
  deadlineMs: number | null | undefined,
  clock: ClockSync,
  frozenMs?: number | null,
): number {
  const [, tick] = useState(0);
  const lastShown = useRef(-1);

  useEffect(() => {
    // Asta in pausa o nessuna scadenza: non c'è niente che scorre.
    if (frozenMs != null || !deadlineMs) return;

    const check = () => {
      // Si ridisegna solo quando cambia il decimo di secondo mostrato:
      // dieci render al secondo bastano, sessanta sono sprecati.
      const decis = Math.ceil(remainingFrom(deadlineMs, clock) / 100);
      if (decis !== lastShown.current) {
        lastShown.current = decis;
        tick((value) => value + 1);
      }
    };

    const interval = setInterval(check, 60);
    // Al ritorno in primo piano si riallinea subito, senza aspettare il tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deadlineMs, clock, frozenMs]);

  return remainingFrom(deadlineMs, clock, frozenMs);
}
