"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { measureClockOffset, type ClockSync } from "@/lib/serverClock";
import type { AuctionEvent, AuctionState } from "@/lib/types";

export type ConnectionStatus = "connecting" | "live" | "offline";

interface UseAuctionStateResult {
  state: AuctionState | null;
  clock: ClockSync;
  connection: ConnectionStatus;
  error: string | null;
  /** Ultimo evento ricevuto: utile per animazioni una-tantum. */
  lastEvent: AuctionEvent | null;
  refresh: () => Promise<void>;
}

const HEARTBEAT_MS = 20_000;
const SAFETY_REFRESH_MS = 30_000;

/**
 * Stato dell'asta sincronizzato col server.
 *
 * Tre garanzie:
 *
 * 1. SNAPSHOT AUTOREVOLE — get_auction_state() restituisce l'intera stanza in
 *    una chiamata. E' quello che si carica all'ingresso e ogni volta che c'e'
 *    il dubbio di essersi persi qualcosa.
 *
 * 2. RILEVAMENTO DEI BUCHI — ogni evento porta uno state_version monotono. Se
 *    arriva la versione N+2 senza aver visto la N+1, un messaggio e' andato
 *    perso: si riscarica lo snapshot invece di proseguire con dati incoerenti.
 *
 * 3. REAZIONE IMMEDIATA — per le offerte si applica subito una patch locale
 *    (l'informazione e' tutta nel payload) cosi' il numero cambia all'istante;
 *    lo snapshot successivo conferma. Per ogni altro evento si ricarica.
 *
 * Riconnessione, ritorno dal background e schede sospese finiscono tutti
 * nello stesso punto: refresh().
 */
export function useAuctionState(auctionId: string | null): UseAuctionStateResult {
  const [state, setState] = useState<AuctionState | null>(null);
  const [clock, setClock] = useState<ClockSync>({ offsetMs: 0, rttMs: 0 });
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<AuctionEvent | null>(null);

  const versionRef = useRef(0);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!auctionId || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const supabase = getSupabaseBrowser();
      const { data, error: rpcError } = await supabase.rpc("get_auction_state", {
        p_auction_id: auctionId,
      });
      if (rpcError) throw rpcError;

      const next = data as AuctionState;
      versionRef.current = next.auction.state_version;
      setState(next);
      setError(null);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "errore");
    } finally {
      refreshingRef.current = false;
    }
  }, [auctionId]);

  // --- Sincronizzazione dell'orologio -----------------------------------------
  useEffect(() => {
    if (!auctionId) return;
    let active = true;
    void (async () => {
      const sync = await measureClockOffset(getSupabaseBrowser());
      if (active) setClock(sync);
    })();
    return () => {
      active = false;
    };
  }, [auctionId]);

  // --- Canale realtime ----------------------------------------------------------
  useEffect(() => {
    if (!auctionId) return;
    const supabase = getSupabaseBrowser();
    let disposed = false;

    const channel = supabase.channel(`auction:${auctionId}`, {
      config: { private: true },
    });

    channel.on("broadcast", { event: "auction_event" }, (message: { payload?: unknown }) => {
      const payload = (message.payload ?? {}) as AuctionEvent;
      const incoming = Number(payload.state_version ?? 0);
      if (!incoming) return;

      // Messaggio vecchio o duplicato: ignorare.
      if (incoming <= versionRef.current) return;

      setLastEvent(payload);

      const isNextInSequence = incoming === versionRef.current + 1;
      const bid = payload.payload as {
        lot_id?: string;
        team_id?: string;
        amount?: number;
        bid_deadline_ms?: number;
      };

      if (
        isNextInSequence &&
        payload.event_type === "bid_placed" &&
        bid?.lot_id &&
        typeof bid.amount === "number"
      ) {
        versionRef.current = incoming;
        setState((prev) => {
          if (!prev?.lot || prev.lot.id !== bid.lot_id) return prev;
          return {
            ...prev,
            auction: { ...prev.auction, state_version: incoming },
            lot: {
              ...prev.lot,
              current_bid: bid.amount!,
              current_bidder_team_id: bid.team_id ?? prev.lot.current_bidder_team_id,
              bid_deadline_ms: bid.bid_deadline_ms ?? prev.lot.bid_deadline_ms,
            },
          };
        });
        return;
      }

      // Cambio di turno, assegnazione, pausa, buco nella sequenza:
      // riallineamento completo.
      void refresh();
    });

    channel.subscribe((status: string) => {
      if (disposed) return;
      // Il primo snapshot parte da qui, non da un effetto separato: cosi'
      // si carica una volta sola e si copre anche il caso in cui il
      // websocket sia bloccato dalla rete, dove i dati servono comunque.
      if (status === "SUBSCRIBED") {
        setConnection("live");
        void refresh();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnection("offline");
        void refresh();
      } else if (status === "CLOSED") {
        setConnection("connecting");
      }
    });

    // I canali privati richiedono che Realtime conosca il token di sessione.
    void supabase.realtime.setAuth();

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [auctionId, refresh]);

  // --- Presenza e reti di sicurezza ---------------------------------------------
  useEffect(() => {
    if (!auctionId) return;
    const supabase = getSupabaseBrowser();

    const heartbeat = setInterval(() => {
      void supabase.rpc("heartbeat", { p_auction_id: auctionId });
    }, HEARTBEAT_MS);

    // Anche se il realtime tacesse del tutto, lo stato non resta mai
    // indietro piu' di mezzo minuto.
    const safety = setInterval(() => void refresh(), SAFETY_REFRESH_MS);

    // Gli smartphone congelano le schede in background: al ritorno la
    // situazione puo' essere cambiata del tutto.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => void refresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      clearInterval(heartbeat);
      clearInterval(safety);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [auctionId, refresh]);

  return { state, clock, connection, error, lastEvent, refresh };
}
