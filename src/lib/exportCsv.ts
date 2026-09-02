import type { AuctionState } from "@/lib/types";

/**
 * Costruzione del CSV delle rose.
 *
 * È separata dal download perché è l'unica parte che può sbagliare: virgole,
 * virgolette e accenti nei nomi delle squadre sono esattamente il genere di
 * cosa che rompe un file aperto in Excel. Isolata così, si può verificare.
 */
export function buildRosterCsv(state: AuctionState): string {
  const escape = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    // Le virgolette interne si raddoppiano, ed è il campo intero a essere
    // quotato: è la regola del formato CSV, non una scorciatoia.
    return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const righe = [
    ["Fantasquadra", "Ruolo", "Giocatore", "Squadra", "Prezzo"].join(","),
    ...state.teams.flatMap((team) =>
      team.players.map((player) =>
        [
          escape(team.name),
          escape(player.role),
          escape([player.first_name, player.last_name].filter(Boolean).join(" ")),
          escape(player.club),
          escape(player.price),
        ].join(","),
      ),
    ),
  ];

  return righe.join("\n");
}

/** Scarica il CSV. Il BOM iniziale serve a Excel per riconoscere gli accenti. */
export function downloadRosterCsv(state: AuctionState) {
  const blob = new Blob(["﻿" + buildRosterCsv(state)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rose-${state.auction.code}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
