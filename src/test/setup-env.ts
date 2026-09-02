import { config } from "dotenv";
import WebSocket from "ws";

// Next legge .env.local da solo; vitest no. Le stesse chiavi dello sviluppo
// servono ai test di integrazione contro Supabase locale.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

// supabase-js istanzia il client Realtime alla creazione e cerca WebSocket
// fra le globali: Node 20 non ce l'ha (arriva con Node 22).
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}
