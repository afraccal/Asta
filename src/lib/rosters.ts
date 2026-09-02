import type { AuctionState, RosterPlayer } from "@/lib/types";

/**
 * Ricostruisce la rosa di ogni squadra a partire dallo storico.
 *
 * Lo snapshot del server non manda le rose: sarebbero gli stessi acquisti
 * gia' presenti nello storico, ripetuti una seconda volta per squadra. Su
 * un'asta piena erano un terzo del peso trasmesso, e quel peso viaggia a ogni
 * cambio di stato verso tutti i partecipanti.
 *
 * Lo storico arriva dal piu' recente al piu' vecchio, quindi anche le rose
 * risultano ordinate dall'ultimo acquisto: e' l'ordine che serve ai tavoli,
 * che mostrano gli ultimi arrivati.
 */
export function withRosters(state: AuctionState): AuctionState {
  const perSquadra = new Map<string, RosterPlayer[]>();

  for (const entry of state.history) {
    if (!entry.team_id) continue;
    const rosa = perSquadra.get(entry.team_id);
    const giocatore: RosterPlayer = {
      player_id: entry.player_id,
      first_name: entry.first_name,
      last_name: entry.last_name,
      role: entry.role,
      club: entry.club,
      price: entry.price,
    };
    if (rosa) rosa.push(giocatore);
    else perSquadra.set(entry.team_id, [giocatore]);
  }

  return {
    ...state,
    teams: state.teams.map((team) => ({
      ...team,
      players: perSquadra.get(team.id) ?? [],
    })),
  };
}
