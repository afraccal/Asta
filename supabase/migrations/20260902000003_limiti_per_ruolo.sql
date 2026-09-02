-- ============================================================================
-- ASTA FANTACALCIO — Limiti di rosa per ruolo
--
-- Il fantacalcio classico vuole 3 portieri, 8 difensori, 8 centrocampisti e 6
-- attaccanti. Finora esisteva solo un limite complessivo, facoltativo: si
-- poteva quindi comprare undici attaccanti e restare senza portieri.
--
-- Il controllo vive qui e non nell'interfaccia: e' la stessa ragione per cui
-- ci vivono crediti e offerte. Un client non deve poter sforare, nemmeno
-- sbagliando.
-- ============================================================================

alter table public.auctions
  add column if not exists slots_p integer check (slots_p is null or slots_p >= 0),
  add column if not exists slots_d integer check (slots_d is null or slots_d >= 0),
  add column if not exists slots_c integer check (slots_c is null or slots_c >= 0),
  add column if not exists slots_a integer check (slots_a is null or slots_a >= 0);

comment on column public.auctions.slots_p is
  'Posti per ruolo. NULL su tutti e quattro = nessun limite per ruolo.';

-- ----------------------------------------------------------------------------
-- Quanti posti restano a una squadra, per ruolo e in totale
-- ----------------------------------------------------------------------------

create or replace function public.posti_liberi_ruolo(
  p_team_id uuid,
  p_role    public.player_role
)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
           when limite is null then 999          -- nessun limite per quel ruolo
           else greatest(0, limite - presi)
         end
    from (
      select
        case p_role
          when 'P' then a.slots_p when 'D' then a.slots_d
          when 'C' then a.slots_c else a.slots_a
        end as limite,
        (select count(*) from public.team_players tp
           join public.players pl on pl.id = tp.player_id
          where tp.team_id = t.id and pl.role = p_role) as presi
      from public.teams t
      join public.auctions a on a.id = t.auction_id
     where t.id = p_team_id
    ) s
$$;

/**
 * Posti ancora da riempire in tutta la rosa.
 * Se ci sono i limiti per ruolo si sommano quelli, perche' e' la somma vera
 * dei posti mancanti: un limite complessivo non saprebbe che a una squadra
 * servono ancora due portieri e nient'altro.
 */
