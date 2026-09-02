/**
 * Le funzioni Postgres sollevano eccezioni con codici stabili (es. "bid_too_low").
 * Qui vengono tradotte in messaggi che una persona puo' leggere durante l'asta.
 * Il codice resta la fonte di verita': il testo e' solo presentazione.
 */

const MESSAGES: Record<string, string> = {
  not_authenticated: "Sessione scaduta. Ricarica la pagina.",
  profile_required: "Scegli prima un nickname.",
  auction_not_found: "Nessuna asta trovata con questo codice.",
  auction_closed: "Questa asta e' chiusa.",
  auction_not_running: "L'asta non e' in corso.",
  auction_paused: "L'asta e' in pausa: le offerte sono sospese.",
  auction_not_paused: "L'asta non e' in pausa.",
  already_started: "L'asta e' gia' iniziata.",
  not_enough_teams: "Servono almeno 2 squadre con un partecipante.",
  no_player_list: "Carica prima il listone dei giocatori.",
  not_admin: "Solo l'amministratore puo' farlo.",
  not_a_member: "Non fai parte di questa asta.",
  team_not_found: "Squadra non trovata.",
  team_full: "Questa squadra ha gia' 2 allenatori.",
  already_in_another_team: "Sei gia' in un'altra squadra.",
  not_allowed: "Non hai i permessi per questa azione.",
  invalid_name: "Il nome non e' valido.",
  not_your_turn: "Non e' il tuo turno di chiamata.",
  no_turn_team: "Nessuna squadra di turno.",
  lot_already_live: "C'e' gia' un giocatore all'asta.",
  lot_not_found: "Lotto non trovato.",
  lot_closed: "L'asta per questo giocatore e' gia' chiusa.",
  player_not_in_list: "Giocatore non presente nel listone.",
  player_already_sold: "Questo giocatore e' gia' stato assegnato.",
  too_late: "Troppo tardi: il tempo era scaduto.",
  not_your_team: "Non puoi offrire per questa squadra.",
  already_leading: "Sei gia' tu in testa all'offerta.",
  bid_too_low: "Qualcuno ti ha preceduto: devi superare l'offerta attuale.",
  insufficient_credits: "Crediti insufficienti per questa offerta.",
  role_full: "Hai già completato questo reparto: non puoi prendere altri giocatori di questo ruolo.",
  lot_not_assigned: "Questo giocatore non risulta assegnato.",
  invalid_price: "Il prezzo non è valido.",
  code_generation_failed: "Impossibile generare il codice, riprova.",
};

export function friendlyError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : ((error as { message?: string } | null)?.message ?? "");

  // I messaggi Postgres arrivano nella forma
  // 'bid_too_low' oppure 'ERROR: bid_too_low' a seconda del trasporto.
  for (const code of Object.keys(MESSAGES)) {
    if (raw.includes(code)) return MESSAGES[code];
  }
  return raw || "Si e' verificato un errore imprevisto.";
}

export function errorCode(error: unknown): string | null {
  const raw =
    typeof error === "string"
      ? error
      : ((error as { message?: string } | null)?.message ?? "");
  for (const code of Object.keys(MESSAGES)) {
    if (raw.includes(code)) return code;
  }
  return null;
}
