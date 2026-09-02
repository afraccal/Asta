-- ============================================================================
-- ASTA FANTACALCIO — Lettura dello stato e ricerca giocatori
-- ============================================================================

-- Snapshot completo della stanza. E' la funzione che ogni client chiama
-- al primo caricamento, al rientro da background e ogni volta che si accorge
-- di aver perso un evento realtime: una sola chiamata riallinea tutto.
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

-- Ricerca nel listone: accento-insensibile, esclude i gia' venduti,
-- privilegia chi inizia con il termine cercato.
create or replace function public.search_players(
  p_auction_id uuid,
  p_query      text default null,
  p_role       public.player_role default null,
  p_club       text default null,
  p_limit      integer default 40
)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_term text := lower(public.f_unaccent(coalesce(btrim(p_query), '')));
  v_list uuid;
begin
  if not public.is_auction_member(p_auction_id) then raise exception 'not_a_member'; end if;

  select player_list_id into v_list from public.auctions where id = p_auction_id;
  if v_list is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(r) - 'search_text' - 'rnk' - 'ord' order by r.rnk, r.ord)
      from (
        select p.*,
               case when lower(public.f_unaccent(p.last_name)) like v_term || '%'
                    then 0 else 1 end as rnk,
               row_number() over (order by p.quotation desc nulls last, p.last_name) as ord
          from public.players p
         where p.list_id = v_list
           and not exists (
                 select 1 from public.team_players tp
                  where tp.auction_id = p_auction_id and tp.player_id = p.id)
           and (p_role is null or p.role = p_role)
           and (p_club is null or lower(public.f_unaccent(p.club)) = lower(public.f_unaccent(p_club)))
           and (v_term = '' or p.search_text like '%' || v_term || '%')
         order by rnk, ord
         limit p_limit
      ) r
  ), '[]'::jsonb);
end $$;

-- Elenco squadre reali presenti nel listone (per il filtro della ricerca)
create or replace function public.list_clubs(p_auction_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_list uuid;
begin
  if not public.is_auction_member(p_auction_id) then raise exception 'not_a_member'; end if;
  select player_list_id into v_list from public.auctions where id = p_auction_id;
  return coalesce((
    select jsonb_agg(distinct club order by club)
      from public.players where list_id = v_list and club is not null
  ), '[]'::jsonb);
end $$;
