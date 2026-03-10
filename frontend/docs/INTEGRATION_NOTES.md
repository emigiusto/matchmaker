# v0 Integration Notes

## Duplicate / Overlapping Functionality

The following overlap with existing project code. Consider consolidating:

| Area | v0 / New | Existing | Action |
|------|----------|----------|--------|
| **API client** | `src/lib/services/api-client.ts` | `src/services/api.client.ts` | Use `api-client.ts` (richer). `api.client.ts` has `apiFetch` — migrate any callers or remove. |
| **Invites API** | `src/lib/services/invites.service.ts` | `src/services/invites.api.ts` | Services use `apiClient`; `invites.api.ts` uses `apiFetch`. Wire pages to `invitesService` and deprecate `invites.api.ts`. |
| **Matches API** | `src/lib/services/matches.service.ts` | `src/services/matches.api.ts` | Same pattern. Prefer `matchesService`. |
| **Availability** | `src/lib/services/availability.service.ts` | `src/services/availability.api.ts` | Prefer `availability.service.ts`. |
| **Invite page** | `src/pages/InviteConfirm/InviteConfirm.tsx` | (was stub) | v0 implementation in place. Wire to `invitesService.getByToken`, `accept`, `decline`. |
| **Match details** | `src/pages/MatchDetails/MatchDetails.tsx` | (was stub) | v0 implementation in place. Wire to `matchesService.getById`. |

## Mock Data → API Wiring

All components using `@/lib/mock-data` have `TODO: wire to API` comments. Summary:

| Component / Page | Replace with |
|------------------|--------------|
| `lib/mock-data.ts` | matchesService, invitesService, matchmakingService, notificationsService, playersService |
| `notifications-dropdown.tsx` | notificationsService.list() |
| `InviteConfirm` | invitesService.getByToken, accept, decline |
| `Dashboard` | matchmakingService, invitesService, matchesService |
| `Play` | schedulingService, invitesService |
| `Suggested` | matchmakingService.getSuggestions() |
| `MatchesUpcoming` | matchesService.getUpcoming() |
| `MatchesPast` | matchesService.getPast() |
| `MatchDetails` | matchesService.getById() |
| `Rankings` | playersService (rankings) |
| `Profile` | playersService.getByUserId() |
| `ProfileView` | playersService.getByUserId() |
| `Notifications` | notificationsService.list() |
| `AiCoachCompanion` | matchesService.getUpcoming() |
| `Reminders` | (no mock import; may need reminders API) |

## Environment

Add to `.env.local` (or similar):

```
VITE_API_BASE_URL=http://localhost:3000
```

Backend serves routes at `/invites`, `/matches`, etc. (no `/api` prefix by default).
