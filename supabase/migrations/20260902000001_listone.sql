-- ============================================================================
-- ASTA FANTACALCIO — Gestione del listone
--
-- I listoni sono condivisi fra aste: caricare le quotazioni una volta e
-- riusarle in tutte le stanze della stagione. L'importazione e' un upsert
-- sull'identificativo ufficiale del giocatore, quindi ricaricare un listone
-- aggiornato non spezza i riferimenti delle aste gia' in corso.
-- ============================================================================

create or replace function public.create_player_list(
  p_name   text,
  p_season text default null
)
returns public.player_lists
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.player_lists;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'invalid_name'; end if;

  insert into public.player_lists (name, season, owner_id, is_public)
  values (btrim(p_name), nullif(btrim(coalesce(p_season, '')), ''), v_uid, true)
  returning * into v_row;

  return v_row;
end $$;

-- Importa (o aggiorna) i giocatori di un listone.
-- p_players e' un array di oggetti gia' normalizzati e validati dal server
-- Next.js: qui si ricontrolla comunque tutto, perche' il database non si fida
-- mai di chi lo chiama.
create or replace function public.import_players(
  p_list_id uuid,
  p_players jsonb
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_owner     uuid;
  v_inserted  integer := 0;
  v_updated   integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select owner_id into v_owner from public.player_lists where id = p_list_id;
  if not found then raise exception 'list_not_found'; end if;
  if v_owner is distinct from v_uid then raise exception 'not_allowed'; end if;

  if jsonb_typeof(p_players) <> 'array' then raise exception 'invalid_payload'; end if;
  if jsonb_array_length(p_players) = 0 then raise exception 'empty_payload'; end if;
  if jsonb_array_length(p_players) > 5000 then raise exception 'payload_too_large'; end if;

  with incoming as (
    select
      nullif(btrim(x.external_id), '')          as external_id,
      nullif(btrim(coalesce(x.first_name, '')), '') as first_name,
      btrim(x.last_name)                        as last_name,
      x.role::public.player_role                as role,
      coalesce(x.role_mantra, '{}')             as role_mantra,
      nullif(btrim(coalesce(x.club, '')), '')   as club,
      x.quotation                               as quotation,
      nullif(btrim(coalesce(x.image_url, '')), '') as image_url,
      coalesce(x.metadata, '{}'::jsonb)         as metadata
    from jsonb_to_recordset(p_players) as x(
      external_id text, first_name text, last_name text, role text,
      role_mantra text[], club text, quotation integer,
      image_url text, metadata jsonb
    )
    where btrim(coalesce(x.last_name, '')) <> ''
  ),
  -- Se lo stesso identificativo comparisse due volte nel file, l'upsert
  -- fallirebbe: si tiene solo l'ultima occorrenza.
  deduped as (
    select distinct on (external_id) *
      from incoming
     order by external_id, last_name
  ),
  upserted as (
    insert into public.players as p (
      list_id, external_id, first_name, last_name, role,
      role_mantra, club, quotation, image_url, metadata
    )
    select p_list_id, d.external_id, d.first_name, d.last_name, d.role,
           d.role_mantra, d.club, d.quotation, d.image_url, d.metadata
      from deduped d
    on conflict (list_id, external_id) where external_id is not null
    do update set
      first_name  = excluded.first_name,
      last_name   = excluded.last_name,
      role        = excluded.role,
      role_mantra = excluded.role_mantra,
      club        = excluded.club,
      quotation   = excluded.quotation,
      -- Un'immagine gia' presente non viene cancellata da un file che non ne ha.
      image_url   = coalesce(excluded.image_url, p.image_url),
      metadata    = excluded.metadata
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert),
         count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from upserted;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'total',    v_inserted + v_updated
  );
end $$;

-- Collega un listone a un'asta. Solo l'amministratore e solo prima dell'avvio:
-- cambiare il listone a giocatori gia' venduti renderebbe incoerente lo storico.
create or replace function public.set_auction_player_list(
  p_auction_id uuid,
  p_list_id    uuid
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_auction public.auctions;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;
  if v_auction.status <> 'lobby' then raise exception 'already_started'; end if;

  if not exists (
    select 1 from public.player_lists
     where id = p_list_id and (is_public or owner_id = auth.uid())
  ) then
    raise exception 'list_not_found';
  end if;

  update public.auctions set player_list_id = p_list_id where id = p_auction_id;

  perform public._bump_state(p_auction_id, 'player_list_set',
                             jsonb_build_object('list_id', p_list_id));
end $$;

-- Listoni utilizzabili, con il numero di giocatori e la composizione per ruolo.
create or replace function public.list_player_lists()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id,
             'name', l.name,
             'season', l.season,
             'is_owner', l.owner_id = v_uid,
             'created_at_ms', (extract(epoch from l.created_at) * 1000)::bigint,
             'player_count', (select count(*) from public.players p where p.list_id = l.id),
             'by_role', (
               select coalesce(jsonb_object_agg(r.role, r.n), '{}'::jsonb)
                 from (select role, count(*) as n from public.players
                        where list_id = l.id group by role) r
             )
           ) order by l.created_at desc)
      from public.player_lists l
     where l.is_public or l.owner_id = v_uid
  ), '[]'::jsonb);
end $$;

grant execute on function
  public.create_player_list(text, text),
  public.import_players(uuid, jsonb),
  public.set_auction_player_list(uuid, uuid),
  public.list_player_lists()
to authenticated;
