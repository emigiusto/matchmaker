# Result Upload & Rating Flow

_Last updated: 2026-03-25_

---

## Overview

This document covers the end-to-end flow for uploading match results, the confirmation lifecycle, and the ELO/rating calculation system. It also documents what is currently missing or incomplete.

---

## 1. Match Result Lifecycle

### States

```
scheduled
  ↓  (first player submits sets)
awaiting_confirmation
  ↓  (second player confirms)
completed  →  triggers rating update
  ↓  (either player disputes at any point)
disputed
```

Match status and Result status are kept in sync. The valid pairs are:

| Match status            | Result status |
|-------------------------|---------------|
| `scheduled`             | `draft`       |
| `awaiting_confirmation` | `submitted`   |
| `completed`             | `confirmed`   |
| `disputed`              | `disputed`    |

---

## 2. Backend API

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/results/:matchId/submit-result` | Main endpoint — creates Result + SetResults, sets match to `awaiting_confirmation` |
| `POST` | `/results/:id/sets` | Add an individual set to an existing result |
| `POST` | `/results/:id/confirm` | Second player confirms; when both confirmed, triggers rating update |
| `POST` | `/results/:id/dispute` | Either player disputes the result |
| `GET`  | `/results/by-match/:matchId` | Fetch result for a match |
| `GET`  | `/results/by-user/:userId` | Fetch all results for a user |
| `GET`  | `/results/recent` | Activity feed of recent results |

### Key Files

| Layer | File |
|-------|------|
| Routes | `src/modules/results/results.routes.ts` |
| Controller | `src/modules/results/results.controller.ts` |
| Service (core logic) | `src/modules/results/results.service.ts` |
| Types | `src/modules/results/results.types.ts` |
| Validators | `src/modules/results/results.validators.ts` |
| Tests | `src/modules/results/results.lifecycles.test.ts` |

---

## 3. Result Submission Logic

**`submitMatchResult()`** — `results.service.ts` lines 254–374

1. Creates a `Result` record if one does not exist for the match
2. Inserts `SetResult` rows for each set provided
3. Computes winner server-side from set scores (count of sets won)
4. Sets `Result.status = submitted` and `Match.status = awaiting_confirmation`
5. Sets either `confirmedByHostAt` or `confirmedByOpponentAt` depending on which player is submitting

**`confirmResult()`** — `results.service.ts` lines 389–520

1. Sets the remaining confirmation timestamp for the second player
2. When **both** `confirmedByHostAt` and `confirmedByOpponentAt` are present:
   - Sets `Result.status = confirmed`
   - Sets `Match.status = completed`
   - Calls `RatingService.updateRatingsForCompletedMatch()`
   - Sends notifications
3. Method is idempotent — calling it twice returns the same result

**`disputeResult()`** — `results.service.ts` lines 535–564

- Marks result as `disputed`, blocking any further confirmation or rating update
- No resolution mechanism currently exists (see Missing Pieces)

---

## 4. Rating System

### Architecture

The rating system is pluggable. Two algorithms are implemented:

| Algorithm | Status | Activation |
|-----------|--------|------------|
| `DeterministicRatingAlgorithm` | **Active (default)** | Always on unless overridden |
| `EloRatingAlgorithm` | Ready, inactive | Set `RATING_ALGORITHM=elo` env var |

Configuration entry point: `src/modules/rating/rating.bootstrap.ts` — called at app startup via `app.ts`.

### Rating Update Guards

`RatingService.updateRatingsForCompletedMatch()` — `rating.service.ts` lines 81–247

Only proceeds if ALL of these are true:
- `match.type === 'competitive'` (practice matches are skipped)
- `match.status === 'completed'`
- `result.status === 'confirmed'`
- `result.winnerUserId` is present
- Neither player already has a `RatingHistory` record for this match (idempotency)

### Deterministic Algorithm

**File:** `src/modules/rating/algorithms/deterministic.algorithm.ts`

```
ratingDiff = |winner.rating - loser.rating|

if lower-rated player wins (upset):
  delta = baseGain + (ratingDiff * 0.1)
  delta *= upsetMultiplier (1.5×)
  delta = min(delta, maxDelta = 0.25)
else:
  delta = baseGain - (ratingDiff * 0.05)

delta = max(delta, minExpectedGain = 0.03)

winner.rating += delta
loser.rating  -= delta * lossFactor (0.5)

