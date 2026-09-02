"use client";

import { cn } from "@/lib/cn";

const VIEWBOX = 100;
const STROKE = 5.5;
const RADIUS = (VIEWBOX - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Il countdown (§7, §11).
 *
 * Non conta per conto proprio: riceve i millisecondi che mancano a una
 * scadenza decisa dal server. Il componente e' isolato apposta, perche' si
 * ridisegna dieci volte al secondo e non deve trascinarsi dietro la sala.
 *
 * L'SVG usa un viewBox fisso e si dimensiona dal CSS: cosi' l'anello cresce
 * insieme a tutto il resto quando la sala finisce su un televisore.
 */
export function CountdownRing({
  remainingMs,
  totalMs,
  paused,
  className,
}: {
  remainingMs: number;
  totalMs: number;
  paused?: boolean;
  className?: string;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const critical = !paused && remainingMs <= 3000 && remainingMs > 0;

  const color = paused
    ? "var(--color-chalk-400)"
    : critical
      ? "var(--color-alarm-400)"
      : "var(--color-gold-400)";

  return (
    <div
      className={cn("relative aspect-square", critical && "anim-alarm", className)}
      style={{ width: "var(--size-ring)" }}
      role="timer"
      aria-label={paused ? "Asta in pausa" : `${seconds} secondi rimanenti`}
    >
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="size-full -rotate-90" aria-hidden>
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-pitch-700)"
          strokeWidth={STROKE}
        />
        {/* Nessuna transizione CSS: la posizione arriva gia' calcolata a ogni
            frame, interpolarla la farebbe restare indietro rispetto al server. */}
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="display leading-none tabular"
          style={{ fontSize: "calc(var(--size-ring) * 0.42)", color }}
        >
          {paused ? "II" : seconds}
        </span>
        <span
          className="uppercase tracking-[0.25em] text-chalk-600"
          style={{ fontSize: "var(--text-label)" }}
        >
          {paused ? "in pausa" : seconds === 1 ? "secondo" : "secondi"}
        </span>
      </div>
    </div>
  );
}
