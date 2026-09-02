import { describe, expect, it } from "vitest";
import { contaPerRuolo, postiLiberiRuolo, repartoPieno } from "./roster";
import type { PlayerRole, Team } from "@/lib/types";

const squadra = (ruoli: PlayerRole[]): Team => ({
  id: "t", name: "T", turn_position: 1, budget_initial: 500, credits_spent: 0,
  credits_remaining: 500, players_count: ruoli.length, max_bid: 500, members: [],
  players: ruoli.map((role, i) => ({
    player_id: String(i), first_name: null, last_name: "G" + i, role, club: null, price: 1,
  })),
});

const classica = { slots: { P: 3, D: 8, C: 8, A: 6 } as Record<PlayerRole, number | null> };
const senzaLimiti = { slots: { P: null, D: null, C: null, A: null } as Record<PlayerRole, number | null> };

describe("posti in rosa per ruolo", () => {
  it("conta i giocatori reparto per reparto", () => {
    expect(contaPerRuolo(squadra(["P", "P", "D", "A"]))).toEqual({ P: 2, D: 1, C: 0, A: 1 });
  });

  it("con tre portieri il reparto e' pieno", () => {
    expect(repartoPieno(classica, squadra(["P", "P", "P"]), "P")).toBe(true);
    expect(repartoPieno(classica, squadra(["P", "P"]), "P")).toBe(false);
  });

  it("un reparto pieno non influenza gli altri", () => {
    const t = squadra(["P", "P", "P"]);
    expect(repartoPieno(classica, t, "D")).toBe(false);
    expect(postiLiberiRuolo(classica, t, "A")).toBe(6);
  });

  it("senza limiti nessun reparto e' mai pieno", () => {
    const t = squadra(Array(20).fill("P") as PlayerRole[]);
    expect(postiLiberiRuolo(senzaLimiti, t, "P")).toBeNull();
    expect(repartoPieno(senzaLimiti, t, "P")).toBe(false);
  });

  it("non restituisce numeri negativi se la rosa sfora", () => {
    // Non dovrebbe accadere (lo impedisce il database), ma il conteggio
    // mostrato non deve diventare assurdo.
    expect(postiLiberiRuolo(classica, squadra(["P", "P", "P", "P"]), "P")).toBe(0);
  });
});
