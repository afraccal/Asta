import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Formato del listone · Asta Fantacalcio",
  description: "Colonne accettate per l'importazione del listone giocatori.",
};

const REQUIRED = [
  {
    field: "Nome del giocatore",
    headers: "Nome · Giocatore · Calciatore · Cognome · Nominativo",
    note: "Obbligatoria. Se il file ha anche una colonna \"Nome proprio\", i due campi restano distinti.",
  },
  {
    field: "Ruolo",
    headers: "R · Ruolo",
    note: "Obbligatoria. Accetta P/D/C/A, Por/Dif/Cen/Att e i nomi per esteso.",
  },
];

const OPTIONAL = [
  {
    field: "Identificativo",
    headers: "Id · Codice",
    note: "Consigliata: è la chiave con cui un nuovo file aggiorna i giocatori già importati invece di duplicarli.",
  },
  { field: "Squadra", headers: "Squadra · Team · Club", note: "Squadra reale di appartenenza." },
  {
    field: "Quotazione",
    headers: "Qt.A · Quotazione · Prezzo · Valore",
    note: "Numero intero. Mostrata in scheda, non vincola le offerte.",
  },
  {
    field: "Ruoli mantra",
    headers: "RM · Ruolo mantra",
    note: "Più ruoli separati da punto e virgola, ad esempio Dd;E.",
  },
  {
    field: "Immagine",
    headers: "Immagine · Foto · Image URL",
    note: "URL della foto. Senza, viene mostrato un segnaposto con le iniziali.",
  },
];

const EXTRAS = "Qt.I · Qt.A M · Qt.I M · FVM · FVM M";

const EXAMPLE = `Id,R,RM,Nome,Squadra,Qt.A
5841,P,Por,Svilar,Roma,19
254,D,E;W,Dimarco,Inter,31
2194,C,M;C,Calhanoglu,Inter,28
2764,A,Pc,Martinez L.,Inter,33`;

export default function FormatoListonePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <Link href="/" className="text-sm text-chalk-400 transition hover:text-chalk-50">
          ← Home
        </Link>
        <h1 className="display text-4xl text-chalk-50">Formato del listone</h1>
        <p className="text-sm text-chalk-400">
          Si accettano file Excel (<code>.xlsx</code>) e CSV. Il file ufficiale di
          Fantacalcio.it funziona così com&apos;è, senza modifiche.
        </p>
      </header>

      <section className="surface space-y-3 p-5">
        <h2 className="display text-2xl text-chalk-50">Come viene letto il file</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-chalk-200">
          <li>
            La riga di intestazione viene <strong>cercata</strong> nelle prime 15 righe: una
            riga di titolo sopra le intestazioni non dà fastidio.
          </li>
          <li>
            Le colonne sono riconosciute per nome, ignorando maiuscole, accenti,
            punti e spazi. L&apos;ordine non conta.
          </li>
          <li>
            Nei file con più fogli viene scelto <strong>Tutti</strong> se esiste, e il
            foglio <strong>Ceduti</strong> non viene mai importato. Puoi comunque cambiare
            foglio dall&apos;anteprima.
          </li>
          <li>Le righe senza nome vengono saltate; quelle con ruolo non valido segnalate.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="display text-2xl text-chalk-50">Colonne obbligatorie</h2>
        <ColumnTable rows={REQUIRED} />
      </section>

      <section className="space-y-3">
        <h2 className="display text-2xl text-chalk-50">Colonne facoltative</h2>
        <ColumnTable rows={OPTIONAL} />
        <p className="text-sm text-chalk-400">
          Le colonne <span className="font-mono text-chalk-200">{EXTRAS}</span> vengono
          conservate come dati aggiuntivi della scheda. Qualsiasi altra colonna viene
          ignorata, e l&apos;anteprima ti dice quali.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="display text-2xl text-chalk-50">Esempio minimo (CSV)</h2>
        <pre className="overflow-x-auto rounded-xl border border-pitch-700 bg-pitch-900/70 p-4 text-sm text-chalk-200">
          <code>{EXAMPLE}</code>
        </pre>
      </section>
    </main>
  );
}

function ColumnTable({
  rows,
}: {
  rows: { field: string; headers: string; note: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-pitch-700">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="bg-pitch-900/70 text-xs uppercase tracking-wider text-chalk-400">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Dato</th>
            <th className="px-4 py-2 text-left font-medium">Intestazioni accettate</th>
            <th className="px-4 py-2 text-left font-medium">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-pitch-800">
          {rows.map((row) => (
            <tr key={row.field}>
              <td className="px-4 py-2.5 font-medium text-chalk-50">{row.field}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-chalk-200">{row.headers}</td>
              <td className="px-4 py-2.5 text-chalk-400">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
