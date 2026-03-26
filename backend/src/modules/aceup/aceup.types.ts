/**
 * aceup.types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared contract between Matchmaker and AceUp's external API.
 *
 * All types here mirror the exact JSON shapes sent/received over the wire.
 * Any change to these types must be coordinated with AceUp's ExternalController.
 */

// ─── Validate Users ───────────────────────────────────────────────────────────

/** Request body for POST /api/external/validate-users */
export interface AceUpValidateUsersRequest {
  /** Email of the match host (Matchmaker's playerA) */
  playerEmail: string
  /** Email of the opponent (Matchmaker's playerB) */
  opponentEmail: string
}

/** Successful validation — both players exist and share exactly one ladder */
export interface AceUpValidateUsersSuccess {
  valid: true
  /** AceUp internal ladder ID — passed back as-is in the match result request */
  ladderId: number
  ladderName: string
  /** AceUp player record for playerEmail */
  player: { playerId: number; ranking: number | null }
  /** AceUp player record for opponentEmail */
  opponent: { playerId: number; ranking: number | null }
}

/** Failed validation — one or both players cannot receive results */
export interface AceUpValidateUsersFailure {
  valid: false
  /**
   * Machine-readable reason:
   *  - player_not_found      → playerEmail has no AceUp account
   *  - opponent_not_found    → opponentEmail has no AceUp account
   *  - player_not_active     → player exists but is inactive in AceUp
   *  - opponent_not_active   → opponent exists but is inactive in AceUp
   *  - no_shared_ladder      → both exist but are not in the same ladder
   */
  reason: 'player_not_found' | 'opponent_not_found' | 'player_not_active' | 'opponent_not_active' | 'no_shared_ladder'
}

export type AceUpValidateUsersResponse = AceUpValidateUsersSuccess | AceUpValidateUsersFailure

// ─── Match Result ─────────────────────────────────────────────────────────────

/**
 * A single set result in AceUp's wire format.
 * Scores are always expressed from player1's perspective: "6-4" means player1 won 6–4.
 */
export interface AceUpSet {
  /** 1-based set number */
  set: number
  /**
   * Score string in "player1Score-player2Score" format, e.g. "6-4", "7-6", "1-6".
   * Derived from Matchmaker's integer playerAScore/playerBScore, where playerA = player1.
   */
  score: string
  /** true if this set was decided by a tiebreak */
  tiebreak: boolean
}

/** Request body for POST /api/external/match-result */
export interface AceUpMatchResultRequest {
  /**
   * Matchmaker's match UUID. Used by AceUp for idempotency —
   * submitting the same UUID twice returns the existing match.
   */
  externalMatchId: string
  /** AceUp ladder ID, obtained from a prior validate-users call */
  ladderId: number
  /**
   * AceUp Player.id for player1 (= Matchmaker's playerA).
   * Obtained from AceUpValidateUsersSuccess.player.playerId.
   */
  player1PlayerId: number
  /**
   * AceUp Player.id for player2 (= Matchmaker's playerB).
   * Obtained from AceUpValidateUsersSuccess.opponent.playerId.
   */
  player2PlayerId: number
  /**
   * AceUp Player.id of the winner.
   * Must be either player1PlayerId or player2PlayerId.
   */
  winnerPlayerId: number
  /** ISO 8601 date-time of the match (Matchmaker's Match.scheduledAt) */
  matchDate: string
  /**
   * Ordered set results (ascending by set number).
   * Scores are always from player1's perspective.
   */
  sets: AceUpSet[]
}

/** Response body from POST /api/external/match-result */
export interface AceUpMatchResultResponse {
  success: true
  /** AceUp internal Match.id for the created (or pre-existing) match */
  matchId: number
}

// ─── Internal helper ─────────────────────────────────────────────────────────

/**
 * Matchmaker set shape (from Prisma SetResult) passed to formatSetsForAceUp().
 * This is NOT part of the AceUp wire format.
 */
export interface MatchmakerSet {
  setNumber: number
  /** Score for the player on team A in Matchmaker */
  playerAScore: number
  /** Score for the player on team B in Matchmaker */
  playerBScore: number
  tiebreakScoreA: number | null
  tiebreakScoreB: number | null
}
