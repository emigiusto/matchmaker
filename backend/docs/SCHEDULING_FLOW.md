# Scheduling Automation Flow

## Architecture Overview

**Not queue-based.** The system uses:

1. **HTTP request–response** — User actions and webhooks drive the flow synchronously.
2. **Cron job** — Only for expiring candidates who don't respond in time.

---

## Two Ways to Accept an Invite

A scheduling request supports dual-path acceptance. Both paths race; the first one to reach the acceptance threshold wins.

| Path | How it works |
|------|-------------|
| **WhatsApp YES/NO** | Candidate receives a WhatsApp message with YES/NO buttons. Reply triggers the webhook. |
| **Web link** | Host shares a `/join/:token` URL. Anyone with the link can open the page and submit a form. |

The transactional `updateMany` + count guard prevents double-completion when both paths fire simultaneously.

---

## Full Flow Diagram

```
User clicks "Start Scheduling" (POST /scheduling/:id/start)
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│  SYNCHRONOUS (same HTTP request)                              │
│  • Find first pending candidate                               │
│  • Update DB: pending → waiting_reply                         │
│  • Send WhatsApp invite (locale-aware: ES / EN)               │
│  • Return updated SchedulingRequest                           │
└──────────────────────────────────────────────────────────────┘
        │
        ├──────────────────────────────────────────────┐
        │  Path A: WhatsApp reply                       │  Path B: Web link
        ▼                                               ▼
┌──────────────────────────────┐       ┌──────────────────────────────────────┐
│  WHATSAPP WEBHOOK             │       │  POST /scheduling/join/:token/accept  │
│  POST /whatsapp/webhook       │       │  Body: { name, phone, email?,         │
│  • Parse sender phone + text  │       │          socioNumber? }               │
│  • Match User by phone        │       │  • Normalize phone → find/create user │
│  • Find waiting_reply cand.   │       │  • Find/create SchedulingCandidate    │
│  • YES → completeScheduling   │       │  • Set status = accepted              │
│  • NO  → contactNextCandidate │       │  • If threshold reached →             │
└──────────────────────────────┘       │    completeScheduling                 │
                                        │  • Record invite_link_accepted event  │
                                        └──────────────────────────────────────┘
        │
        │  If no response within responseWindowMinutes
        ▼
┌──────────────────────────────────────────────────────────────┐
│  CRON JOB (every 15 min, JOBS_ENABLED=true)                   │
│  • Find waiting_reply candidates where contactedAt + window < now │
│  • Mark expired → contactNextCandidate                        │
└──────────────────────────────────────────────────────────────┘
```

---

## completeScheduling

Called when the acceptance threshold is met (singles: 1 accepted candidate; doubles: 3).

1. Creates a `Match` record linked to the `SchedulingRequest`.
2. Creates `MatchParticipant` rows for host + accepted candidates.
3. Tries to create a WhatsApp group with all participants.
   - If group creation succeeds: sends a "match confirmed" message to the group.
   - If group creation fails (privacy settings): sends individual fallback messages with a join link.
4. Marks `SchedulingRequest.status = completed`.
5. Records a `scheduling_completed` event.

---

## Locale-Aware Messages

All WhatsApp messages are locale-aware via `backend/src/lib/whatsapp-messages.ts`.

- Each candidate receives messages in **their own locale** (`User.locale`, default `"es"`).
- Group/confirmation messages use the **host's locale**.
- Supported: `es` (Spanish) and `en` (English).
- Templates: `invite`, `inviteReply`, `noLongerAvailable`, `matchConfirmed`, `noMatch`, `matchCancelled`, `reminder`, `courtBooked`.

---

## Public Join Page

**Frontend:** `/join/:token` → `JoinRequest.tsx`
**Backend:** `GET /scheduling/join/:token` + `POST /scheduling/join/:token/accept`

The page shows a match summary (sport, format, date, location, host name) and a form:

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | Used as display name |
| Phone | Yes | Normalized; used to find or create a user |
| Email | No | Stored on guest user if provided |
| Socio number | Conditional | Shown only when `bookingEnabled = true` on the request |

