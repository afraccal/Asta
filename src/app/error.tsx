"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Qualcosa e' andato storto dentro una pagina.
 *
 * Il punto qui non e' spiegare l'errore, e' non lasciare a bocca aperta otto
 * persone in mezzo a un'asta: si dice che l'asta e' salva (lo stato vive nel
 * database, non in questa scheda) e si offre il modo di rientrare subito.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Errore nella pagina:", error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-5 text-center">
        <h1 className="display text-4xl text-chalk-50">Qualcosa si e&apos; inceppato</h1>
        <p className="text-sm text-chalk-400">
          L&apos;asta non ha subito danni: lo stato vive sul server, non in questa
          scheda. Riprova, e ritroverai tutto come l&apos;hai lasciato.
        </p>

        <div className="flex justify-center gap-2">
          <Button onClick={reset}>Riprova</Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Ricarica la pagina
          </Button>
        </div>

        {error.digest && (
          <p className="font-mono text-xs text-chalk-600">codice: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
