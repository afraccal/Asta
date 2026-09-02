/**
 * L'indirizzo da cui la pagina e' stata aperta e' raggiungibile dagli altri?
 *
 * Il pulsante "Copia link" costruisce l'invito a partire dall'origine
 * corrente: aperto da localhost copia un indirizzo che funziona solo su quel
 * computer, aperto da un indirizzo di rete copia un indirizzo che funziona
 * solo su quel WiFi. Chi lo riceve da fuori vede una pagina che non si apre,
 * e non c'e' modo di capire perche'.
 *
 * Non si puo' indovinare l'indirizzo pubblico da qui, ma si puo' avvisare.
 */

const HOST_LOCALI = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

export type PortataIndirizzo = "pubblico" | "questo-computer" | "questa-rete";

export function portataIndirizzo(hostname: string): PortataIndirizzo {
  const host = hostname.toLowerCase();

  if (HOST_LOCALI.includes(host) || host.endsWith(".localhost")) return "questo-computer";

  // Indirizzi privati: raggiungibili solo da chi e' sulla stessa rete.
  if (/^10\./.test(host)) return "questa-rete";
  if (/^192\.168\./.test(host)) return "questa-rete";
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return "questa-rete";
  if (host.endsWith(".local")) return "questa-rete";

  return "pubblico";
}

export const AVVISO_PORTATA: Record<PortataIndirizzo, string | null> = {
  pubblico: null,
  "questo-computer":
    "Stai usando l'indirizzo locale: questo link si apre solo su questo computer. Per invitare gli amici usa l'indirizzo pubblico dell'asta.",
  "questa-rete":
    "Stai usando un indirizzo di rete locale: questo link funziona solo per chi è collegato al tuo stesso WiFi. Chi è fuori casa non riuscirà ad aprirlo.",
};
