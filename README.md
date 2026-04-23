# Matchmaker

Matchmaker is a sports matchmaking platform that cuts the friction of organizing matches. Players submit availability, organizers send invites via unique time-limited links, and the system handles the rest — including optional automated court booking at partner clubs.

WhatsApp is used only as a notification delivery channel, never for parsing replies. All confirmations go through explicit links.

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, React Router 7, TailwindCSS 4, Radix UI |
| **Backend** | Node.js 20, Express 5, TypeScript, Prisma 6 (MySQL) |
| **Automation** | Puppeteer 24 (court booking via browser), node-cron (background jobs) |
| **Auth** | JWT + bcrypt |
| **Testing** | Vitest 4 (90% coverage thresholds) |
| **Deploy** | Render.com, Docker |

## Core Flows

```
Availability  →  Invite  →  Accept (unique link)  →  Match
```

1. **Availability** — Players submit when/where they can play
2. **Invite** — Organizer sends a unique, time-limited link to a candidate
3. **Confirmation** — Player accepts/declines via the link (no login required)
4. **Match** — Created only on acceptance; immutable from that point

Matches are never created directly — only through invite acceptance. This guarantees explicit consent and a full audit trail.

## Features

- **Scheduling automation** — Multi-candidate scheduling requests with configurable response windows (15m → 72h). System moves to the next candidate on decline or timeout, up to 5 active requests per user.
- **Court booking** — Puppeteer-based automation for booking courts at partner clubs (adapter pattern: Laieta, miclubonline). Credentials stored encrypted per membership.
- **Guest-first** — Players can accept invites and participate without creating an account.
- **Contact management** — Unified address book with optional club socio numbers and native contact import.
- **Rating system** — ELO algorithm with history tracking, tied to match results.
- **WhatsApp integration** — Provider abstraction (mock / Whapi / Wasender) with message templates and locale support.
- **In-app notifications & reminders** — Event-driven, delivery-agnostic. Background job sends match reminders.
- **Add to calendar** — Google Calendar and ICS export from match details, using the actual booked end time.
- **AI Coach** — Insights and companion features for players.
- **i18n** — English and Spanish.

## Project Structure

```
matchmaker/
├── frontend/          # React SPA
│   └── src/
│       ├── pages/     # Dashboard, Play, Matches, Contacts, Profile, ...
│       ├── components/
│       └── lib/       # API client, types, i18n, services
└── backend/           # Express API
    └── src/
        └── modules/
            ├── auth/
            ├── users/
            ├── players/
            ├── availabilities/
            ├── matches/
            ├── matchmaking/
            ├── scheduling/
            ├── booking/
            ├── contacts/
            ├── venues/
            ├── results/
            ├── rating/
            ├── notifications/
            ├── reminders/
            ├── jobs/
            ├── whatsapp/
            └── health/
```

## Local Development

### Prerequisites

- Node.js 20+
- MySQL 8.0+

### Backend

```bash
cd backend
npm install

# Create .env.local — see .env.example for all variables
# Minimum required:
#   DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD
#   ENVIRONMENT=DEVELOPMENT
#   JWT_SECRET

npm run migrate:dev       # Run migrations
npm run seed              # Seed dev data (requires ENVIRONMENT=DEVELOPMENT)
npm run dev               # Start on http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev               # Start on http://localhost:5173
```

### Key backend env vars

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection string (or use `DB_*` vars) |
| `ENVIRONMENT` | `DEVELOPMENT` or `PRODUCTION` |
| `JWT_SECRET` | Token signing key |
| `WHATSAPP_PROVIDER` | `mock` (dev), `whapi`, or `wasender` |
| `BOOKING_SUBMIT_ENABLED` | `true` to actually submit court bookings |
| `JOBS_ENABLED` | `true` to enable background cron jobs |
| `REDIS_URL` | Optional — used for caching |

## Testing

```bash
cd backend
npm test              # Run all tests (vitest)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Coverage thresholds: **90% lines/statements/functions, 85% branches.**

Tests are also run as part of the Docker build, so a failing test aborts the deploy.

## Deployment

The backend deploys to Render as a Docker service. Tests run during the image build — if they fail, the deploy is cancelled.

**Build order:**
1. `npm ci`
2. `npx prisma generate`
3. `npm test`
4. `npm run build` (TypeScript compile)

**On startup:** `npx prisma migrate deploy && node dist/server.js`

The `render.yaml` at the repo root defines the service configuration.

## Architecture Notes

- **User ≠ Player** — A User is an identity (auth, contacts). A Player is an optional sports persona (level, stats). Not all users are players.
- **Intent ≠ Commitment** — Availability is intent. A Match is a commitment, created only through explicit invite acceptance.
- **Side effects are not domain state** — Notifications and WhatsApp messages are fire-and-forget. If delivery fails, the domain transaction still commits.
- **No group chat replies** — WhatsApp is outbound-only for links. All state changes go through unique per-action URLs.
