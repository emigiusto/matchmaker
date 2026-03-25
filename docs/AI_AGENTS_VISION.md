# AI Agents Vision for Matchmaker

*Created: 2026-03-25*

---

## Context: What the App Does Today

Matchmaker is a sports coordination platform (tennis/padel) that eliminates the friction of organizing casual matches. The current flow is:

1. Players submit **availability** (intent, not commitment)
2. An organizer reviews candidates and sends **invites** (unique, time-limited links)
3. Candidates **accept or decline** — no login required
4. On acceptance, a **match is created** (immutable)
5. Optional: automated **court booking** (Puppeteer-based adapters)

The orchestration is **manual and reactive**: a human decides who to invite, when, and in what order. The system executes, but does not reason.

---

## The Core Opportunity

The entire coordination workflow — who to invite, when, in what order, on what court — is a reasoning problem over structured data. That is exactly what LLM agents are good at. The existing architecture is already decomposed into clean, tool-shaped services:

| Existing Service | Role as Agent Tool |
|---|---|
| `MatchmakingService` | Pure read-only scorer — ideal tool, no side effects |
| `AvailabilityService` | Query player availability windows |
| `InviteService` | Single orchestrator for match creation |
| `BookingService` | Adapter-abstracted court reservation |
| `WhatsAppService` | Provider-abstracted messaging |
| `RatingService` | ELO confidence scores per player |
| `SchedulingService` | Multi-candidate escalation logic |

No fundamental restructuring is needed. The agent layer sits above the services and decides *what to do*; the services decide *how to do it*.

---

## Innovation Levels

### Level 1 — Wire Up Existing AI Coach Placeholders

**Effort: Low | Impact: Immediate user value**

The frontend already has two complete UI shells with mock data:

- `AiCoachInsights.tsx` — performance patterns, surface analysis, trend charts
- `AiCoachCompanion.tsx` — opponent-specific tactical prep before a match

Both are ready for real Claude API calls. The data is already in the database: ELO history, match results, opponent records, surface stats, time-of-day patterns.

**Agent tools needed:**

```typescript
get_player_match_history(player_id, limit?)
get_opponent_head_to_head(player_id, opponent_id)
get_player_stats(player_id, surface?, time_range?)
get_opponent_tendencies(opponent_id)  // derived from their match history
```

**Example prompt (Match Companion):**
> "You are a tennis coach. Given this player's history and their upcoming opponent's patterns, provide specific tactical advice for today's match. Be concise and actionable."

This is the lowest-effort, highest-visibility AI integration available.

---

### Level 2 — Autonomous Scheduling Agent

**Effort: Medium | Impact: Core workflow automation**

Today: a human reviews availability, picks candidates, sends invites, waits, and escalates manually.

The agent replaces this loop:

```
[Trigger: cron job or user "I want to play" intent]
        ↓
1. CheckAvailabilities(date_range, skill_level, location)
2. RunMatchmakingScores(candidates) → ranked list
3. SelectOptimalSlot(scores, venue_availability, constraints)
4. SendInvite(top_candidate)
5. WaitForResponse(window)
   → Declined / Timeout → SendInvite(next_candidate)
   → Accepted → BookCourt() → CreateMatch() → SendConfirmations()
6. Done
```

This mirrors how a skilled coordinator would think. The agent reasons over the tradeoffs (level match vs. schedule fit vs. distance vs. recent activity), not just sorts by a score.

**Key constraints to enforce at tool level (not agent level):**
- Max 5 active scheduling requests per user
- Invite windows: 15min → 72h configurable
- Matches are immutable once created
- Explicit acceptance required (never create a match without it)

**Suggested module structure:**

```
backend/modules/agent/
├── SchedulingAgent.ts       # Orchestrator loop
├── tools/
│   ├── availabilityTools.ts
│   ├── matchmakingTools.ts
│   ├── inviteTools.ts
│   └── bookingTools.ts
└── agent.routes.ts          # Trigger endpoints
```

---

### Level 3 — Proactive Match Proposals

**Effort: Medium | Impact: Paradigm shift — from reactive to proactive**

This is where the platform goes from "helping you organize a match" to "actively keeping you playing."

#### How it works

A background agent runs on a schedule (e.g., every morning). For each active player it asks:

> "Should I suggest a match to this person today? If so, who should they play with, when, and why?"

The agent considers:
- Has this player not played in N days? (inactivity trigger)
- Do they have availability windows coming up?
- Are there good candidate opponents also available at the same time?
- Is a preferred court available?
- What's their preferred play frequency?

If conditions are right, the agent sends a **proactive WhatsApp message**:

> *"Hey Alex — you haven't played since last Tuesday. Marco and Sara are both free Saturday morning at Laieta. Want me to set up a match? Reply YES and I'll handle the booking."*

On "YES", the scheduling agent kicks off Level 2 automatically.

#### Why this matters

The biggest friction in casual sports is not coordination — it's **initiation**. Nobody wants to be the one to organize. An agent that removes that inertia entirely is a fundamentally different product.

#### Trigger conditions for proactive proposals

| Trigger | Description |
|---|---|
| **Inactivity** | Player hasn't played in X days (configurable per user) |
| **Mutual availability** | Two or more compatible players share an open window |
| **Court availability** | A preferred venue has an open slot in the next 48h |
| **Streak maintenance** | Player is on a play streak and the next gap is approaching |
| **Weather window** | External signal (outdoor courts) — future integration |

#### User control

