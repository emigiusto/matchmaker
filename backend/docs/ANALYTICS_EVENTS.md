# Analytics Events

This document describes every event tracked in the `UserEvent` table, where each one is emitted, what metadata it carries, and how the data flows from source to storage.

---

## Architecture

### Storage

Events are stored in the `UserEvent` table (MySQL via Prisma):

| Column      | Type     | Notes                                      |
|-------------|----------|--------------------------------------------|
| `id`        | String   | CUID primary key                           |
| `userId`    | String?  | Nullable — anonymous client events have no userId |
| `eventType` | String   | Dot-separated namespace, e.g. `auth.login` |
| `metadata`  | Json     | Arbitrary key/value payload (optional)     |
| `sessionId` | String?  | Client-side session UUID (one per page load) |
| `source`    | String   | `"client"` or `"server"`                  |
| `createdAt` | DateTime | Set by the database on insert              |

Indexes: `[userId]`, `[eventType, createdAt]`, `[createdAt]`, `[userId, createdAt]`.

### Two ingestion paths

**Server-side** — fire-and-forget helper called directly from service functions:

```ts
// analytics.service.ts
void logServerEvent(userId, 'event.type', { key: 'value' })
```

Never throws. If the insert fails it logs a warning and continues. Callers always `void` the promise.

**Client-side** — batched SDK in the browser:

```ts
// frontend/src/lib/analytics/analytics.ts
track('event.type', { key: 'value' })
```

Events are queued in memory and flushed in two ways:
- Every **10 seconds** via `setInterval`
- On **page hide** via `document.visibilitychange` + `navigator.sendBeacon` (falls back to `fetch`)

The batch is sent to `POST /analytics/events`. Auth token is included if present, so client events from logged-in users are attributed. Anonymous events (no token) have `userId = null`.

---

## Event Reference

### `auth.signup`
- **Source:** server (`auth.service.ts` → `signup()`)
- **Metadata:** none
- **When:** immediately after a new user row is created and the JWT is issued

### `auth.login`
- **Source:** server (`auth.service.ts` → `login()`)
- **Metadata:** none
- **When:** on every successful password login

### `auth.logout`
- **Source:** client (`AuthContext.tsx` → `logout()`)
- **Metadata:** none
- **When:** user clicks logout; the queue is flushed synchronously before the token is removed, so the event is always attributed

### `onboarding.completed`
- **Source:** client (`Onboarding.tsx` → `finish()`)
- **Metadata:** none
- **When:** user reaches step 5 (the success screen) of the onboarding flow

### `match.created`
- **Source:** server (`matches.service.ts` → `createMatch()`)
- **Metadata:** `{ matchId }`
- **When:** emitted once per participant (including the host) when a match is confirmed; each user gets their own event row

### `match.completed`
- **Source:** server (`matches.service.ts` → `completeMatch()`)
- **Metadata:** `{ matchId }`
- **When:** host marks the match as played

### `match.cancelled`
- **Source:** server (`matches.service.ts` → `cancelMatch()`)
- **Metadata:** `{ matchId }`
- **When:** any participant cancels the match

### `booking.started`
- **Source:** server (`booking.service.ts` → `triggerBookingForMatch()`)
- **Metadata:** `{ matchId, clubSlug }`
- **When:** the Puppeteer booking job begins (after verifying the host has an active club membership); fires even if the booking eventually fails

### `booking.success`
- **Source:** server (`booking.service.ts`)
- **Metadata:** `{ matchId, courtName, clubSlug }`
- **When:** a court is confirmed booked at the club

### `booking.failed`
- **Source:** server (`booking.service.ts`)
- **Metadata:** `{ matchId, errorCode, clubSlug }`
- **When:** the booking attempt reaches a terminal failure state

### `scheduling.request_created`
- **Source:** server (`scheduling.service.ts` → `createSchedulingRequest()`)
- **Metadata:** `{ requestId }`
- **When:** a user submits an availability window for auto-matching

### `scheduling.invite_accepted`
- **Source:** server (`scheduling.service.ts` → `completeScheduling()`)
- **Metadata:** `{ matchId }`
- **When:** the candidate accepts the scheduling invite and a match is created

### `scheduling.no_match`
- **Source:** server (`scheduling.service.ts` → `expireRequestsPastScheduledTime()`)
- **Metadata:** `{ requestId }`
- **When:** a scheduling request expires without finding a match (cron job)

### `scheduling.request_cancelled`
- **Source:** server (`scheduling.service.ts` → `cancelSchedulingRequest()`)
- **Metadata:** `{ requestId }`
- **When:** user manually cancels a pending scheduling request

### `contact.added`
- **Source:** server (`contacts.service.ts` → `createContact()`)
- **Metadata:** `{ contactId }`
- **When:** user saves a new contact (manual or import)

### `page.view`
- **Source:** client (`usePageTracking.ts`)
- **Metadata:** `{ path }` — the pathname, e.g. `/matches/abc123`
- **When:** on every React Router navigation (fires on route change, not on full reload)

---

## Admin Dashboard

The admin dashboard at `/admin` reads from `GET /analytics/admin/stats?days=N` (requires `isAdmin = true`).

### Computed metrics

| Metric              | Definition                                                     |
|---------------------|----------------------------------------------------------------|
| **DAU**             | Distinct `userId`s with any event today (midnight UTC)        |
| **WAU**             | Distinct `userId`s with any event in the last 7 days          |
| **MAU**             | Distinct `userId`s with any event in the last 30 days         |
| **Total users**     | Count of `User` rows where `isGuest = false` and `isAdmin = false` |
| **New signups**     | Distinct `userId`s with an `auth.signup` event in today / 7d / 30d |
| **Top events**      | Top 10 event types by count in the selected period             |
| **Funnel**          | All-time distinct users who reached each stage: signup → match.created → booking.success |
| **Active users daily** | Distinct `userId`s per calendar day for the selected period |
| **New users daily** | Distinct `userId`s with `auth.signup` per calendar day        |
| **Top users**       | Top 20 users by event count in the selected period             |
| **Recent events**   | Latest 100 events, optionally filtered by `eventType`         |

Results are cached in Redis per period (key: `analytics:admin:stats:<days>`), TTL 5 minutes. Use the **"Stats cache"** button in the dashboard to bust the cache and reload immediately.

### Availability cache

Scraped court availability is cached separately under keys `matchmaker:booking:availability:<adapter>:<clubSlug>:<date>:<sport>`, TTL 15 minutes. Use the **"Availability cache"** button to clear all of these (useful after a scraper fix or when slots look stale).

---

## Adding a new event

1. Pick a dot-namespaced name following the `noun.verb` convention (e.g. `club.joined`).
2. Emit it from the relevant service:
   - Server: `void logServerEvent(userId, 'club.joined', { clubSlug })`
   - Client: `track('club.joined', { clubSlug })`
3. Add it to this document with source, metadata, and trigger condition.
4. Optionally add a color entry in `EVENT_COLORS` in `AdminDashboard.tsx` so it's highlighted in the events feed.
