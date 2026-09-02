import "server-only";

import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { PlayerRole } from "@/lib/types";

/**
 * Lettura del listone.
 *
 * Il formato di riferimento e' il file ufficiale di Fantacalcio.it, che ha una
 * riga di titolo prima delle intestazioni vere e piu' fogli (uno per ruolo,
 * piu' "Tutti" e "Ceduti"). Invece di dare per scontata quella struttura, il
 * parser cerca la riga di intestazione e riconosce le colonne per nome: cosi'
 * legge anche un CSV scritto a mano o un export leggermente diverso.
 */

export interface ParsedPlayer {
  external_id: string | null;
  first_name: string | null;
  last_name: string;
  role: PlayerRole;
  role_mantra: string[];
  club: string | null;
  quotation: number | null;
  image_url: string | null;
  metadata: Record<string, number | string>;
}

export interface ParseIssue {
  row: number | null;
  severity: "error" | "warning";
  message: string;
}

export interface ParseResult {
  sheetNames: string[];
  sheet: string | null;
  headerRow: number | null;
  /** Campo del sistema -> intestazione trovata nel file. */
  mapping: Record<string, string>;
  ignoredColumns: string[];
  players: ParsedPlayer[];
  issues: ParseIssue[];
  stats: {
    total: number;
    byRole: Record<PlayerRole, number>;
    clubs: string[];
  };
}

/** Confronto delle intestazioni tollerante ad accenti, punti, spazi e maiuscole. */
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const ALIASES: Record<string, string[]> = {
  external_id: ["id", "idgiocatore", "codice", "playerid"],
  role: ["r", "ruolo", "ruoloclassic", "ruoloclassico"],
  role_mantra: ["rm", "ruolomantra", "ruolimantra"],
  last_name: ["nome", "giocatore", "calciatore", "cognome", "nominativo"],
  first_name: ["nomeproprio", "firstname"],
  club: ["squadra", "team", "club", "squadradiappartenenza"],
  quotation: ["qta", "quotazione", "quot", "quotazioneattuale", "prezzo", "valore"],
  image_url: ["immagine", "foto", "imageurl", "urlimmagine"],
};

/** Colonne extra da conservare in metadata: non servono all'asta ma sono utili in scheda. */
const EXTRA_COLUMNS: Record<string, string> = {
  qti: "quotazione_iniziale",
  qtam: "quotazione_attuale_mantra",
  qtim: "quotazione_iniziale_mantra",
  fvm: "fvm",
  fvmm: "fvm_mantra",
};

const ROLE_MAP: Record<string, PlayerRole> = {
  p: "P", por: "P", portiere: "P", portieri: "P", gk: "P",
  d: "D", dif: "D", difensore: "D", difensori: "D",
  c: "C", cen: "C", centrocampista: "C", centrocampisti: "C",
  a: "A", att: "A", attaccante: "A", attaccanti: "A",
};

type Grid = unknown[][];

/** Riga di intestazione = la prima che contiene almeno un nome e un ruolo riconoscibili. */
function findHeaderRow(grid: Grid): number | null {
  const limit = Math.min(grid.length, 15);
  for (let i = 0; i < limit; i += 1) {
    const normalized = grid[i].map(normalizeHeader);
    const hasName = normalized.some((h) => ALIASES.last_name.includes(h));
    const hasRole = normalized.some((h) => ALIASES.role.includes(h));
    if (hasName && hasRole) return i;
  }
  return null;
}

function buildColumnIndex(header: unknown[]) {
  const normalized = header.map(normalizeHeader);
  const columns: Record<string, number> = {};
  const mapping: Record<string, string> = {};
  const used = new Set<number>();

  for (const [field, aliases] of Object.entries(ALIASES)) {
    const index = normalized.findIndex((h, i) => !used.has(i) && aliases.includes(h));
    if (index >= 0) {
      columns[field] = index;
      mapping[field] = String(header[index] ?? "").trim();
      used.add(index);
    }
  }

  const extras: Record<string, number> = {};
  normalized.forEach((h, i) => {
    if (used.has(i)) return;
    const key = EXTRA_COLUMNS[h];
    if (key) {
      extras[key] = i;
      used.add(i);
    }
  });

  const ignored = header
    .map((h, i) => (used.has(i) || !String(h ?? "").trim() ? null : String(h).trim()))
    .filter((h): h is string => h !== null);

  return { columns, extras, mapping, ignored };
}

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "result" in (value as object)) {
    return String((value as { result: unknown }).result ?? "").trim();
  }
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join("").trim();
  }
  return String(value).trim();
}

