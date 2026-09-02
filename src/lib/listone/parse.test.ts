import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseListone } from "./parse";

function csv(text: string) {
  return parseListone({ name: "listone.csv", buffer: new TextEncoder().encode(text).buffer });
}

describe("parser del listone", () => {
  it("trova le intestazioni anche sotto una riga di titolo", async () => {
    const result = await csv(
      [
        "Quotazioni Fantacalcio Stagione 2026 27,,,,",
        "Id,R,RM,Nome,Squadra,Qt.A",
        "5841,P,Por,Svilar,Roma,19",
      ].join("\n"),
    );

    expect(result.headerRow).toBe(2);
    expect(result.players).toHaveLength(1);
    expect(result.players[0]).toMatchObject({
      external_id: "5841",
      last_name: "Svilar",
      role: "P",
      role_mantra: ["Por"],
      club: "Roma",
      quotation: 19,
    });
  });

  it("riconosce i ruoli scritti per esteso e le intestazioni con accenti o maiuscole", async () => {
    const result = await csv(
      ["RUOLO,Giocatore,Squadra,Quotazione", "Attaccante,Lautaro,Inter,33"].join("\n"),
    );
    expect(result.players[0].role).toBe("A");
    expect(result.players[0].quotation).toBe(33);
  });

  it("separa nome e cognome quando il file li tiene distinti", async () => {
    const result = await csv(
      ["Nome proprio,Cognome,R,Squadra", "Theo,Hernandez,D,Milan"].join("\n"),
    );
    expect(result.players[0].first_name).toBe("Theo");
    expect(result.players[0].last_name).toBe("Hernandez");
  });

  it("segnala il ruolo non riconosciuto senza scartare il resto del file", async () => {
    const result = await csv(
      ["Id,R,Nome,Squadra,Qt.A", "1,P,Svilar,Roma,19", "2,Z,Ignoto,Roma,5"].join("\n"),
    );
    expect(result.players).toHaveLength(1);
    expect(result.issues.some((i) => i.severity === "error" && /Ignoto/.test(i.message))).toBe(true);
  });

  it("avvisa sugli identificativi duplicati", async () => {
    const result = await csv(
      ["Id,R,Nome,Squadra,Qt.A", "7,A,Uno,Roma,10", "7,A,Due,Roma,12"].join("\n"),
    );
    expect(result.issues.some((i) => /gia' presente/.test(i.message))).toBe(true);
  });

  it("rifiuta un file senza intestazioni riconoscibili", async () => {
    const result = await csv(["alfa,beta,gamma", "1,2,3"].join("\n"));
    expect(result.players).toHaveLength(0);
    expect(result.issues[0].severity).toBe("error");
  });

  it("conserva le colonne extra in metadata e ignora quelle sconosciute", async () => {
    const result = await csv(
      ["Id,R,Nome,Squadra,Qt.A,Qt.I,FVM,Colonna Strana", "1,A,Tizio,Roma,10,9,120,xx"].join("\n"),
    );
    expect(result.players[0].metadata).toMatchObject({ quotazione_iniziale: 9, fvm: 120 });
    expect(result.ignoredColumns).toContain("Colonna Strana");
  });
});

// Il file ufficiale non e' nel repository: il test gira solo se e' a portata di mano.
const REAL_FILE =
  process.env.LISTONE_XLSX ??
  path.join(homedir(), "Downloads", "Quotazioni_Fantacalcio_Stagione_2026_27.xlsx");

describe.skipIf(!existsSync(REAL_FILE))("file ufficiale di Fantacalcio.it", () => {
  it("importa il foglio Tutti, salta i Ceduti e mappa ogni colonna", async () => {
    const bytes = readFileSync(REAL_FILE);
    const result = await parseListone({
      name: path.basename(REAL_FILE),
      buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });

    expect(result.sheet).toBe("Tutti");
    expect(result.headerRow).toBe(2);
    expect(result.stats.total).toBe(531);
    expect(result.stats.clubs).toHaveLength(20);

    // Tutti e quattro i ruoli devono essere popolati
    expect(result.stats.byRole.P).toBeGreaterThan(0);
    expect(result.stats.byRole.D).toBeGreaterThan(0);
    expect(result.stats.byRole.C).toBeGreaterThan(0);
    expect(result.stats.byRole.A).toBeGreaterThan(0);

    // Nessun errore bloccante
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);

    const lautaro = result.players.find((p) => p.last_name === "Martinez L.");
    expect(lautaro).toMatchObject({ role: "A", club: "Inter", external_id: "2764" });
    expect(lautaro?.quotation).toBe(33);

    const dimarco = result.players.find((p) => p.last_name === "Dimarco");
    expect(dimarco?.role_mantra).toEqual(["E", "W"]);
  });
});
