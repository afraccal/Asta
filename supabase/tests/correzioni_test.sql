-- ============================================================================
-- Revoca di un'assegnazione e assegnazione a mano.
-- ============================================================================
\set ON_ERROR_STOP on

do $test$
declare
  adm uuid := 'cccc3333-0000-0000-0000-000000000001';
  alt uuid := 'cccc3333-0000-0000-0000-000000000002';
  v_a public.auctions; v_list uuid;
  v_t1 uuid; v_t2 uuid; v_lot uuid; v_p uuid; v_p2 uuid;
  v_crediti_prima int; v_crediti_dopo int; v_rosa int; i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         x.id::text || '@corr.local', now(), now()
    from (values (adm), (alt)) as x(id) on conflict (id) do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', adm)::text, true);
  perform public.ensure_profile('Admin');
  insert into public.player_lists (name, is_public) values ('Correzioni', true) returning id into v_list;
  insert into public.players (list_id, external_id, last_name, role, club, quotation)
  select v_list, 'x' || n, 'Attaccante' || n, 'A', 'Club', 10 from generate_series(1,4) n;

  v_a := public.create_auction('Correzioni', 500, 2, null, 10, v_list, 3, 8, 8, 6);
  select id into v_t1 from public.teams where auction_id = v_a.id and turn_position = 1;
  select id into v_t2 from public.teams where auction_id = v_a.id and turn_position = 2;
  perform public.claim_team(v_t1);

  perform set_config('request.jwt.claims', json_build_object('sub', alt)::text, true);
  perform public.ensure_profile('Altro');
  perform public.join_auction(v_a.code);
  perform public.claim_team(v_t2);

  perform set_config('request.jwt.claims', json_build_object('sub', adm)::text, true);
  perform public.start_auction(v_a.id, false);

  -- Un acquisto normale a 40 crediti
  select id into v_p from public.players where list_id = v_list order by external_id limit 1;
  v_lot := public.nominate_player(v_a.id, v_p);
  perform set_config('request.jwt.claims', json_build_object('sub', alt)::text, true);
  perform public.place_bid(v_lot, v_t2, 40);
  update public.auction_lots set bid_deadline = clock_timestamp() - interval '1 second' where id = v_lot;
  perform public.finalize_lot(v_lot);

  select credits_remaining, players_count into v_crediti_prima, v_rosa
    from public.teams where id = v_t2;
  if v_crediti_prima <> 460 or v_rosa <> 1 then
    raise exception 'FAIL: acquisto non registrato (crediti %, rosa %)', v_crediti_prima, v_rosa;
  end if;
  raise notice 'OK 1. Acquisto a 40: crediti 500 -> 460, rosa 1';

  -- --- Solo l'amministratore puo' revocare ----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', alt)::text, true);
  begin
    perform public.revoca_assegnazione(v_lot);
    raise exception 'FAIL: un non amministratore ha potuto revocare';
  exception when others then
    if sqlerrm not like '%not_admin%' then
      raise exception 'FAIL: atteso not_admin, ricevuto %', sqlerrm;
    end if;
  end;
  raise notice 'OK 2. Un partecipante qualunque non puo'' revocare';

  -- --- Revoca: crediti indietro, rosa liberata, giocatore di nuovo libero ---
  perform set_config('request.jwt.claims', json_build_object('sub', adm)::text, true);
  perform public.revoca_assegnazione(v_lot);

  select credits_remaining, players_count into v_crediti_dopo, v_rosa
    from public.teams where id = v_t2;
  if v_crediti_dopo <> 500 or v_rosa <> 0 then
    raise exception 'FAIL: revoca incompleta (crediti %, rosa %)', v_crediti_dopo, v_rosa;
  end if;
  if exists (select 1 from public.team_players where lot_id = v_lot) then
    raise exception 'FAIL: il giocatore e'' rimasto in rosa';
  end if;
  raise notice 'OK 3. Revoca: 460 -> 500 crediti, rosa svuotata';

  -- Il giocatore torna cercabile e richiamabile
  if jsonb_array_length(public.search_players(v_a.id, 'Attaccante1')) = 0 then
    raise exception 'FAIL: il giocatore revocato non e'' tornato disponibile';
  end if;
  raise notice 'OK 4. Il giocatore revocato torna nel listone';

  -- --- Assegnazione a mano ---------------------------------------------------
  perform public.assegna_giocatore(v_a.id, v_p, v_t1, 12);
  select credits_remaining, players_count into v_crediti_dopo, v_rosa
    from public.teams where id = v_t1;
  if v_crediti_dopo <> 488 or v_rosa <> 1 then
    raise exception 'FAIL: assegnazione manuale errata (crediti %, rosa %)', v_crediti_dopo, v_rosa;
  end if;
  raise notice 'OK 5. Assegnato a mano a 12 crediti: 500 -> 488';

  -- Compare nello storico come tutti gli altri
  if not exists (
    select 1 from jsonb_array_elements(
      (public.get_auction_state(v_a.id))->'history') e
     where (e->>'price')::int = 12
  ) then
    raise exception 'FAIL: l''assegnazione manuale non compare nello storico';
  end if;
  raise notice 'OK 6. L''assegnazione a mano compare nello storico';

  -- --- I limiti restano validi anche a mano ---------------------------------
  begin
    perform public.assegna_giocatore(v_a.id, v_p, v_t2, 10);
    raise exception 'FAIL: ha riassegnato un giocatore gia'' venduto';
  exception when others then
    if sqlerrm not like '%player_already_sold%' then
      raise exception 'FAIL: atteso player_already_sold, ricevuto %', sqlerrm;
    end if;
  end;

  select id into v_p2 from public.players where list_id = v_list order by external_id offset 1 limit 1;
  begin
    perform public.assegna_giocatore(v_a.id, v_p2, v_t1, 9999);
    raise exception 'FAIL: ha assegnato oltre i crediti disponibili';
  exception when others then
    if sqlerrm not like '%insufficient_credits%' then
      raise exception 'FAIL: atteso insufficient_credits, ricevuto %', sqlerrm;
    end if;
  end;
  raise notice 'OK 7. A mano non si sfora: né giocatori già venduti, né crediti';

  -- Un'assegnazione gratuita e' ammessa
  perform public.assegna_giocatore(v_a.id, v_p2, v_t2, 0);
  select credits_remaining into v_crediti_dopo from public.teams where id = v_t2;
  if v_crediti_dopo <> 500 then
    raise exception 'FAIL: l''assegnazione a 0 ha scalato crediti (%)', v_crediti_dopo;
  end if;
  raise notice 'OK 8. Assegnazione a 0 crediti ammessa, senza scalare nulla';

  raise notice '';
  raise notice '========== CORREZIONI: TUTTI I TEST SUPERATI ==========';
end $test$;