both.confidence += 0.02 (capped at 1.0)
```

Default config values:

| Parameter | Value |
|-----------|-------|
| `baseGain` | 0.1 |
| `upsetMultiplier` | 1.5 |
| `maxDelta` | 0.25 |
| `lossFactor` | 0.5 |
| `confidenceIncrement` | 0.02 |
| `confidenceMax` | 1.0 |
| `defaultRating` | 3.0 |
| `defaultConfidence` | 0.3 |
| `minExpectedGain` | 0.03 |

### ELO Algorithm

**File:** `src/modules/rating/algorithms/elo.algorithm.ts`

Key differences from deterministic:
- Applies **inactivity decay** to confidence before computing deltas (decay rate 0.01/day, kicks in after 14 days inactive, minimum confidence 0)
- **Volatility-adjusted K factor**: `K = kFactor * (1 + (1 - decayedConfidence))` — players with lower confidence swing more
- **Asymmetric (non-zero-sum) deltas**: winner and loser K factors are computed independently
- Standard ELO expected score: `E = 1 / (1 + 10^((opponentRating - playerRating) / 400))`

Default K factor: 32 (overridable via `RATING_K_FACTOR` env var).

### Persistence

After each algorithm run, the service:
1. Updates `Player.levelValue`, `Player.levelConfidence`, `Player.lastMatchAt`
2. Creates a `RatingHistory` record with `oldRating`, `newRating`, `delta`, `oldConfidence`, `newConfidence`

---

## 5. Database Schema

### Result

```prisma
model Result {
  id                    String       @id @default(uuid())
  matchId               String       @unique
  winnerUserId          String?
  status                ResultStatus @default(draft)
  submittedByUserId     String?
  confirmedByHostAt     DateTime?
  confirmedByOpponentAt DateTime?
  disputedByHostAt      DateTime?
  disputedByOpponentAt  DateTime?
  createdAt             DateTime     @default(now())

  match      Match       @relation(...)
  winnerUser User?       @relation(...)
  sets       SetResult[]
}
```

### SetResult

```prisma
model SetResult {
  id             String @id @default(uuid())
  resultId       String
  setNumber      Int
  playerAScore   Int
  playerBScore   Int
  tiebreakScoreA Int?
  tiebreakScoreB Int?

  @@unique([resultId, setNumber])
}
```

### RatingHistory

```prisma
model RatingHistory {
  id            String   @id @default(uuid())
  playerId      String
  matchId       String
  oldRating     Float
  newRating     Float
  delta         Float
  oldConfidence Float
  newConfidence Float
  createdAt     DateTime @default(now())

  @@index([playerId])
  @@index([matchId])
}
```

---

## 6. Frontend

### Upload Dialog

**File:** `frontend/src/components/result-upload-dialog.tsx`

- Supports 1–5 sets with per-set score entry
- Validates tennis rules client-side (winner needs ≥6 games, no ties, 7-5/7-6 allowed)
- Computes winner from set count
- Includes a post-match questionnaire (5 randomly selected from 14 questions)

### Frontend API Service

**File:** `frontend/src/lib/services/results.service.ts`

Methods defined:

```typescript
resultsService.getByMatch(matchId)
resultsService.getByUser(userId)
resultsService.submitSets(resultId, sets)
resultsService.confirm(resultId)
resultsService.dispute(resultId, reason)
```

---

## 7. Missing Pieces

### Critical (Blocking)

| # | Issue | Location |
|---|-------|----------|
| 1 | **`handleSubmit` has no API call** — dialog validates scores and closes with a toast, but never calls the backend | `result-upload-dialog.tsx` lines 280–311 |
| 2 | **`resultsService` methods are never called** from the UI | `frontend/src/lib/services/results.service.ts` |

### Notable Gaps

| # | Issue | Notes |
|---|-------|-------|
| 3 | **Questionnaire answers not persisted** | 14 questions defined in UI, answers stored in local state, but no backend field or endpoint to save them |
| 4 | **Backend tennis validation is incomplete** | `results.validators.ts` has a `TODO` — missing 2-game lead rule (no 6-5), tiebreak enforcement at 6-6, super-tiebreak |
| 5 | **No rating read endpoints** | `RatingHistory` is written but never exposed — no `GET /players/:id/rating-history`, no leaderboard |
| 6 | **Dispute resolution not designed** | `disputeResult()` sets the flag, but there is no admin override, appeal path, or timeout resolution |
| 7 | **Confirmation by same player not blocked** | Nothing prevents the submitter from also providing the second confirmation |
| 8 | **Practice match result behaviour is ambiguous** | Sets can be stored for practice matches, but no rating update happens — intended behaviour is not documented |
| 9 | **Confidence decay only active in ELO mode** | `DeterministicRatingAlgorithm` never reads `lastMatchAt`, so inactivity has no effect on deterministic ratings |
| 10 | **Match completion side effects are minimal** | On `completed`, only rating is updated — no win/loss counters, no leaderboard recalc, no achievement checks |

---

## 8. Recommended Next Steps (Priority Order)

1. **Wire the frontend** — in `handleSubmit`, call `resultsService.submitSets()` with the match ID and collected set scores
2. **Complete server-side tennis validation** — add 2-game lead rule and tiebreak logic to `results.validators.ts`
3. **Decide on questionnaire** — either add a JSON column to `Result` in Prisma or remove the questionnaire from the UI
4. **Enforce confirmation by opposite player** — add a guard in `confirmResult()` that blocks the original submitter from providing the second confirmation
5. **Expose rating history** — add `GET /players/:id/rating-history` and a leaderboard endpoint
6. **Design dispute resolution** — define whether disputes go to admin review, auto-expire, or are handled differently
