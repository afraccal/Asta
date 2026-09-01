"use client";

import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Client browser. Singleton: una sola connessione Realtime per scheda,
 * altrimenti ogni componente aprirebbe il proprio websocket.
 */
export function getSupabaseBrowser() {
  if (!cached) {
    cached = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        realtime: { params: { eventsPerSecond: 20 } },
      },
    );
  }
  return cached;
}
