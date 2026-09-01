-- ============================================================================
-- ASTA FANTACALCIO — Logica transazionale
--
-- Ogni funzione che modifica lo stato inizia bloccando la riga dell'asta
-- (SELECT ... FOR UPDATE). Le operazioni sulla stessa asta vengono cosi'
-- messe in fila dal database: due offerte simultanee diventano due
-- esecuzioni sequenziali, e le race condition spariscono alla radice
-- invece di essere inseguite dal codice applicativo.
--
-- L'ordine di lock e' sempre lo stesso (asta -> lotto -> squadra):
-- deadlock impossibili.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper
-- ----------------------------------------------------------------------------

create or replace function public.server_now()
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'now_ms', (extract(epoch from clock_timestamp()) * 1000)::bigint
  )
$$;

create or replace function public._uid()
returns uuid
language sql stable
as $$ select auth.uid() $$;

-- Codice invito leggibile ad alta voce: niente 0/O/1/I/L che si confondono.
create or replace function public._generate_code()
returns text
language plpgsql
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try  int := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.auctions where code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'code_generation_failed';
    end if;
  end loop;
  return v_code;
end $$;

create or replace function public._bump_state(
  p_auction_id uuid,
  p_event_type text,
  p_payload    jsonb default '{}'::jsonb
)
returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_version bigint;
begin
  update public.auctions
     set state_version = state_version + 1
   where id = p_auction_id
   returning state_version into v_version;

  insert into public.auction_events (auction_id, event_type, payload, state_version)
  values (p_auction_id, p_event_type, p_payload, v_version);

  return v_version;
end $$;

create or replace function public.is_auction_member(p_auction_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.auction_members
     where auction_id = p_auction_id and profile_id = auth.uid()
  )
$$;

create or replace function public.is_auction_admin(p_auction_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.auctions where id = p_auction_id and admin_id = auth.uid()
  )
$$;

