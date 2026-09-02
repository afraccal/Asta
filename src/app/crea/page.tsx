"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/types";

export default function CreateAuctionPage() {
  const router = useRouter();
  const [name, setName] = useState("Asta tra amici");
  const [budget, setBudget] = useState(500);
  const [teamCount, setTeamCount] = useState(8);
  const [timer, setTimer] = useState(10);
  // Predefiniti del fantacalcio classico: chi non tocca niente ottiene la
  // regola che tutti si aspettano.
  const [limitiAttivi, setLimitiAttivi] = useState(true);
  const [posti, setPosti] = useState({ P: 3, D: 8, C: 8, A: 6 });
  const totalePosti = posti.P + posti.D + posti.C + posti.A;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setError("");
    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error: rpcError } = await supabase.rpc("create_auction", {
        p_name: name,
        p_budget: budget,
        p_team_count: teamCount,
        p_slots_per_team: null,
        p_bid_timer: timer,
        p_list_id: null,
        p_slots_p: limitiAttivi ? posti.P : null,
        p_slots_d: limitiAttivi ? posti.D : null,
        p_slots_c: limitiAttivi ? posti.C : null,
        p_slots_a: limitiAttivi ? posti.A : null,
      });
      if (rpcError) throw rpcError;
      const auction = data as { code: string };
      router.push(`/a/${auction.code}/lobby`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-start justify-center px-5 py-10">
      <div className="w-full max-w-lg space-y-6">
        <Link
          href="/"
          className="inline-block text-sm text-chalk-400 transition hover:text-chalk-50"
        >
          ← Indietro
        </Link>

        <header className="space-y-2">
          <h1 className="display text-4xl text-chalk-50">Nuova asta</h1>
          <p className="text-sm text-chalk-400">
            Imposta le regole. Potrai modificarle finché l&apos;asta non parte.
          </p>
        </header>

        <section className="surface space-y-5 p-6">
          <Field label="Nome dell'asta">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Crediti per squadra">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </Field>
            <Field label="Numero di squadre">
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                max={24}
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
              />
            </Field>
          </div>

          <Field
            label="Secondi del timer"
            hint="Ogni rilancio riporta il countdown a questo valore."
          >
            <Input
              type="number"
              inputMode="numeric"
              min={3}
              max={120}
              value={timer}
              onChange={(e) => setTimer(Number(e.target.value))}
            />
          </Field>

          <div className="space-y-3 rounded-xl border border-pitch-700 bg-pitch-900/50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={limitiAttivi}
                onChange={(e) => setLimitiAttivi(e.target.checked)}
                className="mt-1 size-4 accent-[var(--color-brand-500)]"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-chalk-50">
                  Rosa a reparti fissi
                </span>
                <span className="block text-xs text-chalk-400">
                  Nessuno può comprare più giocatori del previsto in un reparto. Il
                  sistema tiene inoltre da parte 1 credito per ogni posto ancora
                  vuoto, così nessuno resta con la rosa incompleta.
                </span>
              </span>
            </label>

            {limitiAttivi && (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {(["P", "D", "C", "A"] as const).map((ruolo) => (
                    <Field key={ruolo} label={ROLE_LABELS[ruolo]}>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={30}
                        value={posti[ruolo]}
                        onChange={(e) =>
                          setPosti((p) => ({ ...p, [ruolo]: Number(e.target.value) }))
                        }
                        className="text-center"
                      />
                    </Field>
                  ))}
                </div>
                <p className="text-xs text-chalk-600">
                  {totalePosti} giocatori per squadra.
                  {totalePosti === 25 && " È la rosa classica del fantacalcio."}
                </p>
              </>
            )}
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleCreate}
            loading={busy}
            disabled={busy || name.trim().length === 0}
          >
            Crea e apri la stanza
          </Button>

          <Alert>{error}</Alert>
        </section>
      </div>
    </main>
  );
}
