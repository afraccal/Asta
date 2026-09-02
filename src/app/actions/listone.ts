"use server";

import { parseListone, type ParseResult } from "@/lib/listone/parse";

export interface PreviewResult extends ParseResult {
  fileName: string;
}

/**
 * Legge il file caricato e ne restituisce l'anteprima.
 *
 * Il parsing sta sul server: exceljs pesa troppo per il bundle del browser, e
 * cosi' l'analisi del file avviene in un posto solo, uguale per xlsx e CSV.
 * L'azione non scrive nulla: la conferma e' un passo separato e voluto.
 */
export async function previewListone(formData: FormData): Promise<PreviewResult> {
  const file = formData.get("file");
  const sheet = formData.get("sheet");

  if (!(file instanceof File)) {
    throw new Error("Nessun file ricevuto.");
  }
  if (file.size === 0) {
    throw new Error("Il file e' vuoto.");
  }

  const result = await parseListone(
    { name: file.name, buffer: await file.arrayBuffer() },
    typeof sheet === "string" && sheet ? sheet : undefined,
  );

  return { ...result, fileName: file.name };
}
