import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// supabase-js istanzia il client Realtime alla creazione e cerca WebSocket fra
// le globali: Node 20 non ce l'ha (arriva con Node 22).
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

/**
 * Preparazione dello scenario via API.
 *
 * I test end-to-end guidano l'INTERFACCIA; l'allestimento (creare l'asta,
 * caricare quattro giocatori, far sedere qualcuno) passa dalle stesse RPC che
 * usa l'app. Farlo cliccando allungherebbe ogni test di un minuto senza
 * verificare niente di piu'.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function nuovoClient(nome: string): Promise<SupabaseClient> {
  const client = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  await client.rpc("ensure_profile", { p_display_name: nome, p_avatar_url: null });
  return client;
}

export interface Scenario {
  code: string;
  auctionId: string;
  /** Tavoli senza allenatori: i browser del test si siedono qui. */
  postiLiberi: { id: string; name: string }[];
  /** Squadra dell'ospite gia' seduto, che fara' da avversario. */
  avversario: { id: string; name: string };
  avversarioClient: SupabaseClient;
  /** L'amministratore: puo' chiamare per qualunque squadra. */
  adminClient: SupabaseClient;
}

export async function creaScenario(nome = "Asta E2E"): Promise<Scenario> {
  const regista = await nuovoClient("Regista");

  const { data: list } = await regista.rpc("create_player_list", {
    p_name: `E2E ${Date.now()}`,
    p_season: "test",
  });
  const listId = (list as { id: string }).id;

  await regista.rpc("import_players", {
    p_list_id: listId,
    p_players: [
      { external_id: "e1", last_name: "Zanetti", role: "D", club: "Inter", quotation: 20, role_mantra: [] },
      { external_id: "e2", last_name: "Baggio", role: "A", club: "Brescia", quotation: 35, role_mantra: [] },
      { external_id: "e3", last_name: "Pirlo", role: "C", club: "Milan", quotation: 28, role_mantra: [] },
      { external_id: "e4", last_name: "Buffon", role: "P", club: "Juventus", quotation: 18, role_mantra: [] },
    ],
  });

  const { data: auction, error } = await regista.rpc("create_auction", {
    p_name: nome, p_budget: 500, p_team_count: 3,
    p_slots_per_team: null, p_bid_timer: 10, p_list_id: listId,
  });
  if (error) throw error;
  const { id: auctionId, code } = auction as { id: string; code: string };

  const { data: stato } = await regista.rpc("get_auction_state", { p_auction_id: auctionId });
  const teams = (stato as { teams: { id: string; name: string }[] }).teams;

  await regista.rpc("claim_team", { p_team_id: teams[0].id });
  await regista.rpc("rename_team", { p_team_id: teams[0].id, p_name: "Squadra Regista" });

  const avversarioClient = await nuovoClient("Avversario");
  await avversarioClient.rpc("join_auction", { p_code: code });
  await avversarioClient.rpc("claim_team", { p_team_id: teams[1].id });
  await avversarioClient.rpc("rename_team", { p_team_id: teams[1].id, p_name: "Squadra Avversaria" });

  // Il terzo tavolo va occupato PRIMA dell'avvio e liberato subito dopo:
  // start_auction rimuove le squadre rimaste vuote in lobby, quindi un posto
  // lasciato libero da subito non esisterebbe piu'. Cosi' invece si riproduce
  // il caso vero: qualcuno che si alza a partita iniziata.
  const passante = await nuovoClient("Passante");
  await passante.rpc("join_auction", { p_code: code });
  await passante.rpc("claim_team", { p_team_id: teams[2].id });
  await passante.rpc("rename_team", { p_team_id: teams[2].id, p_name: "Tavolo Libero" });

  await regista.rpc("start_auction", { p_auction_id: auctionId, p_shuffle: false });
  await passante.rpc("leave_team", { p_team_id: teams[2].id });

  return {
    code,
    auctionId,
    postiLiberi: [{ id: teams[2].id, name: "Tavolo Libero" }],
    avversario: { id: teams[1].id, name: "Squadra Avversaria" },
    avversarioClient,
    adminClient: regista,
  };
}

/** Il regista chiama un giocatore, cosi' il test trova un lotto gia' aperto. */
export async function apriLotto(scenario: Scenario, cognome: string) {
  const { data: trovati } = await scenario.adminClient.rpc("search_players", {
    p_auction_id: scenario.auctionId, p_query: cognome,
    p_role: null, p_club: null, p_limit: 1,
  });
  const playerId = (trovati as { id: string }[])[0].id;

  // L'amministratore puo' chiamare per la squadra di turno, chiunque sia:
  // e' la stessa deroga che in una serata vera serve quando qualcuno si
  // disconnette proprio mentre tocca a lui.
  const { data: lotId, error } = await scenario.adminClient.rpc("nominate_player", {
    p_auction_id: scenario.auctionId, p_player_id: playerId,
  });
  if (error) throw error;
  return lotId as string;
}

/** Un rilancio piazzato dall'avversario, per vedere se arriva sullo schermo. */
export async function rilancia(scenario: Scenario, lotId: string, importo: number) {
  const { error } = await scenario.avversarioClient.rpc("place_bid", {
    p_lot_id: lotId, p_team_id: scenario.avversario.id, p_amount: importo,
  });
  if (error) throw error;
}
