-- ============================================================================
-- ASTA FANTACALCIO — Schema di base
-- Principio guida: il database e' l'unica fonte di verita'.
-- Vincoli e indici rendono STRUTTURALMENTE impossibili gli stati illegali,
-- invece di affidarne la prevenzione al codice applicativo.
-- ============================================================================

create extension if not exists "pg_trgm"  with schema extensions;
create extension if not exists "unaccent" with schema extensions;

-- Wrapper IMMUTABLE: serve perche' unaccent() di per se' non lo e'
-- e quindi non sarebbe utilizzabile in una colonna generata.
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

-- ----------------------------------------------------------------------------
-- Enum
-- ----------------------------------------------------------------------------
create type public.auction_status as enum ('lobby', 'running', 'paused', 'completed', 'cancelled');
create type public.lot_status     as enum ('live', 'assigned', 'void');
create type public.player_role    as enum ('P', 'D', 'C', 'A');
create type public.member_role    as enum ('owner', 'coach');
create type public.room_role      as enum ('admin', 'player', 'spectator');

-- ----------------------------------------------------------------------------
-- Profili (1:1 con auth.users, anche anonimi)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 32),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Listoni giocatori (condivisi fra aste: niente duplicazione per stanza)
-- ----------------------------------------------------------------------------
create table public.player_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  season     text,
  owner_id   uuid references public.profiles(id) on delete set null,
  is_public  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.players (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references public.player_lists(id) on delete cascade,
  external_id  text,
  first_name   text,
  last_name    text not null,
  role         public.player_role not null,
  role_mantra  text[] not null default '{}',
  club         text,
  quotation    integer check (quotation is null or quotation >= 0),
  image_url    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  -- Testo normalizzato per la ricerca: accenti rimossi, tutto minuscolo.
  -- "martinez" trova "Martínez".
  search_text  text generated always as (
    lower(public.f_unaccent(
      coalesce(first_name, '') || ' ' || last_name || ' ' || coalesce(club, '')
    ))
  ) stored
);

create unique index players_list_external_uidx
  on public.players(list_id, external_id) where external_id is not null;
create index players_search_trgm_idx on public.players using gin (search_text extensions.gin_trgm_ops);
create index players_list_role_idx   on public.players(list_id, role);

-- ----------------------------------------------------------------------------
-- Aste
-- ----------------------------------------------------------------------------
create table public.auctions (
  id                         uuid primary key default gen_random_uuid(),
  code                       text not null unique,
  name                       text not null check (length(btrim(name)) between 1 and 60),
  admin_id                   uuid not null references public.profiles(id) on delete restrict,
  player_list_id             uuid references public.player_lists(id) on delete restrict,
  status                     public.auction_status not null default 'lobby',

  budget_initial             integer not null default 500 check (budget_initial > 0),
  team_count                 integer not null default 8   check (team_count between 2 and 24),
  slots_per_team             integer check (slots_per_team is null or slots_per_team > 0),
  bid_timer_seconds          integer not null default 10  check (bid_timer_seconds between 3 and 120),
  nomination_timeout_seconds integer not null default 60,
  min_increment              integer not null default 1   check (min_increment >= 1),

  current_turn_index         integer not null default 0,
  turn_started_at            timestamptz,
  paused_at                  timestamptz,

  -- Contatore monotono: il client rileva gli eventi persi confrontandolo
  -- con la propria ultima versione e, in caso di buco, riscarica lo snapshot.
  state_version              bigint not null default 0,

  started_at                 timestamptz,
  ended_at                   timestamptz,
  created_at                 timestamptz not null default now()
);

create index auctions_admin_idx on public.auctions(admin_id);

-- ----------------------------------------------------------------------------
-- Squadre
-- ----------------------------------------------------------------------------
create table public.teams (
  id             uuid primary key default gen_random_uuid(),
  auction_id     uuid not null references public.auctions(id) on delete cascade,
  name           text not null check (length(btrim(name)) between 1 and 40),
  budget_initial integer not null check (budget_initial > 0),
  credits_spent  integer not null default 0 check (credits_spent >= 0),
  players_count  integer not null default 0 check (players_count >= 0),
  turn_position  integer not null,
  created_at     timestamptz not null default now(),
  -- Sempre coerente per costruzione: non puo' divergere dalla spesa reale.
  credits_remaining integer generated always as (budget_initial - credits_spent) stored,
  constraint teams_no_overspend check (credits_spent <= budget_initial)
);

