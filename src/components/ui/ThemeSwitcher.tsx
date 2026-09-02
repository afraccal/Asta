"use client";

import { Palette } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { DESCRIZIONI, ETICHETTE, TEMI, useTema } from "@/lib/tema";

/** Selettore compatto: tre pastiglie, nessun menu da aprire. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [tema, imposta] = useTema();

  return (
    <div
      className={cn("flex items-center gap-1 rounded-full bg-pitch-800 p-1", className)}
      role="group"
      aria-label="Colori dell'interfaccia"
    >
      <Palette size={14} weight="bold" className="ml-1.5 shrink-0 text-chalk-600" aria-hidden />
      {TEMI.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => imposta(t)}
          aria-pressed={tema === t}
          title={DESCRIZIONI[t]}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs transition",
            tema === t
              ? "bg-chalk-50 font-medium text-pitch-950"
              : "text-chalk-400 hover:text-chalk-50",
          )}
        >
          {ETICHETTE[t]}
        </button>
      ))}
    </div>
  );
}

/** Versione a sola icona, per l'intestazione della sala dove lo spazio manca. */
export function ThemeCycleButton({ className }: { className?: string }) {
  const [tema, imposta] = useTema();
  const successivo = TEMI[(TEMI.indexOf(tema) + 1) % TEMI.length];

  return (
    <button
      type="button"
      onClick={() => imposta(successivo)}
      title={`Colori: ${ETICHETTE[tema]}. Passa a ${ETICHETTE[successivo]}.`}
      className={cn(
        "flex size-8 items-center justify-center rounded-[var(--radius-inner)] bg-pitch-800 text-chalk-400 transition hover:text-chalk-50",
        className,
      )}
    >
      <Palette size={18} weight="bold" />
      <span className="sr-only">Cambia i colori</span>
    </button>
  );
}
