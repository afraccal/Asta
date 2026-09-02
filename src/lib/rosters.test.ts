import { describe, expect, it } from "vitest";
import { withRosters } from "./rosters";
import type { AuctionState, HistoryEntry, Team } from "@/lib/types";

function squadra(id: string): Team {
  return {
    id, name: id, turn_position: 1, budget_initial: 500, credits_spent: 0,
    credits_remaining: 500, players_count: 0, max_bid: 500, members: [], players: [],
  };
}

function acquisto(
  playerId: string, teamId: string | null, price: number, extra: Partial<HistoryEntry> = {},
): HistoryEntry {
  return {
    lot_id: `lot-${playerId}`, turn_number: 1, price, team_id: teamId,
    team_name: teamId, player_id: playerId, first_name: null, last_name: playerId,
    role: "A", club: "Inter", acquired_at_ms: 0, ...extra,
  };
}

function stato(teams: Team[], history: HistoryEntry[]): AuctionState {
  return {
    server_now_ms: 0,
    auction: {} as AuctionState["auction"],
    teams, history, lot: null, last_assigned: null,
    me: { profile_id: "x", is_admin: false, team_id: null },
  };
}

describe("rose ricavate dallo storico", () => {
  it("assegna ogni acquisto alla squadra che lo ha comprato", () => {
    const out = withRosters(
      stato(
        [squadra("A"), squadra("B")],
        [acquisto("p1", "A", 30), acquisto("p2", "B", 25), acquisto("p3", "A", 10)],
      ),
    );

    expect(out.teams[0].players.map((p) => p.player_id)).toEqual(["p1", "p3"]);
    expect(out.teams[1].players.map((p) => p.player_id)).toEqual(["p2"]);
    expect(out.teams[0].players[0].price).toBe(30);
  });

  it("conserva l'ordine dello storico, dal piu' recente", () => {
    // get_auction_state ordina per chiusura decrescente: i tavoli mostrano
    // gli ultimi arrivati, quindi l'ordine non va perso.
    const out = withRosters(
      stato([squadra("A")], [acquisto("recente", "A", 5), acquisto("vecchio", "A", 5)]),
    );
    expect(out.teams[0].players.map((p) => p.player_id)).toEqual(["recente", "vecchio"]);
  });

  it("una squadra senza acquisti ha la rosa vuota, non indefinita", () => {
    const out = withRosters(stato([squadra("A"), squadra("B")], [acquisto("p1", "A", 1)]));
    expect(out.teams[1].players).toEqual([]);
  });

  it("ignora le righe di storico senza squadra invece di rompersi", () => {
    const out = withRosters(stato([squadra("A")], [acquisto("orfano", null, 7), acquisto("p1", "A", 3)]));
    expect(out.teams[0].players.map((p) => p.player_id)).toEqual(["p1"]);
  });

  it("riporta ruolo, squadra reale e prezzo del giocatore", () => {
    const out = withRosters(
      stato([squadra("A")], [acquisto("p1", "A", 42, { role: "D", club: "Milan", first_name: "Theo", last_name: "Hernandez" })]),
    );
    expect(out.teams[0].players[0]).toMatchObject({
      role: "D", club: "Milan", price: 42, first_name: "Theo", last_name: "Hernandez",
    });
  });

  it("non modifica lo stato ricevuto", () => {
    const iniziale = stato([squadra("A")], [acquisto("p1", "A", 3)]);
    withRosters(iniziale);
    expect(iniziale.teams[0].players).toEqual([]);
  });
});
