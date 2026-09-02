import type { Player } from "@/lib/types";

/**
 * Risoluzione della foto del giocatore.
 *
 * §4 chiede di poter passare in futuro a un servizio esterno senza riscrivere
 * l'architettura. Per questo la foto non e' un campo letto direttamente dai
 * componenti ma il risultato di una catena di fornitori interrogati in ordine:
 * aggiungerne uno significa scrivere un adattatore qui, e nient'altro.
 *
 * Se nessuno risponde si ottiene null, e l'interfaccia mostra il segnaposto.
 */

export type PlayerImageInput = Pick<Player, "external_id" | "image_url" | "last_name" | "role">;

export interface PlayerImageProvider {
  name: string;
  resolve(player: PlayerImageInput): string | null;
}

/** 1. URL esplicito, arrivato con il listone. Ha sempre la precedenza. */
const explicitUrl: PlayerImageProvider = {
  name: "explicit",
  resolve: (player) => player.image_url?.trim() || null,
};

/**
 * 2. Convenzione su un archivio nostro: <base>/<id ufficiale>.png
 * Si attiva valorizzando NEXT_PUBLIC_PLAYER_IMAGE_BASE, senza modifiche al codice.
 */
const storageConvention: PlayerImageProvider = {
  name: "storage",
  resolve: (player) => {
    const base = process.env.NEXT_PUBLIC_PLAYER_IMAGE_BASE?.replace(/\/+$/, "");
    if (!base || !player.external_id) return null;
    return `${base}/${encodeURIComponent(player.external_id)}.png`;
  },
};

// L'ordine e' la priorita'. Un fornitore esterno andra' aggiunto in coda.
const providers: PlayerImageProvider[] = [explicitUrl, storageConvention];

export function resolvePlayerImage(player: PlayerImageInput): string | null {
  for (const provider of providers) {
    const url = provider.resolve(player);
    if (url) return url;
  }
  return null;
}

export function playerInitials(player: { first_name?: string | null; last_name: string }): string {
  const source = [player.first_name, player.last_name].filter(Boolean).join(" ");
  const parts = source.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
