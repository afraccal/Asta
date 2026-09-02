# Asta Fantacalcio

**In linea: https://asta-fantacalcio-pi.vercel.app**

Sala d'asta virtuale per il fantacalcio tra amici. Piu' partecipanti si
collegano da PC o smartphone alla stessa stanza e fanno l'asta in tempo reale.

**Stato:** completo, tutte e 8 le fasi.

---

## Come si avvia

Servono Node 20+ e Docker Desktop avviato.

```bash
npm install
npm run db:start      # Supabase in locale: stampa URL e chiavi
npm run dev           # http://localhost:3000
```

Le chiavi stampate da `db:start` vanno in `.env.local` (vedi `.env.example`).

## Test

```bash
npm run test:all      # tutto: unita', integrazione, sicurezza, concorrenza, browser
```

- `test` (vitest) — parser del listone, importazione end-to-end, calcolo del
  tempo residuo e **asta con più partecipanti collegati insieme**: tre client
  Supabase distinti, con sessioni e websocket separati, che si contendono la
  stessa asta.
- `test:flow` — 16 verifiche sul ciclo dell'asta (creazione, ingresso, limite di
  2 allenatori, chiamata, offerte non valide, reset del timer, assegnazione,
  idempotenza, cambio turno, pausa/ripresa, snapshot, ricerca).
- `test:concurrency` — 8 processi `psql` indipendenti che colpiscono la stessa
  asta nello stesso istante: offerte identiche, offerte crescenti, chiusure
  simultanee dello stesso lotto.
- `test:e2e` (Playwright) — la sala guidata da un browser vero: che si carichi,
  che ci si possa sedere a un tavolo ad asta iniziata, che un rilancio altrui
  compaia sullo schermo senza ricaricare, che lo storico si apra.

I test di sicurezza in `src/lib/security.test.ts` provano davvero a barare con
la chiave pubblica del browser: modificare i crediti, inserire offerte a mano,
nominarsi amministratore, leggere le aste altrui, invocare gli helper interni.
Tutti devono fallire.

---

## Le cinque decisioni che reggono tutto il progetto

### 1. La logica critica sta nel database, non in TypeScript

Offerta, assegnazione, scalo crediti e cambio turno sono funzioni PL/pgSQL
`SECURITY DEFINER`. Ogni funzione che modifica lo stato **blocca la riga
dell'asta** (`SELECT ... FOR UPDATE`) come primo passo: le operazioni sulla
stessa asta vengono messe in fila dal database e le race condition spariscono
alla radice invece di essere inseguite dal codice applicativo.

Le RLS negano **ogni** scrittura diretta dal client: l'unica via sono le RPC.
Anche con la chiave anonima in mano, nessuno puo' regalarsi crediti.

Alcuni vincoli sono affidati direttamente agli indici, quindi sono
*strutturalmente* impossibili da violare:

| Vincolo | Come e' garantito |
|---|---|
| Un solo giocatore all'asta per volta | indice univoco parziale su `auction_lots(auction_id) WHERE status='live'` |
| Nessuna doppia vendita dello stesso giocatore | indice univoco su `auction_lots(auction_id, player_id) WHERE status<>'void'` |
| Nessun pareggio di offerta | vincolo univoco su `bids(lot_id, amount)` |
| Nessuna squadra in rosso | `CHECK (credits_spent <= budget_initial)` |

### 2. Il timer e' una scadenza, non un contatore

Il database non conta alla rovescia: memorizza `bid_deadline`, un istante
assoluto. Ogni offerta valida lo sposta a `now() + 10s` dentro la stessa
transazione dell'offerta.

I client **disegnano** il countdown sottraendo la scadenza all'ora del server,
di cui misurano lo scarto all'avvio (NTP semplificato, 5 campioni, si tiene
quello con andata-e-ritorno piu' breve). Chi ricarica la pagina, chiude il
browser o ha la connessione lenta ritrova il numero giusto.

La chiusura del lotto ha **due inneschi indipendenti**:

- il primo client il cui countdown tocca zero chiama `finalize_lot()` — da' la
  reattivita' immediata;
- un job `pg_cron` ogni secondo chiama `finalize_expired_lots()` — chiude i
  lotti anche a browser tutti chiusi.

`finalize_lot()` e' idempotente: sotto lock verifica `status='live'` e scadenza
superata, quindi la seconda chiamata non trova nulla da fare. I due inneschi
non possono generare una doppia assegnazione.

