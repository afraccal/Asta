/**
 * Il campo dell'offerta.
 *
 * La versione precedente ricalcolava l'importo a ogni battuta e lo riportava
 * al minimo valido: con l'offerta a 30, digitare "45" era impossibile, perché
 * al primo carattere il campo vedeva 4, lo giudicava troppo basso e lo
 * riscriveva in 31. Il campo combatteva con chi scriveva.
 *
 * La regola giusta e' un'altra: mentre scrivi il campo non ti tocca mai.
 * Finché non scrivi niente segue da solo il minimo valido (così se qualcuno
 * rilancia, la cifra proposta resta buona); appena scrivi, comanda quello che
 * hai scritto. Il controllo sul minimo avviene solo al momento di offrire, e
 * il pulsante dice sempre la cifra che verrà spedita davvero.
 */

/** `null` significa "nessuno ha ancora scritto": il campo segue il minimo. */
export type BidDraft = string | null;

const MAX_CIFRE = 6;

/** Tiene solo le cifre: niente segni, esponenti o spazi incollati per sbaglio. */
export function sanitizeBidInput(raw: string): string {
  const soleCifre = raw.replace(/\D/g, "").slice(0, MAX_CIFRE);
  // "007" diventa "7", ma una stringa vuota resta vuota (campo in pulizia).
  return soleCifre === "" ? "" : String(Number(soleCifre));
}

/** Cosa mostra il campo. */
export function bidFieldValue(draft: BidDraft, minimum: number): string {
  return draft === null ? String(minimum) : draft;
}

/** La cifra che l'utente ha in mente, anche se non ancora valida. */
export function typedAmount(draft: BidDraft, minimum: number): number | null {
  if (draft === null) return minimum;
  if (draft === "") return null;
  const n = Number(draft);
  return Number.isFinite(n) ? n : null;
}

/**
 * La cifra che verrà effettivamente offerta: mai sotto il minimo, mai sopra
 * quello che la squadra può permettersi. E' il numero scritto sul pulsante,
 * così non ci sono sorprese al clic.
 */
export function effectiveBid(draft: BidDraft, minimum: number, maxBid: number): number {
  const voluto = typedAmount(draft, minimum) ?? minimum;
  return Math.min(Math.max(voluto, minimum), maxBid);
}

/** Vero quando la cifra scritta e' rimasta indietro rispetto ai rilanci. */
export function isBelowMinimum(draft: BidDraft, minimum: number): boolean {
  const voluto = typedAmount(draft, minimum);
  return voluto !== null && voluto < minimum;
}
