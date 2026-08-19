const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

const GUESTS_FILE = path.join(__dirname, 'data', 'hr_guests.json');
const CHECKINS_FILE = path.join(__dirname, 'data', 'check_ins.json');

async function seed() {
  console.log('=================================================');
  console.log('  HR Summit 2026 — Supabase Database Seeding');
  console.log('=================================================');

  if (!fs.existsSync(GUESTS_FILE)) {
    console.error('Local hr_guests.json not found at:', GUESTS_FILE);
    process.exit(1);
  }

  const guestsData = fs.readFileSync(GUESTS_FILE, 'utf8');
  const guests = JSON.parse(guestsData);
  console.log(`[Seed Script] Loaded ${guests.length} local HR records.`);

  const checkInsData = fs.existsSync(CHECKINS_FILE) ? fs.readFileSync(CHECKINS_FILE, 'utf8') : '[]';
  const checkIns = JSON.parse(checkInsData);

  console.log('[Seed Script] Seeding HR guests into Supabase...');
  const guestResult = await supabase.seedBulkGuests(guests);

  if (!guestResult || !guestResult.success) {
    console.error('[Seed Script Error] Failed to seed guests into Supabase.');
    console.error('Please check if Supabase RLS is disabled or if SUPABASE_SERVICE_ROLE_KEY is set in .env.');
    process.exit(1);
  }

  console.log(`[Seed Script Success] Seeded ${guestResult.inserted} HR guests into Supabase!`);

  if (checkIns.length > 0) {
    console.log(`[Seed Script] Seeding ${checkIns.length} check-ins into Supabase...`);
    const checkInResult = await supabase.seedBulkCheckIns(checkIns);
    if (checkInResult && checkInResult.success) {
      console.log(`[Seed Script Success] Seeded ${checkInResult.inserted} check-in records!`);
    }
  }

  console.log('=================================================');
  console.log('  Seeding Finished Successfully!');
  console.log('=================================================');
}

seed().catch(err => {
  console.error('[Seed Script Uncaught Exception]:', err);
  process.exit(1);
});