function toInteger(value: unknown): number | null {
  const text = toText(value).replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function parseGrid(grid: Grid, sheet: string | null, sheetNames: string[]): ParseResult {
  const issues: ParseIssue[] = [];
  const empty: ParseResult = {
    sheetNames,
    sheet,
    headerRow: null,
    mapping: {},
    ignoredColumns: [],
    players: [],
    issues,
    stats: { total: 0, byRole: { P: 0, D: 0, C: 0, A: 0 }, clubs: [] },
  };

  const headerRow = findHeaderRow(grid);
  if (headerRow === null) {
    issues.push({
      row: null,
      severity: "error",
      message:
        "Non ho trovato la riga di intestazione. Servono almeno una colonna con il nome del giocatore e una con il ruolo.",
    });
    return empty;
  }

  const { columns, extras, mapping, ignored } = buildColumnIndex(grid[headerRow]);
  // Il nome puo' arrivare come colonna unica ("Nome") oppure separato in
  // "Nome proprio" + "Cognome": entrambi finiscono nei campi giusti.
  const hasSeparateNames = columns.first_name !== undefined;

  const players: ParsedPlayer[] = [];
  const byRole: Record<PlayerRole, number> = { P: 0, D: 0, C: 0, A: 0 };
  const clubs = new Set<string>();
  const seenIds = new Map<string, number>();

  for (let i = headerRow + 1; i < grid.length; i += 1) {
    const row = grid[i];
    const lineNumber = i + 1;
    if (!row || row.every((cell) => toText(cell) === "")) continue;

    const lastName = toText(row[columns.last_name]);
    if (!lastName) {
      issues.push({ row: lineNumber, severity: "warning", message: "Riga senza nome: saltata." });
      continue;
    }

    const rawRole = normalizeHeader(row[columns.role]);
    const role = ROLE_MAP[rawRole];
    if (!role) {
      issues.push({
        row: lineNumber,
        severity: "error",
        message: `Ruolo non riconosciuto per "${lastName}": "${toText(row[columns.role])}".`,
      });
      continue;
    }

    const externalId = columns.external_id !== undefined ? toText(row[columns.external_id]) : "";
    if (externalId) {
      const previous = seenIds.get(externalId);
      if (previous) {
        issues.push({
          row: lineNumber,
          severity: "warning",
          message: `Id ${externalId} gia' presente alla riga ${previous}: tengo l'ultima occorrenza.`,
        });
      }
      seenIds.set(externalId, lineNumber);
    }

    const quotation = columns.quotation !== undefined ? toInteger(row[columns.quotation]) : null;
    if (quotation !== null && quotation < 0) {
      issues.push({
        row: lineNumber,
        severity: "error",
        message: `Quotazione negativa per "${lastName}".`,
      });
      continue;
    }

    const metadata: Record<string, number | string> = {};
    for (const [key, index] of Object.entries(extras)) {
      const value = toInteger(row[index]);
      if (value !== null) metadata[key] = value;
    }

    const club = columns.club !== undefined ? toText(row[columns.club]) : "";
    if (club) clubs.add(club);

    players.push({
      external_id: externalId || null,
      first_name: hasSeparateNames ? toText(row[columns.first_name]) || null : null,
      last_name: lastName,
      role,
      role_mantra:
        columns.role_mantra !== undefined
          ? toText(row[columns.role_mantra]).split(";").map((r) => r.trim()).filter(Boolean)
          : [],
      club: club || null,
      quotation,
      image_url: columns.image_url !== undefined ? toText(row[columns.image_url]) || null : null,
      metadata,
    });
    byRole[role] += 1;
  }

  if (players.length === 0) {
    issues.push({ row: null, severity: "error", message: "Nessun giocatore valido nel file." });
  }

  return {
    sheetNames,
    sheet,
    headerRow: headerRow + 1,
    mapping,
    ignoredColumns: ignored,
    players,
    issues,
    stats: { total: players.length, byRole, clubs: [...clubs].sort() },
  };
}

/** Nel file ufficiale i fogli per ruolo sono sottoinsiemi di "Tutti", e i
 *  "Ceduti" non giocano piu' in Serie A: si importa il foglio completo. */
function pickSheet(names: string[]): string {
  const preferred = names.find((n) => normalizeHeader(n) === "tutti");
  if (preferred) return preferred;
  const notSold = names.filter((n) => normalizeHeader(n) !== "ceduti");
  return notSold[0] ?? names[0];
}

async function parseWorkbook(buffer: ArrayBuffer, sheetName?: string): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetNames = workbook.worksheets.map((w) => w.name);
  if (sheetNames.length === 0) {
    return {
      sheetNames: [],
      sheet: null,
      headerRow: null,
      mapping: {},
      ignoredColumns: [],
      players: [],
      issues: [{ row: null, severity: "error", message: "Il file non contiene fogli." }],
      stats: { total: 0, byRole: { P: 0, D: 0, C: 0, A: 0 }, clubs: [] },
    };
  }

  const chosen = sheetName && sheetNames.includes(sheetName) ? sheetName : pickSheet(sheetNames);
  const worksheet = workbook.getWorksheet(chosen)!;

  const grid: Grid = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[]; // exceljs indicizza da 1
    grid.push(values.slice(1));
  });

  const result = parseGrid(grid, chosen, sheetNames);

  if (sheetNames.some((n) => normalizeHeader(n) === "ceduti")) {
    result.issues.push({
      row: null,
      severity: "warning",
      message: 'Il foglio "Ceduti" non viene importato: sono giocatori usciti dal campionato.',
    });
  }
  return result;
}

function parseCsv(text: string): ParseResult {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return parseGrid(parsed.data as Grid, null, []);
}

export async function parseListone(
  file: { name: string; buffer: ArrayBuffer },
  sheetName?: string,
): Promise<ParseResult> {
  const isSpreadsheet = /\.(xlsx|xlsm)$/i.test(file.name);
  if (isSpreadsheet) return parseWorkbook(file.buffer, sheetName);
  return parseCsv(new TextDecoder().decode(file.buffer));
}
