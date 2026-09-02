-- ============================================================================
-- ASTA FANTACALCIO — Creazione con i posti per ruolo
--
-- I valori predefiniti sono quelli del fantacalcio classico: 3 portieri, 8
-- difensori, 8 centrocampisti, 6 attaccanti. Restano modificabili, ma chi non
-- tocca niente ottiene la regola che tutti si aspettano.
-- ============================================================================

drop function if exists public.create_auction(text, integer, integer, integer, integer, uuid);

create or replace function public.create_auction(
  p_name           text,
  p_budget         integer default 500,
  p_team_count     integer default 8,
  p_slots_per_team integer default null,
  p_bid_timer      integer default 10,
  p_list_id        uuid    default null,
  p_slots_p        integer default 3,
  p_slots_d        integer default 8,
  p_slots_c        integer default 8,
  p_slots_a        integer default 6
)
returns public.auctions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_auction public.auctions;
  v_totale  integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required';
  end if;

  -- Quando i posti per ruolo ci sono, il totale e' la loro somma: un limite
  -- complessivo diverso dalla somma sarebbe una regola che si contraddice.
  v_totale := case
    when p_slots_p is not null or p_slots_d is not null
      or p_slots_c is not null or p_slots_a is not null
    then coalesce(p_slots_p, 0) + coalesce(p_slots_d, 0)
       + coalesce(p_slots_c, 0) + coalesce(p_slots_a, 0)
    else p_slots_per_team
  end;

  insert into public.auctions (
    code, name, admin_id, player_list_id,
    budget_initial, team_count, slots_per_team, bid_timer_seconds,
    slots_p, slots_d, slots_c, slots_a
  )
  values (
    public._generate_code(), btrim(p_name), v_uid, p_list_id,
    p_budget, p_team_count, v_totale, p_bid_timer,
    p_slots_p, p_slots_d, p_slots_c, p_slots_a
  )
  returning * into v_auction;

  insert into public.teams (auction_id, name, budget_initial, turn_position)
  select v_auction.id, 'Squadra ' || i, p_budget, i
    from generate_series(1, p_team_count) as i;

  insert into public.auction_members (auction_id, profile_id, room_role)
  values (v_auction.id, v_uid, 'admin');

  perform public._bump_state(v_auction.id, 'auction_created',
                             jsonb_build_object('auction_id', v_auction.id));

  return v_auction;
end $$;

grant execute on function
  public.create_auction(text, integer, integer, integer, integer, uuid,
                        integer, integer, integer, integer)
to authenticated;
