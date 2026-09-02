-- ============================================================================
-- ASTA FANTACALCIO — Avvio con tavoli ancora liberi
--
-- Prima l'avvio CANCELLAVA le squadre rimaste vuote in lobby. Chi arrivava in
-- ritardo non trovava piu' un posto dove sedersi, e il pannello dei tavoli
-- liberi in sala non aveva mai nulla da offrire.
--
-- Ora i tavoli vuoti restano: si puo' aprire la stanza appena si e' in due e
-- lasciare che gli altri si accomodino a partita iniziata. Il giro di chiamata
-- salta i tavoli senza allenatori, e li reinserisce da solo appena qualcuno si
-- siede.
-- ============================================================================

/**
 * Porta il turno alla prossima squadra che ha davvero qualcuno seduto.
 * Avanzare di uno alla volta non basterebbe: con sei tavoli vuoti su otto il
 * giro si incepperebbe su una sedia vuota.
 */
create or replace function public._avanza_turno(p_auction_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_n int; v_idx int; v_giro int; v_pos int; v_trovato boolean := false;
begin
  select team_count, current_turn_index into v_n, v_idx
    from public.auctions where id = p_auction_id;
  if v_n is null or v_n < 1 then return; end if;

  for v_giro in 1..v_n loop
    v_idx := v_idx + 1;
    v_pos := (v_idx % v_n) + 1;
    if exists (
      select 1 from public.teams t
        join public.team_members m on m.team_id = t.id
       where t.auction_id = p_auction_id and t.turn_position = v_pos
    ) then
      v_trovato := true;
      exit;
    end if;
  end loop;

  -- Nessuno seduto da nessuna parte: si avanza comunque di uno, cosi' la
  -- funzione resta prevedibile e non lascia il turno fermo per sempre.
  if not v_trovato then
    select current_turn_index + 1 into v_idx from public.auctions where id = p_auction_id;
  end if;

  update public.auctions
     set current_turn_index = v_idx, turn_started_at = now()
   where id = p_auction_id;
end $$;

/**
 * Chi e' di turno. Se il tavolo indicato dall'indice si e' nel frattempo
 * svuotato (qualcuno si e' alzato), si scorre in avanti invece di restituire
 * una squadra senza nessuno.
 */
create or replace function public.current_turn_team_id(p_auction_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_n int; v_idx int; v_giro int; v_pos int; v_team uuid;
begin
  select team_count, current_turn_index into v_n, v_idx
    from public.auctions where id = p_auction_id;
  if v_n is null or v_n < 1 then return null; end if;

  for v_giro in 0..(v_n - 1) loop
    v_pos := ((v_idx + v_giro) % v_n) + 1;
    select t.id into v_team from public.teams t
     where t.auction_id = p_auction_id and t.turn_position = v_pos
       and exists (select 1 from public.team_members m where m.team_id = t.id);
    if v_team is not null then return v_team; end if;
  end loop;

  return null; -- nessuno seduto: non tocca a nessuno
end $$;

-- ----------------------------------------------------------------------------
-- Avvio: i tavoli vuoti restano al loro posto
-- ----------------------------------------------------------------------------

create or replace function public.start_auction(
  p_auction_id uuid,
  p_shuffle    boolean default true
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auction public.auctions;
  v_occupati integer;
  v_totale integer;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;
  if v_auction.status <> 'lobby' then raise exception 'already_started'; end if;
  if v_auction.player_list_id is null then raise exception 'no_player_list'; end if;

  select count(*) into v_totale from public.teams where auction_id = p_auction_id;
  select count(*) into v_occupati
    from public.teams t
   where t.auction_id = p_auction_id
     and exists (select 1 from public.team_members m where m.team_id = t.id);

  -- Servono due squadre per avere un'asta. Le altre possono ancora arrivare.
  if v_occupati < 2 then raise exception 'not_enough_teams'; end if;

  update public.teams set turn_position = -turn_position where auction_id = p_auction_id;

  with ordered as (
    select id,
           row_number() over (
             order by case when p_shuffle then random() else (-turn_position)::numeric end
           ) as rn
      from public.teams where auction_id = p_auction_id
  )
  update public.teams t set turn_position = o.rn
    from ordered o where t.id = o.id;

  update public.auctions
     set status             = 'running',
         team_count         = v_totale,
         current_turn_index = 0,
         turn_started_at    = now(),
         started_at         = now()
   where id = p_auction_id;

  -- Se il primo tavolo del giro e' vuoto si parte comunque da chi c'e'.
  if public.current_turn_team_id(p_auction_id) is null then
    perform public._avanza_turno(p_auction_id);
  end if;

  perform public._bump_state(p_auction_id, 'auction_started',
                             jsonb_build_object('occupati', v_occupati, 'totale', v_totale));
end $$;

-- ----------------------------------------------------------------------------
-- Chi fa avanzare il turno ora usa la regola che salta i tavoli vuoti
-- ----------------------------------------------------------------------------

create or replace function public.skip_turn(p_auction_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auction public.auctions;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;
  if exists (select 1 from public.auction_lots
              where auction_id = p_auction_id and status = 'live') then
    raise exception 'lot_already_live';
  end if;

  perform public._avanza_turno(p_auction_id);
  perform public._bump_state(p_auction_id, 'turn_skipped', '{}'::jsonb);
end $$;

revoke execute on function public._avanza_turno(uuid) from public, anon, authenticated;
grant execute on function public.current_turn_team_id(uuid) to authenticated;

-- La chiusura del lotto usa la stessa regola di avanzamento.
create or replace function public.finalize_lot(p_lot_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auction   public.auctions;
  v_lot       public.auction_lots;
  v_team      public.teams;
  v_player    public.players;
  v_all_full  boolean;
begin
  select a.* into v_auction
    from public.auctions a
    join public.auction_lots l on l.auction_id = a.id
   where l.id = p_lot_id
     for update of a;
  if not found then return null; end if;

  select * into v_lot from public.auction_lots where id = p_lot_id for update;

  -- Gia' chiuso da qualcun altro, oppure non ancora scaduto, oppure in pausa:
  -- non fare nulla e non lamentarsi.
  if v_lot.status <> 'live' then return null; end if;
  if v_auction.status <> 'running' then return null; end if;
  if clock_timestamp() < v_lot.bid_deadline then return null; end if;

  select * into v_player from public.players where id = v_lot.player_id;

  if v_lot.current_bidder_team_id is null then
    update public.auction_lots
       set status = 'void', closed_at = now() where id = p_lot_id;
    perform public._bump_state(v_auction.id, 'lot_void',
                               jsonb_build_object('lot_id', p_lot_id));
    return null;
  end if;

  select * into v_team from public.teams
   where id = v_lot.current_bidder_team_id for update;

  -- Assegnazione, scalo crediti e inserimento in rosa: tutto nella stessa
  -- transazione. O succede tutto, o non succede niente.
  update public.auction_lots
     set status         = 'assigned',
         final_price    = v_lot.current_bid,
         winner_team_id = v_team.id,
         closed_at      = now()
   where id = p_lot_id;

  update public.teams
     set credits_spent = credits_spent + v_lot.current_bid,
         players_count = players_count + 1
   where id = v_team.id;

  insert into public.team_players (auction_id, team_id, player_id, lot_id, price)
  values (v_auction.id, v_team.id, v_lot.player_id, p_lot_id, v_lot.current_bid);

  -- Turno successivo, saltando i tavoli ancora liberi
  perform public._avanza_turno(v_auction.id);

  -- Se tutte le rose sono complete, l'asta finisce da sola.
  if v_auction.slots_per_team is not null then
    select bool_and(players_count >= v_auction.slots_per_team) into v_all_full
      from public.teams where auction_id = v_auction.id;
    if coalesce(v_all_full, false) then
      update public.auctions set status = 'completed', ended_at = now()
       where id = v_auction.id;
    end if;
  end if;

  perform public._bump_state(v_auction.id, 'lot_assigned', jsonb_build_object(
    'lot_id',      p_lot_id,
    'player_id',   v_lot.player_id,
    'player_name', btrim(coalesce(v_player.first_name, '') || ' ' || v_player.last_name),
    'team_id',     v_team.id,
    'team_name',   v_team.name,
    'price',       v_lot.current_bid
  ));

  return jsonb_build_object(
    'lot_id', p_lot_id, 'team_id', v_team.id,
    'team_name', v_team.name, 'price', v_lot.current_bid
  );
end $$;

-- Lo snapshot porta anche i limiti per ruolo.
create or replace function public.get_auction_state(p_auction_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_auction public.auctions;
  v_uid     uuid := auth.uid();
begin
  select * into v_auction from public.auctions where id = p_auction_id;
  if not found then raise exception 'auction_not_found'; end if;
  if not public.is_auction_member(p_auction_id) then raise exception 'not_a_member'; end if;

  return jsonb_build_object(
    'server_now_ms', (extract(epoch from clock_timestamp()) * 1000)::bigint,

    'auction', jsonb_build_object(
      'id', v_auction.id,
      'code', v_auction.code,
      'name', v_auction.name,
      'status', v_auction.status,
      'admin_id', v_auction.admin_id,
      'player_list_id', v_auction.player_list_id,
      'player_list', (
        select jsonb_build_object(
                 'id', l.id, 'name', l.name, 'season', l.season,
                 'player_count', (select count(*) from public.players pl where pl.list_id = l.id))
          from public.player_lists l where l.id = v_auction.player_list_id
      ),
      'budget_initial', v_auction.budget_initial,
      'team_count', v_auction.team_count,
      'slots_per_team', v_auction.slots_per_team,
      'slots', jsonb_build_object(
        'P', v_auction.slots_p, 'D', v_auction.slots_d,
        'C', v_auction.slots_c, 'A', v_auction.slots_a
      ),
      'bid_timer_seconds', v_auction.bid_timer_seconds,
      'nomination_timeout_seconds', v_auction.nomination_timeout_seconds,
      'min_increment', v_auction.min_increment,
      'current_turn_index', v_auction.current_turn_index,
      'turn_started_at_ms', (extract(epoch from v_auction.turn_started_at) * 1000)::bigint,
      'state_version', v_auction.state_version,
      'current_turn_team_id', public.current_turn_team_id(p_auction_id)
    ),

    'teams', coalesce((
      select jsonb_agg(s.t order by s.turn_position)
        from (
          select tm.turn_position, jsonb_build_object(
            'id', tm.id,
            'name', tm.name,
            'turn_position', tm.turn_position,
            'budget_initial', tm.budget_initial,
            'credits_spent', tm.credits_spent,
            'credits_remaining', tm.credits_remaining,
            'players_count', tm.players_count,
            'max_bid', public.max_bid_for_team(tm.id),
            -- Le rose NON viaggiano qui: ogni acquisto e' gia' nello storico
            -- qui sotto, e ripeterlo per squadra faceva pesare lo snapshot un
            -- terzo in piu' per niente. Il client le ricava raggruppando lo
            -- storico per squadra (vedi lib/rosters.ts).
            'members', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'profile_id', p.id,
                       'display_name', p.display_name,
                       'avatar_url', p.avatar_url,
                       'member_role', mm.member_role,
                       'online', am.last_seen_at > now() - interval '45 seconds'
                     ) order by mm.joined_at)
                from public.team_members mm
                join public.profiles p on p.id = mm.profile_id
                left join public.auction_members am
                       on am.auction_id = p_auction_id and am.profile_id = p.id
               where mm.team_id = tm.id), '[]'::jsonb)
          ) as t
          from public.teams tm
         where tm.auction_id = p_auction_id
        ) s
    ), '[]'::jsonb),

    -- Lotto attualmente all'asta (null se si sta aspettando una chiamata)
    'lot', (
      select jsonb_build_object(
               'id', l.id,
               'status', l.status,
               'turn_number', l.turn_number,
               'nominated_by_team_id', l.nominated_by_team_id,
               'current_bid', l.current_bid,
               'current_bidder_team_id', l.current_bidder_team_id,
               'bid_deadline_ms', (extract(epoch from l.bid_deadline) * 1000)::bigint,
               'paused_remaining_ms', l.paused_remaining_ms,
               'player', to_jsonb(pl) - 'search_text',
               'bids', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', b.id, 'team_id', b.team_id, 'amount', b.amount,
                          'created_at_ms', (extract(epoch from b.created_at) * 1000)::bigint
                        ) order by b.id desc)
                   from (select * from public.bids
                          where lot_id = l.id order by id desc limit 12) b), '[]'::jsonb)
             )
        from public.auction_lots l
        join public.players pl on pl.id = l.player_id
       where l.auction_id = p_auction_id and l.status = 'live'
    ),

    -- Ultimo giocatore assegnato: serve al client che si ricollega per
    -- capire se deve ancora mostrare l'animazione "ASSEGNATO!".
    'last_assigned', (
      select jsonb_build_object(
               'lot_id', l.id,
               'closed_at_ms', (extract(epoch from l.closed_at) * 1000)::bigint,
               'price', l.final_price,
               'team_id', l.winner_team_id,
               'team_name', tw.name,
               'player', to_jsonb(pl) - 'search_text'
             )
        from public.auction_lots l
        join public.players pl on pl.id = l.player_id
        left join public.teams tw on tw.id = l.winner_team_id
       where l.auction_id = p_auction_id and l.status = 'assigned'
       order by l.closed_at desc limit 1
    ),

    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lot_id', l.id,
               'turn_number', l.turn_number,
               'price', l.final_price,
               'team_id', l.winner_team_id,
               'team_name', tw.name,
               'player_id', pl.id,
               'first_name', pl.first_name,
               'last_name', pl.last_name,
               'role', pl.role,
               'club', pl.club,
               'acquired_at_ms', (extract(epoch from l.closed_at) * 1000)::bigint
             ) order by l.closed_at desc)
        from public.auction_lots l
        join public.players pl on pl.id = l.player_id
        left join public.teams tw on tw.id = l.winner_team_id
       where l.auction_id = p_auction_id and l.status = 'assigned'
    ), '[]'::jsonb),

    'me', jsonb_build_object(
      'profile_id', v_uid,
      'is_admin', v_auction.admin_id = v_uid,
      'team_id', (
        select tm.team_id from public.team_members tm
          join public.teams t2 on t2.id = tm.team_id
         where tm.profile_id = v_uid and t2.auction_id = p_auction_id limit 1
      )
    )
  );
end $$;