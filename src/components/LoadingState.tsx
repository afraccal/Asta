"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

/**
 * Attesa con una via d'uscita.
 *
 * Un messaggio di caricamento che non finisce mai e' peggio di un errore:
 * chi guarda non sa se aspettare o ricaricare. Dopo qualche secondo si
 * ammette che qualcosa non va e si offre un pulsante.
 */
export function LoadingState({
  message = "Caricamento…",
  error,
  onRetry,
}: {
  message?: string;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [lento, setLento] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLento(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="text-sm text-chalk-400">{message}</p>

        {(lento || error) && (
          <>
            <Alert tone={error ? "error" : "info"}>
              {error
                ? "Il server non risponde come dovrebbe."
                : "Ci sta mettendo piu' del previsto. Puo' essere la rete, oppure il server."}
            </Alert>
            <div className="flex justify-center gap-2">
              {onRetry && (
                <Button size="sm" onClick={onRetry}>
                  Riprova
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
                Ricarica
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
