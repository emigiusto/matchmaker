/**
 * Test script: send a WhatsApp message with Yes/No options to a phone number.
 * Usage: npm run test:whatsapp-message [phone]
 *    or: dotenv -e .env.local -- npx tsx scripts/test-whatsapp-message.ts +34600972125
 *
 * Requires WHATSAPP_PROVIDER and provider config (e.g. WASENDER_API_KEY for wasender).
 * Preload env with: dotenv -e .env.local (or .env.production)
 */
import * as dotenv from 'dotenv';
import path from 'path';

const backendDir = path.resolve(__dirname, '..');
const envFile = process.env.ENV_FILE || '.env.local';
dotenv.config({ path: path.join(backendDir, envFile) });

import { ensureDatabaseUrl } from '../src/config/database-url';
import { ensureRedisUrl } from '../src/config/redis';
import { whatsappService } from '../src/modules/whatsapp/whatsapp.service';

ensureDatabaseUrl();
ensureRedisUrl();

const PHONE = process.argv[2] || '+34600972125';
const MESSAGE = 'Do you want to play tennis this Saturday?\n\nTap your choice below.';
const BUTTONS = [
  { id: 'invite_yes', title: 'YES' },
  { id: 'invite_no', title: 'NO' },
];

async function main() {
  const provider = process.env.WHATSAPP_PROVIDER || 'mock';
  console.log(`Sending test message via ${provider} to ${PHONE}...`);
  console.log('Message:', MESSAGE);
  console.log('Options:', BUTTONS.map((b) => b.title).join(', '));

  const result = await whatsappService.sendInviteMessage(PHONE, MESSAGE, { buttons: BUTTONS });

  if (result.success) {
    console.log('✓ Sent successfully. MessageId:', result.messageId);
  } else {
    console.error('✗ Failed:', result.error);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
