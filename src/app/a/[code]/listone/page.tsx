"use client";

import { use, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { NicknameGate } from "@/components/NicknameGate";
import { LoadingState } from "@/components/LoadingState";
import { ImportPreview } from "@/components/listone/ImportPreview";
import { previewListone, type PreviewResult } from "@/app/actions/listone";
import { useAuctionAccess } from "@/lib/useAuctionAccess";
import { useAuctionState } from "@/lib/useAuctionState";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAsyncData } from "@/lib/useAsyncData";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/cn";

interface ListSummary {
  id: string;
  name: string;
  season: string | null;
  is_owner: boolean;
  player_count: number;
  by_role: Record<string, number>;
}

export default function ListonePage({ params }: PageProps<"/a/[code]/listone">) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const router = useRouter();

  const access = useAuctionAccess(upperCode);
  const { state, refresh } = useAuctionState(access.auctionId);

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [listName, setListName] = useState("");
  const [season, setSeason] = useState("");
  const [busy, setBusy] = useState<null | "parse" | "import" | "select">(null);
  const [error, setError] = useState("");
  const fileRef = useRef<File | null>(null);

  const loadLists = useCallback(async () => {
    const { data } = await getSupabaseBrowser().rpc("list_player_lists");
    return (data as ListSummary[]) ?? [];
  }, []);

  const { data: lists } = useAsyncData<ListSummary[]>(loadLists, []);

  async function handleFile(file: File, sheet?: string) {
    setError("");
    setBusy("parse");
    fileRef.current = file;
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (sheet) formData.set("sheet", sheet);

      const result = await previewListone(formData);
      setPreview(result);

      // Nome proposto: si ricava dal file, ma resta modificabile.
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      setListName((current) => current || base.slice(0, 60));
      const detected = base.match(/(\d{4})[ _/-]*(\d{2,4})/);
      setSeason((current) => current || (detected ? `${detected[1]}/${detected[2]}` : ""));
    } catch (e) {
      setPreview(null);
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!preview || !access.auctionId) return;
    setBusy("import");
    setError("");
    try {
      const supabase = getSupabaseBrowser();

      const { data: list, error: listError } = await supabase.rpc("create_player_list", {
        p_name: listName.trim(),
        p_season: season.trim() || null,
      });
      if (listError) throw listError;

      const { error: importError } = await supabase.rpc("import_players", {
        p_list_id: (list as { id: string }).id,
        p_players: preview.players,
      });
      if (importError) throw importError;

      const { error: linkError } = await supabase.rpc("set_auction_player_list", {
        p_auction_id: access.auctionId,
        p_list_id: (list as { id: string }).id,
      });
      if (linkError) throw linkError;

      router.push(`/a/${upperCode}/lobby`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  }

  async function selectExistingList(listId: string) {
    if (!access.auctionId) return;
    setBusy("select");
    setError("");
    try {
      const { error: rpcError } = await getSupabaseBrowser().rpc("set_auction_player_list", {
        p_auction_id: access.auctionId,
        p_list_id: listId,
      });
      if (rpcError) throw rpcError;
      await refresh();
      router.push(`/a/${upperCode}/lobby`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  }

  if (access.phase === "need-nickname") {
    return (
      <NicknameGate code={upperCode} error={access.error} onSubmit={(n) => access.enter(n)} />
    );
  }

  if (!state) {
    return <LoadingState onRetry={refresh} />;
  }

  if (!state.me.is_admin) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Alert>Solo l&apos;amministratore può gestire il listone.</Alert>
          <Link href={`/a/${upperCode}/lobby`} className="text-sm text-chalk-400 hover:text-chalk-50">
            Torna alla lobby
          </Link>
        </div>
      </main>
    );
  }

  const blockingErrors = preview?.issues.filter((i) => i.severity === "error").length ?? 0;
  const canImport =
    preview !== null && preview.players.length > 0 && listName.trim().length > 0;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <Link
        href={`/a/${upperCode}/lobby`}
        className="inline-block text-sm text-chalk-400 transition hover:text-chalk-50"
      >
        ← Lobby
      </Link>

      <header className="space-y-2">
        <h1 className="display text-4xl text-chalk-50">Listone</h1>
        <p className="text-sm text-chalk-400">
          Carica il file delle quotazioni oppure riusa un listone già importato.
        </p>
      </header>

      <Alert>{error}</Alert>

      {lists.length > 0 && (
        <section className="surface space-y-3 p-5">
          <h2 className="display text-2xl text-chalk-50">Listoni disponibili</h2>
          <ul className="space-y-2">
            {lists.map((list) => {
              const inUse = state.auction.player_list_id === list.id;
              return (
                <li
                  key={list.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl border border-pitch-700 p-3",
                    inUse && "border-turn-400/60 bg-turn-400/[0.07]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-chalk-50">{list.name}</p>
                    <p className="text-xs text-chalk-400">
                      {list.player_count} giocatori
                      {list.season && ` · ${list.season}`}
                      {" · "}
                      {["P", "D", "C", "A"].map((r) => `${r} ${list.by_role[r] ?? 0}`).join("  ")}
                    </p>
                  </div>
                  {inUse ? (
                    <span className="text-sm font-medium text-turn-400">In uso</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => selectExistingList(list.id)}
                    >
                      Usa questo
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="surface space-y-5 p-5">
        <div>
          <h2 className="display text-2xl text-chalk-50">Carica un nuovo listone</h2>
          <p className="mt-1 text-sm text-chalk-400">
            Excel (.xlsx) o CSV. Il formato ufficiale di Fantacalcio.it viene
            riconosciuto da solo.{" "}
            <Link
              href="/docs/formato-listone"
              className="text-brand-400 underline underline-offset-2"
            >
              Formato accettato
            </Link>
          </p>
        </div>

        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl",
            "border-2 border-dashed border-pitch-600 p-8 text-center transition",
            "hover:border-brand-400 hover:bg-brand-500/5",
          )}
        >
          <input
            type="file"
            accept=".xlsx,.xlsm,.csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <span className="display text-xl text-chalk-50">
            {busy === "parse" ? "Lettura del file…" : "Scegli il file"}
          </span>
          <span className="text-xs text-chalk-600">
            Niente viene scritto finché non confermi.
          </span>
        </label>

        {preview && (
          <>
            <ImportPreview
              preview={preview}
              onSheetChange={(sheet) => {
                if (fileRef.current) void handleFile(fileRef.current, sheet);
              }}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome del listone">
                <Input
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  maxLength={60}
                />
              </Field>
              <Field label="Stagione" hint="Facoltativa.">
                <Input
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="2026/27"
                  maxLength={12}
                />
              </Field>
            </div>

            <Button
              size="lg"
              variant="gold"
              className="w-full"
              loading={busy === "import"}
              disabled={!canImport || busy !== null}
              onClick={confirmImport}
            >
              Importa {preview.players.length} giocatori e usa questo listone
            </Button>

            {blockingErrors > 0 && (
              <p className="text-center text-xs text-chalk-600">
                {blockingErrors} righe con errori non verranno importate.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
