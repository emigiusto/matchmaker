# Multi-Hour Time Range Scheduling

## Current State

The wizard forces a fixed 1-hour window. The user picks a start time and the end time is automatically set to `start + 1h`. This is intentional for the v1 launch while the scheduling and booking flows are kept simple.

---

## Goal

Let the host specify a flexible availability window (e.g. 10:00–13:00) so that the system can find a match within any 1-hour slot inside that range. This is more realistic: most people are free for several hours and want a match to happen whenever an opponent is available.

The WhatsApp invite presents **all available hours** in the window as a poll so candidates can vote on which hour works for them. When all required participants have voted for the same hour, the match is confirmed at that hour. If multiple hours reach quorum, the earliest one wins — unless auto-booking is enabled, in which case the earliest hour that also has a court available wins.

---

## Data Model Changes

No schema changes needed. `startTime` and `endTime` on `SchedulingRequest` already support arbitrary ranges. The change is in the UI, the invite message format, and the slot-selection logic.

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

Instead of showing a static time range, the invite sends a **poll** listing each 1-hour slot inside the window. Candidates tap which hour(s) work for them. Multiple selections are allowed.

### Poll format

Each slot is one poll option, e.g.:

```
🎾 *Emiliano quiere jugar contigo!*

📅  Sábado, 21 mar
📍  Club Sportiu Laieta
🎾  Tennis Singles

¿A qué hora te va bien?
1️⃣  09:00 – 10:00
2️⃣  10:00 – 11:00
3️⃣  11:00 – 12:00

⏳ Tienes *2 horas* para responder
```

### Provider support

- **Whapi** (button-based): render each slot as a poll option button. Max ~10 options before the UI degrades; limit the window to 6 hours max or paginate.
- **Wasender** (poll-based): native poll message. Already supports multiple choices.

Both providers must send the poll in a single message so replies are captured against the same message ID.

### Reply handling

When a candidate submits their poll response(s), the scheduling service records which hours they voted for. If a later response supersedes a previous one (candidate changes their mind within the window), replace the earlier votes.

---

## Slot Selection (Match Confirmation)

### Quorum rule

A slot is **confirmed** when the number of participants who voted for it equals the number of required players minus the host (who is always considered available for any slot in their own window).

| Format | Required players | Votes needed to confirm |
|---|---|---|
| Singles | 2 | 1 (opponent only) |
| Doubles | 4 | 3 (all three non-host players) |

### Tie-breaking — no auto-booking

If multiple slots reach quorum at the same time (e.g. two candidates both vote for 10:00 and 11:00), pick the **earliest** slot.

### Tie-breaking — with auto-booking

If the host has an active club connection with `bookingEnabled`, pick the **earliest slot that also has a court available** in the cached full-day availability. Fall back to the earliest slot regardless if no slot has a court.

#### Algorithm

```
confirmed_slots = [slot for slot in window if vote_count(slot) >= quorum]

if bookingEnabled and host has active membership:
    for slot in sorted(confirmed_slots):
        if cachedAvailability has courts at slot:
            return slot
    // fallback: no court found for any confirmed slot
    return confirmed_slots[0]
else:
    return confirmed_slots[0]
```

The availability check is a pure Redis cache read (`matchmaker:booking:availability:{adapterType}:{clubSlug}:{date}:{sport}`) — no Puppeteer, no network call.

#### `pickBestSlotInRange` helper (`booking.service.ts`)

This helper is used both at match-confirmation time and as a fallback when no poll response data is available (e.g. timeout or single-slot window).

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

- Reads from `matchmaker:booking:availability:{adapterType}:{clubSlug}:{date}:{sport}`
- Cache miss or no courts in range → returns `startTime` (safe fallback, never blocks)

---

## Scheduling Service Changes

### `completeScheduling` — slot resolution

```ts
// After all required poll votes are in, resolve the matched slot:
let matchedHour = earliestConfirmedSlot(votes, quorum)

if (request.bookingEnabled) {
  const hostMembership = await prisma.clubMembership.findFirst({
    where: { userId: hostUser.id, status: 'active', encryptedPassword: { not: null } }
  })
  if (hostMembership) {
    matchedHour = await pickBestConfirmedSlot(
      confirmedSlots,      // slots that reached quorum, sorted ascending
      hostMembership,
      dateStr,
      request.sportType,
    )
  }
}

// Build scheduledAt from date + matchedHour
```

### Poll vote tracking

Each vote is stored as a `SchedulingInviteEvent` with `action: 'poll_vote'` and `metadata: { candidateId, hours: ['09', '10'] }`. This keeps the event log immutable and lets the service recompute quorum by replaying events.

---

## Booking Adapter Impact

No changes. `runBookingJob` already derives `time` from `match.availability.startTime`, which will reflect the confirmed matched slot. The pre-check on `/reservas` and the post-submit verification via `/reservas` remain the authoritative success signals.

---

## Summary of Files to Change

| File | Change |
|---|---|
| `frontend/src/components/i-want-to-play-wizard.tsx` | Unlock end time picker; show per-slot court count across range |
| `backend/src/modules/scheduling/scheduling.service.ts` | Send poll invite; record poll votes; resolve slot using quorum + court-awareness in `completeScheduling` |
| `backend/src/modules/booking/booking.service.ts` | Add `pickBestSlotInRange` / `pickBestConfirmedSlot` helpers (cache read only) |
| `backend/src/lib/whatsapp-messages.ts` | Replace static time range with poll message template |
| No schema changes | `startTime`/`endTime` already support ranges; votes stored as `SchedulingInviteEvent` |
