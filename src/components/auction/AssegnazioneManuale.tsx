"use client";

import { useState } from "react";
import { PlayerSearch } from "@/components/player/PlayerSearch";
import { RoleBadge } from "@/components/player/PlayerPortrait";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { NOMI_REPARTO, postiLiberiRuolo } from "@/lib/roster";
import { playerFullName, type AuctionState, type Player } from "@/lib/types";

/**
 * Assegnazione a mano, per l'amministratore.
 *
 * Serve quando l'asta esce dai binari: un accordo preso a voce, un errore da
 * rimediare, un giocatore da sistemare fuori dal giro. Si sceglie la squadra e
 * il prezzo, anche zero.
 *
 * Non si esce pero' dalle regole del gioco: i crediti devono bastare e il
 * reparto deve avere ancora posto. Il controllo vero lo fa il database; qui si
 * anticipa, per non far premere un pulsante destinato a fallire.
 */
export function AssegnazioneManuale({
  state,
  busy,
  onAssegna,
}: {
  state: AuctionState;
  busy: boolean;
  onAssegna: (playerId: string, teamId: string, prezzo: number) => void;
}) {
  const [giocatore, setGiocatore] = useState<Player | null>(null);
  const [squadraId, setSquadraId] = useState<string>("");
  const [prezzo, setPrezzo] = useState("0");

  const squadra = state.teams.find((t) => t.id === squadraId) ?? null;
  const cifra = Number(prezzo.replace(/\D/g, "") || 0);

  const postiRuolo =
    giocatore && squadra ? postiLiberiRuolo(state.auction, squadra, giocatore.role) : null;

  const impedimento =
    !giocatore
      ? "Scegli un giocatore."
      : !squadra
        ? "Scegli la squadra a cui assegnarlo."
        : postiRuolo === 0
          ? `${squadra.name} ha già tutti i ${NOMI_REPARTO[giocatore.role]} che le servono.`
          : cifra > squadra.credits_remaining
            ? `${squadra.name} ha solo ${squadra.credits_remaining} crediti.`
            : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <p className="text-xs leading-relaxed text-chalk-400">
        Assegna un giocatore senza passare dall&apos;asta. I crediti vengono scalati
        come per un acquisto normale.
      </p>

      <div className="min-h-0 flex-1">
        <PlayerSearch
          auctionId={state.auction.id}
          onSelect={setGiocatore}
          selectedId={giocatore?.id}
        />
      </div>

      {giocatore && (
        <p className="flex items-center gap-2 rounded-[var(--radius-inner)] bg-pitch-800 px-3 py-2 text-sm">
          <RoleBadge role={giocatore.role} />
          <span className="min-w-0 flex-1 truncate text-chalk-50">
            {playerFullName(giocatore)}
          </span>
          <span className="text-xs text-chalk-600">{giocatore.club}</span>
        </p>
      )}

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Field label="Squadra">
          <select
            value={squadraId}
            onChange={(e) => setSquadraId(e.target.value)}
            className="h-11 w-full rounded-[var(--radius-inner)] border border-pitch-600 bg-pitch-900 px-3 text-sm text-chalk-50"
          >
            <option value="">Scegli…</option>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.credits_remaining} cr
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prezzo">
          <Input
            type="text"
            inputMode="numeric"
            value={prezzo}
            onChange={(e) => setPrezzo(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="text-center"
          />
        </Field>
      </div>

      <Button
        variant="gold"
        loading={busy}
        disabled={busy || impedimento !== null}
        onClick={() => {
          if (giocatore && squadra) onAssegna(giocatore.id, squadra.id, cifra);
          setGiocatore(null);
          setPrezzo("0");
        }}
      >
        {giocatore && squadra
          ? `Assegna a ${squadra.name} per ${cifra}`
          : "Assegna"}
      </Button>

      <Alert tone="info">{impedimento}</Alert>
    </div>
  );
}
