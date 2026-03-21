# Async Architecture & Queue Strategy

## Current state

Everything runs in a single Node.js process. Key async operations and their current patterns:

| Component | Pattern | Queuing | Retry | Persistence | Safe on restart? |
|-----------|---------|---------|-------|-------------|-----------------|
| Booking trigger | Fire-and-forget | None | 2× (5 s delay, in-process) | `BookingAttempt` row | No — in-flight jobs lost |
| WhatsApp sends | Direct API calls | In-memory chain | None | No | No |
| Notifications | DB insert only | None | None | DB | Yes |
| Cron jobs | node-cron | None | Next cycle | No | No |
| Puppeteer | Per-request browser launch | None | Built into booking logic | No | No |

You already have **Redis** (used for court availability cache). That is the most important prerequisite for the recommended path.

---

## Failure modes worth caring about

### 1. Puppeteer concurrency
10 concurrent booking requests = 10 browser processes. No upper bound. Memory and CPU will exhaust under load.

### 2. Lost work on restart
A deploy, crash, or dyno restart kills in-flight bookings, WhatsApp sends, and any reminder that was mid-execution. No record of what was pending.

### 3. Horizontal scaling
Running two instances causes node-cron to fire duplicate reminder and cache-warm jobs. Reminders double-send — user-visible breakage.

---

## Options

### Option A — BullMQ (recommended)
Sits directly on the existing Redis instance. Minimal infrastructure change.

```
before: triggerBookingForMatch(matchId)  // fire-and-forget
after:  bookingQueue.add('book', { matchId })  // worker picks it up
```

**Gains:**
- Concurrency control: `concurrency: 1` for Puppeteer workers prevents resource exhaustion
- Jobs survive process restarts (stored in Redis)
- Retry with exponential backoff, configurable per job type
- Job deduplication (prevents double-booking the same match)
- Free dashboard via Bull Board

**Cost:** one npm install, one worker file.

---

### Option B — pg-boss
Uses the existing Postgres database (via Prisma) as the queue backend. No new infrastructure.

**Good fit when:** you want exactly-once semantics tied to your DB transaction (e.g., create the `BookingAttempt` row and enqueue the job atomically). The `BookingAttempt` table is essentially a manual implementation of this already.

**Downside:** slower throughput than Redis-backed queues. Fine for bookings (low volume), not ideal for WhatsApp bursts.

---

### Option C — Separate worker process
Run a second process (`node worker.js`) alongside the API server. The worker owns all async jobs; the API only writes to the queue.

This is the right structural split if you want a stateless, horizontally scalable API. Works with BullMQ or pg-boss underneath. Not needed until you actually run multiple API instances.

---

### Option D — Hosted queues (Inngest, Trigger.dev, Upstash QStash)
Managed services that handle retries, scheduling, and observability. You send an HTTP call; they manage execution.

**Good fit for:** serverless hosts (Vercel, Cloudflare Workers) where long-lived processes aren't possible. Since the booking flow requires Puppeteer (which needs a persistent process), this option doesn't apply to the booking worker. Could be useful for notification fan-out in the future.

---

## Recommended path

### Phase 1 — BullMQ on existing Redis (~1 day)

1. Add `bullmq` dependency.
2. Define queues:
   - `booking-queue` — `concurrency: 1` per club membership (prevents concurrent Puppeteer sessions against the same club account)
   - `whatsapp-queue` — respects `WHATSAPP_MIN_SEND_INTERVAL_MS`, retries on provider errors
3. Move `runBookingJob` out of fire-and-forget into the booking worker.
4. Move WhatsApp sends into the WhatsApp worker (current in-memory chain becomes a proper queue).
5. Add a **distributed lock** to node-cron jobs using a Redis `SET NX EX` pattern (or BullMQ's `repeat` jobs) so only one instance runs each cron at a time. **Do this before running more than one instance.**

### Phase 2 — Worker process split (when scaling the API)

Extract the BullMQ workers into a separate process/dyno. The API becomes stateless: it only enqueues work, never executes it. At this point you can scale API instances independently.

### Phase 3 — Notification delivery (when needed)

If push notifications, email, or WhatsApp notifications need fan-out to many users, consider Inngest or a dedicated notification worker. The current DB-only `createNotification` is a clean extension point — it already has TODO comments for future delivery mechanisms.

---

## Distributed lock for cron jobs (immediate fix)

Before running more than one instance, add this to each cron job:

```typescript
// Acquire a Redis lock for the duration of the job.
// Only one instance will proceed; others skip silently.
async function withLock(key: string, ttlSeconds: number, fn: () => Promise<void>) {
  const acquired = await redis.set(key, '1', 'EX', ttlSeconds, 'NX')
  if (!acquired) return
  try {
    await fn()
  } finally {
    await redis.del(key)
  }
}

// Usage in reminder.job.ts
cron.schedule('* * * * *', () => {
  withLock('lock:reminder-job', 55, runReminderJob).catch(logger.error)
})
```

---

## Key files

| File | Role |
|------|------|
| `backend/src/modules/booking/booking.service.ts` | `triggerBookingForMatch`, `runBookingJob` — candidate for BullMQ worker |
| `backend/src/modules/whatsapp/whatsapp.service.ts` | In-memory rate-limit chain — candidate for BullMQ queue |
| `backend/src/modules/notifications/notifications.service.ts` | DB insert only, future delivery extension point |
| `backend/src/modules/jobs/index.ts` | node-cron scheduler entry point |
| `backend/src/modules/jobs/reminder.job.ts` | Fires every minute — needs distributed lock before scaling |
| `backend/src/modules/jobs/availability-cache.job.ts` | Warms Redis every 30 min — needs distributed lock before scaling |
| `backend/src/shared/cache/redis.ts` | Redis client — reuse for BullMQ connection |
