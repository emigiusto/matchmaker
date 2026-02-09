
# MatchMaker Backend (AceUp)

## Overview

This repository contains the backend for **MatchMaker / AceUp**, a guest-first sports matchmaking platform focused on **reducing coordination friction**, not rankings or court bookings.

The backend is intentionally designed around **explicit domain concepts** (Availability, Invite, Match) and **auditable user actions**, enabling:

- guest participation without registration
- WhatsApp / link-based flows without platform dependency
- deterministic match creation
- progressive enrichment (Player profiles, levels, social graph)

This is a **domain-driven backend**, not a CRUD API.

---

## Core Design Principles

### 1. Guest-First by Default
- Users can exist forever as guests (name / phone only).
- No authentication is required to accept an invite.
- All critical actions are link-based and explicit.

### 2. Invite-First Match Creation
- **All Matches are created via Invite acceptance.**
- Availability never creates a match directly.
- Even “accept availability” or “community match” UX flows are internally modeled as:

Availability → Invite → Accept Invite → Match


This guarantees:
- explicit consent
- auditability
- no race conditions
- consistent business rules

### 3. Clear Separation of Intent vs Commitment
- **Availability** = intent (“I could play”)
- **Invite** = proposal (“I propose we play”)
- **Match** = commitment (“We are playing”)

No entity blurs these responsibilities.

### 4. User vs Player Split
- **User** = identity, contact info, social graph
- **Player** = optional sports persona (level, preferences, stats)

Not all users are players. Player creation is **explicit and optional**.

### 5. Side Effects Are Not Domain State
- Notifications are stored as events, never as state transitions.
- If notifications fail, domain state still commits.
- No delivery assumptions (WhatsApp, email, push) exist in core services.

---

## Architecture

### Tech Stack
- **Node.js + Express**
- **TypeScript**
- **Prisma ORM (MySQL)**
- **Zod** for validation
- **Modular service-based structure**
- **Centralized error handling**

### High-Level Modules

| Module | Responsibility |
|------|---------------|
| users | Identity, guest users, contact info |
| players | Optional tennis persona |
| availability | When a user can play (intent only) |
| invites | Source of truth for match creation |
| matches | Immutable scheduled matches |
| friendships | Social graph (users + guest contacts) |
| groups | User collections (friends, informal clubs) |
| venues | Courts and locations |
| results | Match outcomes and sets |
| notifications | System events (delivery-agnostic) |
| messages | In-app conversations |
| jobs | Background tasks (expiration, cleanup, reminders) |

---

## Availability → Invite → Match Lifecycle

### Availability
- Created by a User
- Represents *potential availability*
- Does **not** create matches
- Can exist without ever being used

### Invite
- Created explicitly by a user or implicitly by the system
- Has a unique token and expiration
- Is the **only entity that can create a Match**
- Can be:
	- direct (to a specific person)
	- open / community (to compatible users)

### Match
- Created only after Invite acceptance
- Immutable once created
- May reference Players (if they exist)
- Can later receive Results, Conversations, Notifications

---

## Service Responsibility Boundaries

### AvailabilityService
- CRUD only
- User-scoped
- No Players
- No Matches
- No Notifications
- No acceptance logic

### InviteService
- **Single orchestrator of match creation**
- All acceptance logic lives here
- Handles expiration, status transitions, and atomicity
- Triggers side effects (notifications) after commit

### MatchService
- Read-only access to matches
- No creation logic

This separation is enforced intentionally to prevent architectural drift.

---

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

---

### 2. Create a MySQL Database

#### Using MySQL Workbench

```sql
CREATE DATABASE matchmaker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### Using MySQL CLI

```bash
mysql -u root -p
CREATE DATABASE matchmaker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit
```

---

### 3. Configure Environment

Copy `.env.example` to `.env` and set your variables:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/matchmaker"
ENVIRONMENT=DEVELOPMENT
```

---

### 4. Run Prisma Migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

### 5. Seed the Database (Development Only)

A comprehensive relational seeder is included for development and testing. It generates:

- users (guest + registered)
- players
- availabilities
- venues
- groups
- friendships
- invites
- matches
- results

> ⚠️ **WARNING:** Seeding is destructive and only allowed when `ENVIRONMENT=DEVELOPMENT`.

To run the seeder:

```bash
npm run seed
# or
npx tsx prisma/seeders/seed.ts
```

If you encounter connection issues, reduce batch sizes in:

`prisma/seeders/batchInsert.util.ts`

---

### 6. Start the Server

```bash
npm run dev
```

Server runs on: [http://localhost:3000](http://localhost:3000)

---

## API Usage

See the main repository README for:

- API examples
- Postman collections
- Frontend integration notes

---

## Troubleshooting

- Ensure MySQL is running and accessible
- Verify `DATABASE_URL`
- Run `npx prisma validate` for schema issues
- Check migration history if errors appear

---

## Roadmap / Future Phases

- Authentication & authorization
- Matchmaking service (level-based suggestions)
- Calendar sync
- Clubs & premium features
- Analytics & admin tooling

---

## Final Note

This backend intentionally favors:

- explicit actions over implicit magic
- links over messaging automation
- auditability over shortcuts
- long-term correctness over short-term convenience