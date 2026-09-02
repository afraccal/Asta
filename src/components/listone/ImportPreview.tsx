"use client";

import { cn } from "@/lib/cn";
import { RoleBadge } from "@/components/player/PlayerPortrait";
import type { PreviewResult } from "@/app/actions/listone";
import { ROLE_LABELS, type PlayerRole } from "@/lib/types";

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

const FIELD_LABELS: Record<string, string> = {
  external_id: "Identificativo",
  role: "Ruolo",
  role_mantra: "Ruoli mantra",
  last_name: "Nome",
  first_name: "Nome proprio",
  club: "Squadra",
  quotation: "Quotazione",
  image_url: "Immagine",
};

/**
 * Anteprima prima di scrivere qualsiasi cosa nel database (§20).
 * Mostra come sono state interpretate le colonne, cosa è stato scartato e
 * perché: l'importazione non deve mai essere un salto nel buio.
 */
export function ImportPreview({
  preview,
  onSheetChange,
}: {
  preview: PreviewResult;
  onSheetChange?: (sheet: string) => void;
}) {
  const errors = preview.issues.filter((i) => i.severity === "error");
  const warnings = preview.issues.filter((i) => i.severity === "warning");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-chalk-400">
          <span className="font-medium text-chalk-50">{preview.fileName}</span>
          {preview.headerRow && <> · intestazioni alla riga {preview.headerRow}</>}
        </p>

        {preview.sheetNames.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-chalk-400">
            Foglio
            <select
              value={preview.sheet ?? ""}
              onChange={(e) => onSheetChange?.(e.target.value)}
              className="h-9 rounded-lg border border-pitch-600 bg-pitch-900 px-2 text-chalk-50"
            >
              {preview.sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <div className="rounded-xl bg-pitch-900/60 p-3">
          <dt className="text-xs uppercase tracking-wider text-chalk-400">Giocatori</dt>
          <dd className="display text-2xl text-chalk-50 tabular">{preview.stats.total}</dd>
        </div>
        {ROLES.map((role) => (
          <div key={role} className="rounded-xl bg-pitch-900/60 p-3">
            <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-chalk-400">
              <RoleBadge role={role} />
              <span className="sr-only">{ROLE_LABELS[role]}</span>
            </dt>
            <dd className="display text-2xl text-chalk-50 tabular">
              {preview.stats.byRole[role]}
            </dd>
          </div>
        ))}
        <div className="rounded-xl bg-pitch-900/60 p-3">
          <dt className="text-xs uppercase tracking-wider text-chalk-400">Squadre</dt>
          <dd className="display text-2xl text-chalk-50 tabular">
            {preview.stats.clubs.length}
          </dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-chalk-400">
          Colonne riconosciute
        </h3>
        <ul className="flex flex-wrap gap-2">
          {Object.entries(preview.mapping).map(([field, header]) => (
            <li
              key={field}
              className="rounded-lg bg-pitch-800 px-2.5 py-1 text-xs text-chalk-200"
            >
              {FIELD_LABELS[field] ?? field}
              <span className="text-chalk-600"> ← </span>
              <span className="font-mono">{header}</span>
            </li>
          ))}
          {preview.ignoredColumns.map((header) => (
            <li
              key={header}
              className="rounded-lg border border-dashed border-pitch-600 px-2.5 py-1 text-xs text-chalk-600"
              title="Colonna non utilizzata"
            >
              <span className="font-mono">{header}</span> ignorata
            </li>
          ))}
        </ul>
      </section>

      {(errors.length > 0 || warnings.length > 0) && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-chalk-400">
            Segnalazioni ({errors.length} errori, {warnings.length} avvisi)
          </h3>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-pitch-700 p-3 text-sm">
            {[...errors, ...warnings].slice(0, 60).map((issue, index) => (
              <li
                key={index}
                className={cn(
                  "flex gap-2",
                  issue.severity === "error" ? "text-alarm-400" : "text-gold-400",
                )}
              >
                {issue.row && (
                  <span className="shrink-0 font-mono text-xs text-chalk-600">
                    riga {issue.row}
                  </span>
                )}
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.players.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-chalk-400">
            Prime righe
          </h3>
          <div className="overflow-x-auto rounded-xl border border-pitch-700">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="bg-pitch-900/70 text-xs uppercase tracking-wider text-chalk-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Giocatore</th>
                  <th className="px-3 py-2 text-left font-medium">Ruolo</th>
                  <th className="px-3 py-2 text-left font-medium">Squadra</th>
                  <th className="px-3 py-2 text-right font-medium">Quot.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-800">
                {preview.players.slice(0, 8).map((player, index) => (
                  <tr key={`${player.external_id ?? index}`}>
                    <td className="px-3 py-1.5 text-chalk-50">
                      {[player.first_name, player.last_name].filter(Boolean).join(" ")}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <RoleBadge role={player.role} />
                        <span className="text-xs text-chalk-600">
                          {player.role_mantra.join(" ")}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-chalk-200">{player.club}</td>
                    <td className="px-3 py-1.5 text-right text-gold-400 tabular">
                      {player.quotation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
