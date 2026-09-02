-- ============================================================================
-- Test del ciclo completo dell'asta, eseguito contro il database vero.
-- Ogni passo verifica una regola dichiarata nei requisiti.
-- Fallisce rumorosamente: qualunque assert non rispettato interrompe tutto.
-- ============================================================================

\set ON_ERROR_STOP on

do $test$
declare
  admin_id  uuid := '11111111-1111-1111-1111-111111111111';
  u2_id     uuid := '22222222-2222-2222-2222-222222222222';
  u3_id     uuid := '33333333-3333-3333-3333-333333333333';
  u4_id     uuid := '44444444-4444-4444-4444-444444444444';

  v_auction public.auctions;
  v_list_id uuid;
  v_lot_id  uuid;
  v_team1   uuid;
  v_team2   uuid;
  v_team3   uuid;
  v_turn    uuid;
  v_other   uuid;
  v_player  uuid;
  v_player2 uuid;
  v_state   jsonb;
  v_count   int;
  v_credits int;
  v_before  int;
  v_ok      boolean;

begin
  -- --- Utenti di prova ------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         x.id::text || '@test.local', now(), now()
    from (values (admin_id), (u2_id), (u3_id), (u4_id)) as x(id)
  on conflict (id) do nothing;

  -- --- 1. Profili e creazione asta ------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id)::text, true);
  perform public.ensure_profile('Alessandro');
  v_auction := public.create_auction('Asta di prova', 500, 8, null, 10, null);

  select count(*) into v_count from public.teams where auction_id = v_auction.id;
  if v_count <> 8 then raise exception 'FAIL: attese 8 squadre, trovate %', v_count; end if;
  if length(v_auction.code) <> 6 then raise exception 'FAIL: codice invito malformato'; end if;
  raise notice 'OK  1. Asta creata (codice %), 8 squadre generate', v_auction.code;

  select id into v_team1 from public.teams where auction_id = v_auction.id and turn_position = 1;
  select id into v_team2 from public.teams where auction_id = v_auction.id and turn_position = 2;
  select id into v_team3 from public.teams where auction_id = v_auction.id and turn_position = 3;

  -- --- 2. Ingresso dei partecipanti -----------------------------------------
  perform public.claim_team(v_team1);

  perform set_config('request.jwt.claims', json_build_object('sub', u2_id)::text, true);
  perform public.ensure_profile('Marco');
  perform public.join_auction(v_auction.code);
  perform public.claim_team(v_team2);

  perform set_config('request.jwt.claims', json_build_object('sub', u3_id)::text, true);
  perform public.ensure_profile('Luca');
  perform public.join_auction(v_auction.code);
  perform public.claim_team(v_team3);
  raise notice 'OK  2. Tre partecipanti entrati con il codice';

  -- --- 3. §10 massimo 2 allenatori per squadra ------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u4_id)::text, true);
  perform public.ensure_profile('Giovanni');
  perform public.join_auction(v_auction.code);
  perform public.claim_team(v_team3);   -- secondo allenatore: consentito

  select count(*) into v_count from public.team_members where team_id = v_team3;
  if v_count <> 2 then raise exception 'FAIL: attesi 2 allenatori, trovati %', v_count; end if;

  -- Un terzo deve essere respinto
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id)::text, true);
  begin
    perform public.claim_team(v_team3);
    raise exception 'FAIL: un terzo allenatore e'' stato accettato';
  exception when others then
    if sqlerrm not like '%team_full%' and sqlerrm not like '%already_in_another_team%' then
      raise exception 'FAIL: errore inatteso su team pieno: %', sqlerrm;
    end if;
  end;
  raise notice 'OK  3. Limite di 2 allenatori per squadra rispettato';

  -- --- 4. Listone ------------------------------------------------------------
  insert into public.player_lists (name, season, owner_id, is_public)
  values ('Serie A test', '2025/26', admin_id, true) returning id into v_list_id;

  insert into public.players (list_id, external_id, first_name, last_name, role, club, quotation)
  values (v_list_id, '1', 'Lautaro', 'Martínez', 'A', 'Inter', 30),
         (v_list_id, '2', 'Nicolò',  'Barella',  'C', 'Inter', 25),
         (v_list_id, '3', 'Theo',    'Hernandez','D', 'Milan', 22);

  update public.auctions set player_list_id = v_list_id where id = v_auction.id;
  select id into v_player  from public.players where list_id = v_list_id and last_name = 'Martínez';
  select id into v_player2 from public.players where list_id = v_list_id and last_name = 'Barella';
  raise notice 'OK  4. Listone caricato (3 giocatori)';

  -- --- 5. Avvio: i tavoli liberi restano per chi arriva dopo -----------------
  perform public.start_auction(v_auction.id, false);

  -- Comportamento cambiato di proposito: prima le squadre vuote venivano
  -- cancellate e chi arrivava tardi non trovava piu' un posto.
  select count(*) into v_count from public.teams where auction_id = v_auction.id;
  if v_count <> 8 then raise exception 'FAIL: attesi 8 tavoli dopo l''avvio, trovati %', v_count; end if;

  select status into v_ok from (select status = 'running' as status from public.auctions where id = v_auction.id) s;
  if not v_ok then raise exception 'FAIL: l''asta non risulta in corso'; end if;

  -- E il turno non deve mai finire su un tavolo senza nessuno
  if not exists (
    select 1 from public.team_members m
     where m.team_id = public.current_turn_team_id(v_auction.id)
  ) then
    raise exception 'FAIL: il turno e'' su un tavolo vuoto';
  end if;
  raise notice 'OK  5. Asta avviata: 8 tavoli, 3 occupati, il turno salta i vuoti';

  -- --- 6. Chiamata: il banditore parte da 1 credito --------------------------
  v_turn := public.current_turn_team_id(v_auction.id);
  if v_turn is null then raise exception 'FAIL: nessuna squadra di turno'; end if;

  -- Il chiamante deve essere un allenatore di quella squadra
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.team_members where team_id = v_turn limit 1))::text, true);
  v_lot_id := public.nominate_player(v_auction.id, v_player);

  select current_bid into v_count from public.auction_lots where id = v_lot_id;
  if v_count <> 1 then raise exception 'FAIL: offerta di apertura % invece di 1', v_count; end if;

  select (current_bidder_team_id = v_turn) into v_ok from public.auction_lots where id = v_lot_id;
  if not v_ok then raise exception 'FAIL: il banditore non detiene l''offerta di apertura'; end if;
  raise notice 'OK  6. Giocatore chiamato, apertura a 1 credito in mano al banditore';

  -- --- 7. Un solo lotto live per asta ---------------------------------------
  begin
    perform public.nominate_player(v_auction.id, v_player2);
    raise exception 'FAIL: e'' stato aperto un secondo lotto contemporaneo';
  exception when others then
    if sqlerrm not like '%lot_already_live%' and sqlerrm not like '%not_your_turn%' then
      raise exception 'FAIL: errore inatteso su doppio lotto: %', sqlerrm;
    end if;
  end;
  raise notice 'OK  7. Impossibile aprire due lotti insieme';

  -- --- 8. Offerte: validazioni ----------------------------------------------
  select id into v_other from public.teams
   where auction_id = v_auction.id and id <> v_turn order by turn_position limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.team_members where team_id = v_other limit 1))::text, true);

  -- 8a. offerta pari a quella attuale -> rifiutata
  begin
    perform public.place_bid(v_lot_id, v_other, 1);
    raise exception 'FAIL: accettata un''offerta pari a quella attuale';
  exception when others then
    if sqlerrm not like '%bid_too_low%' then raise exception 'FAIL: atteso bid_too_low, ricevuto %', sqlerrm; end if;
  end;

  -- 8b. offerta oltre i crediti disponibili -> rifiutata
  begin
    perform public.place_bid(v_lot_id, v_other, 501);
    raise exception 'FAIL: accettata un''offerta superiore al budget';
  exception when others then
    if sqlerrm not like '%insufficient_credits%' then
      raise exception 'FAIL: atteso insufficient_credits, ricevuto %', sqlerrm;
    end if;
  end;

  -- 8c. offerta valida
  perform public.place_bid(v_lot_id, v_other, 10);
  select current_bid into v_count from public.auction_lots where id = v_lot_id;
  if v_count <> 10 then raise exception 'FAIL: offerta non registrata (% invece di 10)', v_count; end if;

  -- 8d. rilancio su se stessi -> rifiutato
  begin
    perform public.place_bid(v_lot_id, v_other, 11);
    raise exception 'FAIL: consentito il rilancio su se stessi';
  exception when others then
    if sqlerrm not like '%already_leading%' then
      raise exception 'FAIL: atteso already_leading, ricevuto %', sqlerrm;
    end if;
  end;
  raise notice 'OK  8. Offerte non valide respinte, offerta valida registrata (10)';

  -- --- 9. §7 ogni rilancio riporta il timer a 10 secondi ---------------------
  update public.auction_lots set bid_deadline = clock_timestamp() + interval '2 seconds'
   where id = v_lot_id;

  perform set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.team_members where team_id = v_turn limit 1))::text, true);
  perform public.place_bid(v_lot_id, v_turn, 20);

  select (bid_deadline - clock_timestamp() > interval '9 seconds') into v_ok
    from public.auction_lots where id = v_lot_id;
  if not v_ok then raise exception 'FAIL: il timer non e'' stato riportato a 10 secondi'; end if;
  raise notice 'OK  9. Ogni rilancio riazzera il countdown a 10 secondi';

  -- --- 10. Scadenza e assegnazione ------------------------------------------
  select credits_remaining into v_before from public.teams where id = v_turn;

  update public.auction_lots set bid_deadline = clock_timestamp() - interval '1 second'
   where id = v_lot_id;
  perform public.finalize_lot(v_lot_id);

  select status = 'assigned' into v_ok from public.auction_lots where id = v_lot_id;
  if not v_ok then raise exception 'FAIL: il lotto non risulta assegnato'; end if;

  select credits_remaining, players_count into v_credits, v_count
    from public.teams where id = v_turn;
  if v_credits <> v_before - 20 then
    raise exception 'FAIL: crediti errati (% invece di %)', v_credits, v_before - 20;
  end if;
  if v_count <> 1 then raise exception 'FAIL: rosa non aggiornata (% giocatori)', v_count; end if;

  if not exists (select 1 from public.team_players
                  where team_id = v_turn and player_id = v_player and price = 20) then
    raise exception 'FAIL: giocatore non inserito in rosa';
  end if;
  raise notice 'OK 10. Assegnato a 20 crediti: budget 500 -> %, rosa aggiornata', v_credits;

  -- --- 11. Idempotenza: la doppia chiusura non deve raddoppiare nulla -------
  if public.finalize_lot(v_lot_id) is not null then
    raise exception 'FAIL: la seconda chiusura ha prodotto una nuova assegnazione';
  end if;
  select credits_remaining into v_credits from public.teams where id = v_turn;
  if v_credits <> v_before - 20 then
    raise exception 'FAIL: la doppia chiusura ha scalato i crediti due volte';
  end if;
  raise notice 'OK 11. finalize_lot idempotente: nessuna doppia assegnazione';

  -- --- 12. Il turno e' avanzato ---------------------------------------------
  if public.current_turn_team_id(v_auction.id) = v_turn then
    raise exception 'FAIL: il turno non e'' passato alla squadra successiva';
  end if;
  raise notice 'OK 12. Turno passato alla squadra successiva';

  -- --- 13. Un giocatore venduto non torna all'asta ---------------------------
  v_turn := public.current_turn_team_id(v_auction.id);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.team_members where team_id = v_turn limit 1))::text, true);
  begin
    perform public.nominate_player(v_auction.id, v_player);
    raise exception 'FAIL: un giocatore gia'' venduto e'' stato rimesso all''asta';
  exception when others then
    if sqlerrm not like '%player_already_sold%' then
      raise exception 'FAIL: atteso player_already_sold, ricevuto %', sqlerrm;
    end if;
  end;
  raise notice 'OK 13. Un giocatore assegnato non e'' piu'' chiamabile';

  -- --- 14. §16 pausa e ripresa conservano il tempo residuo -------------------
  v_lot_id := public.nominate_player(v_auction.id, v_player2);
  update public.auction_lots set bid_deadline = clock_timestamp() + interval '6 seconds'
   where id = v_lot_id;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id)::text, true);
  perform public.pause_auction(v_auction.id);

  select paused_remaining_ms between 5000 and 6100 into v_ok
    from public.auction_lots where id = v_lot_id;
  if not v_ok then raise exception 'FAIL: tempo residuo non congelato correttamente'; end if;

  -- In pausa nessuno puo' offrire
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.team_members where team_id = v_other limit 1))::text, true);
  begin
    perform public.place_bid(v_lot_id, v_other, 50);
    raise exception 'FAIL: accettata un''offerta con asta in pausa';
  exception when others then
    if sqlerrm not like '%auction_paused%' then
      raise exception 'FAIL: atteso auction_paused, ricevuto %', sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id)::text, true);
  perform public.resume_auction(v_auction.id);
  select (bid_deadline - clock_timestamp() between interval '4.5 seconds' and interval '6.5 seconds')
    into v_ok from public.auction_lots where id = v_lot_id;
  if not v_ok then raise exception 'FAIL: alla ripresa il tempo residuo non e'' stato restituito'; end if;
  raise notice 'OK 14. Pausa: offerte bloccate e secondi residui restituiti alla ripresa';

  -- --- 15. Snapshot completo per i client ------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id)::text, true);
  v_state := public.get_auction_state(v_auction.id);

  if jsonb_array_length(v_state->'teams') <> 8 then
    raise exception 'FAIL: snapshot con % squadre', jsonb_array_length(v_state->'teams');
  end if;
  if v_state->'lot'->>'id' is null then raise exception 'FAIL: snapshot senza lotto attivo'; end if;
  if jsonb_array_length(v_state->'history') <> 1 then raise exception 'FAIL: storico incompleto'; end if;
  if (v_state->>'server_now_ms')::bigint is null then raise exception 'FAIL: snapshot senza ora del server'; end if;
  raise notice 'OK 15. Snapshot completo: squadre, lotto, storico e ora del server';

  -- --- 16. Ricerca accento-insensibile e senza venduti -----------------------
  if jsonb_array_length(public.search_players(v_auction.id, 'martinez')) <> 0 then
    raise exception 'FAIL: un giocatore venduto compare ancora nella ricerca';
  end if;
  if jsonb_array_length(public.search_players(v_auction.id, 'hernandez')) <> 1 then
    raise exception 'FAIL: la ricerca senza accenti non trova il giocatore';
  end if;
  if jsonb_array_length(public.search_players(v_auction.id, null, 'D')) <> 1 then
    raise exception 'FAIL: filtro per ruolo non funzionante';
  end if;
  raise notice 'OK 16. Ricerca: accenti ignorati, venduti esclusi, filtro ruolo attivo';

  raise notice '';
  raise notice '================ TUTTI I TEST SUPERATI ================';
end $test$;
