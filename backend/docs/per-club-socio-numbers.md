# Per-Club Socio Numbers for Contacts

## Problem

`GuestContact.socioNumber` is a single optional field. This assumes a contact belongs to at most one club — which is wrong. A person can be a member of multiple clubs, each with a different socio number (e.g. socio 1234 at Laieta, socio 5678 at another club).

The current data model breaks as soon as a second club adapter is added.

## Current State

```prisma
model GuestContact {
  id          String   @id
  ownerUserId String
  name        String
  phone       String
  socioNumber String?  // ← single field, club-agnostic
  ...
}
```

During booking (`booking.service.ts › runBookingJob`), participant socio numbers are looked up as:
1. Check `ClubMembership` for the participant at the same `clubSlug` as the host
2. Fall back to `GuestContact.socioNumber` (ignores which club is being booked)

The fallback in step 2 is wrong: it uses whatever socio number is stored, regardless of which club the booking is for.

## Proposed Solution

Replace `GuestContact.socioNumber` with a `GuestContactMembership` join table — one row per (contact, club).

### New Schema

```prisma
model GuestContact {
  id          String   @id @default(uuid())
  ownerUserId String
  name        String
  phone       String
  createdAt   DateTime @default(now())

  owner        User                     @relation(fields: [ownerUserId], references: [id])
  friendships  Friendship[]
  memberships  GuestContactMembership[]

  @@index([ownerUserId])
  @@index([phone])
}

model GuestContactMembership {
  id             String       @id @default(uuid())
  guestContactId String
  clubSlug       String
  socioNumber    String
  createdAt      DateTime     @default(now())

  guestContact   GuestContact @relation(fields: [guestContactId], references: [id], onDelete: Cascade)

  @@unique([guestContactId, clubSlug])
  @@index([guestContactId])
  @@index([clubSlug])
}
```

## Implementation Plan

### 1. Migration (SQL)

```sql
-- Create GuestContactMembership table
CREATE TABLE "GuestContactMembership" (
  "id"             TEXT NOT NULL,
  "guestContactId" TEXT NOT NULL,
  "clubSlug"       TEXT NOT NULL,
  "socioNumber"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestContactMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestContactMembership_guestContactId_clubSlug_key"
  ON "GuestContactMembership"("guestContactId", "clubSlug");

CREATE INDEX "GuestContactMembership_guestContactId_idx"
  ON "GuestContactMembership"("guestContactId");

CREATE INDEX "GuestContactMembership_clubSlug_idx"
  ON "GuestContactMembership"("clubSlug");

ALTER TABLE "GuestContactMembership"
  ADD CONSTRAINT "GuestContactMembership_guestContactId_fkey"
  FOREIGN KEY ("guestContactId") REFERENCES "GuestContact"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data → laieta (the only supported club today)
INSERT INTO "GuestContactMembership" ("id", "guestContactId", "clubSlug", "socioNumber", "createdAt")
SELECT gen_random_uuid()::text, "id", 'laieta', "socioNumber", NOW()
FROM "GuestContact"
WHERE "socioNumber" IS NOT NULL AND "socioNumber" <> '';

-- Drop the old column
ALTER TABLE "GuestContact" DROP COLUMN "socioNumber";
```

---

### 2. Backend Types (`guest-contacts.types.ts`)

```typescript
export interface GuestContactClubMembership {
  clubSlug: string;
  socioNumber: string;
}

export interface GuestContactDTO {
  id: string;
  ownerUserId: string;
  name: string;
  phone: string;
  memberships: GuestContactClubMembership[];  // replaces socioNumber?
  createdAt: string;
}

export interface CreateGuestContactInput {
  ownerUserId: string;
  name: string;
  phone: string;
  clubSlug?: string;    // optional: set initial club membership at creation
  socioNumber?: string;
}

export interface UpsertGuestContactClubMembershipInput {
  id: string;
  ownerUserId: string;
  clubSlug: string;
  socioNumber: string;
}
```

---

### 3. Backend Service (`guest-contacts.service.ts`)

- `createGuestContact`: if `clubSlug` + `socioNumber` provided, also create a `GuestContactMembership` row.
- `listGuestContactsByOwner`: include `memberships` via Prisma `include`.
- Replace `updateGuestContactSocioNumber` with `upsertGuestContactClubMembership(input)`: upserts a `GuestContactMembership` row for the given `(guestContactId, clubSlug)`.

