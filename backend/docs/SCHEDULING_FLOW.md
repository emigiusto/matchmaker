# Scheduling Automation Flow

## Architecture Overview

**Not queue-based.** The system uses:

1. **HTTP request–response**: User actions and webhooks drive the flow synchronously.
2. **Cron job**: Only for expiring candidates who don’t respond in time.

### How it works when the user puts it up for scheduling

```
User clicks "Start Scheduling" (POST /scheduling/:id/start)
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  SYNCHRONOUS (same HTTP request)                                   │
│  • Find first pending candidate                                    │
│  • Update DB: contacted → waiting_reply                            │
│  • Send WhatsApp invite (mock logs to console; real provider sends) │
│  • Return updated SchedulingRequest                                │
└───────────────────────────────────────────────────────────────────┘
        │
        │  Candidate receives WhatsApp
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  WHATSAPP WEBHOOK (POST /whatsapp/webhook)                         │
│  Provider (Whapi, etc.) calls this when user replies                │
│  • Parse sender phone + message text                               │
│  • Find User by phone, then SchedulingCandidate (status=waiting)    │
│  • If YES → completeScheduling (create Match, group, etc.)          │
│  • If NO  → contactNextCandidate (send to next person)              │
└───────────────────────────────────────────────────────────────────┘
        │
        │  If no response within responseWindowMinutes (e.g. 1h, 4h)
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  CRON JOB (every 15 min, when JOBS_ENABLED=true)                   │
│  • Find waiting_reply candidates where contactedAt + window < now   │
│  • Mark expired → contactNextCandidate                             │
└───────────────────────────────────────────────────────────────────┘
```

### Important points

- **No message queue**: Contacting the next candidate happens in the webhook handler or the cron job.
- **No background workers**: `contactNextCandidate` runs in the request that triggers it (start, webhook, or cron).
- **Persistent state**: DB stores all state; restarts don’t lose progress.

---

## Invite vs Scheduling (two separate flows)

| | **Invite flow** (`/invites`) | **Scheduling flow** (`/scheduling`) |
|---|---|---|
| Purpose | One-off invite for an availability | Sequential WhatsApp invites |
| Token | Invite.token | SchedulingRequest.inviteToken |
| How to accept | Link click → POST /invites/:token/confirm | WhatsApp reply YES/NO → webhook |
| Match creation | InviteService.confirmInvite | schedulingService.completeScheduling |

---

## Local Testing Guide

### 1. Prerequisites

- Node.js, MySQL, Redis (if used)
- `.env` with `DATABASE_URL` (or `DB_*` vars), `JOBS_ENABLED=true`

### 2. Start the server

```bash
cd backend
npm run dev
```

### 3. Seed users (with phone numbers)

Create users via your seed or API. For webhook testing, candidates must have `phone` set. Phone is matched by digits only (e.g. `34612345678`).

```bash
# Seed (requires ENVIRONMENT=DEVELOPMENT)
ENVIRONMENT=DEVELOPMENT npx tsx prisma/seeders/seed.ts
```

Then get user IDs and phones from the DB. For the test script, set:

```bash
export HOST_USER_ID=<uuid>
export CANDIDATE_1_ID=<uuid>
export CANDIDATE_2_ID=<uuid>
export CANDIDATE_1_PHONE=34612345678   # Must match User.phone digits
export CANDIDATE_2_PHONE=34687654321
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
    "date": "2026-03-12",
    "startTime": "2026-03-12T18:00:00.000Z",
    "endTime": "2026-03-12T19:30:00.000Z",
    "locationText": "Barcelona Club",
    "radiusKm": 10,
    "responseWindowMinutes": 60,
    "candidateUserIds": ["<carlos-id>", "<pablo-id>"]
  }'
```

### 5. Start scheduling (sends first WhatsApp)

```bash
curl -X POST http://localhost:3000/scheduling/<request-id>/start
```

With mock provider, the server logs:

```
[MOCK WhatsApp] sendInviteMessage { phoneNumber: '34612345678', messagePreview: '...' }
```

### 6. Simulate webhook (candidate reply)

```bash
# Candidate Carlos accepts
curl -X POST http://localhost:3000/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "34612345678",
    "text": { "body": "YES" }
  }'
```

Or with a flatter body (controller supports multiple formats):

```bash
curl -X POST http://localhost:3000/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "34612345678",
    "body": { "text": "YES" }
  }'
```

For decline:

```bash
curl -X POST http://localhost:3000/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "34612345678",
    "body": { "text": "NO" }
  }'
```

Phone format: digits only. `User.phone` is matched after removing non-digits.

### 7. Trigger expiration manually

If you don’t want to wait for the cron:

1. Temporarily change `responseWindowMinutes` to 1.
2. Or call `expireWaitingCandidates` from a small script or debug endpoint.

Otherwise, with `JOBS_ENABLED=true`, the cron runs every 15 minutes and will expire candidates whose `contactedAt + responseWindowMinutes` is in the past.

---

## Webhook payload formats

The controller supports:

- **Whapi**: `body.messages[0]` with `from`, `text.body`, `from_me` (ignores `from_me` messages)
- **Flat**: `body.sender.phone`, `body.from`, or `body.contacts[0].wa_id` for sender
- **Message**: `body.body.text`, `body.text.body`, or `body.message` (string)

---

## Checklist before production

- [ ] Set `WHATSAPP_PROVIDER=whapi` and configure `WHAPI_TOKEN` / `WHAPI_URL`
- [ ] In Whapi panel: set webhook URL to `https://your-domain/whatsapp/webhook`
- [ ] Ensure `User.phone` is stored in E.164 (digits only) and matches provider format
- [ ] Set `JOBS_ENABLED=true` so the expiration cron runs
- [ ] Test full flow with real WhatsApp