create unique index teams_auction_turn_uidx on public.teams(auction_id, turn_position);
create index teams_auction_idx on public.teams(auction_id);

-- Max 2 allenatori per squadra (requisito §10)
create table public.team_members (
  team_id     uuid not null references public.teams(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  member_role public.member_role not null default 'coach',
  joined_at   timestamptz not null default now(),
  primary key (team_id, profile_id)
);

create index team_members_profile_idx on public.team_members(profile_id);

-- Presenza nella stanza (anche di chi non ha ancora una squadra)
create table public.auction_members (
  auction_id   uuid not null references public.auctions(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  room_role    public.room_role not null default 'player',
  last_seen_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),
  primary key (auction_id, profile_id)
);

create index auction_members_profile_idx on public.auction_members(profile_id);

-- ----------------------------------------------------------------------------
-- Lotti: un lotto = un giocatore messo all'asta
-- ----------------------------------------------------------------------------
create table public.auction_lots (
  id                     uuid primary key default gen_random_uuid(),
  auction_id             uuid not null references public.auctions(id) on delete cascade,
  player_id              uuid not null references public.players(id) on delete restrict,
  turn_number            integer not null,
  nominated_by_team_id   uuid references public.teams(id) on delete set null,
  status                 public.lot_status not null default 'live',

  current_bid            integer not null check (current_bid >= 1),
  current_bidder_team_id uuid references public.teams(id) on delete set null,

  -- ⏱ LA FONTE DI VERITA' DEL TIMER: una scadenza assoluta, non un contatore.
  -- Il client la sottrae all'ora del server per disegnare il countdown.
  bid_deadline           timestamptz not null,
  -- Millisecondi residui congelati durante la pausa (§16)
  paused_remaining_ms    integer,

  opened_at              timestamptz not null default now(),
  closed_at              timestamptz,
  final_price            integer,
  winner_team_id         uuid references public.teams(id) on delete set null
);

-- ⛔ Un solo lotto "live" per asta. Garantito dal DB, non dal codice.
create unique index auction_lots_one_live_uidx
  on public.auction_lots(auction_id) where status = 'live';

-- ⛔ Un giocatore non puo' essere venduto due volte nella stessa asta.
create unique index auction_lots_player_uidx
  on public.auction_lots(auction_id, player_id) where status <> 'void';

create index auction_lots_auction_status_idx on public.auction_lots(auction_id, status);

-- ----------------------------------------------------------------------------
-- Offerte
-- ----------------------------------------------------------------------------
create table public.bids (
  id         bigserial primary key,
  lot_id     uuid not null references public.auction_lots(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  amount     integer not null check (amount >= 1),
  created_at timestamptz not null default now(),
  -- ⛔ Due squadre non possono avere la stessa offerta sullo stesso lotto.
  constraint bids_unique_amount unique (lot_id, amount)
);

create index bids_lot_idx on public.bids(lot_id, id desc);

-- ----------------------------------------------------------------------------
-- Rose acquistate (query veloci, storico stabile)
-- ----------------------------------------------------------------------------
create table public.team_players (
  id          uuid primary key default gen_random_uuid(),
  auction_id  uuid not null references public.auctions(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete restrict,
  lot_id      uuid not null references public.auction_lots(id) on delete cascade,
  price       integer not null check (price >= 1),
  acquired_at timestamptz not null default now(),
  constraint team_players_unique_player unique (auction_id, player_id)
);

create index team_players_team_idx    on public.team_players(team_id);
create index team_players_auction_idx on public.team_players(auction_id, acquired_at desc);

-- ----------------------------------------------------------------------------
-- Log eventi: storico, audit e sorgente dei broadcast realtime
-- ----------------------------------------------------------------------------
create table public.auction_events (
  id            bigserial primary key,
  auction_id    uuid not null references public.auctions(id) on delete cascade,
  event_type    text not null,
  payload       jsonb not null default '{}'::jsonb,
  state_version bigint not null,
  created_at    timestamptz not null default now()
);

create index auction_events_auction_idx on public.auction_events(auction_id, id desc);
