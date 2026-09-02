import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { AuctionEvent, AuctionState } from "@/lib/types";

/**
 * Test multi-partecipante (§24).
 *
 * Ogni "amico" è un client Supabase separato, con la sua sessione e il suo
 * websocket: non è una simulazione dentro un solo processo, sono connessioni
 * distinte che si contendono la stessa asta.
 *
 * Cosa si verifica: che un rilancio arrivi a tutti, che il timer riparta
 * uguale per tutti, che due offerte simultanee non possano vincere entrambe,
 * e che chi perde la connessione ritrovi lo stato esatto al rientro.
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

interface Participant {
  name: string;
  client: SupabaseClient;
  teamId: string;
  events: AuctionEvent[];
  channel?: RealtimeChannel;
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000, label = "condizione") {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timeout in attesa di: ${label}`);
}

async function newClient(displayName: string) {
  const client = createClient(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInAnonymously();
  if (error) throw error;
  await client.rpc("ensure_profile", { p_display_name: displayName, p_avatar_url: null });
  return client;
}

async function subscribe(participant: Participant, auctionId: string) {
  await participant.client.realtime.setAuth();
  const channel = participant.client.channel(`auction:${auctionId}`, {
    config: { private: true },
  });
  channel.on("broadcast", { event: "auction_event" }, (message) => {
    participant.events.push(message.payload as AuctionEvent);
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${participant.name}: canale non aperto`)), 8000);
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  participant.channel = channel;
}

async function snapshot(participant: Participant, auctionId: string): Promise<AuctionState> {
  const { data, error } = await participant.client.rpc("get_auction_state", {
    p_auction_id: auctionId,
  });
  if (error) throw error;
  return data as AuctionState;
}

describe.skipIf(!available)("asta con più partecipanti collegati", () => {
  let auctionId: string;
  const people: Participant[] = [];
  let playerIds: string[] = [];
  let lotId: string;

  beforeAll(async () => {
    const admin = await newClient("Alessandro");

    // Listone minimo, creato dall'amministratore.
    const { data: list } = await admin.rpc("create_player_list", {
      p_name: `Multiclient ${Date.now()}`,
      p_season: "test",
    });
    const listId = (list as { id: string }).id;

    await admin.rpc("import_players", {
      p_list_id: listId,
      p_players: [
        { external_id: "m1", last_name: "Lautaro", role: "A", club: "Inter", quotation: 30, role_mantra: [] },
        { external_id: "m2", last_name: "Barella", role: "C", club: "Inter", quotation: 25, role_mantra: [] },
        { external_id: "m3", last_name: "Theo", role: "D", club: "Milan", quotation: 22, role_mantra: [] },
      ],
    });

    // Timer corto: il test deve poter aspettare la scadenza senza durare un minuto.
    const { data: auction, error } = await admin.rpc("create_auction", {
      p_name: "Serata fra amici",
      p_budget: 500,
      p_team_count: 3,
      p_slots_per_team: null,
      p_bid_timer: 3,
      p_list_id: listId,
    });
    if (error) throw error;
    const created = auction as { id: string; code: string };
    auctionId = created.id;

    const clients = [admin, await newClient("Marco"), await newClient("Luca")];
    const names = ["Alessandro", "Marco", "Luca"];

    for (let i = 0; i < clients.length; i += 1) {
      await clients[i].rpc("join_auction", { p_code: created.code });
    }

    const state = await snapshot(
      { name: "setup", client: admin, teamId: "", events: [] },
      auctionId,
    );

    for (let i = 0; i < clients.length; i += 1) {
      const team = state.teams[i];
      const { error: claimError } = await clients[i].rpc("claim_team", { p_team_id: team.id });
      if (claimError) throw claimError;
      await clients[i].rpc("rename_team", {
        p_team_id: team.id,
        p_name: `Team ${names[i]}`,
      });
      people.push({ name: names[i], client: clients[i], teamId: team.id, events: [] });
    }

    // Ordine di chiamata non sorteggiato: il test deve sapere chi comincia.
    const { error: startError } = await admin.rpc("start_auction", {
      p_auction_id: auctionId,
      p_shuffle: false,
    });
    if (startError) throw startError;

    for (const person of people) await subscribe(person, auctionId);

    const { data: found } = await admin.rpc("search_players", {
      p_auction_id: auctionId,
      p_query: null,
      p_role: null,
      p_club: null,
      p_limit: 10,
    });
    playerIds = (found as { id: string }[]).map((p) => p.id);
  });

  it("la chiamata di un giocatore arriva a tutti i partecipanti", async () => {
    const state = await snapshot(people[0], auctionId);
    const turnTeamId = state.auction.current_turn_team_id;
    const caller = people.find((p) => p.teamId === turnTeamId)!;

    const { data, error } = await caller.client.rpc("nominate_player", {
      p_auction_id: auctionId,
      p_player_id: playerIds[0],
    });
    expect(error).toBeNull();
    lotId = data as string;

    await waitFor(
      () => people.every((p) => p.events.some((e) => e.event_type === "lot_opened")),
      8000,
      "lot_opened su tutti i client",
    );

    // Il banditore detiene l'apertura a 1 credito
    const opened = await snapshot(people[1], auctionId);
    expect(opened.lot?.current_bid).toBe(1);
    expect(opened.lot?.current_bidder_team_id).toBe(caller.teamId);
  });

  it("un rilancio arriva a tutti con lo stesso timer", async () => {
    const state = await snapshot(people[0], auctionId);
    const bidder = people.find((p) => p.teamId !== state.lot!.current_bidder_team_id)!;

    const before = state.lot!.bid_deadline_ms;
    people.forEach((p) => (p.events.length = 0));

    const { error } = await bidder.client.rpc("place_bid", {
      p_lot_id: lotId,
      p_team_id: bidder.teamId,
      p_amount: 10,
    });
    expect(error).toBeNull();

    await waitFor(
      () => people.every((p) => p.events.some((e) => e.event_type === "bid_placed")),
      8000,
      "bid_placed su tutti i client",
    );

    // Ogni partecipante riceve la stessa identica scadenza: il countdown non
    // può divergere da uno schermo all'altro.
    const deadlines = people.map(
      (p) =>
        (p.events.find((e) => e.event_type === "bid_placed")!.payload as {
          bid_deadline_ms: number;
        }).bid_deadline_ms,
    );
    expect(new Set(deadlines).size).toBe(1);

    // §7: il rilancio ha riportato il timer al valore pieno.
    expect(deadlines[0]).toBeGreaterThan(before);
  });

  it("due offerte identiche nello stesso istante: ne passa una sola", async () => {
    const state = await snapshot(people[0], auctionId);
    const leader = state.lot!.current_bidder_team_id;
    const challengers = people.filter((p) => p.teamId !== leader);
    expect(challengers.length).toBeGreaterThanOrEqual(2);

    const results = await Promise.all(
      challengers.map((p) =>
        p.client.rpc("place_bid", { p_lot_id: lotId, p_team_id: p.teamId, p_amount: 25 }),
      ),
    );

    const accepted = results.filter((r) => r.error === null);
    const rejected = results.filter((r) => r.error !== null);
    expect(accepted).toHaveLength(1);
    expect(rejected.length).toBe(challengers.length - 1);
    expect(rejected.every((r) => /bid_too_low|already_leading/.test(r.error!.message))).toBe(true);

    const after = await snapshot(people[0], auctionId);
    expect(after.lot!.current_bid).toBe(25);
  });

  it("chi perde la connessione ritrova lo stato esatto al rientro", async () => {
    const offline = people[2];
    await offline.client.removeChannel(offline.channel!);
    offline.events.length = 0;

    // Mentre è disconnesso, gli altri continuano a rilanciare.
    const state = await snapshot(people[0], auctionId);
    const bidder = people.find(
      (p) => p.teamId !== state.lot!.current_bidder_team_id && p.name !== offline.name,
    )!;
    const { error } = await bidder.client.rpc("place_bid", {
      p_lot_id: lotId,
      p_team_id: bidder.teamId,
      p_amount: 40,
    });
    expect(error).toBeNull();

    // Rientrando non ha visto nulla via realtime...
    expect(offline.events).toHaveLength(0);

    // ...ma lo snapshot lo riallinea completamente.
    await subscribe(offline, auctionId);
    const recovered = await snapshot(offline, auctionId);
    const reference = await snapshot(people[0], auctionId);

    expect(recovered.lot!.current_bid).toBe(40);
    expect(recovered.lot!.current_bid).toBe(reference.lot!.current_bid);
    expect(recovered.lot!.bid_deadline_ms).toBe(reference.lot!.bid_deadline_ms);
    expect(recovered.auction.state_version).toBe(reference.auction.state_version);
  });

  it("allo scadere del tempo il giocatore viene assegnato e i crediti scalati", async () => {
    const before = await snapshot(people[0], auctionId);
    const winnerId = before.lot!.current_bidder_team_id!;
    const price = before.lot!.current_bid;
    const creditsBefore = before.teams.find((t) => t.id === winnerId)!.credits_remaining;

    // Nessun client chiama finalize_lot: si lascia lavorare la sola rete di
    // sicurezza pg_cron, per dimostrare che l'asta si chiude anche a browser
    // tutti chiusi.
    let after: AuctionState | null = null;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      after = await snapshot(people[0], auctionId);
      if (after.lot === null) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(after!.lot).toBeNull();

    const winner = after!.teams.find((t) => t.id === winnerId)!;
    expect(winner.credits_remaining).toBe(creditsBefore - price);
    expect(winner.players_count).toBe(1);

    expect(after!.last_assigned?.team_id).toBe(winnerId);
    expect(after!.last_assigned?.price).toBe(price);
    expect(after!.history[0].price).toBe(price);

    // Il turno è passato alla squadra successiva.
    expect(after!.auction.current_turn_team_id).not.toBe(before.auction.current_turn_team_id);
  });

  it("in pausa nessuno può offrire, e alla ripresa il tempo residuo torna intero", async () => {
    const admin = people[0];
    const state = await snapshot(admin, auctionId);
    const caller = people.find((p) => p.teamId === state.auction.current_turn_team_id)!;

    const { data: newLot, error: nominateError } = await caller.client.rpc("nominate_player", {
      p_auction_id: auctionId,
      p_player_id: playerIds[1],
    });
    expect(nominateError).toBeNull();
    const secondLot = newLot as string;

    const { error: pauseError } = await admin.client.rpc("pause_auction", {
      p_auction_id: auctionId,
    });
    expect(pauseError).toBeNull();

    const other = people.find((p) => p.teamId !== caller.teamId)!;
    const { error: bidError } = await other.client.rpc("place_bid", {
      p_lot_id: secondLot,
      p_team_id: other.teamId,
      p_amount: 5,
    });
    expect(bidError?.message).toContain("auction_paused");

    const paused = await snapshot(admin, auctionId);
    expect(paused.auction.status).toBe("paused");
    expect(paused.lot!.paused_remaining_ms).toBeGreaterThan(0);

    await admin.client.rpc("resume_auction", { p_auction_id: auctionId });

    const resumed = await snapshot(admin, auctionId);
    expect(resumed.auction.status).toBe("running");
    expect(resumed.lot!.paused_remaining_ms).toBeNull();
    expect(resumed.lot!.bid_deadline_ms).toBeGreaterThan(resumed.server_now_ms);

    // Chiusura pulita dei canali.
    for (const person of people) {
      if (person.channel) await person.client.removeChannel(person.channel);
    }
  });
});
