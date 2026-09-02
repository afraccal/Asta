import { describe, expect, it } from "vitest";
import { AVVISO_PORTATA, portataIndirizzo } from "./indirizzoPubblico";

describe("portata dell'indirizzo", () => {
  it("riconosce gli indirizzi che valgono solo su questo computer", () => {
    for (const host of ["localhost", "127.0.0.1", "0.0.0.0", "app.localhost"]) {
      expect(portataIndirizzo(host)).toBe("questo-computer");
    }
  });

  it("riconosce gli indirizzi che valgono solo sulla stessa rete", () => {
    for (const host of ["192.168.1.18", "192.168.178.58", "10.0.0.5", "172.20.1.1", "mac.local"]) {
      expect(portataIndirizzo(host)).toBe("questa-rete");
    }
  });

  it("considera pubblico un dominio vero", () => {
    for (const host of ["asta-fantacalcio-pi.vercel.app", "asta.example.com"]) {
      expect(portataIndirizzo(host)).toBe("pubblico");
    }
  });

  it("non scambia per privato un indirizzo che gli somiglia", () => {
    // 172.32 e' fuori dall'intervallo privato, 192.169 pure
    expect(portataIndirizzo("172.32.0.1")).toBe("pubblico");
    expect(portataIndirizzo("192.169.1.1")).toBe("pubblico");
    expect(portataIndirizzo("10a.example.com")).toBe("pubblico");
  });

  it("solo l'indirizzo pubblico non produce avvisi", () => {
    expect(AVVISO_PORTATA.pubblico).toBeNull();
    expect(AVVISO_PORTATA["questo-computer"]).toBeTruthy();
    expect(AVVISO_PORTATA["questa-rete"]).toBeTruthy();
  });
});
