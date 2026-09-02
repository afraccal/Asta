import type { AuctionInfo, PlayerRole, Team } from "@/lib/types";

export const RUOLI: PlayerRole[] = ["P", "D", "C", "A"];

/**
 * Quanti giocatori ha una squadra in un reparto, e quanti gliene mancano.
 *
 * Il limite vero lo fa rispettare il database: questo serve a mostrarlo prima
 * che qualcuno ci sbatta contro, e a spegnere un pulsante destinato a fallire.
 */
export function contaPerRuolo(team: Team): Record<PlayerRole, number> {
  const conteggio: Record<PlayerRole, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const giocatore of team.players) conteggio[giocatore.role] += 1;
  return conteggio;
}

export function postiLiberiRuolo(
  auction: Pick<AuctionInfo, "slots">,
  team: Team,
  ruolo: PlayerRole,
): number | null {
  const limite = auction.slots?.[ruolo] ?? null;
  if (limite === null) return null; // nessun limite su quel ruolo
  return Math.max(0, limite - contaPerRuolo(team)[ruolo]);
}

export function repartoPieno(
  auction: Pick<AuctionInfo, "slots">,
  team: Team,
  ruolo: PlayerRole,
): boolean {
  return postiLiberiRuolo(auction, team, ruolo) === 0;
}

export const NOMI_REPARTO: Record<PlayerRole, string> = {
  P: "portieri",
  D: "difensori",
  C: "centrocampisti",
  A: "attaccanti",
};
