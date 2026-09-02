-- ============================================================================
-- ASTA FANTACALCIO — Correzioni dell'amministratore
--
-- Durante una serata vera si sbaglia: si assegna al tavolo sbagliato, si
-- digita 40 invece di 4, ci si accorge dopo che il giocatore era gia' di
-- qualcun altro. Servono due poteri per rimediare: togliere un'assegnazione e
-- farne una a mano.
--
-- Sono poteri dell'AMMINISTRATORE, non di chi ha il turno: il banditore
-- cambia a ogni giro, e chiunque potrebbe altrimenti annullare gli acquisti
-- degli altri.
--
-- Entrambe le operazioni restano dentro le regole del gioco: non si puo'
-- assegnare a chi non ha i crediti, ne' sfondare un reparto gia' completo.
-- La liberta' e' su a chi e a quanto, non sul violare i vincoli.
-- ============================================================================

-- Un'assegnazione a mano puo' valere zero crediti (uno svincolato, un premio):
-- il vincolo si limita quindi a vietare i prezzi negativi.
alter table public.team_players drop constraint if exists team_players_price_check;
alter table public.team_players add constraint team_players_price_check check (price >= 0);

/**
 * Toglie un giocatore da una rosa e lo rimette in circolazione.
 *
 * Il lotto diventa 'void', e questo lo fa uscire dall'indice univoco parziale
 * che impedisce di vendere due volte lo stesso giocatore: da quel momento puo'
 * essere richiamato all'asta come se non fosse mai stato venduto.
 */
create or replace function public.revoca_assegnazione(p_lot_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auction public.auctions;
  v_lot     public.auction_lots;
  v_team    public.teams;
  v_player  public.players;
begin
  select a.* into v_auction
    from public.auctions a join public.auction_lots l on l.auction_id = a.id
   where l.id = p_lot_id for update of a;
  if not found then raise exception 'lot_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;

  select * into v_lot from public.auction_lots where id = p_lot_id for update;
  if v_lot.status <> 'assigned' then raise exception 'lot_not_assigned'; end if;

  select * into v_team from public.teams where id = v_lot.winner_team_id for update;
  select * into v_player from public.players where id = v_lot.player_id;

  delete from public.team_players where lot_id = p_lot_id;

  update public.teams
     set credits_spent = greatest(0, credits_spent - coalesce(v_lot.final_price, 0)),
         players_count = greatest(0, players_count - 1)
   where id = v_team.id;

  update public.auction_lots
     set status = 'void', winner_team_id = null, final_price = null, closed_at = now()
   where id = p_lot_id;

  -- Se l'asta si era chiusa perche' le rose erano piene, ora non lo sono piu'.
  if v_auction.status = 'completed' then
    update public.auctions set status = 'running', ended_at = null where id = v_auction.id;
  end if;

  perform public._bump_state(v_auction.id, 'assegnazione_revocata', jsonb_build_object(
    'lot_id', p_lot_id,
    'player_id', v_lot.player_id,
    'player_name', btrim(coalesce(v_player.first_name, '') || ' ' || v_player.last_name),
    'team_id', v_team.id,
    'team_name', v_team.name,
    'price', v_lot.final_price
  ));

  return jsonb_build_object(
    'player_name', btrim(coalesce(v_player.first_name, '') || ' ' || v_player.last_name),
    'team_name', v_team.name,
    'crediti_restituiti', v_lot.final_price
  );
end $$;

/**
 * Assegna un giocatore a una squadra senza passare dall'asta.
 *
 * Serve per rimediare a un errore o per accordi presi a voce. Resta comunque
 * dentro le regole: crediti sufficienti e reparto non ancora completo.
 */
create or replace function public.assegna_giocatore(
  p_auction_id uuid,
  p_player_id  uuid,
  p_team_id    uuid,
  p_price      integer
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auction public.auctions;
  v_team    public.teams;
  v_player  public.players;
  v_lot_id  uuid;
  v_turn    integer;
  v_piene   boolean;
begin
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'auction_not_found'; end if;
  if v_auction.admin_id <> auth.uid() then raise exception 'not_admin'; end if;
  if v_auction.status = 'lobby' then raise exception 'auction_not_running'; end if;
  if p_price is null or p_price < 0 then raise exception 'invalid_price'; end if;

  select * into v_player from public.players
   where id = p_player_id and list_id = v_auction.player_list_id;
  if not found then raise exception 'player_not_in_list'; end if;

  if exists (select 1 from public.team_players
              where auction_id = p_auction_id and player_id = p_player_id) then
    raise exception 'player_already_sold';
  end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found or v_team.auction_id <> p_auction_id then raise exception 'team_not_found'; end if;

  if public.posti_liberi_ruolo(p_team_id, v_player.role) <= 0 then
    raise exception 'role_full';
  end if;
  if p_price > v_team.credits_remaining then raise exception 'insufficient_credits'; end if;

  select coalesce(max(turn_number), 0) + 1 into v_turn
    from public.auction_lots where auction_id = p_auction_id;

  -- Il lotto nasce gia' chiuso: nessuno ha chiamato, nessuno ha rilanciato.
  insert into public.auction_lots (
    auction_id, player_id, turn_number, nominated_by_team_id, status,
    current_bid, current_bidder_team_id, bid_deadline,
    opened_at, closed_at, final_price, winner_team_id
  ) values (
    p_auction_id, p_player_id, v_turn, null, 'assigned',
    greatest(1, p_price), p_team_id, now(),
    now(), now(), p_price, p_team_id
  )
  returning id into v_lot_id;

  insert into public.team_players (auction_id, team_id, player_id, lot_id, price)
  values (p_auction_id, p_team_id, p_player_id, v_lot_id, p_price);

  update public.teams
     set credits_spent = credits_spent + p_price,
         players_count = players_count + 1
   where id = p_team_id;

  if v_auction.slots_per_team is not null then
    select bool_and(players_count >= v_auction.slots_per_team) into v_piene
      from public.teams where auction_id = p_auction_id;
    if coalesce(v_piene, false) then
      update public.auctions set status = 'completed', ended_at = now()
       where id = p_auction_id;
    end if;
  end if;

  perform public._bump_state(p_auction_id, 'assegnazione_manuale', jsonb_build_object(
    'lot_id', v_lot_id, 'player_id', p_player_id,
    'player_name', btrim(coalesce(v_player.first_name, '') || ' ' || v_player.last_name),
    'team_id', p_team_id, 'team_name', v_team.name, 'price', p_price
  ));

  return jsonb_build_object('lot_id', v_lot_id, 'team_name', v_team.name, 'price', p_price);
end $$;

grant execute on function
  public.revoca_assegnazione(uuid),
  public.assegna_giocatore(uuid, uuid, uuid, integer)
to authenticated;