create or replace function public.posti_liberi_totali(p_team_id uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when a.slots_p is not null or a.slots_d is not null
      or a.slots_c is not null or a.slots_a is not null
    then coalesce(public.posti_liberi_ruolo(t.id, 'P'), 0)
       + coalesce(public.posti_liberi_ruolo(t.id, 'D'), 0)
       + coalesce(public.posti_liberi_ruolo(t.id, 'C'), 0)
       + coalesce(public.posti_liberi_ruolo(t.id, 'A'), 0)
    when a.slots_per_team is not null
    then greatest(0, a.slots_per_team - t.players_count)
    else 0
  end
  from public.teams t join public.auctions a on a.id = t.auction_id
  where t.id = p_team_id
$$;

-- ----------------------------------------------------------------------------
-- L'offerta massima tiene conto dei posti che restano, ruolo per ruolo
-- ----------------------------------------------------------------------------

create or replace function public.max_bid_for_team(p_team_id uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
           when public.posti_liberi_totali(t.id) = 0 then t.credits_remaining
           -- Un credito va tenuto da parte per ogni posto ancora vuoto oltre
           -- a quello che si sta comprando: nessuno resta con la rosa monca.
           else greatest(0, t.credits_remaining
                            - greatest(0, public.posti_liberi_totali(t.id) - 1))
         end
    from public.teams t
   where t.id = p_team_id
$$;

-- ----------------------------------------------------------------------------
-- I due punti in cui il limite va fatto valere
-- ----------------------------------------------------------------------------

create or replace function public.nominate_player(
  p_auction_id uuid,
  p_player_id  uuid
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auction  public.auctions;
  v_team_id  uuid;
  v_player   public.players;
  v_lot_id   uuid;
  v_turn     integer;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.status <> 'running' then raise exception 'auction_not_running'; end if;

  v_team_id := public.current_turn_team_id(p_auction_id);
  if v_team_id is null then raise exception 'no_turn_team'; end if;
  if not public.can_act_for_team(v_team_id) then raise exception 'not_your_turn'; end if;

  if exists (select 1 from public.auction_lots
              where auction_id = p_auction_id and status = 'live') then
    raise exception 'lot_already_live';
  end if;

  select * into v_player from public.players
   where id = p_player_id and list_id = v_auction.player_list_id;
  if not found then raise exception 'player_not_in_list'; end if;

  if exists (select 1 from public.team_players
              where auction_id = p_auction_id and player_id = p_player_id) then
    raise exception 'player_already_sold';
  end if;

  -- Chi chiama tiene l'apertura a 1 credito: se il suo reparto e' pieno, il
  -- giocatore non puo' nemmeno essere messo all'asta da lui.
  if public.posti_liberi_ruolo(v_team_id, v_player.role) <= 0 then
    raise exception 'role_full';
  end if;

  if public.max_bid_for_team(v_team_id) < 1 then
    raise exception 'insufficient_credits';
  end if;

  select coalesce(max(turn_number), 0) + 1 into v_turn
    from public.auction_lots where auction_id = p_auction_id;

  insert into public.auction_lots (
    auction_id, player_id, turn_number, nominated_by_team_id, status,
    current_bid, current_bidder_team_id, bid_deadline
  ) values (
    p_auction_id, p_player_id, v_turn, v_team_id, 'live',
    1, v_team_id, now() + make_interval(secs => v_auction.bid_timer_seconds)
  )
  returning id into v_lot_id;

  insert into public.bids (lot_id, team_id, profile_id, amount)
  values (v_lot_id, v_team_id, auth.uid(), 1);

  perform public._bump_state(p_auction_id, 'lot_opened',
    jsonb_build_object('lot_id', v_lot_id, 'player_id', p_player_id, 'team_id', v_team_id));

  return v_lot_id;
end $$;

create or replace function public.place_bid(
  p_lot_id  uuid,
  p_team_id uuid,
  p_amount  integer
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auction  public.auctions;
  v_lot      public.auction_lots;
  v_team     public.teams;
  v_role     public.player_role;
  v_max_bid  integer;
  v_deadline timestamptz;
begin
  select a.* into v_auction
    from public.auctions a
    join public.auction_lots l on l.auction_id = a.id
   where l.id = p_lot_id
     for update of a;
  if not found then raise exception 'lot_not_found'; end if;

  select * into v_lot from public.auction_lots where id = p_lot_id for update;

  if v_auction.status = 'paused' then raise exception 'auction_paused'; end if;
  if v_auction.status <> 'running' then raise exception 'auction_not_running'; end if;
  if v_lot.status <> 'live' then raise exception 'lot_closed'; end if;
  if clock_timestamp() >= v_lot.bid_deadline then raise exception 'too_late'; end if;
  if not public.can_act_for_team(p_team_id) then raise exception 'not_your_team'; end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found or v_team.auction_id <> v_auction.id then raise exception 'team_not_found'; end if;

  if v_lot.current_bidder_team_id = p_team_id then raise exception 'already_leading'; end if;

  if p_amount < v_lot.current_bid + v_auction.min_increment then
    raise exception 'bid_too_low';
  end if;

  -- Il reparto deve avere ancora posto: non si offre per un giocatore che non
  -- si potrebbe tenere in rosa.
  select role into v_role from public.players where id = v_lot.player_id;
  if public.posti_liberi_ruolo(p_team_id, v_role) <= 0 then
    raise exception 'role_full';
  end if;

  v_max_bid := public.max_bid_for_team(p_team_id);
  if p_amount > v_max_bid then raise exception 'insufficient_credits'; end if;

  insert into public.bids (lot_id, team_id, profile_id, amount)
  values (p_lot_id, p_team_id, auth.uid(), p_amount);

  v_deadline := clock_timestamp() + make_interval(secs => v_auction.bid_timer_seconds);

  update public.auction_lots
     set current_bid            = p_amount,
         current_bidder_team_id = p_team_id,
         bid_deadline           = v_deadline
   where id = p_lot_id;

  perform public._bump_state(v_auction.id, 'bid_placed', jsonb_build_object(
    'lot_id', p_lot_id, 'team_id', p_team_id, 'team_name', v_team.name,
    'amount', p_amount,
    'bid_deadline_ms', (extract(epoch from v_deadline) * 1000)::bigint
  ));

  return jsonb_build_object(
    'lot_id', p_lot_id, 'amount', p_amount,
    'bid_deadline_ms', (extract(epoch from v_deadline) * 1000)::bigint
  );
end $$;

grant execute on function
  public.posti_liberi_ruolo(uuid, public.player_role),
  public.posti_liberi_totali(uuid)
to authenticated;
