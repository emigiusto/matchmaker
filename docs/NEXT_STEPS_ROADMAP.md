# Next Steps & Roadmap

Potential improvements and next steps for both repositories, plus a plan to migrate to mobile for native contact access.

---

## Backend – Potential Next Steps

| Priority | Item | Description |
|----------|------|-------------|
| High | **Render startup** | Ensure Start Command is `npm run start:prod` so migrations run on each deploy (DB_* env vars required). |
| High | **WhatsApp webhook signature** | Verify webhook requests (HMAC) so only Whapi/Wasender can POST. See [backend/docs/TECH_DEBT.md](backend/docs/TECH_DEBT.md). |
| Medium | **Competitive / Practice** | Reintroduce match type (competitive vs practice) in API and UI. See [backend/docs/TECH_DEBT.md](backend/docs/TECH_DEBT.md). |
| Medium | **Rate limiting** | Add rate limiting on auth, webhook, and scheduling endpoints. |
| Medium | ~~Health check~~ | Done. `GET /health` and `GET /` return DB + Redis connectivity. |
| Low | **API versioning** | Introduce `/v1/` prefix for future backward compatibility. |
| Low | **OpenAPI spec** | Auto-generate OpenAPI from Swagger for client generation. |

---

## Frontend – Potential Next Steps

| Priority | Item | Description |
|----------|------|-------------|
| High | **Wire mock data to API** | Replace `lib/mock-data.ts` usage with real services. See [frontend/docs/INTEGRATION_NOTES.md](frontend/docs/INTEGRATION_NOTES.md). |
| High | **API client consolidation** | Standardize on `api-client.ts` / services; deprecate `api.client.ts` and legacy `*.api.ts` files. |
| Medium | **Invite flow wiring** | Ensure InviteConfirm uses `invitesService.getByToken`, `accept`, `decline`. |
| Medium | **Candidate selection UX** | Improve how users pick friends/contacts for scheduling; depends on contact access (see mobile plan). |
| Medium | **Offline support** | Service worker for basic offline caching of dashboard/invites. |
| Low | **PWA manifest** | Add `manifest.json` for “Add to Home Screen” and basic PWA behavior. |
| Low | **Analytics / telemetry** | Optional analytics for usage and error tracking. |

---

## Mobile App Migration – Plan for Native Contact Pulling

On the web, access to the device contact list is limited. A mobile app enables direct contact picker integration and better UX for selecting invitees.

### Goal

Migrate (or extend) the frontend to a mobile app so users can:

- Pick contacts from their device when adding invitees
- Match phone numbers to existing users or create guest contacts
- Keep the same scheduling, invites, and match flows

### Recommended Approach: React Native (Expo)

| Factor | Notes |
|--------|-------|
| **Code reuse** | Reuse logic, types, and API layer; rebuild UI with React Native components. |
| **Contacts** | `expo-contacts` provides native contact access with permission prompts. |
| **Auth** | JWT-based auth works the same. |
| **Stack** | React, TypeScript, same backend. |

**Phases:**

1. **Setup** – Create `mobile/` (Expo) next to `frontend/`. Share API types and base URLs via a small shared package or copy.
2. **Auth** – Implement Login/Signup, JWT storage (secure store), protected navigation.
3. **Core flows** – Dashboard, I Want to Play, scheduling, invite confirm. Use native UI components.
4. **Contact picker** – Add `expo-contacts`; show contact list, filter by phone, map to users/guests.
5. **Push notifications** – `expo-notifications` for invites and reminders.

**Contacts integration example:**

```ts
import * as Contacts from 'expo-contacts';

const { status } = await Contacts.requestPermissionsAsync();
if (status === 'granted') {
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
  // Map to candidateUserIds or create GuestContacts via API
}
```

---

### Alternative: Capacitor (Wrap Existing Web App)

> **Detailed guide:** See [docs/CAPACITOR_MIGRATION.md](CAPACITOR_MIGRATION.md) for the full migration document.

| Factor | Notes |
|--------|-------|
| **Code reuse** | Reuse the full Vite/React frontend. |
| **Contacts** | Use `@capacitor-community/contacts` plugin. |
| **Trade-off** | Less native feel; still renders a WebView. |

**Phases:**

1. Add Capacitor to `frontend/`, run `npx cap add ios` and `npx cap add android`.
2. Install `@capacitor-community/contacts`, add permission handling.
3. Implement a “Pick from contacts” action that calls the plugin and returns phone numbers.
4. Map phone numbers to `User` or `GuestContact` via backend; feed into existing scheduling flow.
5. Build native apps with `npx cap sync` and open in Xcode/Android Studio.

---

### Comparison

| Criterion | React Native (Expo) | Capacitor |
|-----------|---------------------|-----------|
| Contact access | ✅ Native picker | ✅ Via plugin |
| Effort | Higher (new UI) | Lower (reuse web UI) |
| Performance | Native | WebView |
| Maintenance | Separate app | Single codebase |
| Best for | Long-term mobile-first | Quick MVP with contacts |

---

### Backend Impact

- No schema changes required for contact picking; backend already supports:
  - `User.phone` for existing users
  - `GuestContact` for invites to non-users
- Optional: endpoint to bulk-resolve phone numbers to users/guests for smoother UX.

---

*Last updated: 2026-03*
