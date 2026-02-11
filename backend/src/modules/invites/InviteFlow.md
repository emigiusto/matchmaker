# 🧪 End-to-End Flow Testing Guide

## MatchMaker / AceUp Backend

This document provides a **complete step-by-step guide** to manually test the core lifecycle of the system:

**Availability → Invite → Match → Notification**

This flow is the **architectural backbone** of the application. All scheduling logic depends on it.

---

## 📌 Core Domain Rules

### 1️⃣ Availability = Intent
- A user expresses they are available.
- No commitment is created.
- No match is created.
- Status starts as `open`.

### 2️⃣ Invite = Commitment Request
- Invites are the **only** way to create a Match.
- Every Match must originate from an Invite.
- Invite has a token (public-safe).
- Invite lifecycle: `pending → accepted | declined | expired`

### 3️⃣ Match = Confirmed Commitment
- Created **only once** per Invite.
- Immutable.
- Always traceable to:
  - Invite
  - Availability

### 4️⃣ Notifications = Side Effects
- Emitted after transaction commits.
- Never block domain state.
- Delivery-agnostic.

---

## 🔧 Prerequisites

- Backend running at: `http://localhost:3000`
- Database migrated.
- At least one user exists.

Create a user:
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "phone": "+10000000000"
  }'
```

---

# 🚀 Step-by-Step End-to-End Test

## 1️⃣ Create Availability
```bash
curl -X POST http://localhost:3000/availability \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "date": "2026-02-10T00:00:00.000Z",
    "startTime": "2026-02-10T19:00:00.000Z",
    "endTime": "2026-02-10T21:00:00.000Z",
    "locationText": "Barcelona Tennis Club"
  }'
```
**Expected Result:**
- Status = `open`
- No match created
- No notifications emitted

---

## 2️⃣ Create Invite
```bash
curl -X POST http://localhost:3000/invites \
  -H "Content-Type: application/json" \
  -d '{
    "inviterUserId": "USER_ID",
    "availabilityId": "AVAILABILITY_ID"
  }'
```
**Expected Result:**
```json
{
  "status": "pending",
  "token": "...",
  "matchId": null
}
```
- This token simulates the WhatsApp link.

---

## 3️⃣ Fetch Invite (Public / Guest Safe)
```bash
curl -X GET http://localhost:3000/invites/INVITE_TOKEN
```
**Expected Result:**
- Status still `pending`
- No mutation occurs
- Safe to call multiple times

---

## 4️⃣ Confirm Invite (Creates Match)
```bash
curl -X POST http://localhost:3000/invites/INVITE_TOKEN/confirm \
  -H "Content-Type: application/json"
```
**Expected Result:**
```json
{
  "status": "accepted",
  "matchId": "MATCH_ID"
}
```
**What Happens Atomically:**
- Invite → accepted
- Match created
- Availability marked as matched

---

## 5️⃣ Verify Match
```bash
curl -X GET http://localhost:3000/matches/MATCH_ID
```
**Expected Result:**
- `inviteId` matches Invite
- `availabilityId` matches Availability
- `scheduledAt` equals availability startTime

---

## 6️⃣ Verify Availability Updated
```bash
curl -X GET http://localhost:3000/availability/AVAILABILITY_ID
```
**Expected Result:**
```json
{
  "status": "matched"
}
```
- Availability cannot be reused.

---

## 7️⃣ Attempt Double Confirmation (Safety Check)
```bash
curl -X POST http://localhost:3000/invites/INVITE_TOKEN/confirm \
  -H "Content-Type: application/json"
```
**Expected Result:**
```json
{
  "message": "Invite is not pending",
  "statusCode": 409
}
```
- No duplicate match creation
- Idempotent behavior
- Race condition protection

---

## 8️⃣ Verify Notification Emitted
```bash
curl -X GET "http://localhost:3000/notifications?userId=USER_ID"
```
**Expected Result:**
```json
{
  "type": "invite.accepted",
  "payload": {
    "inviteId": "...",
    "matchId": "...",
    "scheduledAt": "..."
  }
}
```
- Notification is stored, non-blocking, and delivery-agnostic.

---

# 🧠 What This Flow Guarantees

| Guarantee                   | Why It Matters            |
|-----------------------------|---------------------------|
| Invite-only match creation  | Prevents silent scheduling|
| Transactional integrity     | No partial state          |
| No duplicate matches        | Safe against retries      |
| Guest-safe confirmation     | No login required         |
| Auditability                | Every match traceable     |
| Side effects separated      | Reliable architecture     |

---

# ⚠️ Negative Test Scenarios

### Expired Invite
- Wait until `expiresAt`
- Confirm returns 410
- No match created

### Decline Invite
```bash
curl -X POST http://localhost:3000/invites/INVITE_TOKEN/decline
```
- Status → declined
- No match created

---

# 🏗 System Architecture Summary

```
User
  └── Availability (intent)
         └── Invite (proposal)
                └── Match (commitment)
                       └── Result (future)
```

**Separation of concerns:**
- AvailabilityService → CRUD only
- InviteService → Match creation only
- MatchService → Read-only
- NotificationService → Side effects only

---

# 🧩 Why This Matters

This backend enforces:
- Explicit state transitions
- Immutable commitments
- Deterministic scheduling
- Safe guest flows
- WhatsApp as transport, not logic

This is production-grade coordination architecture.

---

# 🏁 Final Checklist

After completing the flow, verify:
- Availability starts as open
- Invite starts as pending
- Confirm creates exactly one match
- Availability becomes matched
- Double confirm fails
- Notification emitted
- Match references Invite + Availability

If all pass → your core domain is stable.

---

# 🔜 Recommended Next Steps
- Add integration tests locking these invariants
- Implement result lifecycle
- Attach players to matches
- Add open/community invite UX
- Add match completion state

---

# 🏆 Conclusion
If this entire flow works exactly as documented:

You have successfully validated the core scheduling engine of MatchMaker / AceUp.

Everything else in the product builds on top of this.