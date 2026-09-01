"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { ensureIdentity, readStoredNickname } from "@/lib/identity";
import { friendlyError } from "@/lib/errors";

type Phase = "loading" | "need-nickname" | "ready" | "error";

/**
 * Risolve il codice di invito in un'asta a cui l'utente e' iscritto.
 *
 * Gestisce il caso piu' comune della serata: qualcuno apre il link ricevuto
 * su WhatsApp senza essere mai passato dalla home. In quel caso serve solo
 * un nome, poi si entra.
 */
export function useAuctionAccess(code: string) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [auctionId, setAuctionId] = useState<string | null>(null);
  const [auctionName, setAuctionName] = useState("");
  const [error, setError] = useState("");

  const enter = useCallback(
    async (nickname?: string) => {
      try {
        const supabase = getSupabaseBrowser();
        const { data: session } = await supabase.auth.getSession();

        if (!session.session || nickname) {
          const name = (nickname ?? readStoredNickname()).trim();
          if (!name) {
            setPhase("need-nickname");
            return;
          }
          await ensureIdentity(name);
        }

        const { data, error: rpcError } = await supabase.rpc("join_auction", {
          p_code: code.toUpperCase(),
        });
        if (rpcError) throw rpcError;

        const auction = data as { id: string; name: string };
        setAuctionId(auction.id);
        setAuctionName(auction.name);
        setError("");
        setPhase("ready");
      } catch (e) {
        // La sessione anonima esiste ma il profilo no: chiedere il nome.
        if (String((e as { message?: string })?.message).includes("profile_required")) {
          setPhase("need-nickname");
          return;
        }
        setError(friendlyError(e));
        setPhase("error");
      }
    },
    [code],
  );

  useEffect(() => {
    // enter() aggiorna lo stato solo DOPO una chiamata di rete attesa, quindi
    // non provoca il render a cascata che questa regola vuole evitare: il
    // linter non riesce a dimostrarlo attraverso l'await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void enter();
  }, [enter]);

  return { phase, auctionId, auctionName, error, enter };
}
