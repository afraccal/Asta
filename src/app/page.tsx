"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { ensureIdentity, useStoredNickname } from "@/lib/identity";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";

export default function HomePage() {
  const router = useRouter();
  // Il nome salvato fa da valore iniziale finché l'utente non scrive.
  const storedNickname = useStoredNickname();
  const [draftNickname, setDraftNickname] = useState<string | null>(null);
  const nickname = draftNickname ?? storedNickname;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "join" | "create">(null);
  const [error, setError] = useState("");

  async function handleJoin() {
    setError("");
    setBusy("join");
    try {
      await ensureIdentity(nickname);
      const supabase = getSupabaseBrowser();
      const { data, error: rpcError } = await supabase.rpc("join_auction", {
        p_code: code.trim().toUpperCase(),
      });
      if (rpcError) throw rpcError;
      const auction = data as { code: string };
      router.push(`/a/${auction.code}/lobby`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  }

  async function handleCreate() {
    setError("");
    setBusy("create");
    try {
      await ensureIdentity(nickname);
      router.push("/crea");
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  }

  const nicknameOk = nickname.trim().length >= 2;

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-8">
        <header className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-400">
            Sala d&apos;asta
          </p>
          <h1 className="display text-5xl leading-[0.95] text-chalk-50 sm:text-6xl">
            Asta
            <br />
            Fantacalcio
          </h1>
          <p className="text-sm text-chalk-400">
            Aprite il link, sedetevi ai tavoli, iniziate l&apos;asta.
          </p>
        </header>

        <section className="surface space-y-5 p-6">
          <Field label="Il tuo nome" hint="Come ti vedranno gli altri al tavolo.">
            <Input
              value={nickname}
              onChange={(e) => setDraftNickname(e.target.value)}
              placeholder="Alessandro"
              maxLength={32}
              autoComplete="nickname"
            />
          </Field>

          <div className="h-px bg-pitch-700" />

          <Field label="Codice dell'asta">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nicknameOk && code.length === 6) void handleJoin();
              }}
              placeholder="A7K2QM"
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="text-center font-mono text-2xl tracking-[0.4em] uppercase"
            />
          </Field>

          <Button
            className="w-full"
            size="lg"
            onClick={handleJoin}
            loading={busy === "join"}
            disabled={!nicknameOk || code.trim().length !== 6 || busy !== null}
          >
            Entra nella stanza
          </Button>

          <Alert>{error}</Alert>
        </section>

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-pitch-700" />
          <span className="text-xs uppercase tracking-widest text-chalk-600">oppure</span>
          <div className="h-px flex-1 bg-pitch-700" />
        </div>

        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          onClick={handleCreate}
          loading={busy === "create"}
          disabled={!nicknameOk || busy !== null}
        >
          Crea una nuova asta
        </Button>

        <div className="flex justify-center pt-2">
          <ThemeSwitcher />
        </div>
      </div>
    </main>
  );
}