```typescript
// Replace existing updateGuestContactSocioNumber with:
export async function upsertGuestContactClubMembership(
  input: UpsertGuestContactClubMembershipInput,
): Promise<GuestContactDTO> {
  const contact = await prisma.guestContact.findUnique({
    where: { id: input.id },
    include: { memberships: true },
  });
  if (!contact) throw new AppError('Guest contact not found', 404);
  if (contact.ownerUserId !== input.ownerUserId) throw new AppError('Forbidden', 403);

  await prisma.guestContactMembership.upsert({
    where: { guestContactId_clubSlug: { guestContactId: input.id, clubSlug: input.clubSlug } },
    create: { id: randomUUID(), guestContactId: input.id, clubSlug: input.clubSlug, socioNumber: input.socioNumber },
    update: { socioNumber: input.socioNumber },
  });

  const updated = await prisma.guestContact.findUnique({
    where: { id: input.id },
    include: { memberships: true },
  });
  return toDTO(updated!);
}
```

---

### 4. Backend Controller & Routes (`guest-contacts.controller.ts`, `.routes.ts`)

Replace `PATCH /:id/socio-number` with `PATCH /:id/club-membership`:

```typescript
// controller
static async upsertClubMembership(req: Request, res: Response, next: NextFunction) {
  const { ownerUserId, clubSlug, socioNumber } = req.body;
  if (!ownerUserId || !clubSlug || !socioNumber)
    return res.status(400).json({ error: 'Missing ownerUserId, clubSlug, or socioNumber' });
  const contact = await GuestContactsService.upsertGuestContactClubMembership({
    id: req.params.id, ownerUserId, clubSlug, socioNumber,
  });
  return res.json(contact);
}

// route
router.patch('/:id/club-membership', GuestContactsController.upsertClubMembership);
```

---

### 5. Booking Service (`booking.service.ts`)

Update participant socio lookup to query `GuestContactMembership` filtered by `clubSlug`:

```typescript
// Replace the GuestContact fallback lookup block:
const phone = participant.user?.phone
if (phone) {
  const normalizePhone = (p: string) => p.split('-')[0].replace(/\s+/g, '')
  const participantPhoneNorm = normalizePhone(phone)
  const guestContact = await prisma.guestContact.findFirst({
    where: { ownerUserId: hostUserId },
    include: { memberships: { where: { clubSlug: membership.clubSlug } } },
  })
  // ... match by phone, then:
  const socioNumber = guestContact?.memberships[0]?.socioNumber
  if (socioNumber) {
    participantSocioNumbers.push(socioNumber)
    continue
  }
}
```

---

### 6. Frontend Service (`guest-contacts.service.ts`)

```typescript
export interface GuestContactClubMembership {
  clubSlug: string
  socioNumber: string
}

export interface GuestContactDTO {
  id: string
  ownerUserId: string
  name: string
  phone: string
  memberships: GuestContactClubMembership[]
  createdAt: string
}

// Replace updateSocioNumber with:
async upsertClubMembership(
  id: string,
  ownerUserId: string,
  clubSlug: string,
  socioNumber: string,
): Promise<GuestContactDTO> {
  return apiClient.patch<GuestContactDTO>(`/guest-contacts/${id}/club-membership`, {
    ownerUserId, clubSlug, socioNumber,
  })
}
```

---

### 7. Frontend Wizard (`i-want-to-play-wizard.tsx`)

- The wizard already has `selectedMembershipId` (the host's chosen club connection).
- Resolve the `clubSlug` from `clubMemberships.find(m => m.id === selectedMembershipId)?.clubSlug`.
- In Step 3, the "Socio #" field (for both manual add and the existing contacts list) should be scoped to that `clubSlug`.
- `gcMeta` state shape stays the same (`Record<userId, { gcId, socioNumber }>`), but the save call becomes `upsertClubMembership(gcId, hostUserId, clubSlug, socioNumber)`.
- Only show socio number fields when `bookingEnabled` is true (no point asking if booking is off).

---

### 8. Frontend Profile (`Profile.tsx`)

- Contacts section currently shows a single socio number per contact.
- Update to show one row per club membership per contact (grouped by contact).
- Use `upsertClubMembership` instead of `updateSocioNumber`.
- The club selector in the editor should be limited to `SUPPORTED_CLUBS` that the host themselves has a `ClubMembership` for (no point setting a socio for a club the host isn't connected to).

---

## Notes

- Only `laieta` is supported today, so the migration is safe to default all existing socio numbers to `clubSlug = 'laieta'`.
- The `GuestContactMembership` table mirrors the structure of `ClubMembership` but without credentials — guests don't log in, only the host does.
- The booking service lookup already correctly scopes by `clubSlug` when checking `ClubMembership` (step 1). Only the `GuestContact` fallback (step 2) is currently club-agnostic and needs updating.