### 3. Il countdown si ricalcola, non si accumula

Il valore mostrato non è tenuto in stato React: viene ricalcolato a ogni render
sottraendo la scadenza all'ora del server. Lo stato serve solo a provocare i
render, e il battito è un `setInterval`, non `requestAnimationFrame`.

Non è un dettaglio: rAF viene **congelato** quando la scheda non è in primo
piano. Con il valore conservato in stato, una scheda in secondo piano restava
ferma sull'ultimo numero — e la schermata "ASSEGNATO!" non spariva più. Un
timer al massimo rallenta, non si ferma; e siccome il numero si ricalcola
sempre dalla scadenza assoluta, un rallentamento non lascia mai indietro nulla:
al primo render successivo il valore è già quello giusto.

### 4. La sala si adatta alla forma dello schermo, non alla larghezza

La stessa schermata viene guardata a 40 cm su un telefono e a 3 metri su un
televisore. Le misure sono quindi legate alla finestra, non fissate in pixel:
`clamp(min, min(vw, vh), max)`. Il `min(vw, vh)` non e' un vezzo, e' la
correzione di un difetto vero: con le sole `vw`, un portatile collegato alla TV
(1280x720, largo ma basso) faceva sfondare il palco in verticale e spingeva i
controlli di offerta fuori campo.

Anche la disposizione cambia con l'**altezza**, non con la larghezza:

- schermo alto (televisore, telefono) -> tavoli ai lati del palco, come
  seduti attorno a un tavolo, e composizione del palco a due fasce;
- schermo largo ma basso -> tavoli in una striscia orizzontale in fondo, palco
  a tutta larghezza con le due fasce affiancate.

Otto tavoli in colonna vogliono altezza, non larghezza: sceglierne la
disposizione guardando solo la larghezza e' quello che tagliava il pulsante
d'offerta su un portatile.

Il pulsante d'offerta e' l'ultima cosa che puo' sparire dallo schermo: su
telefono sta in fondo, dove arriva il pollice.

### 5. Realtime via Broadcast, con rilevamento dei buchi

Un trigger su `auction_events` emette un messaggio sul topic
`auction:<id>` (canale privato, accesso filtrato dalle RLS su
`realtime.messages`). Si e' scelto Broadcast e non "Postgres Changes" perche'
quest'ultimo rivaluta le RLS per ogni client a ogni evento e non regge la
crescita.

Ogni evento porta uno `state_version` monotono. Se un client riceve la versione
N+2 senza aver visto la N+1, sa di aver perso un messaggio e riscarica l'intero
snapshot con `get_auction_state()`. Lo stesso snapshot viene richiesto al primo
caricamento, al ritorno da background (le schede degli smartphone vengono
congelate) e a ogni riconnessione del websocket.

---

## Il listone

L'importazione accetta Excel (`.xlsx`) e CSV. Il file ufficiale di
Fantacalcio.it funziona senza modifiche, ma il parser non da' per scontata
quella struttura:

- la **riga di intestazione viene cercata** nelle prime 15 righe, quindi una
  riga di titolo sopra le intestazioni non da' fastidio;
- le colonne sono riconosciute **per nome**, ignorando maiuscole, accenti,
  punti e spazi, in qualsiasi ordine (`Qt.A`, `Quotazione` e `Prezzo` sono la
  stessa cosa);
- nei file multi-foglio viene scelto **Tutti** e il foglio **Ceduti** non viene
  mai importato — ma il foglio resta selezionabile dall'anteprima.

Il parsing gira **sul server**: exceljs pesa troppo per il bundle del browser e
cosi' xlsx e CSV seguono un percorso solo. L'anteprima mostra come sono state
interpretate le colonne, quali sono state ignorate e quali righe hanno problemi;
**niente viene scritto finche' non si conferma**.

Reimportare un file aggiornato e' un **upsert sull'Id ufficiale**: i giocatori
esistenti vengono aggiornati invece di duplicati, e i riferimenti delle aste in
corso restano validi. Il formato completo e' documentato in-app su
`/docs/formato-listone`.

### I colori

Tre temi, scelti dall'interfaccia e ricordati nel browser: **tenue** (il
predefinito: scuro ma morbido, per starci ore), **notte** (nero pieno, per la
TV in una stanza al buio) e **chiaro**, per giocare di giorno.

