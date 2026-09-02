import { describe, expect, it, vi, afterEach } from "vitest";
import { remainingFrom } from "./useCountdown";

/**
 * Il countdown si è già rotto una volta perché il valore era conservato in
 * stato e il browser aveva smesso di aggiornarlo con la scheda in secondo
 * piano: la schermata di aggiudicazione restava in scena. Questi test
 * fissano la proprietà che lo impedisce, cioè che il valore dipenda solo
 * dalla scadenza e dall'ora corrente.
 */
describe("tempo residuo", () => {
  afterEach(() => vi.useRealTimers());

  const clock = { offsetMs: 0, rttMs: 0 };

  it("si ricalcola dall'ora corrente, senza memoria del passato", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00Z"));
    const deadline = Date.now() + 10_000;

    expect(remainingFrom(deadline, clock)).toBe(10_000);

    // Nessun tick, nessun render: solo tempo che passa.
    vi.setSystemTime(new Date("2026-09-02T10:00:07Z"));
    expect(remainingFrom(deadline, clock)).toBe(3_000);

    // Anche saltando in avanti di colpo (scheda risvegliata dopo minuti)
    // il valore è subito quello giusto, non recuperato a poco a poco.
    vi.setSystemTime(new Date("2026-09-02T10:05:00Z"));
    expect(remainingFrom(deadline, clock)).toBe(0);
  });

  it("non scende mai sotto zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00Z"));
    expect(remainingFrom(Date.now() - 60_000, clock)).toBe(0);
  });

  it("tiene conto dello scarto fra orologio locale e server", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00Z"));
    const deadline = Date.now() + 10_000;

    // Orologio locale indietro di 3 secondi rispetto al server: il countdown
    // deve seguire il server, non il computer di chi guarda.
    expect(remainingFrom(deadline, { offsetMs: 3_000, rttMs: 20 })).toBe(7_000);
    expect(remainingFrom(deadline, { offsetMs: -3_000, rttMs: 20 })).toBe(13_000);
  });

  it("in pausa restituisce il residuo congelato, ignorando la scadenza", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T10:00:00Z"));
    expect(remainingFrom(Date.now() - 999_999, clock, 4_200)).toBe(4_200);
  });

  it("senza scadenza vale zero", () => {
    expect(remainingFrom(null, clock)).toBe(0);
    expect(remainingFrom(undefined, clock)).toBe(0);
  });
});
