"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function InviteBar({ code }: { code: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

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
    <div className="surface flex flex-wrap items-center gap-4 p-4 sm:p-5">
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
  );
}
