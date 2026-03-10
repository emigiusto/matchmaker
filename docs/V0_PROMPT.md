# V0 Prompt: Match Scheduling UI

Copy the prompt below into [V0](https://v0.dev) to generate a React UI that connects to the MatchMaker scheduling API.

---

## Prompt for V0

```
Build a tennis/padel match scheduling UI that connects to a REST API. The app lets a host create a scheduling request, pick candidates from their friends, and start WhatsApp invites. Candidates reply YES/NO on WhatsApp (handled by webhook); the UI shows status.

## Tech requirements
- React + TypeScript
- Tailwind CSS
- Use environment variable VITE_API_BASE_URL for the API base (e.g. https://my-api.onrender.com)
- All API calls: fetch to `${API_BASE}${path}` with Content-Type: application/json

## API Base URL
- Read from import.meta.env.VITE_API_BASE_URL (empty string for same-origin)
- Example: const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

## User flow
1. **User selection**: User picks themselves as host (or we use a stored/selected userId for now—no auth)
2. **Create scheduling request**: Form with date, time, location, sport, format (singles/doubles), response window, and candidate picker
3. **Start scheduling**: Button to start → sends first WhatsApp to first candidate
4. **Status view**: List of host's scheduling requests with candidate statuses (pending, waiting_reply, accepted, declined, expired)
5. **Incoming invites** (optional): For a candidate user, show scheduling requests where they are a candidate and status is waiting_reply

## API Endpoints (all return JSON)

### Users
- **GET /users** – Array of { id, name, phone?, email?, isGuest }
  - Use to list users for picking host and to fetch user names
- **GET /users/:id** – Single user
- **POST /users/guest** – Create guest: body { name, phone }, returns user

### Friends (for candidate picker)
- **GET /friendships?userId={userId}** – Array of { type: 'user'|'guestContact', id, name, phone? }
  - For type 'user', id is the User ID (use for candidateUserIds)
  - Filter to users with phone for scheduling (WhatsApp requires it). Guest contacts cannot be candidates.

### Scheduling
- **POST /scheduling** – Body: hostUserId, sportType ("tennis"|"padel"), format ("singles"|"doubles"), matchType ("competitive"|"practice"), date (YYYY-MM-DD), startTime, endTime (ISO 8601), locationText, radiusKm (optional), responseWindowMinutes (30|60|120|240|600|1440), candidateUserIds (array of user UUIDs), hostPartnerUserId (required for doubles only)
- **POST /scheduling/:requestId/start** – No body. Starts scheduling, sends first WhatsApp.
- **GET /scheduling?hostUserId={userId}** – List host's requests
- **GET /scheduling/:requestId** – Get one request with candidates array
- **GET /scheduling/incoming?userId={userId}** – Requests where user is a candidate
- **GET /scheduling/active-count?hostUserId={userId}** – Returns { count } (max 3)
- **POST /scheduling/:requestId/pause** – Body { userId }
- **POST /scheduling/:requestId/resume** – Body { userId }
- **POST /scheduling/:requestId/cancel** – Body { userId }

### SchedulingRequest response shape
id, hostUserId, hostPartnerUserId, sportType, format, matchType, date, startTime, endTime, locationText, radiusKm, responseWindowMinutes, inviteToken, status (active|paused|completed|expired|cancelled), currentCandidateIndex, matchId, candidates (array of: id, contactUserId, contactUserName, priorityOrder, status (pending|contacted|waiting_reply|accepted|declined|expired), contactedAt, responseAt)

## UI components to build

1. **Host selector** – Dropdown to set current userId (for demo; no auth yet)
2. **Create scheduling form** – Date, start/end time, location, sport (tennis/padel), format (singles/doubles), match type, response window, candidate multi-select (from friends with phone)
3. **Scheduling requests list** – Cards for each request: date, location, sport, status, candidates with status badges
4. **Start button** – On each active request, "Start" sends first WhatsApp
5. **Incoming invites** – List of requests where current user is candidate with status waiting_reply (optional)
6. **Error handling** – Show API errors (400, 404, etc.) in toast or inline

## Date/time format
- date: YYYY-MM-DD
- startTime, endTime: ISO 8601. Combine date + time, e.g. date "2026-03-15" + start "18:00" → "2026-03-15T18:00:00.000Z" (use user's timezone or UTC)

## Validation
- At least 1 candidate required
- Max 3 active scheduling requests per host
- Candidates must be users with phone for WhatsApp
```

---

## Usage

1. Copy the entire prompt (from "Build a tennis/padel match scheduling UI" through the closing triple backticks)
2. Paste into [v0.dev](https://v0.dev) chat
3. V0 will generate components; iterate as needed
4. Add VITE_API_BASE_URL to your frontend .env pointing to your Render backend
5. Deploy frontend; set CORS_ORIGIN on backend to your frontend URL

## API base path note

The backend mounts routes at root. No `/api` prefix. Paths are:
- `/users`, `/users/:id`, `/users/guest`
- `/friendships?userId=`
- `/scheduling`, `/scheduling/:id`, `/scheduling/:id/start`, etc.
