"use client";

import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

const HOST_LOCALI = ["localhost", "127.0.0.1", "0.0.0.0"];

/**
 * In sviluppo, Supabase gira sul computer di chi programma. Da quel computer
 * si raggiunge come "localhost", ma da un telefono sulla stessa rete no:
 * li' "localhost" e' il telefono stesso.
 *
 * Scrivere l'indirizzo di rete nel file di configurazione funziona finche' il
 * router non ne assegna un altro, e allora smette di funzionare senza dire
 * perche'. Meglio dedurlo: se l'indirizzo configurato e' locale ma la pagina
 * arriva da un altro host, e' da quell'host che si raggiunge anche Supabase.
 *
 * In produzione l'indirizzo e' un dominio vero e questa regola non tocca nulla.
 */
function indirizzoSupabase(): string {
  const configurato = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (typeof window === "undefined") return configurato;

  try {
    const url = new URL(configurato);
    if (HOST_LOCALI.includes(url.hostname) && window.location.hostname !== url.hostname) {
      url.hostname = window.location.hostname;
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    /* indirizzo malformato: se ne accorgera' la prima chiamata */
  }
  return configurato;
}

/**
 * Client browser. Singleton: una sola connessione Realtime per scheda,
 * altrimenti ogni componente aprirebbe il proprio websocket.
 */
export function getSupabaseBrowser() {
  if (!cached) {
    cached = createBrowserClient(
      indirizzoSupabase(),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        realtime: { params: { eventsPerSecond: 20 } },
      },
    );
  }
  return cached;
}
