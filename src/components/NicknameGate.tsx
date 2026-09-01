"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { readStoredNickname } from "@/lib/identity";

/** Schermata mostrata a chi apre il link di invito senza essere passato dalla home. */
export function NicknameGate({
  code,
  onSubmit,
  error,
}: {
  code: string;
  onSubmit: (nickname: string) => Promise<void> | void;
  error?: string;
}) {
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setNickname(readStoredNickname()), []);

  async function submit() {
    setBusy(true);
    await onSubmit(nickname.trim());
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">
            Stanza {code}
          </p>
          <h1 className="display text-4xl text-chalk-50">Come ti chiami?</h1>
        </header>

        <section className="surface space-y-5 p-6">
          <Field label="Il tuo nome">
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nickname.trim().length >= 2) void submit();
              }}
              placeholder="Marco"
              maxLength={32}
              autoFocus
            />
          </Field>
          <Button
            className="w-full"
            size="lg"
            onClick={submit}
            loading={busy}
            disabled={nickname.trim().length < 2 || busy}
          >
            Entra
          </Button>
          <Alert>{error}</Alert>
        </section>
      </div>
    </main>
  );
}
