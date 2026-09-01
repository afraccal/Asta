# Asta Fantacalcio

Sala d'asta virtuale per il fantacalcio tra amici. Piu' partecipanti si
collegano da PC o smartphone alla stessa stanza e fanno l'asta in tempo reale.

**Stato:** Fase 1 di 8 completata.

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
npm run test:db       # ciclo completo + concorrenza reale
```

- `test:flow` — 16 verifiche sul ciclo dell'asta (creazione, ingresso, limite di
  2 allenatori, chiamata, offerte non valide, reset del timer, assegnazione,
  idempotenza, cambio turno, pausa/ripresa, snapshot, ricerca).
- `test:concurrency` — 8 processi `psql` indipendenti che colpiscono la stessa
  asta nello stesso istante: offerte identiche, offerte crescenti, chiusure
  simultanee dello stesso lotto.

---

## Le tre decisioni che reggono tutto il progetto

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

### 3. Realtime via Broadcast, con rilevamento dei buchi

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

## Struttura

```
src/
  app/
    page.tsx                  home: nickname + codice, oppure crea
    crea/page.tsx             wizard di creazione asta
    a/[code]/page.tsx         link di invito -> lobby
    a/[code]/lobby/page.tsx   lobby: tavoli, ingressi, avvio
  components/
    ui/                       Button, Input, Alert, Avatar
    lobby/                    InviteBar, TeamSlot
    NicknameGate.tsx          per chi apre il link senza passare dalla home
  lib/
    types.ts                  tipi allineati a get_auction_state()
    errors.ts                 codici Postgres -> messaggi leggibili
    identity.ts               autenticazione anonima + profilo
    serverClock.ts            sincronizzazione dell'orologio col server
    useAuctionState.ts        snapshot + realtime + riallineamento
    useCountdown.ts           countdown su requestAnimationFrame
    useAuctionAccess.ts       codice invito -> asta
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
- Non si rilancia su se stessi (vale anche tra i due allenatori della squadra).
- Ordine di chiamata sorteggiato all'avvio; le squadre rimaste vuote in lobby
  non partecipano.
- L'amministratore puo' mettere in pausa: i secondi residui vengono congelati e
  restituiti alla ripresa. Puo' anche offrire per una squadra disconnessa.
- Se e' impostata la dimensione della rosa, il sistema tiene da parte 1 credito
  per ogni slot vuoto, cosi' nessuno resta con la rosa incompleta.

---

## Roadmap

| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Setup progetto, Supabase locale, CI | ✅ |
| 1 | Schema, RLS, auth anonima, creazione asta, lobby, squadre | ✅ |
| 2 | Import listone CSV, ricerca, scheda giocatore | ⬜ |
| 3 | Offerte, crediti, timer, assegnazione | 🟡 motore gia' pronto e testato lato DB |
| 4 | Realtime, riconnessioni | 🟡 hook gia' pronto |
| 5 | Storico, turni, pausa/ripresa, chiusura | 🟡 funzioni gia' pronte lato DB |
| 6 | Sala d'asta, tavoli, animazioni, modalita' TV | ⬜ |
| 7 | Videochiamata (LiveKit, isolata dall'asta) | ⬜ |
| 8 | Test E2E multi-utente, hardening, deploy | ⬜ |
