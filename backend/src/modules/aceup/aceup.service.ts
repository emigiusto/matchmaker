// aceup.service.ts
// HTTP client for the AceUp external integration API.

import { AppError } from '../../shared/errors/AppError'
import type {
  AceUpValidateUsersRequest,
  AceUpValidateUsersResponse,
  AceUpMatchResultRequest,
  AceUpMatchResultResponse,
  MatchmakerSet,
  AceUpSet,
} from './aceup.types'

export type {
  AceUpValidateUsersResponse,
  AceUpValidateUsersSuccess,
  AceUpValidateUsersFailure,
  AceUpMatchResultRequest,
  AceUpMatchResultResponse,
  AceUpSet,
  MatchmakerSet,
} from './aceup.types'

const ACEUP_API_URL = process.env.ACEUP_API_URL
const ACEUP_API_SECRET = process.env.ACEUP_API_SECRET

/**
 * Converts Matchmaker's integer set scores into AceUp's "6-4" string format.
 * Scores are always expressed from player1's perspective (player1Score-player2Score).
 *
 * @param sets - Raw set results from Matchmaker (Prisma SetResult rows)
 * @param playerAIsPlayer1 - true when Matchmaker's teamA maps to AceUp's player1
 */
export function formatSetsForAceUp(sets: MatchmakerSet[], playerAIsPlayer1: boolean): AceUpSet[] {
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
  body: AceUpValidateUsersRequest,
): Promise<AceUpValidateUsersResponse> {
  if (!ACEUP_API_URL) throw new AppError('ACEUP_API_URL is not configured', 500)

  const url = `${ACEUP_API_URL}/api/external/validate-users`
  console.log('[aceup] validateUsersOnAceUp →', url, JSON.stringify(body))

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[aceup] validateUsersOnAceUp fetch error:', err)
    throw err
  }

  console.log('[aceup] validateUsersOnAceUp ←', response.status)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('[aceup] validateUsersOnAceUp error body:', text)
    throw new AppError(`AceUp validate-users request failed (${response.status})`, 502)
  }

  return response.json() as Promise<AceUpValidateUsersResponse>
}

export async function sendMatchResultToAceUp(
  payload: AceUpMatchResultRequest,
): Promise<AceUpMatchResultResponse> {
  if (!ACEUP_API_URL) throw new AppError('ACEUP_API_URL is not configured', 500)

  const url = `${ACEUP_API_URL}/api/external/match-result`
  console.log('[aceup] sendMatchResultToAceUp →', url, JSON.stringify(payload))

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[aceup] sendMatchResultToAceUp fetch error:', err)
    throw err
  }

  console.log('[aceup] sendMatchResultToAceUp ←', response.status)
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string }
    console.error('[aceup] sendMatchResultToAceUp error body:', err)
    throw new AppError(err.error ?? `AceUp match-result request failed (${response.status})`, 502)
  }

  return response.json() as Promise<AceUpMatchResultResponse>
}