I token mantengono il loro ruolo (`pitch-*` sono superfici, `chalk-*` e' testo)
e cambiano solo di valore: nessun componente sa quale tema e' attivo. Nel tema
chiaro i colori accesi vengono scuriti, non solo spostati, perche' l'oro e il
verde che si leggono benissimo sul nero spariscono sul bianco; i contrasti
sono stati misurati, non stimati a occhio.

Il tema viene applicato da uno script nel `<head>` prima del disegno della
pagina, altrimenti a ogni caricamento si vedrebbe un lampo del tema sbagliato.

### Foto dei giocatori

`resolvePlayerImage()` interroga una catena di fornitori in ordine: URL
esplicito dal listone, poi convenzione su un archivio proprio
(`NEXT_PUBLIC_PLAYER_IMAGE_BASE`), e in futuro un servizio esterno. Aggiungerne
uno significa scrivere un adattatore in `src/lib/playerImage.ts` e nient'altro:
i componenti non cambiano. Senza foto si ottiene un segnaposto con le iniziali
sul colore del ruolo, leggibile anche da lontano.

---

## Struttura

```
src/
  app/
    page.tsx                  home: nickname + codice, oppure crea
    crea/page.tsx             wizard di creazione asta
    a/[code]/page.tsx         link di invito -> lobby
    a/[code]/lobby/page.tsx   lobby: tavoli, ingressi, avvio
    a/[code]/listone/page.tsx import del listone e scelta fra quelli esistenti
    a/[code]/giocatori/page.tsx consultazione del listone
    a/[code]/room/page.tsx    LA SALA D'ASTA: palco, tavoli, offerte, timer
    a/[code]/riepilogo/page.tsx rose complete, statistiche, export CSV
    docs/formato-listone/     formato accettato, documentato per chi carica
    actions/listone.ts        server action: legge il file e restituisce l'anteprima
  components/
    ui/                       Button, Input, Alert, Avatar
    lobby/                    InviteBar, TeamSlot
    listone/ImportPreview.tsx anteprima con mappatura colonne e segnalazioni
    player/                   PlayerPortrait, PlayerCard, PlayerSearch
    auction/                  RoomStage, CountdownRing, BidControls, TeamTable,
                              NominationPanel, AssignedOverlay, RoomChrome,
                              HistoryPanel, SeatPicker
    NicknameGate.tsx          per chi apre il link senza passare dalla home
  lib/
    types.ts                  tipi allineati a get_auction_state()
    errors.ts                 codici Postgres -> messaggi leggibili
    identity.ts               autenticazione anonima + profilo
    serverClock.ts            sincronizzazione dell'orologio col server
    useAuctionState.ts        snapshot + realtime + riallineamento
    useCountdown.ts           countdown su requestAnimationFrame
    useAuctionAccess.ts       codice invito -> asta
    useAsyncData.ts           caricamento dati al montaggio
    useLotFinalizer.ts        chiusura del lotto allo scadere del tempo
    playerImage.ts            catena di risoluzione delle foto
    exportCsv.ts              costruzione del CSV delle rose
    listone/parse.ts          parser xlsx/CSV con riconoscimento colonne
    supabase/                 client browser e server

supabase/
  migrations/
    ..._schema.sql            tabelle, enum, indici, vincoli
    ..._functions.sql         logica transazionale (offerte, assegnazione)
    ..._reads.sql             snapshot e ricerca
    ..._security_realtime.sql RLS, grant, broadcast, pg_cron
  tests/
    flow_test.sql             ciclo completo
    concurrency_test.sh       concorrenza reale multi-processo
```

---

## Regole dell'asta implementate

- 8 squadre, 500 crediti, timer 10 secondi (tutto configurabile alla creazione).
- Massimo 2 allenatori per squadra.
- Il banditore di turno detiene l'apertura a 1 credito: se nessuno rilancia
  entro il timer, il giocatore e' suo.
- Il listone lo vedono tutti, sempre: chi non e' di turno puo' cercare,
  aprire una scheda e prepararsi la mossa. A essere legata al turno e' la
  chiamata, non la consultazione.
- Non si rilancia su se stessi (vale anche tra i due allenatori della squadra).
- Ordine di chiamata sorteggiato all'avvio; le squadre rimaste vuote in lobby
  non partecipano.
- L'amministratore puo' mettere in pausa: i secondi residui vengono congelati e
  restituiti alla ripresa. Puo' anche offrire per una squadra disconnessa.
- Rosa a reparti fissi, con i valori del fantacalcio classico: 3 portieri, 8
  difensori, 8 centrocampisti, 6 attaccanti. Chi ha completato un reparto non
  puo' nemmeno rilanciare su un giocatore di quel ruolo. Il sistema tiene
  inoltre da parte 1 credito per ogni posto ancora vuoto, cosi' nessuno resta
  con la rosa incompleta. I numeri sono modificabili alla creazione.
- Si puo' iniziare appena si e' in due: i tavoli ancora liberi restano al loro
  posto, chi arriva dopo si siede ad asta iniziata, e il giro di chiamata salta
  i tavoli vuoti reinserendoli appena qualcuno si accomoda.
- La videochiamata e' disponibile gia' in lobby: ci si vede mentre si aspettano
  i ritardatari, senza dover avviare l'asta per forza.

---

## La sala

Non una pagina scura, una stanza: una pozza di luce sul palco, i tavoli in
penombra intorno, i bordi che si spengono. La gerarchia la fa la luce, cosi'
regge anche vista da lontano.

Il colore dice tre cose e nient'altro. **Oro** = questo tavolo e' in testa
all'offerta. **Verde** = tocca a lui chiamare. **Bordo chiaro** = sei tu.
Nessuna decorazione: se un elemento e' colorato, quel colore significa
qualcosa.

Il pulsante **TV** in alto a destra toglie di mezzo il contorno e ingrandisce
il palco. Non ingrandisce i tavoli: farlo spingeva fuori schermo l'ottavo
tavolo e il pulsante d'offerta, cioe' proprio quello che si vuole vedere
meglio.

Le animazioni sono sei, ognuna dice qualcosa: entrata del giocatore chiamato,
battito del numero a ogni rilancio, lampo sul tavolo che passa in testa,
pulsazione rossa sotto i tre secondi, aggiudicazione, cambio turno. Tutte solo
su `transform` e `opacity`, e tutte spente per chi ha chiesto meno animazioni
al sistema.

## Storico e riepilogo

Lo **storico** e' un pannello laterale, non una pagina: lo si apre in mezzo a
un'asta, e uscire dalla stanza significherebbe perdere di vista il timer. Ha
due schede, storico cronologico e rose per squadra, e si filtra per nome,
ruolo e squadra. I dati arrivano dallo snapshot che il client ha gia', quindi
si aggiorna da solo a ogni aggiudicazione.

Il **riepilogo** (`/a/<codice>/riepilogo`) e' invece una pagina, perche' lo si
guarda a giochi fatti: rose complete divise per ruolo, spesa di ognuno,
acquisto piu' caro, ed export CSV. Funziona anche ad asta in corso, come
fotografia della situazione.

La costruzione del CSV sta in `lib/exportCsv.ts` e non nella pagina: virgole,
virgolette e accenti nei nomi sono esattamente il genere di cosa che rompe un
file aperto in Excel, ed e' l'unica parte che vale la pena verificare da sola.

## La videochiamata

E' un extra, e il codice lo tratta come tale: se le chiavi non sono
configurate, l'endpoint dei permessi risponde 503, i comandi spariscono e
l'asta si comporta esattamente come se il video non esistesse. Anche a video
attivo, nessun componente dell'asta dipende dalla videochiamata.

Si usa un SFU (LiveKit) e non una connessione diretta fra i browser: in mesh,
con otto tavoli, ognuno dovrebbe inviare il proprio video a tutti gli altri.
La CPU va al massimo, e a rallentare non e' solo il video ma la scheda intera,
timer compreso. Con un SFU ognuno invia una copia sola.

La libreria viene caricata solo quando qualcuno entra davvero in
videochiamata: chi gioca senza video non se ne porta dietro il peso.

L'audio richiede due attenzioni che il video non ha, ed entrambe erano
mancate alla prima stesura: le voci vanno riprodotte in elementi `<audio>`
propri (il riquadro video e' `muted` per forza, altrimenti ognuno sentirebbe
la propria voce in ritardo), e i browser bloccano la riproduzione automatica
finche' non c'e' stata un'interazione, quindi lo si rileva e si offre un
pulsante invece di restare in silenzio. La regola di raccolta delle tracce
vive in `lib/videoTracks.ts` con i suoi test: e' il punto esatto in cui il
bug era nato.

Il permesso di entrare viene rilasciato dal server dopo aver verificato, con
le stesse regole dell'asta, che chi lo chiede sia gia' membro di quella
stanza. Si entra con la telecamera accesa e il microfono spento.

### Attivarla

1. Creare un progetto gratuito su **https://cloud.livekit.io**
2. Copiare *WebSocket URL*, *API Key* e *API Secret*
3. Metterli fra le variabili d'ambiente (in locale in `.env.local`, su Vercel
   in *Settings -> Environment Variables*):

