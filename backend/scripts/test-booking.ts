/**
 * Test the LaietaAdapter booking flow end-to-end (locally).
 * Fetches Alex Rivera's ClubMembership from the DB, checks availability,
 * then attempts to book a court for tomorrow at 10:00 with a test participant.
 *
 * BOOKING_SUBMIT_ENABLED=false (set in .env.local) means the final form submit
 * is skipped — change it to "true" to actually book.
 *
 * Run:
 *   npx tsx scripts/test-booking.ts
 */

import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })
import { ensureDatabaseUrl } from '../src/config/database-url'
ensureDatabaseUrl()

import { prisma } from '../src/prisma'
import { decrypt } from '../src/shared/utils/crypto.utils'
import { getAdapter } from '../src/modules/booking/adapters/adapter.registry'

const TARGET_TIME = '13:00'
const PARTICIPANT_SOCIO = '23386'
const PARTICIPANT_NAME = 'Test Participant'

async function main() {
  // ── 1. Load Alex Rivera's club membership ────────────────────────
  const alexUser = await prisma.user.findFirst({
    where: { email: 'alex@example.com' },
  })
  if (!alexUser) {
    console.error('❌ User alex@example.com not found in DB')
    process.exit(1)
  }
  console.log(`✅ Host user: ${alexUser.name} (${alexUser.id})`)

  const membership = await prisma.clubMembership.findFirst({
    where: {
      userId: alexUser.id,
      encryptedPassword: { not: null },
      status: 'active',
    },
  })
  if (!membership) {
    console.error('❌ No active ClubMembership with password found for Alex Rivera')
    process.exit(1)
  }
  console.log(`✅ Club membership: clubSlug=${membership.clubSlug}, adapterType=${membership.adapterType}, socio=${membership.socioNumber}`)

  const creds = {
    socioNumber: membership.socioNumber,
    password: decrypt(membership.encryptedPassword!),
  }

  const adapter = getAdapter(membership.adapterType)

  // ── 2. Check availability for tomorrow at 13:00 ──────────────────
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const date = tomorrow.toLocaleDateString('en-CA') // YYYY-MM-DD
  console.log(`\n📅 Checking availability: date=${date}, time=${TARGET_TIME}`)

  const availability = await adapter.checkAvailability(creds, date, TARGET_TIME, { sport: 'tennis' })
  console.log(`   Available courts at ${TARGET_TIME}:`, availability.availableCourts.filter(c => c.time === TARGET_TIME).map(c => c.courtId))

  const court = availability.availableCourts.find(c => c.time === TARGET_TIME)
  if (!court) {
    console.error(`❌ No available tennis court at ${TARGET_TIME} on ${date}`)
    process.exit(1)
  }
  console.log(`✅ Using court: ${court.courtId}`)

  // ── 3. Attempt booking ───────────────────────────────────────────
  const participants = [{ socioNumber: PARTICIPANT_SOCIO, name: PARTICIPANT_NAME }]
  console.log(`\n🎾 Booking: court=${court.courtId}, date=${date}, time=${TARGET_TIME}`)
  console.log(`   Participants: ${participants.map(p => `${p.name}(${p.socioNumber})`).join(', ')}`)
  console.log(`   BOOKING_SUBMIT_ENABLED=${process.env.BOOKING_SUBMIT_ENABLED ?? 'false'}`)
  if (process.env.BOOKING_SUBMIT_ENABLED !== 'true') {
    console.log('   ⚠️  Submit is disabled — running in TEST MODE (no actual booking will be made)')
    console.log('   Set BOOKING_SUBMIT_ENABLED=true in .env.local to actually book')
  }

  const result = await adapter.book(creds, date, TARGET_TIME, court.courtId, participants, { sport: 'tennis' })
  console.log('\n✅ Booking result:', result)
}

main()
  .catch((err) => {
    console.error('\n❌ Error:', err?.message ?? err)
    if (err?.stack) console.error(err.stack)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
