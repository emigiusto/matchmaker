# Reaction Support via Whapi

## Background

When Matchmaker sends a scheduling invite poll over WhatsApp, the poll stays "open" on the candidate's screen until they vote or a terminal event occurs (match found, invite expired, cancelled). Currently on **Wasender**, there is no way to react to that poll message — their API only supports receiving reactions via webhook, not sending them. The poll therefore remains visually unresolved for the candidate regardless of what happens next.

**Whapi supports `POST /messages/reaction`**, which lets the bot post an emoji reaction on any previously sent message by its `message_id`.

---

## How It Reduces Friction

### 1. Immediate visual closure

When an invite is no longer relevant, the candidate sees the reaction appear on the poll without opening any other screen. The emoji acts as a passive, zero-tap signal:

| Event | Reaction | Meaning to candidate |
|---|---|---|
| Host cancels the invite | ❌ | "This slot was cancelled" |
| Invite expires (no response) | ❌ | "Too late, slot is gone" |
| Match already found (without them) | 🔒 | "Slot is taken" |

Without reactions, the poll just sits there. The candidate has no way to know whether the game happened, was cancelled, or is still pending. This causes follow-up messages, confusion, and erodes trust in the system.

### 2. No extra message clutter

Reactions attach to the original poll. They do not push a new message into the conversation, so the candidate's chat thread stays clean. The "no longer available" text message we send is still useful for people who scroll past the poll, but the reaction is the primary low-friction signal for anyone still looking at the poll.

### 3. Consistent UX across all terminal states

Every invite has a clear lifecycle: **open → voted / accepted / expired / cancelled → locked**. Reactions map each terminal state to a visible emoji on the exact message the candidate is looking at, making the lifecycle legible without any UI outside WhatsApp.

---

## Current Provider Status

| Provider | `sendReaction` | Notes |
|---|---|---|
| **Whapi** | ✅ Supported | `POST /messages/reaction` with `{ to, message_id, emoji }` |
| **Wasender** | ❌ Not supported | Reactions are receive-only; send calls return 422 |
| **Mock** | ✅ No-op | Logs the call, returns `{ success: true }` |

The `sendReaction` call in the scheduling service is best-effort (`void` + warn on failure). Switching to Whapi makes reactions functional; staying on Wasender means they silently no-op, which is safe but leaves the visual gap described above.

---

## Switching to Whapi

Set the provider env var and ensure `WHAPI_API_TOKEN` is configured. No code changes required — the `WhapiProvider.sendReaction` implementation is already in place and used via the shared `whatsappService.sendReaction` interface.

```
WHATSAPP_PROVIDER=whapi
WHAPI_API_TOKEN=<token>
WHAPI_BASE_URL=https://gate.whapi.cloud   # optional, this is the default
```

The `pollMessageId` stored on each `SchedulingCandidate` is the message `id` returned by Whapi when the invite is sent — this is what gets passed as `message_id` to the reaction endpoint.
