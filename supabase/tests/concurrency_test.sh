#!/usr/bin/env bash
# ============================================================================
# Test di concorrenza reale: piu' processi psql indipendenti, quindi backend
# Postgres distinti, che colpiscono la stessa asta nello stesso istante.
# Non e' una simulazione: e' esattamente lo scenario di 8 amici che premono
# "OFFRI" insieme.
# ============================================================================
set -uo pipefail

DB=supabase_db_asta-fantacalcio
psql_run() { docker exec -i "$DB" psql -U postgres -d postgres -t -A -q -c "$1" 2>&1; }

fail() { echo "❌ $1"; exit 1; }

# --- Scenario A: 8 offerte identiche nello stesso istante --------------------
read -r AUCTION LOT <<<"$(psql_run "select public._test_setup_concurrency('A');")"
[ -n "$LOT" ] || fail "setup fallito: $AUCTION"

TMP=$(mktemp -d)
for i in $(seq 1 8); do
  UID_I="00000000-0000-0000-0000-$(printf '%012d' "$i")"
  (
    docker exec -i "$DB" psql -U postgres -d postgres -t -A -q -c "
      select set_config('request.jwt.claims', json_build_object('sub','$UID_I')::text, false);
      select public.place_bid(
        '$LOT'::uuid,
        (select id from public.teams where auction_id='$AUCTION'::uuid and turn_position=$i),
        50);
    " >"$TMP/out.$i" 2>&1
  ) &
done
wait

OK_COUNT=0
for i in $(seq 1 8); do
  grep -q "bid_deadline_ms" "$TMP/out.$i" && OK_COUNT=$((OK_COUNT + 1))
done
BID=$(psql_run "select current_bid from public.auction_lots where id='$LOT'::uuid;")
NBIDS=$(psql_run "select count(*) from public.bids where lot_id='$LOT'::uuid and amount=50;")

echo "Scenario A — 8 offerte da 50 crediti sparate insieme:"
echo "   offerte accettate : $OK_COUNT (atteso 1)"
echo "   offerta corrente  : $BID (atteso 50)"
echo "   righe a 50 crediti: $NBIDS (atteso 1)"
[ "$OK_COUNT" = "1" ] || fail "Scenario A: $OK_COUNT offerte accettate invece di 1"
[ "$BID" = "50" ]     || fail "Scenario A: offerta corrente $BID"
[ "$NBIDS" = "1" ]    || fail "Scenario A: $NBIDS offerte registrate a 50"
echo "✅ Scenario A superato: una sola offerta vince, le altre 7 respinte"
echo

# --- Scenario B: 8 offerte crescenti simultanee ------------------------------
read -r AUCTION LOT <<<"$(psql_run "select public._test_setup_concurrency('B');")"
for i in $(seq 1 8); do
  UID_I="00000000-0000-0000-0000-$(printf '%012d' "$i")"
  AMOUNT=$((i * 7))
  (
    docker exec -i "$DB" psql -U postgres -d postgres -t -A -q -c "
      select set_config('request.jwt.claims', json_build_object('sub','$UID_I')::text, false);
      select public.place_bid(
        '$LOT'::uuid,
        (select id from public.teams where auction_id='$AUCTION'::uuid and turn_position=$i),
        $AMOUNT);
    " >/dev/null 2>&1
  ) &
done
wait

BID=$(psql_run "select current_bid from public.auction_lots where id='$LOT'::uuid;")
MONO=$(psql_run "
  select bool_and(ok) from (
    select amount > lag(amount) over (order by id) as ok
      from public.bids where lot_id='$LOT'::uuid
  ) s where ok is not null;")
NEG=$(psql_run "select count(*) from public.teams where auction_id='$AUCTION'::uuid and credits_remaining < 0;")

echo "Scenario B — 8 offerte di importo diverso sparate insieme:"
echo "   offerta finale        : $BID"
echo "   sequenza monotona     : $MONO (atteso t)"
echo "   squadre in rosso      : $NEG (atteso 0)"
[ "$MONO" = "t" ] || fail "Scenario B: la sequenza di offerte non e' strettamente crescente"
[ "$NEG" = "0" ]  || fail "Scenario B: $NEG squadre con crediti negativi"
echo "✅ Scenario B superato: le offerte si sono serializzate senza incoerenze"
echo

# --- Scenario C: 8 chiusure simultanee dello stesso lotto --------------------
read -r AUCTION LOT <<<"$(psql_run "select public._test_setup_concurrency('C');")"
psql_run "update public.auction_lots set bid_deadline = clock_timestamp() - interval '1 second' where id='$LOT'::uuid;" >/dev/null

for i in $(seq 1 8); do
  ( docker exec -i "$DB" psql -U postgres -d postgres -t -A -q \
      -c "select public.finalize_lot('$LOT'::uuid);" >"$TMP/fin.$i" 2>&1 ) &
done
wait

ASSIGNED=$(psql_run "select count(*) from public.team_players where lot_id='$LOT'::uuid;")
SPENT=$(psql_run "
  select credits_spent from public.teams
   where id = (select winner_team_id from public.auction_lots where id='$LOT'::uuid);")
PRICE=$(psql_run "select final_price from public.auction_lots where id='$LOT'::uuid;")

echo "Scenario C — 8 chiusure simultanee dello stesso lotto:"
echo "   giocatori assegnati : $ASSIGNED (atteso 1)"
echo "   crediti scalati     : $SPENT (atteso $PRICE, cioe' il prezzo una volta sola)"
[ "$ASSIGNED" = "1" ]  || fail "Scenario C: $ASSIGNED assegnazioni invece di 1"
[ "$SPENT" = "$PRICE" ] || fail "Scenario C: crediti scalati $SPENT invece di $PRICE"
echo "✅ Scenario C superato: nessuna doppia assegnazione, crediti scalati una sola volta"

rm -rf "$TMP"
echo
echo "================ CONCORRENZA: TUTTI I TEST SUPERATI ================"
