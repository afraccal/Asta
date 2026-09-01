-- Impalcatura per i test di concorrenza: prepara un'asta con 8 squadre
-- occupate, avviata, con un giocatore gia' in asta.
-- Restituisce "auction_id lot_id" per lo script di shell.

create or replace function public._test_setup_concurrency(p_tag text)
returns text
language plpgsql
as $$
declare
  v_uid     uuid;
  v_auction public.auctions;
  v_list    uuid;
  v_player  uuid;
  v_team    uuid;
  v_lot     uuid;
  i         int;
begin
  -- 8 utenti deterministici: 00000000-0000-0000-0000-00000000000N
  for i in 1..8 loop
    v_uid := ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'conc' || i || '@test.local', now(), now())
    on conflict (id) do nothing;
  end loop;

  -- Listone minimo
  insert into public.player_lists (name, is_public) values ('Concorrenza ' || p_tag, true)
  returning id into v_list;
  insert into public.players (list_id, first_name, last_name, role, club, quotation)
  values (v_list, 'Test', 'Giocatore ' || p_tag, 'A', 'Test FC', 30)
  returning id into v_player;

  -- Asta con 8 squadre, una per utente
  v_uid := '00000000-0000-0000-0000-000000000001'::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  perform public.ensure_profile('Utente 1');
  v_auction := public.create_auction('Concorrenza ' || p_tag, 500, 8, null, 10, v_list);

  for i in 1..8 loop
    v_uid := ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
    perform public.ensure_profile('Utente ' || i);
    perform public.join_auction(v_auction.code);
    select id into v_team from public.teams
     where auction_id = v_auction.id and turn_position = i;
    perform public.claim_team(v_team);
  end loop;

  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000001'::uuid)::text, true);
  perform public.start_auction(v_auction.id, false);

  -- La squadra 1 chiama e detiene l'apertura a 1 credito
  v_lot := public.nominate_player(v_auction.id, v_player);

  -- Timer lungo: il test deve poter orchestrare le offerte con calma
  update public.auction_lots set bid_deadline = clock_timestamp() + interval '120 seconds'
   where id = v_lot;

  return v_auction.id::text || ' ' || v_lot::text;
end $$;
