# Next Steps: Connect v0 UI and Enable Real Match Scheduling

## Overview

To get end-to-end match scheduling with WhatsApp:

1. Configure Whapi webhook so YES/NO replies reach your backend
2. Connect the v0 frontend to the Render backend
3. Wire up scheduling UI and API
4. Deploy and test

---

## 1. Whapi Webhook Configuration

So that Whapi forwards incoming WhatsApp messages to your backend:

1. Go to [Whapi panel](https://panel.whapi.cloud) → your channel
2. Open **Settings** (top right)
3. In **Webhook**, set the URL to:
   ```
   https://<your-render-app>.onrender.com/whatsapp/webhook
   ```
4. Enable the **Messages** event (new message / edit / delete)
5. Click **Check webhook** to verify the connection

**Docs:** [Whapi – Set webhook link](https://support.whapi.cloud/help-desk/receiving/webhooks/set-the-webhook-link-to-the-channel)

---

## 2. Render Environment Variables

In the Render dashboard for your backend service, ensure:

| Variable | Example |
|----------|---------|
| `DB_HOST` | your Aiven host |
| `DB_USERNAME` | avnadmin |
| `DB_PASSWORD` | … |
| `DB_NAME` | matchmaker |
| `DB_PORT` | 19619 |
| `DB_SSL_ACCEPT` | accept_invalid_certs |
| `WHATSAPP_PROVIDER` | whapi |
| `WHAPI_TOKEN` | … |
| `WHAPI_URL` | https://gate.whapi.cloud |
| `WHATSAPP_BOT_NUMBER` | 34604131625 |
| `CORS_ORIGIN` | https://your-frontend.vercel.app |
| `APP_BASE_URL` | https://your-render-app.onrender.com |
| `JOBS_ENABLED` | true |

`CORS_ORIGIN` must include your frontend origin (Vercel URL).

---

## 3. Frontend API Configuration

### 3.1 API base URL

Create `frontend/.env` and/or `frontend/.env.production`:

```env
VITE_API_BASE_URL=https://your-render-app.onrender.com
```

Local dev:

```env
VITE_API_BASE_URL=http://localhost:3000
```

### 3.2 Update API client

Update `frontend/src/services/api.client.ts` so requests go to the backend:

```ts
const baseUrl = import.meta.env.VITE_API_BASE_URL || '';

export async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const url = typeof input === 'string' ? `${baseUrl}${input}` : input;
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'API Error');
  }
  return res.json();
}
```

### 3.3 Scheduling API client

Create `frontend/src/services/scheduling.api.ts`:

```ts
import { apiFetch } from './api.client';

export interface SchedulingRequest {
  id: string;
  hostUserId: string;
  sportType: string;
  format: 'singles' | 'doubles';
  date: string;
  startTime: string;
  endTime: string;
  locationText: string;
  status: string;
  candidates?: { contactUserName?: string; status: string }[];
  matchId?: string;
}

export async function createSchedulingRequest(body: {
  hostUserId: string;
  sportType: string;
  format?: string;
  matchType?: string;
  date: string;
  startTime: string;
  endTime: string;
  locationText: string;
  responseWindowMinutes?: number;
  candidateUserIds: string[];
  hostPartnerUserId?: string;
}) {
  return apiFetch<SchedulingRequest>('/scheduling', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function startScheduling(requestId: string) {
  return apiFetch<SchedulingRequest>(`/scheduling/${requestId}/start`, { method: 'POST' });
}

export async function listSchedulingRequests(hostUserId: string) {
  return apiFetch<SchedulingRequest[]>(`/scheduling?hostUserId=${hostUserId}`);
}

export async function getSchedulingRequest(requestId: string) {
  return apiFetch<SchedulingRequest>(`/scheduling/${requestId}`);
}

export async function getSchedulingByToken(token: string) {
  return apiFetch<SchedulingRequest>(`/scheduling/by-token/${token}`);
}

export async function listIncomingInvites(userId: string) {
  return apiFetch<SchedulingRequest[]>(`/scheduling/incoming?userId=${userId}`);
}
```

---

## 4. Scheduling UI in v0

In your v0-generated or custom UI:

1. **Create scheduling request** – Form with date, time, location, sport, candidates.
2. **Start scheduling** – Button that calls `startScheduling(requestId)` to send the first WhatsApp.
3. **List requests** – Show host’s scheduling requests and their status.
4. **Incoming invites** – For candidates, show pending invites (optional if they only use WhatsApp).

You need at least:

- A way to select the current user (or guest auth) to get `hostUserId`.
- A way to pick candidate users (e.g. friends or contacts with phones) for `candidateUserIds`.

---

## 5. Users and Phones

For WhatsApp to work:

- Every candidate must have a `User` record with `phone` in E.164 (e.g. `34612345678`).
- Use your seed or API to create users with phone numbers.
- The frontend (or backend) must ensure chosen candidates have phones before creating a scheduling request.

---

## 6. Deploy and Test

1. Deploy frontend to Vercel (or your host).
2. Set `VITE_API_BASE_URL` to your Render backend URL in Vercel env.
3. In Render, set `CORS_ORIGIN` to your Vercel URL (e.g. `https://your-app.vercel.app`).
4. In Whapi, confirm the webhook URL and that the Messages event is enabled.

**Manual test:**

1. Create users (host + candidates) with phones.
2. Create a scheduling request from the UI.
3. Click “Start scheduling” – first candidate should get a WhatsApp.
4. Reply YES or NO on WhatsApp.
5. If YES: match is created. If NO: next candidate is contacted.

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /scheduling | Create request |
| POST | /scheduling/:id/start | Start (send first WhatsApp) |
| GET | /scheduling?hostUserId= | List host’s requests |
| GET | /scheduling/:id | Get one request |
| GET | /scheduling/by-token/:token | Get by invite token |
| GET | /scheduling/incoming?userId= | List incoming invites for user |
| GET | /users | List users (for picking host/candidates) |

---

## Troubleshooting

- **CORS errors** – Add the frontend origin to `CORS_ORIGIN` on Render.
- **Webhook not called** – Check Whapi Settings: correct URL, Messages event enabled, HTTPS.
- **“User not found” when replying** – Ensure `User.phone` matches the sender’s number (digits only).