-- L'utente puo' agire per questa squadra se ne e' allenatore,
-- oppure se e' l'admin (che puo' sostituire un partecipante disconnesso).
create or replace function public.can_act_for_team(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.team_members
     where team_id = p_team_id and profile_id = auth.uid()
  ) or exists (
    select 1 from public.teams t
      join public.auctions a on a.id = t.auction_id
     where t.id = p_team_id and a.admin_id = auth.uid()
  )
$$;

-- Offerta massima sostenibile: se e' impostata la dimensione rosa, lascia
-- da parte 1 credito per ogni slot ancora da riempire, cosi' nessuna squadra
-- puo' svuotare il budget e restare con la rosa incompleta.
create or replace function public.max_bid_for_team(p_team_id uuid)
returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
           when a.slots_per_team is null then t.credits_remaining
           else t.credits_remaining - greatest(0, (a.slots_per_team - t.players_count) - 1)
         end
    from public.teams t
    join public.auctions a on a.id = t.auction_id
   where t.id = p_team_id
$$;

-- Squadra a cui tocca chiamare, derivata dall'indice di turno.
create or replace function public.current_turn_team_id(p_auction_id uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select t.id
    from public.auctions a
    join public.teams t on t.auction_id = a.id
   where a.id = p_auction_id
     and t.turn_position = (a.current_turn_index % greatest(a.team_count, 1)) + 1
$$;

-- ----------------------------------------------------------------------------
-- Profilo e ingresso nella stanza
-- ----------------------------------------------------------------------------

create or replace function public.ensure_profile(
  p_display_name text,
  p_avatar_url   text default null
)
returns public.profiles
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (v_uid, btrim(p_display_name), p_avatar_url)
  on conflict (id) do update
     set display_name = btrim(excluded.display_name),
         avatar_url   = coalesce(excluded.avatar_url, public.profiles.avatar_url),
         updated_at   = now()
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.create_auction(
  p_name           text,
  p_budget         integer default 500,
  p_team_count     integer default 8,
  p_slots_per_team integer default null,
  p_bid_timer      integer default 10,
  p_list_id        uuid    default null
)
returns public.auctions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_auction public.auctions;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required';
  end if;

  insert into public.auctions (code, name, admin_id, player_list_id,
                               budget_initial, team_count, slots_per_team, bid_timer_seconds)
  values (public._generate_code(), btrim(p_name), v_uid, p_list_id,
          p_budget, p_team_count, p_slots_per_team, p_bid_timer)
  returning * into v_auction;

  -- Le squadre nascono subito, vuote e numerate: i partecipanti le occupano.
  insert into public.teams (auction_id, name, budget_initial, turn_position)
  select v_auction.id, 'Squadra ' || i, p_budget, i
    from generate_series(1, p_team_count) as i;

  insert into public.auction_members (auction_id, profile_id, room_role)
  values (v_auction.id, v_uid, 'admin');

  perform public._bump_state(v_auction.id, 'auction_created',
                             jsonb_build_object('auction_id', v_auction.id));

  return v_auction;
end $$;

create or replace function public.join_auction(p_code text)
returns public.auctions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_auction public.auctions;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_required';
  end if;

  select * into v_auction from public.auctions where code = upper(btrim(p_code));
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.status in ('cancelled') then raise exception 'auction_closed'; end if;

  insert into public.auction_members (auction_id, profile_id, room_role)
  values (v_auction.id, v_uid,
          (case when v_auction.admin_id = v_uid then 'admin' else 'player' end)::public.room_role)
  on conflict (auction_id, profile_id) do update set last_seen_at = now();

  perform public._bump_state(v_auction.id, 'member_joined',
                             jsonb_build_object('profile_id', v_uid));

  return v_auction;
end $$;

create or replace function public.heartbeat(p_auction_id uuid)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  update public.auction_members set last_seen_at = now()
   where auction_id = p_auction_id and profile_id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- Squadre
-- ----------------------------------------------------------------------------

create or replace function public.claim_team(p_team_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_team    public.teams;
  v_auction public.auctions;
  v_count   integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select a.* into v_auction
    from public.teams t join public.auctions a on a.id = t.auction_id
   where t.id = p_team_id
     for update of a;
  if not found then raise exception 'team_not_found'; end if;

  select * into v_team from public.teams where id = p_team_id for update;

  if not public.is_auction_member(v_auction.id) then
    raise exception 'not_a_member';
  end if;
  if v_auction.status in ('completed', 'cancelled') then
    raise exception 'auction_closed';
  end if;

  -- Una persona, una squadra.
  if exists (
    select 1 from public.team_members tm
      join public.teams t2 on t2.id = tm.team_id
     where tm.profile_id = v_uid and t2.auction_id = v_auction.id and tm.team_id <> p_team_id
  ) then
    raise exception 'already_in_another_team';
  end if;

  -- §10: massimo 2 allenatori.
  select count(*) into v_count from public.team_members where team_id = p_team_id;
  if v_count >= 2 and not exists (
       select 1 from public.team_members where team_id = p_team_id and profile_id = v_uid) then
    raise exception 'team_full';
  end if;

  insert into public.team_members (team_id, profile_id, member_role)
  values (p_team_id, v_uid, (case when v_count = 0 then 'owner' else 'coach' end)::public.member_role)
  on conflict do nothing;

  perform public._bump_state(v_auction.id, 'team_updated',
                             jsonb_build_object('team_id', p_team_id));
end $$;

create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auction_id uuid;
begin
  select auction_id into v_auction_id from public.teams where id = p_team_id;
  if not found then raise exception 'team_not_found'; end if;

  delete from public.team_members where team_id = p_team_id and profile_id = auth.uid();

  perform public._bump_state(v_auction_id, 'team_updated',
                             jsonb_build_object('team_id', p_team_id));
end $$;

create or replace function public.rename_team(p_team_id uuid, p_name text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auction_id uuid;
begin
  if not public.can_act_for_team(p_team_id) then raise exception 'not_allowed'; end if;
  if length(btrim(p_name)) = 0 then raise exception 'invalid_name'; end if;

  update public.teams set name = btrim(p_name) where id = p_team_id
  returning auction_id into v_auction_id;

  perform public._bump_state(v_auction_id, 'team_updated',
                             jsonb_build_object('team_id', p_team_id));
end $$;

-- ----------------------------------------------------------------------------
-- Avvio dell'asta
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
  v_claimed integer;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;
  if v_auction.status <> 'lobby' then raise exception 'already_started'; end if;
  if v_auction.player_list_id is null then raise exception 'no_player_list'; end if;

  -- Le squadre rimaste vuote non partecipano: si gioca in 6 se in 6 si e' presentato.
  delete from public.teams t
   where t.auction_id = p_auction_id
     and not exists (select 1 from public.team_members m where m.team_id = t.id);

  select count(*) into v_claimed from public.teams where auction_id = p_auction_id;
  if v_claimed < 2 then raise exception 'not_enough_teams'; end if;

  -- Riassegna le posizioni di turno. Il passaggio intermedio in negativo
  -- evita di violare l'indice univoco (auction_id, turn_position).
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
         team_count         = v_claimed,
         current_turn_index = 0,
         turn_started_at    = now(),
         started_at         = now()
   where id = p_auction_id;

  perform public._bump_state(p_auction_id, 'auction_started', '{}'::jsonb);
end $$;

-- ----------------------------------------------------------------------------
-- Chiamata del giocatore
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

  if public.max_bid_for_team(v_team_id) < 1 then
    raise exception 'insufficient_credits';
  end if;

  select coalesce(max(turn_number), 0) + 1 into v_turn
    from public.auction_lots where auction_id = p_auction_id;

  -- Il banditore detiene da subito l'offerta di apertura a 1 credito:
  -- se nessuno rilancia entro il timer, il giocatore e' suo.
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

-- ----------------------------------------------------------------------------
-- OFFERTA — il punto piu' delicato dell'intero sistema
-- ----------------------------------------------------------------------------

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
  v_max_bid  integer;
  v_deadline timestamptz;
begin
  -- 1. Lock dell'asta: da qui in poi siamo soli. Le offerte concorrenti
  --    aspettano il loro turno e rileggeranno lo stato aggiornato.
  select a.* into v_auction
    from public.auctions a
    join public.auction_lots l on l.auction_id = a.id
   where l.id = p_lot_id
     for update of a;
  if not found then raise exception 'lot_not_found'; end if;

  select * into v_lot from public.auction_lots where id = p_lot_id for update;

  -- 2. Stato dell'asta
  if v_auction.status = 'paused' then raise exception 'auction_paused'; end if;
  if v_auction.status <> 'running' then raise exception 'auction_not_running'; end if;

  -- 3. Il lotto e' ancora aperto?
  if v_lot.status <> 'live' then raise exception 'lot_closed'; end if;

  -- 4. Siamo ancora in tempo? Il confronto usa l'ora del server, non del client.
  if clock_timestamp() >= v_lot.bid_deadline then raise exception 'too_late'; end if;

  -- 5. Autorizzazione
  if not public.can_act_for_team(p_team_id) then raise exception 'not_your_team'; end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found or v_team.auction_id <> v_auction.id then raise exception 'team_not_found'; end if;

  -- 6. Non si rilancia su se stessi (vale anche fra i due allenatori della squadra)
  if v_lot.current_bidder_team_id = p_team_id then raise exception 'already_leading'; end if;

  -- 7. L'offerta deve superare quella attuale
  if p_amount < v_lot.current_bid + v_auction.min_increment then
    raise exception 'bid_too_low';
  end if;

  -- 8. I crediti devono bastare davvero
  v_max_bid := public.max_bid_for_team(p_team_id);
  if p_amount > v_max_bid then raise exception 'insufficient_credits'; end if;

  -- 9. Registra l'offerta e RIAZZERA IL TIMER (§7)
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

-- ----------------------------------------------------------------------------
-- CHIUSURA DEL LOTTO — idempotente per costruzione
--
-- Chiamata da due sorgenti indipendenti: il primo client il cui countdown
-- tocca lo zero (reattivita') e un job pg_cron ogni secondo (rete di
-- sicurezza, funziona anche a browser tutti chiusi). La clausola
-- "status = 'live' AND deadline scaduta" sotto lock fa si' che la seconda
-- chiamata non trovi piu' nulla da fare: doppia assegnazione impossibile.
-- ----------------------------------------------------------------------------

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

  -- Turno successivo
  update public.auctions
     set current_turn_index = current_turn_index + 1,
         turn_started_at    = now()
   where id = v_auction.id;

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

-- Rete di sicurezza invocata da pg_cron ogni secondo.
create or replace function public.finalize_expired_lots()
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_lot_id uuid;
  v_count  integer := 0;
begin
  for v_lot_id in
    select l.id
      from public.auction_lots l
      join public.auctions a on a.id = l.auction_id
     where l.status = 'live'
       and a.status = 'running'
       and l.bid_deadline <= clock_timestamp()
  loop
    if public.finalize_lot(v_lot_id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- ----------------------------------------------------------------------------
-- Controlli amministrativi
-- ----------------------------------------------------------------------------

create or replace function public.pause_auction(p_auction_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auction public.auctions;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;
  if v_auction.status <> 'running' then raise exception 'auction_not_running'; end if;

  -- Congela il tempo residuo del lotto in corso: nessuno perde secondi
  -- per colpa di una pausa.
  update public.auction_lots
     set paused_remaining_ms = greatest(
           0, (extract(epoch from (bid_deadline - clock_timestamp())) * 1000)::integer)
   where auction_id = p_auction_id and status = 'live';

  update public.auctions set status = 'paused', paused_at = now() where id = p_auction_id;

  perform public._bump_state(p_auction_id, 'auction_paused', '{}'::jsonb);
end $$;

create or replace function public.resume_auction(p_auction_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auction public.auctions;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;
  if v_auction.status <> 'paused' then raise exception 'auction_not_paused'; end if;

  update public.auction_lots
     set bid_deadline = clock_timestamp()
                        + make_interval(secs => coalesce(paused_remaining_ms, 0) / 1000.0),
         paused_remaining_ms = null
   where auction_id = p_auction_id and status = 'live';

  update public.auctions set status = 'running', paused_at = null where id = p_auction_id;

  perform public._bump_state(p_auction_id, 'auction_resumed', '{}'::jsonb);
end $$;

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

  update public.auctions
     set current_turn_index = current_turn_index + 1, turn_started_at = now()
   where id = p_auction_id;

  perform public._bump_state(p_auction_id, 'turn_skipped', '{}'::jsonb);
end $$;

-- Annulla una chiamata sbagliata: il giocatore torna disponibile,
-- il turno NON avanza.
create or replace function public.cancel_lot(p_lot_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auction public.auctions;
begin
  select a.* into v_auction
    from public.auctions a join public.auction_lots l on l.auction_id = a.id
   where l.id = p_lot_id for update of a;
  if not found then raise exception 'lot_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;

  update public.auction_lots set status = 'void', closed_at = now()
   where id = p_lot_id and status = 'live';

  perform public._bump_state(v_auction.id, 'lot_cancelled',
                             jsonb_build_object('lot_id', p_lot_id));
end $$;

create or replace function public.end_auction(p_auction_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auction public.auctions;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;

  update public.auction_lots set status = 'void', closed_at = now()
   where auction_id = p_auction_id and status = 'live';

  update public.auctions set status = 'completed', ended_at = now() where id = p_auction_id;

  perform public._bump_state(p_auction_id, 'auction_ended', '{}'::jsonb);
end $$;
