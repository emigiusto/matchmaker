// aceup.routes.ts
// Endpoints for the Matchmaker → AceUp integration.
//
// GET  /aceup/validate/:matchId  — checks both players exist on AceUp and share a ladder
// POST /aceup/send/:matchId      — sends a confirmed singles result to AceUp

import { Router, Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { requireAuth } from '../../shared/middleware/requireAuth'
import { prisma } from '../../prisma'
import { AppError } from '../../shared/errors/AppError'
import { normalizePhoneToCanonical } from '../../shared/utils/phone.utils'
import {
  validateUsersOnAceUp,
  sendMatchResultToAceUp,
  formatSetsForAceUp,
  type AceUpValidateUsersSuccess,
} from './aceup.service'

const router = Router()

router.use(requireAuth)

// ─── Prisma include shape ────────────────────────────────────────────────────

const matchInclude = Prisma.validator<Prisma.MatchInclude>()({
  participants: { include: { user: true } },
  result: { include: { sets: { orderBy: { setNumber: 'asc' as const } } } },
  playerA: { include: { user: true } },
  playerB: { include: { user: true } },
})

type MatchWithDetails = Prisma.MatchGetPayload<{ include: typeof matchInclude }>

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSingles(match: MatchWithDetails): boolean {
  return match.participants.length === 2
}

/** Returns [playerUser, opponentUser] preferring playerA/playerB, falling back to participants. */
function resolvePlayers(match: MatchWithDetails, requestingUserId: string) {
  if (match.playerA?.user && match.playerB?.user) {
    return [match.playerA.user, match.playerB.user] as const
  }
  // Fall back to participants: requesting user = player, other = opponent
  const self = match.participants.find((p) => p.userId === requestingUserId)
  const other = match.participants.find((p) => p.userId !== requestingUserId)
  return [self?.user ?? null, other?.user ?? null] as const
}

function isEligibleToSend(match: MatchWithDetails): boolean {
  return !!match.result && ['submitted', 'confirmed'].includes(match.result.status)
}

function isEligibleToValidate(match: MatchWithDetails): boolean {
  return !!match.result && ['submitted', 'confirmed'].includes(match.result.status)
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /aceup/validate/:matchId
 *
 * Checks whether both players in a submitted/confirmed singles match exist and
 * are active on AceUp. Called by the frontend to decide whether to show the
 * "Send to AceUp" button.
 */
router.get('/validate/:matchId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const matchId = req.params.matchId as string
    const requestingUserId = req.user?.id
    if (!requestingUserId) throw new AppError('Unauthorized', 401)

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: matchInclude,
    })

    if (!match) throw new AppError('Match not found', 404)

    const isParticipant = match.participants.some((p) => p.userId === requestingUserId)
    if (!isParticipant) throw new AppError('Forbidden', 403)

    if (!isSingles(match)) {
      return res.status(400).json({ error: 'Only singles matches can be sent to AceUp' })
    }

    if (!isEligibleToValidate(match)) {
      return res.status(400).json({ error: 'Result must be submitted before sending to AceUp' })
    }

    const [playerUser, opponentUser] = resolvePlayers(match, requestingUserId)

    const validation = await validateUsersOnAceUp({
      playerEmail: playerUser?.email ?? undefined,
      playerPhone: playerUser?.phone ? normalizePhoneToCanonical(playerUser.phone) : undefined,
      opponentEmail: opponentUser?.email ?? undefined,
      opponentPhone: opponentUser?.phone ? normalizePhoneToCanonical(opponentUser.phone) : undefined,
    })

    return res.status(200).json(validation)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /aceup/send/:matchId
 *
 * Sends the confirmed singles result to AceUp.
 * Idempotent: subsequent calls return the previously synced matchId.
 */
router.post('/send/:matchId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const matchId = req.params.matchId as string
    const requestingUserId = req.user?.id
    if (!requestingUserId) throw new AppError('Unauthorized', 401)

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: matchInclude,
    })

    if (!match) throw new AppError('Match not found', 404)

    const isParticipant = match.participants.some((p) => p.userId === requestingUserId)
    if (!isParticipant) throw new AppError('Forbidden', 403)

    if (!isSingles(match)) {
      return res.status(400).json({ error: 'Only singles matches can be sent to AceUp' })
    }

    if (!isEligibleToSend(match)) {
      return res.status(400).json({ error: 'Result must be confirmed before sending to AceUp' })
    }

    // Already synced — return cached info
    if (match.result!.aceupSyncedAt) {
      return res.status(200).json({ success: true, challengeId: match.result!.aceupChallengeId })
    }

    // Re-validate to get AceUp player IDs
    const [playerUser, opponentUser] = resolvePlayers(match, requestingUserId)

    const validation = await validateUsersOnAceUp({
      playerEmail: playerUser?.email ?? undefined,
      playerPhone: playerUser?.phone ? normalizePhoneToCanonical(playerUser.phone) : undefined,
      opponentEmail: opponentUser?.email ?? undefined,
      opponentPhone: opponentUser?.phone ? normalizePhoneToCanonical(opponentUser.phone) : undefined,
    })

    if (!validation.valid) {
      return res.status(422).json({ valid: false, reason: validation.reason })
    }

    // TypeScript now knows validation is AceUpValidateUsersSuccess
    const { ladderId, player, opponent } = validation as AceUpValidateUsersSuccess

    // playerA → player1, playerB → player2 (consistent mapping)
    const player1PlayerId = player.playerId
    const player2PlayerId = opponent.playerId

    // Determine winner's AceUp player ID (player1 = requesting user)
    const winnerIsPlayer1 = match.result!.winnerUserId === playerUser?.id
    const winnerPlayerId = winnerIsPlayer1 ? player1PlayerId : player2PlayerId

    // Format sets from player1 (=playerA) perspective
    const sets = formatSetsForAceUp(match.result!.sets, /* playerAIsPlayer1 */ true)

    const aceupResponse = await sendMatchResultToAceUp({
      externalMatchId: match.id,
      ladderId,
      player1PlayerId,
      player2PlayerId,
      winnerPlayerId,
      matchDate: match.scheduledAt.toISOString(),
      sets,
    })

    // Persist sync metadata
    await prisma.result.update({
      where: { id: match.result!.id },
      data: {
        aceupSyncedAt: new Date(),
        aceupChallengeId: aceupResponse.challengeId,
      },
    })

    return res.status(200).json({ success: true, challengeId: aceupResponse.challengeId })
  } catch (err) {
    next(err)
  }
})

export default router
