# Next Steps & Roadmap

*Last updated: 2026-03-16*

---

## Backend

| Priority | Item | Description |
|----------|------|-------------|
| High | **Apply pending migrations** | Run `npx prisma migrate deploy` with `DATABASE_URL` set: adds `User.locale` and drops the `Invite` table. Also run `npx prisma generate` to regenerate the client. |
| ~~High~~ ✅ | ~~**SocioNumber → ClubMembership**~~ | Fixed: `acceptViaLink` now upserts a `ClubMembership` for the guest (deriving `clubSlug`/`adapterType` from the host's active membership). |
| ~~High~~ ✅ | ~~**WhatsApp webhook signature**~~ | Fixed: `verifyWebhookSignature` middleware added to `POST /whatsapp/webhook`. Set `WHAPI_WEBHOOK_SECRET` / `WASENDER_WEBHOOK_SECRET` in production to activate. |
| Medium | **Competitive / Practice in UI** | Restore match type selector in wizard and badges across Dashboard, Matches, MatchDetails. See [TECH_DEBT.md](../backend/docs/TECH_DEBT.md). |
| Medium | **Rate limiting** | Add rate limiting on auth, webhook, and `/scheduling/join/:token/accept` endpoints. |
| Medium | **Reminder locale** | `reminder.job.ts` resolves user locale via `(user as any).locale` — add `locale` to the Prisma select and remove the cast. |
| Low | **API versioning** | Introduce `/v1/` prefix for future backward compatibility. |
| Low | **OpenAPI spec** | Auto-generate OpenAPI from controllers for client SDK generation. |

---

## Frontend

| Priority | Item | Description |
|----------|------|-------------|
| High | **JoinRequest socioNumber UX** | Conditionally show the socio number field only for clubs with `bookingEnabled=true`; validate format per club (e.g. numeric-only for miclubonline). |
| Medium | **Candidate selection UX** | Improve how users pick friends/contacts for scheduling; depends on contact access (see mobile plan below). |
| Medium | **Locale selector in profile** | Allow users to change `User.locale` (currently defaults to `"es"`). Changing it updates WhatsApp message language for that user. |
| Medium | **Offline support** | Service worker for basic offline caching of dashboard and match views. |
| Low | **PWA manifest** | Add `manifest.json` for "Add to Home Screen" and basic PWA behavior. |
| Low | **Analytics / telemetry** | Optional error tracking and usage analytics. |

---

## Mobile App Migration – Plan for Native Contact Pulling

On the web, access to the device contact list is limited. A mobile app enables direct contact picker integration and better UX for selecting invitees.

### Goal

Migrate (or extend) the frontend to a mobile app so users can:

- Pick contacts from their device when adding scheduling candidates
- Match phone numbers to existing users or create guest contacts
- Keep the same scheduling and match flows

### Recommended Approach: React Native (Expo)

| Factor | Notes |
|--------|-------|
| **Code reuse** | Reuse logic, types, and API layer; rebuild UI with React Native components. |
| **Contacts** | `expo-contacts` provides native contact access with permission prompts. |
| **Auth** | JWT-based auth works the same. |
| **Stack** | React, TypeScript, same backend. |

**Phases:**

1. **Setup** — Create `mobile/` (Expo) next to `frontend/`. Share API types via a small shared package or copy.
2. **Auth** — Login/Signup, JWT storage (secure store), protected navigation.
3. **Core flows** — Dashboard, I Want to Play, scheduling, join-via-link. Native UI components.
4. **Contact picker** — `expo-contacts`; show contact list, filter by phone, map to users/guests.
5. **Push notifications** — `expo-notifications` for scheduling invites and match reminders.

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

> **Detailed guide:** See [CAPACITOR_MIGRATION.md](CAPACITOR_MIGRATION.md).

| Factor | Notes |
|--------|-------|
| **Code reuse** | Reuse the full Vite/React frontend. |
| **Contacts** | `@capacitor-community/contacts` plugin. |
| **Trade-off** | Less native feel; renders a WebView. |

**Phases:**

1. Add Capacitor to `frontend/`, run `npx cap add ios` and `npx cap add android`.
2. Install `@capacitor-community/contacts`, add permission handling.
3. Implement "Pick from contacts" → returns phone numbers.
4. Map phones to `User` or `GuestContact` via backend; feed into scheduling flow.
5. Build with `npx cap sync` and open in Xcode / Android Studio.

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

No schema changes required for contact picking. Backend already supports:

- `User.phone` for existing users
- `GuestContact` for non-users
- Optional: bulk phone-number resolver endpoint for smoother UX.
