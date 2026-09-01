"use client";

import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, ReactNode } from "react";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        "h-11 w-full rounded-xl border border-pitch-600 bg-pitch-900/80 px-4",
        "text-chalk-50 placeholder:text-chalk-600",
        "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30",
        "disabled:opacity-50",
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-chalk-400">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-chalk-600">{hint}</span>}
    </label>
  );
}