```
LIVEKIT_URL=wss://<progetto>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

⚠️ **Senza** il prefisso `NEXT_PUBLIC_`: queste chiavi devono restare sul
server. Se finissero nel browser, chiunque potrebbe entrare in qualunque
stanza video.

---

## Messa online

Gia' fatta: database su Supabase (`ysoogolibmevpdwersoj`, regione Irlanda) e
applicazione su Vercel. Quanto segue serve per rifarla da zero, o per capire
cosa e' stato configurato.

Servono un progetto Supabase e un account Vercel, entrambi gratuiti.

### 1. Database

```bash
npx supabase link --project-ref <id-del-progetto>
npx supabase db push
```

Poi, nella dashboard Supabase:

- **Authentication -> Sign In / Providers**: attivare **Anonymous sign-ins**.
  Senza, nessuno riesce a entrare.
- **Database -> Extensions**: verificare che **pg_cron** sia attiva.

⚠️ **Controllo da non saltare.** La chiusura automatica dei lotti dipende da un
job che gira ogni secondo. Se l'estensione non fosse disponibile la migrazione
non fallisce, si limita ad avvisare: senza questa verifica il difetto si
scoprirebbe solo durante l'asta, con un giocatore che resta appeso perche' chi
doveva chiudere il lotto ha chiuso il browser.

```sql
select jobname, schedule, active from cron.job;
-- deve comparire: asta-finalize-expired-lots | 1 seconds | t
```

### 2. Applicazione

Su Vercel, importare il repository e impostare due variabili d'ambiente
(**Settings -> Environment Variables**), prese da Supabase in
*Project Settings -> API*:

| Variabile | Valore |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | l'URL del progetto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la chiave anon/publishable |

Entrambe finiscono nel browser: e' previsto. La sicurezza non poggia sulla
segretezza della chiave ma sulle RLS e sui permessi di esecuzione, che i test
di sicurezza verificano. La chiave `service_role` invece **non va mai** messa
in una variabile `NEXT_PUBLIC_`.

### 3. Aggiornare l'applicazione

Il repository non e' collegato automaticamente a Vercel (richiede di
autorizzare l'app Vercel su GitHub). Finche' non lo si fa, si pubblica a mano:

```bash
npx vercel deploy --prod --yes
```

Per attivare la pubblicazione automatica a ogni push: dalla dashboard Vercel,
**Settings -> Git -> Connect Git Repository**.

### 4. Prima dell'asta vera

- Caricare il listone e controllare che i conteggi per ruolo tornino.
- Aprire il link su due dispositivi diversi e fare un rilancio: il numero deve
  cambiare sull'altro schermo senza ricaricare.
- Lasciare scadere un timer con **tutti i browser chiusi** e verificare che il
  giocatore risulti comunque assegnato: e' la prova che il job sta girando.

### Da sapere

- Sul piano gratuito Supabase **mette in pausa** i progetti inattivi da una
  settimana. Se l'asta e' stagionale, riattivare il progetto dalla dashboard
  qualche ora prima.
- Da qui in avanti le migrazioni sono **append-only**: una volta applicate in
  produzione, modificarle a posteriori manderebbe fuori sincrono il database.

---

## Roadmap

| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Setup progetto, Supabase locale, CI | ✅ |
| 1 | Schema, RLS, auth anonima, creazione asta, lobby, squadre | ✅ |
| 2 | Import listone (xlsx/CSV), ricerca, scheda giocatore | ✅ |
| 3 | Offerte, crediti, timer, assegnazione | ✅ |
| 4 | Realtime, riconnessioni | ✅ |
| 5 | Storico, turni, pausa/ripresa, chiusura | ✅ |
| 6 | Sala d'asta, tavoli, animazioni, modalità TV | ✅ |
| 7 | Videochiamata (LiveKit, isolata dall'asta) | ✅ |
| 8 | Test E2E, sicurezza, gestione errori, deploy | ✅ |
