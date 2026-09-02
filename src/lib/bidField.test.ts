import { describe, expect, it } from "vitest";
import {
  bidFieldValue, effectiveBid, isBelowMinimum, sanitizeBidInput, typedAmount,
  type BidDraft,
} from "./bidField";

describe("campo dell'offerta", () => {
  it("si puo' digitare una cifra qualsiasi senza essere corretti a meta'", () => {
    // Regressione: con l'offerta a 30 (minimo 31), scrivere "45" era
    // impossibile perche' al primo carattere il campo tornava a 31.
    const minimo = 31;
    let draft: BidDraft = null;

    expect(bidFieldValue(draft, minimo)).toBe("31");

    draft = sanitizeBidInput("4");
    expect(bidFieldValue(draft, minimo)).toBe("4");

    draft = sanitizeBidInput("45");
    expect(bidFieldValue(draft, minimo)).toBe("45");
    expect(effectiveBid(draft, minimo, 500)).toBe(45);
  });

  it("il campo si puo' svuotare per riscrivere da capo", () => {
    const draft = sanitizeBidInput("");
    expect(bidFieldValue(draft, 31)).toBe("");
    expect(typedAmount(draft, 31)).toBeNull();
    // A campo vuoto si offre comunque il minimo, non zero.
    expect(effectiveBid(draft, 31, 500)).toBe(31);
  });

  it("finche' non si scrive, la cifra proposta segue i rilanci altrui", () => {
    const draft: BidDraft = null;
    expect(bidFieldValue(draft, 31)).toBe("31");
    expect(bidFieldValue(draft, 58)).toBe("58");
  });

  it("una volta scritta, la cifra non viene piu' cambiata sotto le dita", () => {
    const draft = sanitizeBidInput("45");
    expect(bidFieldValue(draft, 58)).toBe("45"); // qualcuno ha rilanciato a 57
    expect(isBelowMinimum(draft, 58)).toBe(true);
    // Ma il pulsante dice la verita': spedirebbe 58, non 45.
    expect(effectiveBid(draft, 58, 500)).toBe(58);
  });

  it("non si puo' offrire piu' di quanto la squadra possa permettersi", () => {
    expect(effectiveBid("900", 31, 442)).toBe(442);
  });

  it("scarta tutto cio' che non e' una cifra", () => {
    expect(sanitizeBidInput("4e5")).toBe("45");
    expect(sanitizeBidInput("-30")).toBe("30");
    expect(sanitizeBidInput("1 2 3")).toBe("123");
    expect(sanitizeBidInput("abc")).toBe("");
  });

  it("toglie gli zeri iniziali ma non blocca la scrittura", () => {
    expect(sanitizeBidInput("007")).toBe("7");
    expect(sanitizeBidInput("0")).toBe("0");
  });

  it("mette un tetto alla lunghezza, per non incollare un numero assurdo", () => {
    expect(sanitizeBidInput("123456789012")).toBe("123456");
  });
});
