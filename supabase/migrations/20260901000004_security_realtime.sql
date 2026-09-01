-- ============================================================================
-- ASTA FANTACALCIO — Sicurezza, realtime e job di chiusura
--
-- Modello di sicurezza (§17): il client puo' LEGGERE solo le aste di cui e'
-- membro e non puo' SCRIVERE NULLA, mai, su nessuna tabella. L'unica via di
-- scrittura sono le funzioni SECURITY DEFINER, che validano ogni condizione.
-- Anche con la chiave anonima in mano, un client non puo' regalarsi crediti.
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.player_lists    enable row level security;
alter table public.players         enable row level security;
alter table public.auctions        enable row level security;
alter table public.teams           enable row level security;
alter table public.team_members    enable row level security;
alter table public.auction_members enable row level security;
alter table public.auction_lots    enable row level security;
alter table public.bids            enable row level security;
alter table public.team_players    enable row level security;
alter table public.auction_events  enable row level security;

-- ⛔ Nessuna scrittura diretta, per nessuno. Solo le RPC.
revoke insert, update, delete on all tables in schema public from anon, authenticated;

-- --- Politiche di sola lettura ------------------------------------------------

create policy profiles_read on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1 from public.auction_members mine
      join public.auction_members theirs on theirs.auction_id = mine.auction_id
     where mine.profile_id = auth.uid() and theirs.profile_id = public.profiles.id
  )
);

create policy lists_read on public.player_lists for select to authenticated
using (is_public or owner_id = auth.uid());

create policy players_read on public.players for select to authenticated
using (exists (
  select 1 from public.player_lists l
   where l.id = public.players.list_id and (l.is_public or l.owner_id = auth.uid())
));

create policy auctions_read on public.auctions for select to authenticated
using (public.is_auction_member(id));

create policy teams_read on public.teams for select to authenticated
using (public.is_auction_member(auction_id));

create policy team_members_read on public.team_members for select to authenticated
using (exists (
  select 1 from public.teams t
   where t.id = public.team_members.team_id and public.is_auction_member(t.auction_id)
));

create policy auction_members_read on public.auction_members for select to authenticated
using (public.is_auction_member(auction_id));

create policy lots_read on public.auction_lots for select to authenticated
using (public.is_auction_member(auction_id));

create policy bids_read on public.bids for select to authenticated
using (exists (
  select 1 from public.auction_lots l
   where l.id = public.bids.lot_id and public.is_auction_member(l.auction_id)
));

create policy team_players_read on public.team_players for select to authenticated
using (public.is_auction_member(auction_id));

create policy events_read on public.auction_events for select to authenticated
using (public.is_auction_member(auction_id));

-- --- Permessi di esecuzione ---------------------------------------------------

grant execute on function
  public.server_now(),
  public.ensure_profile(text, text),
  public.create_auction(text, integer, integer, integer, integer, uuid),
  public.join_auction(text),
  public.heartbeat(uuid),
  public.claim_team(uuid),
  public.leave_team(uuid),
  public.rename_team(uuid, text),
  public.start_auction(uuid, boolean),
  public.nominate_player(uuid, uuid),
  public.place_bid(uuid, uuid, integer),
  public.finalize_lot(uuid),
  public.pause_auction(uuid),
  public.resume_auction(uuid),
  public.skip_turn(uuid),
  public.cancel_lot(uuid),
  public.end_auction(uuid),
  public.get_auction_state(uuid),
  public.search_players(uuid, text, public.player_role, text, integer),
  public.list_clubs(uuid),
  public.is_auction_member(uuid),
  public.is_auction_admin(uuid),
  public.can_act_for_team(uuid),
  public.max_bid_for_team(uuid),
  public.current_turn_team_id(uuid)
to authenticated;

grant execute on function public.server_now() to anon;

-- Gli helper interni non sono invocabili dall'esterno.
revoke execute on function
  public._bump_state(uuid, text, jsonb),
  public._generate_code(),
  public.finalize_expired_lots()
from anon, authenticated;

-- ============================================================================
-- REALTIME
--
-- Si usa Broadcast (non "Postgres Changes"): quest'ultimo rivaluta le RLS
-- per ogni client a ogni evento e non regge la crescita. Con Broadcast il
-- database emette UN messaggio sul topic della stanza e Realtime lo
-- distribuisce. Il payload e' gia' pronto per la UI: nessuna query di
-- rimbalzo dal client dopo ogni offerta.
-- ============================================================================

create or replace function public._broadcast_auction_event()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'event_type',    new.event_type,
      'state_version', new.state_version,
      'payload',       new.payload,
      'at_ms',         (extract(epoch from new.created_at) * 1000)::bigint
    ),
    -- Nome evento costante: il client si iscrive a un solo canale logico e
    -- discrimina sul campo event_type. Evita di dover registrare un handler
    -- per ogni tipo e di perdere i tipi aggiunti in futuro.
    'auction_event',
    'auction:' || new.auction_id::text,
    true   -- canale privato: l'accesso passa dalla policy qui sotto
  );
  return new;
end $$;

create trigger auction_events_broadcast
  after insert on public.auction_events
  for each row execute function public._broadcast_auction_event();

-- Solo i membri della stanza possono ascoltarne il canale.
create policy auction_broadcast_read on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.is_auction_member(
        nullif(split_part(realtime.topic(), ':', 2), '')::uuid
      )
);

-- ============================================================================
-- CHIUSURA AUTOMATICA DEI LOTTI
--
-- Rete di sicurezza lato database: chiude i lotti scaduti anche se tutti i
-- browser sono chiusi o congelati. La reattivita' immediata la fornisce il
-- client che chiama finalize_lot() quando il suo countdown tocca zero;
-- essendo la funzione idempotente, i due inneschi non possono confliggere.
-- ============================================================================

do $$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('asta-finalize-expired-lots')
    where exists (select 1 from cron.job where jobname = 'asta-finalize-expired-lots');

  perform cron.schedule(
    'asta-finalize-expired-lots',
    '1 seconds',
    $cron$ select public.finalize_expired_lots(); $cron$
  );
exception when others then
  raise warning 'pg_cron non disponibile (%): la chiusura automatica restera'' affidata ai client.', sqlerrm;
end $$;
