-- ============================================================================
-- Limiti di rosa per ruolo e avvio con tavoli ancora liberi.
--
-- Nota sui blocchi: un'eccezione sollevata al livello di un blocco PL/pgSQL
-- annulla tutto cio' che il blocco ha fatto. Le prove che si aspettano un
-- errore stanno quindi in blocchi interni, cosi' il resto sopravvive.
-- ============================================================================
\set ON_ERROR_STOP on

do $test$
declare
  u1 uuid := 'bbbb2222-0000-0000-0000-000000000001';
  u2 uuid := 'bbbb2222-0000-0000-0000-000000000002';
  u3 uuid := 'bbbb2222-0000-0000-0000-000000000003';
  v_auction public.auctions;
  v_list uuid; v_team1 uuid; v_team2 uuid; v_vuoto uuid;
  v_lot uuid; v_turno uuid; v_p uuid; i int; v_n int; v_max int;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         x.id::text || '@ruoli.local', now(), now()
    from (values (u1), (u2), (u3)) as x(id)
  on conflict (id) do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', u1)::text, true);
  perform public.ensure_profile('Uno');
  insert into public.player_lists (name, is_public) values ('Ruoli', true) returning id into v_list;
  insert into public.players (list_id, external_id, last_name, role, club, quotation)
  select v_list, 'p' || n, 'Portiere' || n, 'P', 'Club', 5 from generate_series(1,6) n;
  insert into public.players (list_id, external_id, last_name, role, club, quotation)
  select v_list, 'd' || n, 'Difensore' || n, 'D', 'Club', 5 from generate_series(1,4) n;

  v_auction := public.create_auction('Prova ruoli', 500, 8, null, 10, v_list, 3, 8, 8, 6);
  if v_auction.slots_p <> 3 or v_auction.slots_a <> 6 then
    raise exception 'FAIL: posti per ruolo non salvati';
  end if;
  if v_auction.slots_per_team <> 25 then
    raise exception 'FAIL: totale atteso 25, trovato %', v_auction.slots_per_team;
  end if;
  raise notice 'OK 1. Asta creata con i limiti classici (3-8-8-6, totale 25)';

  select id into v_team1 from public.teams where auction_id = v_auction.id and turn_position = 1;
  select id into v_team2 from public.teams where auction_id = v_auction.id and turn_position = 2;
  select id into v_vuoto from public.teams where auction_id = v_auction.id and turn_position = 5;
  perform public.claim_team(v_team1);

  perform set_config('request.jwt.claims', json_build_object('sub', u2)::text, true);
  perform public.ensure_profile('Due');
  perform public.join_auction(v_auction.code);
  perform public.claim_team(v_team2);

  -- --- Avvio con 6 tavoli ancora liberi -------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u1)::text, true);
  perform public.start_auction(v_auction.id, false);

  select count(*) into v_n from public.teams where auction_id = v_auction.id;
  if v_n <> 8 then raise exception 'FAIL: squadre vuote cancellate (rimaste %)', v_n; end if;
  raise notice 'OK 2. Avviata con 2 presenti su 8: i tavoli liberi restano';

  for i in 1..6 loop
    v_turno := public.current_turn_team_id(v_auction.id);
    if v_turno is distinct from v_team1 and v_turno is distinct from v_team2 then
      raise exception 'FAIL: il turno e'' finito su un tavolo vuoto';
    end if;
    perform public._avanza_turno(v_auction.id);
  end loop;
  raise notice 'OK 3. Il giro di chiamata salta i tavoli senza allenatori';

  -- --- Chi arriva a partita iniziata trova posto ----------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u3)::text, true);
  perform public.ensure_profile('Tre, in ritardo');
  perform public.join_auction(v_auction.code);
  perform public.claim_team(v_vuoto);
  if not exists (select 1 from public.team_members where team_id = v_vuoto) then
    raise exception 'FAIL: il ritardatario non ha trovato posto';
  end if;
  raise notice 'OK 4. Chi arriva ad asta iniziata si siede a un tavolo libero';

  -- E da quel momento rientra nel giro delle chiamate
  perform set_config('request.jwt.claims', json_build_object('sub', u1)::text, true);
  update public.auctions set current_turn_index = 3 where id = v_auction.id;  -- appena prima del suo
  if public.current_turn_team_id(v_auction.id) is distinct from v_vuoto then
    raise exception 'FAIL: il ritardatario non e'' rientrato nel giro';
  end if;
  raise notice 'OK 5. Il ritardatario rientra subito nel giro di chiamata';

  -- --- Limiti per ruolo -----------------------------------------------------
  for i in 1..3 loop
    perform set_config('request.jwt.claims', json_build_object('sub', u1)::text, true);
    update public.auctions
       set current_turn_index = (select turn_position - 1 from public.teams where id = v_team1)
     where id = v_auction.id;
    select p.id into v_p from public.players p
     where p.list_id = v_list and p.role = 'P'
       and not exists (select 1 from public.team_players tp
                        where tp.auction_id = v_auction.id and tp.player_id = p.id)
     limit 1;
    v_lot := public.nominate_player(v_auction.id, v_p);
    update public.auction_lots set bid_deadline = clock_timestamp() - interval '1 second'
     where id = v_lot;
    perform public.finalize_lot(v_lot);
  end loop;

  if public.posti_liberi_ruolo(v_team1, 'P') <> 0 then
    raise exception 'FAIL: dopo 3 portieri il reparto risulta ancora aperto';
  end if;
  raise notice 'OK 6. Tre portieri comprati: il reparto e'' pieno';

  -- Un quarto portiere non e' chiamabile (blocco interno: l'errore e' atteso)
  perform set_config('request.jwt.claims', json_build_object('sub', u1)::text, true);
  update public.auctions
     set current_turn_index = (select turn_position - 1 from public.teams where id = v_team1)
   where id = v_auction.id;
  select p.id into v_p from public.players p
   where p.list_id = v_list and p.role = 'P'
     and not exists (select 1 from public.team_players tp
                      where tp.auction_id = v_auction.id and tp.player_id = p.id)
   limit 1;
  begin
    perform public.nominate_player(v_auction.id, v_p);
    raise exception 'FAIL: ha potuto chiamare un quarto portiere';
  exception when others then
    if sqlerrm not like '%role_full%' then
      raise exception 'FAIL: atteso role_full in chiamata, ricevuto %', sqlerrm;
    end if;
  end;
  raise notice 'OK 7. Il quarto portiere non e'' chiamabile';

  -- E non si puo' nemmeno rilanciare su un portiere chiamato da un altro
  perform set_config('request.jwt.claims', json_build_object('sub', u2)::text, true);
  update public.auctions
     set current_turn_index = (select turn_position - 1 from public.teams where id = v_team2)
   where id = v_auction.id;
  v_lot := public.nominate_player(v_auction.id, v_p);

  perform set_config('request.jwt.claims', json_build_object('sub', u1)::text, true);
  begin
    perform public.place_bid(v_lot, v_team1, 5);
    raise exception 'FAIL: ha potuto offrire per un ruolo pieno';
  exception when others then
    if sqlerrm not like '%role_full%' then
      raise exception 'FAIL: atteso role_full sull''offerta, ricevuto %', sqlerrm;
    end if;
  end;
  raise notice 'OK 8. Con il reparto pieno non si puo'' nemmeno rilanciare';

  -- --- Riserva crediti sui posti che restano --------------------------------
  v_max := public.max_bid_for_team(v_team1);
  select credits_remaining into v_n from public.teams where id = v_team1;
  -- 25 posti - 3 portieri presi = 22 ancora vuoti, se ne tiene 21 da parte
  if v_max <> v_n - 21 then
    raise exception 'FAIL: riserva errata (max %, residui %, attesa %)', v_max, v_n, v_n - 21;
  end if;
  raise notice 'OK 9. L''offerta massima tiene 1 credito per ogni posto ancora vuoto';

  raise notice '';
  raise notice '========== RUOLI E AVVIO: TUTTI I TEST SUPERATI ==========';
end $test$;
