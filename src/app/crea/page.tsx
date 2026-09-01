"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";

export default function CreateAuctionPage() {
  const router = useRouter();
  const [name, setName] = useState("Asta tra amici");
  const [budget, setBudget] = useState(500);
  const [teamCount, setTeamCount] = useState(8);
  const [timer, setTimer] = useState(10);
  const [useSlots, setUseSlots] = useState(false);
  const [slots, setSlots] = useState(25);
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
        p_slots_per_team: useSlots ? slots : null,
        p_bid_timer: timer,
        p_list_id: null,
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
            Imposta le regole. Potrai modificarle finche&apos; l&apos;asta non parte.
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
                checked={useSlots}
                onChange={(e) => setUseSlots(e.target.checked)}
                className="mt-1 size-4 accent-[var(--color-brand-500)]"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-chalk-50">
                  Limita la dimensione della rosa
                </span>
                <span className="block text-xs text-chalk-400">
                  Se attivo, il sistema tiene da parte 1 credito per ogni slot ancora
                  vuoto: nessuno puo&apos; svuotare il budget e restare con la rosa
                  incompleta.
                </span>
              </span>
            </label>

            {useSlots && (
              <Field label="Giocatori per squadra">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  value={slots}
                  onChange={(e) => setSlots(Number(e.target.value))}
                />
              </Field>
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
