// aceup.service.ts
// HTTP client for the AceUp external integration API.

import { AppError } from '../../shared/errors/AppError'

const ACEUP_API_URL = process.env.ACEUP_API_URL
const ACEUP_API_SECRET = process.env.ACEUP_API_SECRET

interface AceUpSet {
  set: number
  score: string
  tiebreak: boolean
}

interface AceUpSetRaw {
  setNumber: number
  playerAScore: number
  playerBScore: number
  tiebreakScoreA: number | null
  tiebreakScoreB: number | null
}

export interface ValidateUsersResponse {
  valid: boolean
  reason?: string
  ladderId?: number
  ladderName?: string
  player?: { playerId: number; ranking: number | null }
  opponent?: { playerId: number; ranking: number | null }
}

export interface SendMatchResultInput {
  externalMatchId: string
  ladderId: number
  player1PlayerId: number
  player2PlayerId: number
  winnerPlayerId: number
  matchDate: string
  sets: AceUpSet[]
}

/**
 * Formats Matchmaker integer set scores into AceUp's "6-4" string format.
 * Scores are always expressed from player1's perspective (player1Score-player2Score).
 * playerAIsPlayer1: true when Matchmaker's teamA maps to AceUp's player1.
 */
export function formatSetsForAceUp(sets: AceUpSetRaw[], playerAIsPlayer1: boolean): AceUpSet[] {
  return sets.map((s) => {
    const [p1Score, p2Score] = playerAIsPlayer1
      ? [s.playerAScore, s.playerBScore]
      : [s.playerBScore, s.playerAScore]
    return {
      set: s.setNumber,
      score: `${p1Score}-${p2Score}`,
      tiebreak: s.tiebreakScoreA != null || s.tiebreakScoreB != null,
    }
  })
}

function headers() {
  if (!ACEUP_API_SECRET) throw new AppError('ACEUP_API_SECRET is not configured', 500)
  return {
    'Content-Type': 'application/json',
    'X-Matchmaker-Secret': ACEUP_API_SECRET,
  }
}

export async function validateUsersOnAceUp(
  playerEmail: string,
  opponentEmail: string,
): Promise<ValidateUsersResponse> {
  if (!ACEUP_API_URL) throw new AppError('ACEUP_API_URL is not configured', 500)

  const response = await fetch(`${ACEUP_API_URL}/api/external/validate-users`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ playerEmail, opponentEmail }),
  })

  if (!response.ok) {
    throw new AppError(`AceUp validate-users request failed (${response.status})`, 502)
  }

  return response.json() as Promise<ValidateUsersResponse>
}

export async function sendMatchResultToAceUp(
  payload: SendMatchResultInput,
): Promise<{ success: boolean; matchId: number }> {
  if (!ACEUP_API_URL) throw new AppError('ACEUP_API_URL is not configured', 500)

  const response = await fetch(`${ACEUP_API_URL}/api/external/match-result`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new AppError(body.error ?? `AceUp match-result request failed (${response.status})`, 502)
  }

  return response.json() as Promise<{ success: boolean; matchId: number }>
}
