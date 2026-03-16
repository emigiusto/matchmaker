# Contacts System Redesign

## Problem Statement

The current system has three overlapping, poorly-integrated models:

| Model | Purpose | Issues |
|---|---|---|
| `GuestContact` | Non-user contacts owned by a user | No list/group support; socio number has no club context |
| `Friendship` | Social graph edges (user ↔ user or user ↔ guest) | Dual-pointer design is confusing; no management UI |
| `Group` / `GroupMember` | Named lists of users only | No GuestContacts allowed; no management UI |

The wizard Step 3 exposes all three through separate "Friends" / "All Contacts" / "From Lists" buttons, which is hard to understand.

---

## Goal

Replace all three models with a single, unified system:

- **`Contact`** — one record per person you know (user or non-user)
- **`ContactList`** — a named list you own (replaces Group)
- **`ContactListMember`** — many-to-many: which contacts belong to which list

One `/contacts` page manages everything. The wizard Step 3 becomes: pick from your contacts / lists, or add one manually.

---

## Future: Mobile Native Contacts

The app will eventually ship as a mobile app with access to the device's native contact book. The `Contact` model must support this from day one:

- An `importSource` field (`"manual"` | `"native"` | `"whatsapp"` | `null`) tracks where each contact came from
- A `externalId` field stores the native contact ID (device-specific) for deduplication on re-import
- At import time, phone number normalization + `externalId` matching prevents duplicates
- Contacts imported from the native book can still be linked to a registered app user via `linkedUserId`

This means **no schema change is needed when mobile arrives** — only new import logic.

---

## New Prisma Schema

### `Contact`

Replaces `GuestContact` + `Friendship`.

```prisma
model Contact {
  id          String   @id @default(uuid())
  ownerUserId String
  name        String
  phone       String   // E.164, required
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // If this phone matches a registered user, link them
  linkedUserId String?

  // Socio numbers per club connection (JSON map: clubSlug → socioNumber)
  // e.g. { "laieta": "12345" }
  socioNumbers Json @default("{}")

  // Import metadata (for future mobile native contacts)
  importSource String? // "manual" | "native" | "whatsapp"
  externalId   String? // device contact ID for deduplication on re-import

  owner       User  @relation("OwnedContacts", fields: [ownerUserId], references: [id])
  linkedUser  User? @relation("LinkedContacts", fields: [linkedUserId], references: [id])

  listMemberships ContactListMember[]

  @@unique([ownerUserId, phone])          // one contact per phone per owner
  @@unique([ownerUserId, externalId])     // dedup on native re-import
  @@index([ownerUserId])
  @@index([linkedUserId])
}
```

Key decisions:
- `socioNumbers` is a JSON map (clubSlug → socioNumber) rather than a separate table. This avoids a join for a rare field and keeps the model simple. If the socio data grows complex, it can be normalized later.
- `phone` is required. Anyone contactable in the matchmaker must have a phone.
- `linkedUserId` is nullable — set automatically when a registered user with the same phone is found.

### `ContactList`

Replaces `Group`.

```prisma
model ContactList {
  id          String   @id @default(uuid())
  ownerUserId String
  name        String
  createdAt   DateTime @default(now())

  owner   User                @relation("OwnedContactLists", fields: [ownerUserId], references: [id])
  members ContactListMember[]

  @@index([ownerUserId])
}
```

### `ContactListMember`

Replaces `GroupMember`. Now supports both registered users and contacts.

```prisma
model ContactListMember {
  id            String   @id @default(uuid())
  contactListId String
  contactId     String
  addedAt       DateTime @default(now())

  contactList ContactList @relation(fields: [contactListId], references: [id], onDelete: Cascade)
  contact     Contact     @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([contactListId, contactId])
  @@index([contactListId])
  @@index([contactId])
}
```

### User model additions

```prisma
// In User model:
ownedContacts      Contact[]     @relation("OwnedContacts")
linkedAsContact    Contact[]     @relation("LinkedContacts")
ownedContactLists  ContactList[] @relation("OwnedContactLists")
```

### Models to remove

- `GuestContact`
- `Friendship`
- `Group`
- `GroupMember`

---

## Migration Path

### Phase 1 — Add new models (non-breaking)

1. Add `Contact`, `ContactList`, `ContactListMember` to schema
2. Keep old models in place (no data loss)
3. Deploy

### Phase 2 — Migrate existing data

Run a one-time migration script (can be a Prisma seed or standalone script):

