# Result Upload & Rating Flow

_Last updated: 2026-03-25 (rev 2)_

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

## 7. Open Gaps

| # | Issue | Notes |
|---|-------|-------|
| 1 | **Questionnaire answers not persisted** | UI collects answers into local state after result submission, but `Result` has no `questionnaire` column and there is no save endpoint. Either add a `Json?` column to `Result` in Prisma and a `PATCH /results/:id/questionnaire` endpoint, or remove the questionnaire from the UI entirely. |
| 2 | **No rating history endpoint** | `RatingHistory` rows are written on every confirmed match but never exposed. `PlayerStats.ratingHistory` on the frontend is always empty. Needs `GET /players/:id/rating-history`. |
| 3 | **No dispute resolution path** | `disputeResult()` sets the flag and stores a note, but there is no endpoint for an admin to override or resolve a dispute. Disputed matches stay stuck indefinitely. |
| 4 | **Confidence decay only active in ELO mode** | `DeterministicRatingAlgorithm` ignores `lastMatchAt`, so inactivity has no effect on ratings in the default mode. Intentional or oversight — should be documented either way. |
| 5 | **`Player.wins` / `Player.losses` / `Player.matchesPlayed` do not exist in the schema** | These fields appear in the frontend `Player` type and `PlayerStats` but are not Prisma columns and are never written by the backend. Win/loss counts are a pure derivation of confirmed `Result` records and should be computed at query time rather than cached as mutable state. The frontend should source these values from the `PlayerStats` endpoint, not from the player record. |

---

## 8. Next Steps (Priority Order)

1. **Persist questionnaire answers** — add `questionnaire Json?` to the `Result` model, create a migration, and add `PATCH /results/:id/questionnaire` (or include in the submit payload). Wire the frontend to call it after the dialog closes successfully.
2. **Expose rating history** — add `GET /players/:id/rating-history` returning `RatingHistory` rows ordered by `createdAt` desc. Update `PlayerStats` on the frontend to populate `ratingHistory` from this endpoint.
3. **Compute win/loss stats server-side** — add a `GET /players/:id/stats` endpoint (or extend the existing one) that derives `wins`, `losses`, `matchesPlayed`, `winRate`, and `currentStreak` directly from confirmed `Result` records. Remove the cached fields from the frontend `Player` type.
4. **Dispute resolution for admins** — add `POST /results/:id/resolve-dispute` (admin only) that accepts corrected set scores, resets the result to `submitted` with the new sets, and resumes the normal confirmation flow.
