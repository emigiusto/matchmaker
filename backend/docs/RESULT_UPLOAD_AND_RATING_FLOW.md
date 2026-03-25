# Result Upload & Rating Flow

_Last updated: 2026-03-25 (rev 3)_

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
| `POST` | `/results/:id/dispute` | Either player disputes the result; fires notifications to other participant + all admins |
| `POST` | `/results/:id/resolve-dispute` | **Admin only** — accepts corrected set scores, resets result to `submitted`, restarts confirmation flow |
| `GET`  | `/results/disputed` | **Admin only** — returns all `disputed` results enriched with match and participant data |
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

**`disputeResult()`** — `results.service.ts`

- Marks result as `disputed`, blocking any further confirmation or rating update
- Stores `disputeNote` as a JSON string: `{ reason: string, proposedSets?: SetScore[] }`
- After the transaction, fires best-effort notifications via `setImmediate`:
  - `result.disputed` → all participants who did not submit the dispute
  - `result.disputed.admin` → all admin users (excluding participants)

**`resolveDispute()`** — `results.service.ts`

- Admin-only: accepts corrected set scores, deletes existing `SetResult` rows, inserts new ones
- Recomputes `winnerUserId` from the corrected sets
- Resets `Result.status = submitted` and `Match.status = awaiting_confirmation`
- Clears `disputedByHostAt`, `disputedByOpponentAt`, and `disputeNote`
- Normal confirmation flow (second player confirms → `completed` → rating update) resumes from here

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
  disputeNote           String?      // JSON: { reason: string, proposedSets?: SetScore[] }
  questionnaire         Json?        // PostMatchQuestionnaire answers
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
- Includes a post-match questionnaire (5 randomly selected from 14 questions); answers are persisted to `Result.questionnaire` on submission

### Match Details

**File:** `frontend/src/pages/MatchDetails/MatchDetails.tsx`

- Shows current result sets and status
- When `result.status === "disputed"` and `disputeNote` is present, parses the JSON and renders the dispute reason and proposed corrected scores
- Participants who did not submit can confirm or dispute; admins have an additional "Resolve dispute" dialog

### Admin Dashboard — Disputes Tab

**File:** `frontend/src/pages/Admin/AdminDashboard.tsx`

- Tab trigger shows a red badge with the count of open disputes
- Fetches `GET /results/disputed` on mount
- Each card shows: players, date/time/location, parsed dispute note (reason + proposed scores), current set scores
- Inline "Resolve…" form lets admins enter corrected scores and call `POST /results/:id/resolve-dispute`

### Frontend API Service

**File:** `frontend/src/lib/services/results.service.ts`

```typescript
resultsService.getByMatch(matchId)
resultsService.getByUser(userId)
resultsService.submitMatchResult(matchId, sets, questionnaire?)
resultsService.submitSets(resultId, sets)
resultsService.confirm(resultId)
resultsService.dispute(resultId, noteJson)
resultsService.resolveDispute(resultId, sets)
resultsService.getDisputedResults()   // admin only
```

### Notifications

**Files:** `frontend/src/lib/api/adapters.ts`, `frontend/src/lib/hooks/use-notification-text.ts`, `frontend/src/lib/i18n/locales/{en,es}.json`

| Backend type | Frontend type | EN title | ES title |
|---|---|---|---|
| `result.disputed` | `result_disputed` | "Result disputed" | "Resultado impugnado" |
| `result.disputed.admin` | `result_disputed` | "Result disputed — review needed" | "Resultado impugnado — revisión necesaria" |

---

## 7. Player Stats

**Endpoint:** `GET /players/:id/stats`

Stats are **computed at read time** from confirmed `Result` and `RatingHistory` records — never cached as mutable counters on the `Player` row. This avoids permanent desync if a counter update fails mid-transaction.

Fields returned: `totalMatches`, `competitiveMatches`, `practiceMatches`, `wins`, `losses`, `winRate`, `averageOpponentLevel`, `currentStreak`, `streakType`, `ratingHistory`.

---

## 8. Open Gaps

| # | Issue | Notes |
|---|-------|-------|
| 1 | **No rating history endpoint** | `RatingHistory` rows are written on every confirmed match but not yet exposed via `GET /players/:id/rating-history`. `PlayerStats.ratingHistory` on the frontend is always an empty array until this is added. |
| 2 | **Confidence decay only active in ELO mode** | `DeterministicRatingAlgorithm` ignores `lastMatchAt`, so inactivity has no effect on ratings in the default mode. Intentional or oversight — should be documented either way. |
| 3 | **Questionnaire data not yet surfaced** | Answers are persisted to `Result.questionnaire` but not rendered anywhere in the UI. Planned: AI-powered post-match insight panel on the match detail page. |

---

## 9. Next Steps (Priority Order)

1. **Expose rating history** — add `GET /players/:id/rating-history` returning `RatingHistory` rows ordered by `createdAt` desc. Update `PlayerStats` on the frontend to populate `ratingHistory` from this endpoint.
2. **Profile UI and player analytics** — render rating chart, win rate, streak, and average opponent level on the player profile page using data from `GET /players/:id/stats`.
3. **AI post-match insights** — use `Result.questionnaire` data to generate a short insight message after a match is confirmed. Display on the match detail page with a label like "Powered by AI".
