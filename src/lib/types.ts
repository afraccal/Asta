/**
 * Tipi di dominio, allineati 1:1 al JSON restituito da get_auction_state().
 * Sono la "forma della verita'" che il client riceve dal database.
 */

export type AuctionStatus = "lobby" | "running" | "paused" | "completed" | "cancelled";
export type LotStatus = "live" | "assigned" | "void";
export type PlayerRole = "P" | "D" | "C" | "A";
export type MemberRole = "owner" | "coach";

export const ROLE_LABELS: Record<PlayerRole, string> = {
  P: "Portiere",
  D: "Difensore",
  C: "Centrocampista",
  A: "Attaccante",
};

export const ROLE_COLORS: Record<PlayerRole, string> = {
  P: "var(--color-role-p)",
  D: "var(--color-role-d)",
  C: "var(--color-role-c)",
  A: "var(--color-role-a)",
};

export interface Player {
  id: string;
  list_id: string;
  external_id: string | null;
  first_name: string | null;
  last_name: string;
  role: PlayerRole;
  role_mantra: string[];
  club: string | null;
  quotation: number | null;
  image_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TeamMember {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  member_role: MemberRole;
  online: boolean;
}

export interface RosterPlayer {
  player_id: string;
  first_name: string | null;
  last_name: string;
  role: PlayerRole;
  club: string | null;
  price: number;
}

export interface Team {
  id: string;
  name: string;
  turn_position: number;
  budget_initial: number;
  credits_spent: number;
  credits_remaining: number;
  players_count: number;
  /** Offerta massima realmente sostenibile, calcolata dal server. */
  max_bid: number;
  members: TeamMember[];
  players: RosterPlayer[];
}

export interface Bid {
  id: number;
  team_id: string;
  amount: number;
  created_at_ms: number;
}

export interface Lot {
  id: string;
  status: LotStatus;
  turn_number: number;
  nominated_by_team_id: string | null;
  current_bid: number;
  current_bidder_team_id: string | null;
  /** Scadenza assoluta decisa dal server: il client la disegna, non la decide. */
  bid_deadline_ms: number;
  paused_remaining_ms: number | null;
  player: Player;
  bids: Bid[];
}

export interface AssignedLot {
  lot_id: string;
  closed_at_ms: number;
  price: number;
  team_id: string | null;
  team_name: string | null;
  player: Player;
}

export interface HistoryEntry {
  lot_id: string;
  turn_number: number;
  price: number;
  team_id: string | null;
  team_name: string | null;
  player_id: string;
  first_name: string | null;
  last_name: string;
  role: PlayerRole;
  club: string | null;
  acquired_at_ms: number;
}

export interface AuctionInfo {
  id: string;
  code: string;
  name: string;
  status: AuctionStatus;
  admin_id: string;
  player_list_id: string | null;
  budget_initial: number;
  team_count: number;
  slots_per_team: number | null;
  bid_timer_seconds: number;
  nomination_timeout_seconds: number;
  min_increment: number;
  current_turn_index: number;
  turn_started_at_ms: number | null;
  state_version: number;
  current_turn_team_id: string | null;
}

export interface AuctionState {
  server_now_ms: number;
  auction: AuctionInfo;
  teams: Team[];
  lot: Lot | null;
  last_assigned: AssignedLot | null;
  history: HistoryEntry[];
  me: {
    profile_id: string;
    is_admin: boolean;
    team_id: string | null;
  };
}

/** Evento realtime emesso dal database sul topic `auction:<id>`. */
export interface AuctionEvent {
  event_type: string;
  state_version: number;
  payload: Record<string, unknown>;
  at_ms: number;
}

export function playerFullName(p: { first_name: string | null; last_name: string }) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ");
}
