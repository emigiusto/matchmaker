# Multi-Hour Time Range Scheduling

## Current State

The wizard forces a fixed 1-hour window. The user picks a start time and the end time is automatically set to `start + 1h`. This is intentional for the v1 launch while the scheduling and booking flows are kept simple.

---

## Goal

Let the host specify a flexible availability window (e.g. 10:00–13:00) so that the system can find a match within any 1-hour slot inside that range. This is more realistic: most people are free for several hours and want a match to happen whenever an opponent is available.

When the host has an active club connection with `bookingEnabled`, the matched slot is also court-aware: the system picks the earliest hour in the window that has a court available, using the cached full-day availability — no extra Puppeteer call at match time.

---

## Data Model Changes

No schema changes needed. `startTime` and `endTime` on `SchedulingRequest` already support arbitrary ranges. The change is purely in the UI and the slot-selection logic.

```
startTime: DateTime   // e.g. 10:00
endTime:   DateTime   // e.g. 13:00  ← currently always startTime + 1h
```

---

## UI Changes (Frontend)

### Wizard Step 1

- Remove the "Duration is fixed at 1 hour" copy.
- Make the **End time** select interactive (same `TIME_SLOTS` array, filtered to `> startTime`).
- Show the computed duration (`2h`, `3h`, etc.) as a hint next to the time picker.

```tsx
const endTimeSlots = TIME_SLOTS.filter((t) => t > startTime)
```

### Court availability across the range

When Auto-book is ON, show one line per hour inside `[startTime, endTime)` instead of a single count. This lets the host see which hours have courts and adjust their window accordingly.

```
10:00 — 2 courts ✓
11:00 — 3 courts ✓
12:00 — 0 courts ✗
```

The full-day availability is already fetched and cached — this is a client-side filter, no extra API call.

---

## WhatsApp Invite Message

**Already implemented.** The invite message already formats the time as a range (`start – end`) at line 453 of `scheduling.service.ts`:

```ts
const timeStr = `${formatInTz(request.startTime, ...)} - ${formatInTz(request.endTime, ...)}`
```

No changes needed here.

---

## Slot Selection at Match Time

### Current

`scheduledAt` is always set to `request.startTime` in `completeScheduling` (lines 670–680 of `scheduling.service.ts`).

### New: court-aware slot selection

When `bookingEnabled` is true and the host has an active club membership, `completeScheduling` picks the best 1-hour slot within `[startTime, endTime)` using the cached court availability — reading from Redis only, never triggering a new Puppeteer session.

#### Algorithm

```
for each hour H in [request.startTime, request.endTime - 1h]:
    if cachedAvailability has courts at H:
        matched_slot = H
        break

fallback: matched_slot = request.startTime
```

#### `pickBestSlotInRange` helper (`booking.service.ts`)

```ts
export async function pickBestSlotInRange(
  userId: string,
  clubSlug: string,
  date: string,    // YYYY-MM-DD
  sport: string,
  startTime: string,  // HH:MM
  endTime: string,    // HH:MM
): Promise<string>    // returns best HH:MM, defaults to startTime
```

- Reads from `cacheGet("booking:availability:{adapterType}:{clubSlug}:{date}:{sport}")` — same key written by `checkCourtAvailability`
- Cache miss or no courts in range → returns `startTime` (safe fallback, never blocks)
- Pure cache read: no Puppeteer, no network call

#### Where to change in `completeScheduling`

```ts
// After resolving hostUser and before building scheduledAt:
let matchedHour = /* HH:MM from request.startTime */

if (request.bookingEnabled) {
  const hostMembership = await prisma.clubMembership.findFirst({
    where: { userId: hostUser.id, status: 'active', encryptedPassword: { not: null } }
  })
  if (hostMembership) {
    matchedHour = await pickBestSlotInRange(
      hostUser.id,
      hostMembership.clubSlug,
      dateStr,
      request.sportType,
      startHH,  // derived from request.startTime
      endHH,    // derived from request.endTime
    )
  }
}

// Build scheduledAt from date + matchedHour (replaces current request.startTime usage)
```

---

## Matching Logic (Candidate Overlap) — Deferred

Currently candidates are selected purely by priority order with no availability filtering. Adding availability-based overlap detection (checking if a candidate is free during the matched slot) is a separate future feature and is not part of this implementation.

---

## Booking Adapter Impact

No changes. `runBookingJob` already derives `time` from `match.availability.startTime`, which will now reflect the court-aware matched slot. The adapter performs a live Puppeteer check at booking time regardless, so stale cache is handled gracefully.

---

## Summary of Files to Change

| File | Change |
|---|---|
| `frontend/src/components/i-want-to-play-wizard.tsx` | Unlock end time picker; show per-slot court count across range |
| `backend/src/modules/booking/booking.service.ts` | Add `pickBestSlotInRange` helper (cache read only) |
| `backend/src/modules/scheduling/scheduling.service.ts` | Call `pickBestSlotInRange` in `completeScheduling` to set `scheduledAt` |
| No schema changes | `startTime`/`endTime` already support ranges |
| No WhatsApp changes | Invite message already shows `start – end` |
