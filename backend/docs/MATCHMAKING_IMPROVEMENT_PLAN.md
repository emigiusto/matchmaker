# Matchmaking Improvement Plan

**Branch:** `feature/matchmaking-profile-discovery`

## Progress

| Phase | Status |
|-------|--------|
| Phase 1 — Backend: Profile-Based Discovery | ✅ Complete |
| Phase 2 — Backend: API Layer | ✅ Complete |
| Phase 3 — Frontend | ✅ Complete |

---

## Goal

Extend the matchmaking engine so that every user receives suggested opponents — even if they have not published any availability slot. The system runs both matching modes automatically, merges the results into a single ranked feed, and surfaces them in the UI with visual cues that distinguish candidates with real time overlap from profile-only matches.

---

## Current State & Problems

### Backend

- `findMatchCandidates` and `findAllMatchCandidatesForUser` are **100% gated on availability overlap**. A user with no published availability slots receives zero suggestions.
- `scoreSurfacePreference`, `scoreRecentActivity`, and `scoreReliability` are stubs that always return 0.
- `minLevel` / `maxLevel` fields exist on `Availability` but are **unused** in scoring.
- No enrichment step: the controller returns raw `MatchmakingCandidate[]` but the frontend expects `SuggestedOpponent[]` (with a full `Player` object, `distance`, `levelDifference`, etc.). This mapping is missing.

### Frontend

- [`Suggested.tsx`](../src/pages/Suggested/Suggested.tsx) calls `matchmakingService.getSuggestions(userId)` with no `availabilityId`. The backend requires one, so **this always returns a 400 error silently** — the suggestions page effectively never loads real data.
- The correct endpoint for this view is `/matchmaking/all` via `getAllSuggestions`, which is never called from this page.
- [`SuggestionCard.tsx`](../src/components/suggestion-card.tsx) shows "No overlapping availability" with no alternative call-to-action.

---

## Design: Hybrid Mode (single feed, two signal types)

The user **never chooses a mode**. The system always runs both internally, merges results into one ranked list, and returns it. `matchMode` is an implementation detail used only for rendering.

### Score architecture

Both modes share the same score components. Availability mode adds an overlap bonus on top:

```
Profile score      = level + location + social + surface + recentActivity
Availability score = level + location + social + surface + recentActivity + overlap_bonus
```

The overlap bonus is naturally significant (60+ minutes = 60+ points at weight 1), so availability matches organically float to the top of the ranked list without any artificial boosting.

**Deduplication rule:** if a candidate qualifies in both modes (has overlapping availability AND passes profile scoring), keep only the availability-mode result — it is strictly the better signal.

### UI treatment

| Signal | Card appearance |
|--------|----------------|
| Availability match | Green "Available" badge · time slot picker shown · "Invite" CTA |
| Profile match only | Neutral badge · "No shared slots yet" note · "Connect" or "Suggest a time" CTA |

---

## Implementation Phases

---

### Phase 1 — Backend: Profile-Based Discovery ✅

**1. New function `findProfileBasedCandidates(userId, filters?)`** in `matchmaking.service.ts`

- Loads the requester's `Player` (level, coordinates, `preferredSurfaces` via `PlayerSurface` relation).
- Queries all other `Player` records — no availability requirement.
- For each candidate, scores using: level compatibility + geolocation + social proximity + surface preference + recent activity.
- No overlap score component.
- Returns `ProfileCandidate[]` tagged with `matchMode: 'profile'` and `hasOpenAvailability: boolean` (checked via a single `EXISTS` query on `Availability` with `status: 'open'`).

**2. Update `findAllMatchCandidatesForUser`**

- Always runs `findProfileBasedCandidates`.
- If the user has open availabilities, also runs the existing availability-based loop.
- Merges: deduplicate by `candidateUserId`, keeping availability-mode result when both exist.
- Sorts the merged list by score descending.
- Result: every user receives suggestions regardless of whether they have published availability.

**3. Update `matchmaking.types.ts`**

```typescript
interface MatchmakingCandidate {
  // existing fields ...
  matchMode: 'availability' | 'profile';      // new
  hasOpenAvailability: boolean;               // new
  requesterAvailabilityId?: string;           // was required, now optional
  candidateAvailabilityId?: string;           // was required, now optional
  overlapRange?: { start: string; end: string }; // already optional, confirm stays optional
}
```

**4. Implement stub score components**

- `scoreSurfacePreference.ts`: Accept `requesterSurfaces: string[]` (from `Player.preferredSurfaces`) and `candidateSurfaces: string[]`. Score based on intersection count.
- `scoreRecentActivity.ts`: Accept `lastMatchAt: Date | null`. More recent = small positive bonus (e.g. played in last 30 days = +5, last 90 days = +2, older/null = 0).

