"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sincronizzazione dell'orologio col server.
 *
 * Il timer dell'asta e' una scadenza assoluta decisa dal database. Perche'
 * tutti vedano lo stesso numero, ogni client misura di quanto il proprio
 * orologio e' sfasato rispetto a quello del server.
 *
 * Metodo (NTP semplificato): si campiona piu' volte e si tiene la misura
 * con andata-e-ritorno piu' breve, perche' e' quella meno inquinata dai
 * ritardi di rete. Con 5 campioni l'errore residuo e' tipicamente < 30ms:
 * impercettibile su un countdown di 10 secondi.
 */

export interface ClockSync {
  offsetMs: number;
  rttMs: number;
}

export async function measureClockOffset(
  supabase: SupabaseClient,
  samples = 5,
): Promise<ClockSync> {
  let best: ClockSync = { offsetMs: 0, rttMs: Number.POSITIVE_INFINITY };

  for (let i = 0; i < samples; i += 1) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc("server_now");
    const t1 = Date.now();
    if (error || !data) continue;

    const rttMs = t1 - t0;
    const serverMs = Number((data as { now_ms: number }).now_ms);
    // Si assume che andata e ritorno siano simmetrici: il server era a
    // serverMs quando qui era la meta' esatta del giro.
    const offsetMs = serverMs - (t0 + rttMs / 2);

    if (rttMs < best.rttMs) best = { offsetMs, rttMs };
  }

  return Number.isFinite(best.rttMs) ? best : { offsetMs: 0, rttMs: 0 };
}

/** Ora del server stimata, in millisecondi. */
export function serverNow(sync: ClockSync): number {
  return Date.now() + sync.offsetMs;
}
