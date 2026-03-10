#!/usr/bin/env npx tsx
/**
 * Test user API - run with: npx tsx scripts/test-user-api.ts
 * Requires backend to be running on localhost:3000
 */

const BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const USER_ID = process.argv[2] || '023eddcc-c568-4091-8d7b-354a1744c7d4';

async function test() {
  console.log(`Testing user API at ${BASE}`);
  console.log(`User ID: ${USER_ID}\n`);

  // 1. List all users
  console.log('--- GET /users ---');
  try {
    const listRes = await fetch(`${BASE}/users`);
    const listText = await listRes.text();
    console.log('Status:', listRes.status);
    console.log('Response:', listText);
  } catch (e) {
    console.error('Error:', e);
  }

  // 2. Get user by ID
  console.log('\n--- GET /users/:id ---');
  try {
    const userRes = await fetch(`${BASE}/users/${USER_ID}`);
    const userText = await userRes.text();
    console.log('Status:', userRes.status);
    console.log('Response:', userText);
  } catch (e) {
    console.error('Error:', e);
  }

  // 3. Matches for user (what Dashboard uses)
  console.log('\n--- GET /matches/upcoming?userId=... ---');
  try {
    const matchesRes = await fetch(`${BASE}/matches/upcoming?userId=${USER_ID}`);
    const matchesText = await matchesRes.text();
    console.log('Status:', matchesRes.status);
    console.log('Response:', matchesText);
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
