"use client";

import { cn } from "@/lib/cn";

/**
 * Il countdown dell'asta (§7, §11).
 *
 * Non conta per conto proprio: riceve i millisecondi che mancano a una
 * scadenza decisa dal server. Il componente è isolato apposta, perché si
 * ri-renderizza dieci volte al secondo e non deve trascinarsi dietro il resto
 * della sala.
 */
export function CountdownRing({
  remainingMs,
  totalMs,
  paused,
  size = 200,
}: {
  remainingMs: number;
  totalMs: number;
  paused?: boolean;
  size?: number;
}) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const critical = !paused && remainingMs <= 3000 && remainingMs > 0;

  const stroke = size * 0.055;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const color = paused
    ? "var(--color-chalk-400)"
    : critical
      ? "var(--color-alarm-400)"
      : "var(--color-gold-400)";

  return (
    <div
      className={cn("relative", critical && "anim-alarm")}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={paused ? "Asta in pausa" : `${seconds} secondi rimanenti`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-pitch-700)"
          strokeWidth={stroke}
        />
        {/* Nessuna transizione CSS: la posizione arriva già calcolata a ogni
            frame, interpolarla la farebbe restare indietro rispetto al server. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display tabular leading-none" style={{ fontSize: size * 0.42, color }}>
          {paused ? "‖" : seconds}
        </span>
        {!paused && (
          <span className="text-xs uppercase tracking-[0.2em] text-chalk-600">
            second{seconds === 1 ? "o" : "i"}
          </span>
        )}
      </div>
    </div>
  );
}
