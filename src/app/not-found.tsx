import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="display text-6xl text-gold-400">404</p>
        <h1 className="display text-3xl text-chalk-50">Questa stanza non esiste</h1>
        <p className="text-sm text-chalk-400">
          Controlla il codice dell&apos;asta, oppure fatti rimandare il link.
        </p>
        <Link
          href="/"
          className="inline-block rounded-[var(--radius-inner)] bg-pitch-800 px-5 py-2.5 text-sm text-chalk-200 transition hover:text-chalk-50"
        >
          Torna alla home
        </Link>
      </div>
    </main>
  );
}
