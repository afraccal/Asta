import { describe, expect, it } from "vitest";
import { buildRosterCsv } from "./exportCsv";
import type { AuctionState, Team } from "@/lib/types";

function squadra(name: string, players: Team["players"]): Team {
  return {
    id: name, name, turn_position: 1, budget_initial: 500,
    credits_spent: 0, credits_remaining: 500, players_count: players.length,
    max_bid: 500, members: [], players,
  };
}

function stato(teams: Team[]): AuctionState {
  return {
    server_now_ms: 0,
    auction: { code: "ABC123" } as AuctionState["auction"],
    teams, lot: null, last_assigned: null, history: [],
    me: { profile_id: "x", is_admin: false, team_id: null },
  };
}

describe("CSV delle rose", () => {
  it("scrive intestazione e una riga per giocatore", () => {
    const csv = buildRosterCsv(
      stato([
        squadra("Team Alessandro", [
          { player_id: "1", first_name: "Theo", last_name: "Hernandez", role: "D", club: "Milan", price: 42 },
          { player_id: "2", first_name: null, last_name: "Martinez L.", role: "A", club: "Inter", price: 33 },
        ]),
      ]),
    );

    expect(csv.split("\n")).toEqual([
      "Fantasquadra,Ruolo,Giocatore,Squadra,Prezzo",
      "Team Alessandro,D,Theo Hernandez,Milan,42",
      "Team Alessandro,A,Martinez L.,Inter,33",
    ]);
  });

  it("mette fra virgolette i nomi che contengono una virgola", () => {
    const csv = buildRosterCsv(
      stato([
        squadra("Roma, Caput Mundi", [
          { player_id: "1", first_name: null, last_name: "Svilar", role: "P", club: "Roma", price: 19 },
        ]),
      ]),
    );
    expect(csv).toContain('"Roma, Caput Mundi",P,Svilar,Roma,19');
  });

  it("raddoppia le virgolette interne invece di spezzare il campo", () => {
    const csv = buildRosterCsv(
      stato([
        squadra('I "Campioni"', [
          { player_id: "1", first_name: null, last_name: "Rabiot", role: "C", club: "Milan", price: 18 },
        ]),
      ]),
    );
    expect(csv).toContain('"I ""Campioni""",C,Rabiot,Milan,18');
  });

  it("conserva gli accenti dei nomi", () => {
    const csv = buildRosterCsv(
      stato([
        squadra("Team", [
          { player_id: "1", first_name: "Lautaro", last_name: "Martínez", role: "A", club: "Inter", price: 30 },
        ]),
      ]),
    );
    expect(csv).toContain("Lautaro Martínez");
  });

  it("con le rose vuote resta la sola intestazione", () => {
    expect(buildRosterCsv(stato([squadra("Vuota", [])]))).toBe(
      "Fantasquadra,Ruolo,Giocatore,Squadra,Prezzo",
    );
  });
});
