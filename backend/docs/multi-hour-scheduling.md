# Multi-Hour Time Range Scheduling

## Current State

The wizard forces a fixed 1-hour window. The user picks a start time and the end time is automatically set to `start + 1h`. This is intentional for the v1 launch while the scheduling and booking flows are kept simple.

---

## Goal

Let the host specify a flexible availability window (e.g. 10:00–13:00) so that the system can find a match within any 1-hour slot inside that range. This is more realistic: most people are free for several hours and want a match to happen whenever an opponent is available.

---

## Data Model Changes

### `SchedulingRequest`

Currently `startTime` and `endTime` define a single 1-hour slot. No schema change is needed — the fields already support arbitrary ranges. The change is purely in the UI and matching logic.

```
startTime: DateTime   // e.g. 10:00
endTime:   DateTime   // e.g. 13:00  ← currently always startTime + 1h
```

### `Availability` (matched player side)

The matched player's availability also has `startTime` / `endTime`. The overlap between the host window and the candidate window determines valid booking slots.

---

## UI Changes (Frontend)

### Wizard Step 1

- Remove the "Duration is fixed at 1 hour" copy.
- Make the **End time** select interactive again (same `TIME_SLOTS` array, filtered to `> startTime`).
- Minimum range: 1 hour. Optionally show the computed duration (`2h`, `3h`, etc.) as a hint.

```tsx
// endTimeSlots already exists:
const endTimeSlots = TIME_SLOTS.filter((t) => t > startTime)
```

No other wizard changes are needed.

---

## WhatsApp Invite Message

Currently the invite message shows a fixed time:

```
📅 Thursday, March 19 · 10:00 AM
```

With a range, it should show:

```
📅 Thursday, March 19 · 10:00 – 13:00
```

### Where to change

`backend/src/modules/scheduling/scheduling.service.ts` — the function that builds the WhatsApp invite message sent to candidates. Replace the single-time format with a range format when `startTime !== endTime - 1h`.

```ts
// Current
const timeLabel = format(startTime, 'h:mm a')

// New
const startLabel = format(startTime, 'h:mm a')
const endLabel   = format(endTime,   'h:mm a')
const timeLabel  = startLabel === endLabel
  ? startLabel
  : `${startLabel} – ${endLabel}`
```

---

## Matching Logic Changes

### Current

The scheduler looks for candidates whose availability overlaps the exact slot `[startTime, endTime]`.

### New

The scheduler should find candidates available for **at least 1 hour** within the host's window. The actual booked slot is negotiated to the earliest overlapping hour.

#### Algorithm

```
overlap_start = max(host.startTime, candidate.startTime)
overlap_end   = min(host.endTime,   candidate.endTime)
overlap_hours = (overlap_end - overlap_start) in hours

if overlap_hours >= 1:
    matched_slot_start = overlap_start
    matched_slot_end   = overlap_start + 1h
```

#### Where to change

`backend/src/modules/scheduling/scheduling.service.ts` — the candidate availability query and the match creation logic. The match's `scheduledAt` should be set to `matched_slot_start`, and the booking adapter will use that time.

---

## Booking Adapter Impact

The booking adapter (`laieta.adapter.ts`) uses `time` (HH:MM) derived from `match.availability.startTime`. This does not change — the adapter always books a single 1-hour court slot at the resolved `matched_slot_start`.

---

## Summary of Files to Change

| File | Change |
|------|--------|
| `frontend/src/components/i-want-to-play-wizard.tsx` | Re-enable end time picker |
| `backend/src/modules/scheduling/scheduling.service.ts` | WhatsApp message range format + overlap matching logic |
| No schema changes | `startTime`/`endTime` already support ranges |