States handled: loading, not-found, cancelled, match-full (already completed), form, success.

**Race condition guard:** `acceptViaLink` uses a `prisma.$transaction` block. After setting the candidate to `accepted`, it counts total accepted candidates and only calls `schedulingRequest.updateMany({ where: { status: { not: 'completed' } } })`. The `count` result tells it whether it "won" the race; only the winner triggers `completeScheduling`.

---

## Key DB Models

| Model | Purpose |
|-------|---------|
| `SchedulingRequest` | The request itself. Has `inviteToken` (unique), `status`, `bookingEnabled`, `responseWindowMinutes`. |
| `SchedulingCandidate` | One row per person contacted. Statuses: `pending → contacted → waiting_reply → accepted / declined / expired / cancelled / send_failed`. |
| `SchedulingInviteEvent` | Append-only audit log. Actions include `invite_sent`, `invite_accepted`, `invite_link_accepted`, `invite_declined`, `invite_expired`, `scheduling_completed`, etc. |

---

## Local Testing Guide

### 1. Prerequisites

- Node.js, MySQL
- `.env` with `DATABASE_URL`, `JOBS_ENABLED=true`

### 2. Start the server

```bash
cd backend
npm run dev
```

### 3. Seed users

```bash
ENVIRONMENT=DEVELOPMENT npx tsx prisma/seeders/seed.ts
```

### 4. Create a scheduling request

```bash
curl -X POST http://localhost:3000/scheduling \
  -H "Content-Type: application/json" \
  -d '{
    "hostUserId": "<host-user-id>",
    "sportType": "tennis",
    "format": "singles",
    "matchType": "competitive",
    "date": "2026-04-10",
    "startTime": "2026-04-10T18:00:00.000Z",
    "endTime": "2026-04-10T19:30:00.000Z",
    "locationText": "Barcelona Club",
    "responseWindowMinutes": 60,
    "candidateUserIds": ["<user-a-id>", "<user-b-id>"]
  }'
```

### 5. Start scheduling (sends first WhatsApp)

```bash
curl -X POST http://localhost:3000/scheduling/<request-id>/start
```

With the mock provider the server logs:

```
[MOCK WhatsApp] sendInviteMessage { phoneNumber: '34612345678', messagePreview: '...' }
```

### 6. Simulate WhatsApp reply (webhook)

```bash
# Accept
curl -X POST http://localhost:3000/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{ "from": "34612345678", "text": { "body": "YES" } }'

# Decline
curl -X POST http://localhost:3000/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{ "from": "34612345678", "text": { "body": "NO" } }'
```

### 7. Simulate web-link acceptance

```bash
curl -X POST http://localhost:3000/scheduling/join/<invite-token>/accept \
  -H "Content-Type: application/json" \
  -d '{ "name": "Ana García", "phone": "+34612345678", "email": "ana@test.com" }'
```

### 8. Trigger expiration manually

Set `responseWindowMinutes` to 1, or wait for the 15-minute cron with `JOBS_ENABLED=true`.

---

## Webhook (provider-agnostic)

Each provider (`whapi`, `wasender`, `mock`) implements `parseWebhookPayload` to convert its format into `{ senderPhone, messageText }`. The controller delegates parsing to the active provider.

---

## Checklist Before Production

- [ ] Set `WHATSAPP_PROVIDER=whapi` (or `wasender`) and configure API keys
- [ ] Set webhook URL in provider dashboard: `https://your-domain/whatsapp/webhook`
- [ ] Verify `User.phone` is stored in E.164 / digits-only format
- [ ] Set `JOBS_ENABLED=true` so expiration cron runs
- [ ] Set `FRONTEND_BASE_URL` so join links point to the correct domain
- [ ] Run pending migrations: `npx prisma migrate deploy`
- [ ] Test full dual-path flow (WhatsApp + web link) with real WhatsApp