```
For each GuestContact gc owned by user U:
  → Create Contact { ownerUserId: U, name: gc.name, phone: gc.phone,
                     socioNumbers: gc.socioNumber ? { [defaultClubSlug]: gc.socioNumber } : {},
                     importSource: "manual" }
  → Attempt to link: find User with phone = gc.phone → set linkedUserId

For each Friendship f (userId U, friendUserId FU where FU != null):
  → Ensure Contact exists for FU's phone under owner U
    (FU is a registered user — pull phone from User.phone)

For each Group g owned by user U:
  → Create ContactList { ownerUserId: U, name: g.name }
  → For each GroupMember gm in g:
      → Find Contact for gm.userId under owner U → add to list
```

Notes:
- `socioNumber` is migrated under the key `"laieta"` — the only club currently in use.
- If a GuestContact has no matching Contact yet, create it during migration.
- Migration is idempotent (check `@@unique([ownerUserId, phone])` before inserting).

### Phase 3 — Switch all call sites to new models

- Update `guest-contacts` module → `contacts` module
- Update wizard Step 3 data fetching
- Update `candidateUserIds` resolution (see below)
- Remove old models from schema

---

## `candidateUserIds` Resolution

Scheduling always works with `userId` values. The resolution logic:

```
Contact.linkedUserId != null → use linkedUserId directly
Contact.linkedUserId == null → call ensureUserByPhone(phone, name) → get/create shadow User → cache linkedUserId back on Contact
```

This is the same as today's `ensureUserByPhone`, but now the link is stored durably on `Contact.linkedUserId` so subsequent wizard opens skip the lookup.

---

## Backend Module: `contacts`

Replace `guest-contacts` module entirely.

### Routes

```
GET    /contacts              → list all contacts for current user
POST   /contacts              → create contact (manual)
PATCH  /contacts/:id          → update name, socioNumbers
DELETE /contacts/:id          → delete contact

GET    /contacts/lists        → list all contact lists
POST   /contacts/lists        → create list
PATCH  /contacts/lists/:id    → rename list
DELETE /contacts/lists/:id    → delete list (cascade members)

POST   /contacts/lists/:id/members          → add contact to list
DELETE /contacts/lists/:id/members/:contactId → remove contact from list

POST   /contacts/import/native              → future: bulk upsert from device contact book
```

### Service functions

```ts
// Contacts
createContact(ownerUserId, { name, phone, importSource?, externalId? }): Contact
listContacts(ownerUserId): Contact[]          // includes linkedUser.name
updateContact(id, ownerUserId, patch): Contact
deleteContact(id, ownerUserId): void
linkContactToUser(contactId): void            // internal: sets linkedUserId

// Lists
createContactList(ownerUserId, name): ContactList
listContactLists(ownerUserId): ContactListWithMembers[]
renameContactList(id, ownerUserId, name): ContactList
deleteContactList(id, ownerUserId): void
addMemberToList(listId, contactId): ContactListMember
removeMemberFromList(listId, contactId): void

// Resolution
resolveContactUserId(contactId): Promise<string>   // returns userId, creates shadow user if needed
```

### DTOs

```ts
interface ContactDTO {
  id: string
  name: string
  phone: string
  socioNumbers: Record<string, string>   // clubSlug → socioNumber
  linkedUserId: string | null
  linkedUserName: string | null
  importSource: string | null
  createdAt: string
}

interface ContactListDTO {
  id: string
  name: string
  members: ContactDTO[]
}
```

---

## Frontend: `/contacts` Page

A single page under the main nav. Replaces the profile's inline guest contact panel.

### Layout

```
[ + New Contact ]  [ + New List ]

Search: [____________]

─── Lists ──────────────────────────────────
  "Thursday Team" (4)   [Edit] [Delete]
  "Padel Group"   (3)   [Edit] [Delete]

─── All Contacts ───────────────────────────
  Maria García    +34 612 345 678   [Laieta: 4521]  [Edit] [Delete]
  Joan Puig       +34 633 111 222   (App user ✓)    [Edit] [Delete]
  ...
```

### Contact card detail

- Name (editable)
- Phone (read-only once set — phone is identity)
- App user status badge (linked / not linked)
- Socio number per club: shows club name + number, with inline edit (same pattern as today)
- Lists membership: chips showing which lists contain this contact

### New Contact modal

```
Name:        [____________]
Phone:       [____________]  (E.164, validated)
Add to list: [dropdown, optional]
```

### New List modal

```
List name:   [____________]
```

Members are added from the contact list view (checkbox multi-select).

---

## Wizard Step 3 Simplification

Replace three source buttons (Friends / All Contacts / From Lists) with two:

```
[ + From Contact Lists ]   [ + From All Contacts ]
```

