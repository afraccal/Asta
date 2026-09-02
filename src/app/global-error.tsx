"use client";

/**
 * Rete di sicurezza piu' esterna: qui e' saltato anche il layout, quindi la
 * pagina deve portarsi dietro il proprio <html> e i propri stili minimi.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#070A11",
          color: "#F2F5FA",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem" }}>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 0.75rem" }}>
            Qualcosa si e&apos; inceppato
          </h1>
          <p style={{ color: "#8695B0", fontSize: "0.9rem", lineHeight: 1.6 }}>
            L&apos;asta non ha subito danni: lo stato vive sul server. Ricarica per
            rientrare.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.7rem 1.4rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#FFC94D",
              color: "#070A11",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Riprova
          </button>
          {error.digest && (
            <p style={{ color: "#5A6880", fontSize: "0.75rem", marginTop: "1rem" }}>
              codice: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
