"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Il tema dei colori.
 *
 * Tre scelte, non due: il nero assoluto va benissimo su una TV in una stanza
 * al buio, ma stanca su un monitor per una serata intera. Il predefinito e'
 * quello di mezzo.
 *
 * Il valore vive su `data-tema` nell'elemento <html> e in localStorage. E'
 * stato esterno a React, quindi si legge con useSyncExternalStore invece che
 * con un effetto: niente disallineamento fra server e idratazione, e la
 * scelta resta allineata fra piu' schede aperte.
 */

export const TEMI = ["tenue", "notte", "chiaro"] as const;
export type Tema = (typeof TEMI)[number];

export const ETICHETTE: Record<Tema, string> = {
  tenue: "Tenue",
  notte: "Notte",
  chiaro: "Chiaro",
};

export const DESCRIZIONI: Record<Tema, string> = {
  tenue: "Scuro ma morbido, per starci ore",
  notte: "Nero pieno, per la TV al buio",
  chiaro: "Fondo chiaro, per giocare di giorno",
};

const CHIAVE = "asta.tema";
const PREDEFINITO: Tema = "tenue";

export function leggiTema(): Tema {
  if (typeof document === "undefined") return PREDEFINITO;
  const attuale = document.documentElement.dataset.tema;
  return (TEMI as readonly string[]).includes(attuale ?? "")
    ? (attuale as Tema)
    : PREDEFINITO;
}

export function applicaTema(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  try {
    window.localStorage.setItem(CHIAVE, tema);
  } catch {
    /* modalita' privata: il tema vale per questa sessione */
  }
  // Sveglia gli altri componenti in ascolto, in questa e nelle altre schede.
  window.dispatchEvent(new Event("asta:tema"));
}

function subscribe(onChange: () => void) {
  window.addEventListener("asta:tema", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("asta:tema", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useTema(): [Tema, (t: Tema) => void] {
  const tema = useSyncExternalStore(subscribe, leggiTema, () => PREDEFINITO);
  const imposta = useCallback((t: Tema) => applicaTema(t), []);
  return [tema, imposta];
}

/**
 * Script inserito nel <head>: applica il tema salvato PRIMA che la pagina
 * venga disegnata. Senza, si vedrebbe un lampo del tema sbagliato a ogni
 * caricamento.
 */
export const SCRIPT_TEMA_INIZIALE = `
(function(){try{
  var t = localStorage.getItem(${JSON.stringify(CHIAVE)});
  document.documentElement.dataset.tema =
    ${JSON.stringify(TEMI)}.indexOf(t) >= 0 ? t : ${JSON.stringify(PREDEFINITO)};
}catch(e){document.documentElement.dataset.tema=${JSON.stringify(PREDEFINITO)};}})();
`.trim();
