import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifica del modello di sicurezza (§17).
 *
 * Tutto il progetto poggia su un'affermazione: con la chiave anonima in mano,
 * un client NON puo' scrivere niente e NON puo' leggere le aste altrui.
 * Questi test la mettono alla prova invece di darla per buona: usano la stessa
 * chiave pubblica che finisce nel browser e provano davvero a barare.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function reachable() {
  if (!URL || !KEY) return false;
  try {
    return (await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY } })).ok;
  } catch {
    return false;
  }
}
const available = await reachable();

async function nuovoClient(nome: string) {
  const client = createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  await client.rpc("ensure_profile", { p_display_name: nome, p_avatar_url: null });
  return client;
}

describe.skipIf(!available)("un client con la chiave anonima non puo' barare", () => {
  let vittima: SupabaseClient;
  let attaccante: SupabaseClient;
  let auctionId: string;
  let auctionCode: string;
  let teamId: string;
  let listId: string;

  beforeAll(async () => {
    vittima = await nuovoClient("Proprietario");
    attaccante = await nuovoClient("Malintenzionato");

    const { data: list } = await vittima.rpc("create_player_list", {
      p_name: `Sicurezza ${Date.now()}`,
      p_season: "test",
    });
    listId = (list as { id: string }).id;
    await vittima.rpc("import_players", {
      p_list_id: listId,
      p_players: [
        { external_id: "s1", last_name: "Tizio", role: "A", club: "Roma", quotation: 20, role_mantra: [] },
      ],
    });

    const { data: auction } = await vittima.rpc("create_auction", {
      p_name: "Asta privata", p_budget: 500, p_team_count: 2,
      p_slots_per_team: null, p_bid_timer: 10, p_list_id: listId,
    });
    auctionId = (auction as { id: string }).id;
    auctionCode = (auction as { code: string }).code;

    const { data: state } = await vittima.rpc("get_auction_state", { p_auction_id: auctionId });
    teamId = (state as { teams: { id: string }[] }).teams[0].id;
    await vittima.rpc("claim_team", { p_team_id: teamId });
  });

  // --- Scritture dirette: devono fallire tutte --------------------------------

  it("non puo' regalarsi crediti modificando la squadra", async () => {
    const { error } = await attaccante
      .from("teams")
      .update({ credits_spent: 0, budget_initial: 999999 })
      .eq("id", teamId);
    expect(error).not.toBeNull();
  });

  it("non puo' inserire un'offerta scrivendo direttamente in tabella", async () => {
    const { error } = await attaccante
      .from("bids")
      .insert({ lot_id: auctionId, team_id: teamId, amount: 1 });
    expect(error).not.toBeNull();
  });

  it("non puo' assegnarsi un giocatore scrivendo in team_players", async () => {
    const { error } = await attaccante
      .from("team_players")
      .insert({ auction_id: auctionId, team_id: teamId, player_id: auctionId, lot_id: auctionId, price: 1 });
    expect(error).not.toBeNull();
  });

  it("non puo' aprire un lotto a mano", async () => {
    const { error } = await attaccante.from("auction_lots").insert({
      auction_id: auctionId, player_id: auctionId, turn_number: 1,
      current_bid: 1, bid_deadline: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("non puo' nominarsi amministratore di un'asta altrui", async () => {
    const { data: me } = await attaccante.auth.getUser();
    const { error } = await attaccante
      .from("auctions")
      .update({ admin_id: me.user!.id, status: "lobby" })
      .eq("id", auctionId);
    expect(error).not.toBeNull();
  });

  it("non puo' cancellare le squadre di un'asta", async () => {
    const { error } = await attaccante.from("teams").delete().eq("id", teamId);
    expect(error).not.toBeNull();
  });

  it("non puo' sedersi a un tavolo scrivendo in team_members", async () => {
    const { data: me } = await attaccante.auth.getUser();
    const { error } = await attaccante
      .from("team_members")
      .insert({ team_id: teamId, profile_id: me.user!.id, member_role: "owner" });
    expect(error).not.toBeNull();
  });

  it("non puo' falsificare lo storico degli eventi", async () => {
    const { error } = await attaccante
      .from("auction_events")
      .insert({ auction_id: auctionId, event_type: "falso", payload: {}, state_version: 999 });
    expect(error).not.toBeNull();
  });

  // --- Letture: le aste altrui non si vedono ---------------------------------

  it("non vede le squadre di un'asta di cui non fa parte", async () => {
    const { data, error } = await attaccante.from("teams").select("*").eq("auction_id", auctionId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS non da' errore: semplicemente non esiste nulla
  });

  it("non vede l'asta stessa", async () => {
    const { data } = await attaccante.from("auctions").select("*").eq("id", auctionId);
    expect(data).toHaveLength(0);
  });

  it("lo snapshot di un'asta altrui viene rifiutato", async () => {
    const { error } = await attaccante.rpc("get_auction_state", { p_auction_id: auctionId });
    expect(error?.message).toContain("not_a_member");
  });

  it("la ricerca giocatori di un'asta altrui viene rifiutata", async () => {
    const { error } = await attaccante.rpc("search_players", {
      p_auction_id: auctionId, p_query: null, p_role: null, p_club: null, p_limit: 5,
    });
    expect(error?.message).toContain("not_a_member");
  });

  // --- Funzioni interne: non invocabili --------------------------------------

  it("non puo' invocare gli helper interni del database", async () => {
    const bump = await attaccante.rpc("_bump_state", {
      p_auction_id: auctionId, p_event_type: "falso", p_payload: {},
    });
    expect(bump.error).not.toBeNull();

    const cron = await attaccante.rpc("finalize_expired_lots");
    expect(cron.error).not.toBeNull();
  });

  // --- Autorizzazioni dentro l'asta ------------------------------------------

  it("entrato con il codice, non puo' comunque offrire per una squadra non sua", async () => {
    await attaccante.rpc("join_auction", { p_code: auctionCode });

    // Ora vede l'asta, come e' giusto: e' entrato con il codice.
    const { error: readError } = await attaccante.rpc("get_auction_state", {
      p_auction_id: auctionId,
    });
    expect(readError).toBeNull();

    // Ma le scritture dirette restano chiuse anche da dentro.
    const { error: writeError } = await attaccante
      .from("teams")
      .update({ credits_spent: 0 })
      .eq("id", teamId);
    expect(writeError).not.toBeNull();
  });

  it("non puo' avviare l'asta di cui non e' amministratore", async () => {
    const { error } = await attaccante.rpc("start_auction", {
      p_auction_id: auctionId, p_shuffle: false,
    });
    expect(error?.message).toContain("not_admin");
  });

  it("non puo' mettere in pausa l'asta altrui", async () => {
    const { error } = await attaccante.rpc("pause_auction", { p_auction_id: auctionId });
    expect(error?.message).toMatch(/not_admin|auction_not_running/);
  });

  it("non puo' importare giocatori nel listone di un altro", async () => {
    const { error } = await attaccante.rpc("import_players", {
      p_list_id: listId,
      p_players: [{ external_id: "x", last_name: "Falso", role: "A", role_mantra: [] }],
    });
    expect(error?.message).toContain("not_allowed");
  });
});
