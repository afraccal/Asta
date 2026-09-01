"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

const NICKNAME_KEY = "asta.nickname";

export function readStoredNickname(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NICKNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeNickname(name: string) {
  try {
    window.localStorage.setItem(NICKNAME_KEY, name);
  } catch {
    /* modalita' privata: pazienza, si riscrive al prossimo ingresso */
  }
}

/**
 * Autenticazione anonima: nessuno deve creare un account per una serata
 * fra amici. La sessione produce comunque un JWT vero, quindi le RLS e i
 * canali privati funzionano esattamente come con un login classico.
 * Il token viene persistito, cosi' chi ricarica la pagina resta se stesso.
 */
export async function ensureIdentity(displayName: string) {
  const supabase = getSupabaseBrowser();
  const name = displayName.trim();
  if (!name) throw new Error("profile_required");

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }

  const { error: profileError } = await supabase.rpc("ensure_profile", {
    p_display_name: name,
    p_avatar_url: null,
  });
  if (profileError) throw profileError;

  storeNickname(name);
  return name;
}

export interface Identity {
  userId: string | null;
  displayName: string;
  loading: boolean;
}

export function useIdentity(): Identity {
  const [identity, setIdentity] = useState<Identity>({
    userId: null,
    displayName: "",
    loading: true,
  });

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let active = true;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      const userId = data.session?.user.id ?? null;
      let displayName = readStoredNickname();

      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.display_name) displayName = profile.display_name;
      }

      if (active) setIdentity({ userId, displayName, loading: false });
    })();

    return () => {
      active = false;
    };
  }, []);

  return identity;
}

export function useEnsureIdentity() {
  return useCallback(ensureIdentity, []);
}
