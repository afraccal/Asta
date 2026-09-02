-- ============================================================================
-- ASTA FANTACALCIO — Blindatura dei permessi di esecuzione
--
-- Postgres concede EXECUTE a PUBLIC su OGNI funzione appena creata. Revocare
-- il permesso solo da `anon` e `authenticated` non serve a niente: quei ruoli
-- lo ereditano comunque da PUBLIC.
--
-- Il buco era reale e non teorico: `_bump_state` e' SECURITY DEFINER e scrive
-- in auction_events, che e' la sorgente dei messaggi realtime. Chiunque, anche
-- senza far parte della stanza, poteva quindi iniettare in QUALSIASI asta un
-- evento falso (per esempio un finto "giocatore assegnato") e vederlo
-- comparire sullo schermo di tutti i partecipanti.
--
-- Si inverte quindi la logica: si nega tutto a tutti, poi si concede solo
-- l'elenco esplicito di cio' che il client deve poter chiamare.
-- ============================================================================

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;

-- Le funzioni create in futuro non nasceranno piu' aperte a PUBLIC.
alter default privileges in schema public revoke execute on functions from public;

-- Il ruolo di servizio (chiave segreta, mai nel browser) resta operativo.
grant execute on all functions in schema public to service_role;

-- --- L'unica superficie che il client puo' chiamare --------------------------
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
  public.create_player_list(text, text),
  public.import_players(uuid, jsonb),
  public.set_auction_player_list(uuid, uuid),
  public.list_player_lists()
to authenticated;

-- Servono alle policy RLS, che vengono valutate con i permessi di chi legge.
grant execute on function
  public.is_auction_member(uuid),
  public.is_auction_admin(uuid),
  public.can_act_for_team(uuid),
  public.max_bid_for_team(uuid),
  public.current_turn_team_id(uuid)
to authenticated;

-- Prima ancora di autenticarsi, il client misura lo scarto col nostro orologio.
grant execute on function public.server_now() to anon;

-- Restano fuori, e devono restarci: _bump_state, _generate_code, _uid,
-- _broadcast_auction_event e finalize_expired_lots (quest'ultima e' il job di
-- pg_cron, che gira come proprietario del database).