And manual add remains at the bottom.

Data fetch on wizard open:

```ts
const contacts = await contactsService.listContacts(userId)
const lists    = await contactsService.listContactLists(userId)
```

That's two calls replacing four (users, friends, guestContacts, groups).

The priority list items are always `Contact` objects. When the user submits, `resolveContactUserId` converts each to a `userId` for `candidateUserIds`.

**Socio numbers in wizard**: pulled from `contact.socioNumbers[activeClubSlug]` — no separate fetch, no inline edit in the wizard. If they want to edit, they go to `/contacts`.

**"Add new person" flow**: replaces the old "All users in the system" search. The user types a name + phone; if that phone is not in their contacts, it is created on the spot (importSource: `"manual"`) and immediately added to the priority list. If the phone already exists, show: *"You already have [Name] at this number"* and add the existing contact instead.

---

## Socio Numbers: Club Context

Today `GuestContact.socioNumber` is a single string with no club context. The new `Contact.socioNumbers` is a JSON map:

```json
{ "laieta": "12345", "miclubonline": "678" }
```

The booking service reads it like:

```ts
const socioNumber = contact.socioNumbers[membership.clubSlug]
```

This is backward-compatible: migrated data uses the existing club slug as the key.

---

## Native Contacts Import (Future)

When the mobile app is ready:

1. The device provides a list of `{ name, phone, nativeId }` records
2. The app calls `POST /contacts/import/native` with the batch
3. The service upserts by `(ownerUserId, externalId)` for previously-imported contacts
4. For new entries, it also checks `(ownerUserId, phone)` to avoid duplicating a manually-added contact
5. Sets `importSource: "native"`, `externalId: nativeId`
6. Immediately attempts `linkContactToUser` for each

UI reconciliation: contacts with `importSource: "native"` get a "From phone book" badge. If the same person exists both as a manual contact and a native import (matched by phone), they are merged — the manual record wins, the native `externalId` is added to it.

---

## Files to Change

| Area | File | Change |
|---|---|---|
| Schema | `backend/prisma/schema.prisma` | Add Contact, ContactList, ContactListMember; remove GuestContact, Friendship, Group, GroupMember |
| Migration | `backend/prisma/migrations/` | New migration file |
| Data migration | `backend/prisma/seed-migration.ts` (new) | One-time script to port existing data |
| Backend module | `backend/src/modules/contacts/` (new) | contacts.service.ts, .controller.ts, .routes.ts, .types.ts, .validators.ts |
| Backend module | `backend/src/modules/guest-contacts/` | Delete after migration |
| Scheduling | `backend/src/modules/scheduling/scheduling.service.ts` | Replace GuestContact lookups with Contact.linkedUserId resolution |
| Frontend service | `frontend/src/lib/services/contacts.service.ts` (new) | CRUD for contacts and lists |
| Frontend service | `frontend/src/lib/services/guest-contacts.service.ts` | Delete after migration |
| Frontend page | `frontend/src/pages/Contacts/Contacts.tsx` (new) | Full contacts management UI |
| Frontend wizard | `frontend/src/components/i-want-to-play-wizard.tsx` | Simplify Step 3 data fetching and source buttons |
| Frontend profile | wherever guest contacts are shown inline | Remove inline panel; link to `/contacts` |
| i18n | `en.json`, `es.json` | Add contacts page keys; remove guest-contact keys |
| Nav | sidebar / nav component | Add `/contacts` route |

---

## What Does NOT Change

- `ensureUserByPhone` logic — still needed for new contacts, now stored on `Contact.linkedUserId`
- WhatsApp messaging — no change
- `candidateUserIds` array in `SchedulingRequest` — still `string[]` of user IDs
- Booking adapter — reads socio from contact before creating match; same call, new field path
- Auth / sessions — unrelated

---

## Decisions

1. **Default club slug for socio migration**: Hardcode `"laieta"` — it is the only club currently in use.

2. **Phone editability**: Phone is immutable after creation. To change a contact's phone, delete and re-add. This keeps the uniqueness constraint simple and avoids re-linking edge cases.

3. **Wizard Step 3 — "Find someone new"**: Keep an "Add new person" flow in the wizard. When the user searches for a name/phone that does not exist in their contacts, the wizard offers to create the contact on the spot (same as today's manual add). This replaces the old "All users in the system" search — you can only invite people you have added as contacts.

4. **Contact deduplication**: If the user tries to add a phone that already exists in their contacts, show a clear inline error: *"You already have [Name] at this number."* Do not silently merge or update — the user must decide whether to delete the existing contact first or use a different phone. This avoids accidental overwrites.