Proactive proposals must be opt-in and configurable:
- Frequency: daily / weekly suggestions
- Minimum gap between proposals
- Preferred days/times
- Whether to auto-book or ask first

---

### Level 4 — WhatsApp Conversational Agent

**Effort: High | Impact: Highest adoption ceiling**

Replace the web app as the primary interface for the common flow. A player sends a WhatsApp message:

> *"I want to play padel this Saturday afternoon, Barceloneta area"*

The agent:
1. Parses intent → creates availability entry
2. Finds candidates → computes matchmaking scores
3. Proposes match options → player confirms
4. Sends invites → handles replies inline
5. Books court → confirms with all players

This eliminates the need to open the app for the most common action. It also removes the signup/login barrier — new players join via phone number, exactly how your guest-first flow already works.

Your existing `WhatsAppService` provider abstraction (mock/Whapi/Wasender) is already designed for this. The agent layer is what makes it conversational rather than template-based.

**Example conversation flow:**

```
Player:  "I want to play tennis tomorrow"
Agent:   "Morning or afternoon? You're level 5 — I'll find you a good match."
Player:  "Afternoon, after 4pm"
Agent:   "Found 3 options: Carlos (level 5, 4:30pm, Laieta), Marta (level 5.5, 5pm,
          Barceloneta), Pau (level 4.5, 4pm, Gracia). Want me to invite one of them?"
Player:  "Carlos sounds good"
Agent:   "On it. I'll let you know when he replies."
[Carlos accepts]
Agent:   "Carlos is in. Court booked at Laieta, Thursday 4:30–6pm.
          See you there — here's the court location: [map link]"
```

---

### Level 5 — Post-Match Intelligence Loop

**Effort: Low-Medium | Impact: Compounds over time**

After every match, the agent:
1. Prompts both players for the result (if not submitted)
2. Updates ELO ratings
3. Detects patterns: *"You win 70% of matches starting after 5pm but only 40% in the morning"*
4. Adjusts future proposals: *"Scheduling you for evening slots going forward"*
5. Surfaces insights in the AI Coach dashboard

This closes the feedback loop: matches → results → patterns → better proposals → more matches.

---

## Recommended Architecture

### Agent Runtime

Use **Claude API with tool use** (streaming, multi-turn). Each agent is a loop:

```typescript
// Conceptual structure
async function runSchedulingAgent(context: AgentContext) {
  const messages: Message[] = [buildSystemPrompt(context)];

  while (true) {
    const response = await claude.messages.create({
      model: "claude-opus-4-6",
      tools: schedulingTools,
      messages,
    });

    if (response.stop_reason === "end_turn") break;
    if (response.stop_reason === "tool_use") {
      const toolResults = await executeTools(response.content);
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }
  }
}
```

### Tool Authorization Boundaries

Tools enforce business invariants — the agent cannot bypass them:

```typescript
// The agent cannot create a match without explicit acceptance
async function create_match(invite_token: string): Promise<Match> {
  const invite = await InviteService.findByToken(invite_token);
  if (invite.status !== "ACCEPTED") throw new Error("Cannot create match without acceptance");
  return InviteService.createMatchFromAcceptedInvite(invite.id);
}

// The agent cannot exceed active request limits
async function send_invite(organizer_id: string, candidate_id: string, slot: Slot) {
  const activeCount = await SchedulingService.countActiveRequests(organizer_id);
  if (activeCount >= 5) throw new Error("Max active requests reached");
  return InviteService.create({ organizer_id, candidate_id, slot });
}
```

### Agent Triggers

| Agent | Trigger |
|---|---|
| Proactive Proposal Agent | Cron: daily at 8am |
| Scheduling Orchestration Agent | User intent ("I want to play") or proposal acceptance |
| WhatsApp Conversational Agent | Incoming WhatsApp webhook |
| AI Coach Agent | On-demand via dashboard button |
| Post-Match Intelligence Agent | Match result submitted event |

---

## What Makes This Architecture Fit Well

1. **Matchmaking is already pure/read-only** — perfect tool with no risk of unintended mutations
2. **InviteService is the single orchestrator** — the agent goes through it, not around it
3. **WhatsApp abstraction is provider-agnostic** — conversational agent works across Whapi/Wasender
4. **Guest-first identity model** — conversational agent can onboard new players via phone number alone
5. **ELO + match history** — rich structured data for reasoning, not just retrieval
6. **Existing scheduling windows (15m–72h)** — natural fit for agent wait/escalate loops

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Agent sends too many WhatsApp messages | Per-user rate limits enforced at tool level, not prompt level |
| Agent creates a match without real consent | `create_match` tool validates `ACCEPTED` status — invariant enforced in code |
| Proactive proposals feel spammy | Opt-in, configurable frequency, explicit "snooze" reply handling |
| Agent reasoning errors (hallucinated player names, wrong slots) | Tools validate all IDs against DB before acting; agent gets structured data not free text |
| LLM cost at scale | Tiered: rule-based filtering first, LLM only for ambiguous cases or high-value players |

---

## Suggested Implementation Order

1. **Wire AI Coach** (Insights + Companion) with real Claude calls — existing UI, high visibility, low risk
2. **Proactive Proposal Agent** — cron-based, read-heavy, low blast radius, immediately differentiating
3. **Scheduling Orchestration Agent** — automates the core workflow, replaces manual invite loop
4. **Post-Match Intelligence Loop** — closes the feedback cycle, improves over time
5. **WhatsApp Conversational Agent** — full conversational interface, highest effort but highest ceiling
