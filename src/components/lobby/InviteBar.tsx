"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { AVVISO_PORTATA, portataIndirizzo } from "@/lib/indirizzoPubblico";

const nessunAscolto = () => () => {};

export function InviteBar({ code }: { code: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  // L'host della pagina non cambia mai durante la visita: si legge una volta,
  // lato client, senza disallineare il render del server.
  const host = useSyncExternalStore(
    nessunAscolto,
    () => window.location.hostname,
    () => "",
  );
  const avviso = host ? AVVISO_PORTATA[portataIndirizzo(host)] : null;

  async function copy(what: "link" | "code") {
    const value = what === "code" ? code : `${window.location.origin}/a/${code}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard negata dal browser: il codice resta comunque leggibile */
    }
  }

  return (
    <div className="surface space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-widest text-chalk-400">
          Codice della stanza
        </p>
        <p className="display text-4xl tracking-[0.25em] text-gold-400 tabular">{code}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => copy("code")}>
          {copied === "code" ? "Copiato" : "Copia codice"}
        </Button>
        <Button variant="gold" size="sm" onClick={() => copy("link")}>
          {copied === "link" ? "Copiato" : "Copia link"}
        </Button>
      </div>
      </div>

      {/* Il link copiato parte dall'indirizzo con cui sei entrato: se e'
          locale, chi lo riceve da fuori vede una pagina che non si apre e non
          ha modo di capire perche'. Meglio dirlo prima di mandarlo. */}
      {avviso && (
        <p className="rounded-[var(--radius-inner)] border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-xs leading-relaxed text-gold-400">
          {avviso}
        </p>
      )}
    </div>
  );
}