**5. Update `matchmaking.constants.ts`**

```typescript
export const WEIGHT_SURFACE_PREFERENCE = 1;
export const WEIGHT_RECENT_ACTIVITY = 1;
export const AVAILABILITY_BONUS = 20; // flat bonus added when both users have overlapping availability
export const SCORE_SURFACE_MATCH = 10;
export const SCORE_RECENT_30_DAYS = 5;
export const SCORE_RECENT_90_DAYS = 2;
```

---

### Phase 2 — Backend: API Layer ✅

**6. Fix `/matchmaking` endpoint** (`matchmaking.controller.ts`)

- Remove the hard 400 on missing `availabilityId`.
- If `availabilityId` is absent, fall through to `findAllMatchCandidatesForUser` (same as `/matchmaking/all`).
- If `availabilityId` is present, keep the existing specific-availability flow.

**7. Add enrichment mapper**

The controller currently returns raw `MatchmakingCandidate[]`. Add a `enrichCandidates(candidates)` helper (in the controller or a dedicated `matchmaking.mapper.ts`) that:

- Batch-fetches user + player records for all `candidateUserId`s.
- Computes `distance` (km) from requester and candidate coordinates.
- Computes `levelDifference` (candidate level − requester level).
- Formats `availabilityOverlap` as human-readable time slot strings.
- Returns `SuggestedOpponent[]` ready for the frontend.

This mapper runs in the controller, not the service (the service stays pure / read-only).

---

### Phase 3 — Frontend ✅

**8. Fix `Suggested.tsx`**

- Replace `matchmakingService.getSuggestions(currentUserId)` with `matchmakingService.getAllSuggestions({ userId: currentUserId })`.
- Pass `distanceRadius` and `levelRange` filter values to the API call (server-side filtering) rather than only filtering client-side after the fact.
- Update the empty state: if zero results, show "Set your availability to get better matches" with a link to the availability page.

**9. Update `SuggestionCard.tsx`**

- Render a green "Available" badge when `hasOpenAvailability === true`.
- Render a neutral "Profile match" label when `matchMode === 'profile'`.
- When `availabilityOverlap` is empty:
  - Replace time slot picker with: "This player hasn't set their availability yet — you can still reach out."
  - Replace "Invite" button with a "Connect" or "Suggest a time" button (links to the player's profile or opens a lightweight message flow).

**10. Update `SuggestedOpponent` type** (`frontend/src/lib/types.ts`)

```typescript
interface SuggestedOpponent {
  player: Player;
  distance: number;
  levelDifference: number;
  availabilityOverlap: string[];
  reason: string;
  score?: number;                                   // new
  matchMode?: 'availability' | 'profile';          // new
  hasOpenAvailability?: boolean;                   // new
}
```

**11. Update `matchmaking.service.ts`** (frontend)

- Pass `distanceRadius`, `levelRangeMin`, `levelRangeMax` in `getAllSuggestions` params (already defined in `MatchmakingFilters`, just not wired through from the page).

---

## File Change Summary

| File | Change |
|------|--------|
| `backend/src/modules/matchmaking/matchmaking.service.ts` | Add `findProfileBasedCandidates`; update `findAllMatchCandidatesForUser` to merge both modes |
| `backend/src/modules/matchmaking/matchmaking.types.ts` | Add `matchMode`, `hasOpenAvailability`; make availability fields optional |
| `backend/src/modules/matchmaking/matchmaking.constants.ts` | Add surface/activity weights and availability bonus constant |
| `backend/src/modules/matchmaking/matchmaking.controller.ts` | Remove hard `availabilityId` requirement; add enrichment mapper call |
| `backend/src/modules/matchmaking/scoreComponents/scoreSurfacePreference.ts` | Implement using `Player.preferredSurfaces` |
| `backend/src/modules/matchmaking/scoreComponents/scoreRecentActivity.ts` | Implement using `Player.lastMatchAt` |
| `frontend/src/pages/Suggested/Suggested.tsx` | Fix service call; wire filters to API; update empty state |
| `frontend/src/components/suggestion-card.tsx` | Add mode badge; handle no-overlap CTA |
| `frontend/src/lib/types.ts` | Extend `SuggestedOpponent` with `score`, `matchMode`, `hasOpenAvailability` |
| `frontend/src/lib/services/matchmaking.service.ts` | Wire filter params through `getAllSuggestions` |

---

## Out of Scope (this iteration)

- `scoreReliability.ts` — remains a stub; no cancellation history data is available yet.
- Sending actual "Connect" messages — the CTA for profile-only matches links to the player profile for now.
- Real-time cache invalidation when a candidate's profile changes (level update, location change) — existing TTL-based cache is sufficient.
