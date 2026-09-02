import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseListone } from "./parse";

/**
 * Integrazione con il database vero: si percorre esattamente la strada del
 * browser (accesso anonimo, profilo, RPC) con il listone ufficiale.
 * Se Supabase locale non e' in esecuzione, i test vengono saltati.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FILE =
  process.env.LISTONE_XLSX ??
  path.join(homedir(), "Downloads", "Quotazioni_Fantacalcio_Stagione_2026_27.xlsx");

async function reachable() {
  if (!URL || !KEY || !existsSync(FILE)) return false;
  try {
    const response = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY } });
    return response.ok;
  } catch {
    return false;
  }
}

const available = await reachable();

describe.skipIf(!available)("importazione del listone ufficiale", () => {
  let supabase: SupabaseClient;
  let listId: string;

  beforeAll(async () => {
    supabase = createClient(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.auth.signInAnonymously();
    expect(error).toBeNull();

    const { error: profileError } = await supabase.rpc("ensure_profile", {
      p_display_name: "Test Import",
      p_avatar_url: null,
    });
    expect(profileError).toBeNull();
  });

  it("crea il listone e importa tutti i giocatori", async () => {
    const bytes = readFileSync(FILE);
    const parsed = await parseListone({
      name: path.basename(FILE),
      buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    expect(parsed.players).toHaveLength(531);

    const { data: list, error: listError } = await supabase.rpc("create_player_list", {
      p_name: "Serie A 2026/27 (test)",
      p_season: "2026/27",
    });
    expect(listError).toBeNull();
    listId = (list as { id: string }).id;

    const { data: result, error: importError } = await supabase.rpc("import_players", {
      p_list_id: listId,
      p_players: parsed.players,
    });
    expect(importError).toBeNull();
    expect(result).toMatchObject({ inserted: 531, updated: 0, total: 531 });
  });

  it("reimportare lo stesso file aggiorna invece di duplicare", async () => {
    const bytes = readFileSync(FILE);
    const parsed = await parseListone({
      name: path.basename(FILE),
      buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    const { data: result, error } = await supabase.rpc("import_players", {
      p_list_id: listId,
      p_players: parsed.players,
    });
    expect(error).toBeNull();
    expect(result).toMatchObject({ inserted: 0, updated: 531, total: 531 });
  });

  it("rifiuta l'importazione in un listone di qualcun altro", async () => {
    const intruder = createClient(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await intruder.auth.signInAnonymously();
    await intruder.rpc("ensure_profile", { p_display_name: "Intruso", p_avatar_url: null });

    const { error } = await intruder.rpc("import_players", {
      p_list_id: listId,
      p_players: [{ external_id: "999", last_name: "Falso", role: "A", role_mantra: [] }],
    });
    expect(error?.message).toContain("not_allowed");
  });

  it("la ricerca trova i giocatori del listone collegato all'asta", async () => {
    const { data: auction, error: auctionError } = await supabase.rpc("create_auction", {
      p_name: "Asta di verifica",
      p_budget: 500,
      p_team_count: 8,
      p_slots_per_team: null,
      p_bid_timer: 10,
      p_list_id: listId,
    });
    expect(auctionError).toBeNull();
    const auctionId = (auction as { id: string }).id;

    // Ricerca senza accenti: "martinez" deve trovare i Martinez del listone.
    const { data: byName } = await supabase.rpc("search_players", {
      p_auction_id: auctionId,
      p_query: "martinez",
      p_role: null,
      p_club: null,
      p_limit: 40,
    });
    const names = (byName as { last_name: string }[]).map((p) => p.last_name);
    expect(names).toContain("Martinez L.");

    // Filtro per squadra reale
    const { data: byClub } = await supabase.rpc("search_players", {
      p_auction_id: auctionId,
      p_query: "inter",
      p_role: "D",
      p_club: null,
      p_limit: 40,
    });
    const defenders = byClub as { club: string; role: string }[];
    expect(defenders.length).toBeGreaterThan(0);
    expect(defenders.every((p) => p.role === "D")).toBe(true);

    // I ruoli mantra sopravvivono al viaggio fino al database
    const dimarco = (byClub as { last_name: string; role_mantra: string[] }[]).find(
      (p) => p.last_name === "Dimarco",
    );
    expect(dimarco?.role_mantra).toEqual(["E", "W"]);
  });
});
