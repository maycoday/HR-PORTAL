const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

const INITIAL_SEED_FILE = path.join(__dirname, 'data', 'hr_guests.json');
const CHECK_OUTS_FILE = path.join(__dirname, 'data', 'check_outs.json');

function getLocalFileCheckOuts() {
  if (fs.existsSync(CHECK_OUTS_FILE)) {
    try {
      const content = fs.readFileSync(CHECK_OUTS_FILE, 'utf8');
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveLocalFileCheckOut(record) {
  if (!record || !record.hr_guest_id) return;
  const list = getLocalFileCheckOuts();
  const existingIndex = list.findIndex(c => parseInt(c.hr_guest_id, 10) === parseInt(record.hr_guest_id, 10));
  if (existingIndex !== -1) {
    list[existingIndex] = record;
  } else {
    list.push(record);
  }
  try {
    fs.writeFileSync(CHECK_OUTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving local check_outs.json file:', e.message);
  }
}


function normalizeText(str) {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

// Startup Initialization: Seed initial data to Supabase if database is empty
async function initDb() {
  console.log('[Database Init] Connecting directly to Supabase cloud database...');
  const sbGuests = await supabase.fetchGuests();

  if (sbGuests === null) {
    console.error('[Database Init Error] Failed to connect to Supabase. Check SUPABASE_URL, SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY and RLS policies.');
    return;
  }

  if (sbGuests.length === 0 && fs.existsSync(INITIAL_SEED_FILE)) {
    try {
      const data = fs.readFileSync(INITIAL_SEED_FILE, 'utf8');
      const localGuests = JSON.parse(data);
      if (Array.isArray(localGuests) && localGuests.length > 0) {
        console.log(`[Database Init] Supabase hr_guests table is empty. Seeding ${localGuests.length} initial records into Supabase...`);
        const seedResult = await supabase.seedBulkGuests(localGuests);
        if (seedResult && seedResult.success) {
          console.log(`[Database Init Success] Seeded ${seedResult.inserted} HR records into Supabase!`);
        }
      }
    } catch (err) {
      console.error('[Database Init Error] Exception while reading initial seed file:', err.message);
    }
  } else {
    console.log(`[Database Init] Connected to Supabase cloud database (${sbGuests.length} HR records present).`);
  }
}

// Read Guests: Direct from Supabase ONLY
async function readGuests() {
  const sbGuests = await supabase.fetchGuests();
  if (sbGuests === null) {
    throw new Error('Failed to fetch HR guests from Supabase database. Check database connection or RLS policies.');
  }
  return sbGuests;
}

// Read Check-ins: Direct from Supabase ONLY
async function readCheckIns() {
  const sbCheckIns = await supabase.fetchCheckIns();
  if (sbCheckIns === null) {
    throw new Error('Failed to fetch check-ins from Supabase database. Check database connection or RLS policies.');
  }
  return sbCheckIns;
}

// Read Check-outs: Merged Supabase and Server Storage
async function readCheckOuts() {
  const sbCheckOuts = await supabase.fetchCheckOuts();
  const fileCheckOuts = getLocalFileCheckOuts();
  const map = new Map();
  for (const c of (sbCheckOuts || [])) {
    if (c && c.hr_guest_id) map.set(parseInt(c.hr_guest_id, 10), c);
  }
  for (const c of fileCheckOuts) {
    if (c && c.hr_guest_id && !map.has(parseInt(c.hr_guest_id, 10))) {
      map.set(parseInt(c.hr_guest_id, 10), c);
    }
  }
  return Array.from(map.values());
}


// Main Search Function (100% Case-Insensitive & Diacritic-Insensitive over Supabase Data)
async function search(rawQuery, activeDate = null) {
  const query = rawQuery ? rawQuery.trim() : '';
  if (!query) {
    return { query: '', exactMatch: null, possibleMatches: [], alreadyCheckedIn: false, checkInInfo: null, alreadyCheckedOut: false, checkOutInfo: null };
  }

  const guests = await readGuests();
  const checkIns = await readCheckIns();
  const checkOuts = await readCheckOuts();
  const normQuery = normalizeText(query);
  const words = normQuery.split(' ').filter(w => w.length > 0);

  let exactMatches = [];
  const possibleMatchesMap = new Map();

  for (const g of guests) {
    const normName = normalizeText(g.full_name);
    const normCompany = normalizeText(g.company_name);
    const normEmail = normalizeText(g.email);
    const normMobile = normalizeText(g.mobile_number);
    const normDesignation = normalizeText(g.designation);

    const nameWords = normName.split(' ');

    if (
      normName === normQuery ||
      (normEmail && normEmail === normQuery) ||
      (normMobile && normMobile === normQuery) ||
      (normMobile && normMobile.replace(/\D/g, '') === normQuery.replace(/\D/g, '') && normQuery.length >= 8)
    ) {
      exactMatches.push(g);
      continue;
    }

    if (nameWords.includes(normQuery) && normQuery.length >= 3) {
      possibleMatchesMap.set(g.id, { guest: g, score: 95 });
      continue;
    }

    let score = 0;
    if (normName.startsWith(normQuery)) score += 60;
    else if (normName.includes(normQuery)) score += 40;

    if (normCompany.startsWith(normQuery)) score += 45;
    else if (normCompany.includes(normQuery)) score += 30;

    if (normEmail.includes(normQuery)) score += 35;
    if (normMobile.includes(normQuery)) score += 35;
    if (normDesignation.includes(normQuery)) score += 20;

    for (const w of words) {
      if (normName.includes(w)) score += 15;
      if (normCompany.includes(w)) score += 10;
    }

    if (score >= 10) {
      possibleMatchesMap.set(g.id, { guest: g, score });
    }
  }

  const sortedPossibles = Array.from(possibleMatchesMap.values())
    .sort((a, b) => b.score - a.score)
    .map(item => item.guest);

  let exactMatch = null;
  let remainingPossibles = sortedPossibles;

  if (exactMatches.length === 1) {
    exactMatch = exactMatches[0];
  } else if (exactMatches.length > 1) {
    remainingPossibles = [...exactMatches, ...sortedPossibles];
  } else if (sortedPossibles.length === 1 && (sortedPossibles[0].full_name.toLowerCase().includes(query.toLowerCase()))) {
    exactMatch = sortedPossibles[0];
    remainingPossibles = [];
  }

  let alreadyCheckedIn = false;
  let checkInInfo = null;
  let alreadyCheckedOut = false;
  let checkOutInfo = null;

  if (exactMatch) {
    const exactId = parseInt(exactMatch.id, 10);
    const guestCheckIns = checkIns.filter(c => parseInt(c.hr_guest_id, 10) === exactId);
    if (activeDate && activeDate !== 'both' && activeDate !== 'all') {
      const existing = guestCheckIns.find(c => c.check_in_date === activeDate || (c.check_in_date || '').includes(activeDate.substring(0, 6)));
      if (existing) {
        alreadyCheckedIn = true;
        checkInInfo = existing;
      }
    } else if (guestCheckIns.length > 0) {
      alreadyCheckedIn = true;
      checkInInfo = guestCheckIns[0];
    }

    const guestCheckOuts = checkOuts.filter(c => parseInt(c.hr_guest_id, 10) === exactId);
    if (activeDate && activeDate !== 'both' && activeDate !== 'all') {
      const existingOut = guestCheckOuts.find(c => c.check_out_date === activeDate || (c.check_out_date || '').includes(activeDate.substring(0, 6)));
      if (existingOut) {
        alreadyCheckedOut = true;
        checkOutInfo = existingOut;
      }
    } else if (guestCheckOuts.length > 0) {
      alreadyCheckedOut = true;
      checkOutInfo = guestCheckOuts[0];
    }
  }

  return {
    query,
    exactMatch,
    possibleMatches: remainingPossibles.slice(0, 100),
    alreadyCheckedIn,
    checkInInfo,
    alreadyCheckedOut,
    checkOutInfo
  };
}

// Perform Check-in (Direct to Supabase ONLY)
async function checkIn(hrId, operator = 'Desk Operator', checkInDate = null) {
  const sbResult = await supabase.checkInGuest(hrId, operator, checkInDate);
  if (!sbResult) {
    return { success: false, message: 'Failed to record check-in in Supabase database. Please verify connection or RLS policies.' };
  }
  return sbResult;
}

// Perform Check-out (Direct to Supabase with Server Storage Fallback)
async function checkOut(hrId, operator = 'Desk Operator', checkOutDate = null) {
  const sbResult = await supabase.checkOutGuest(hrId, operator, checkOutDate);
  if (!sbResult) {
    return { success: false, message: 'Failed to record check-out in Supabase database. Please verify connection or RLS policies.' };
  }
  if (sbResult.success && sbResult.checkOutInfo) {
    saveLocalFileCheckOut(sbResult.checkOutInfo);
  }
  return sbResult;
}

// Add HR (Direct to Supabase ONLY)
async function addHR(hrData) {
  const sbResult = await supabase.addGuest(hrData);
  if (!sbResult) {
    return { success: false, message: 'Failed to add HR guest in Supabase database. Please verify connection or RLS policies.' };
  }
  return sbResult;
}

// Update HR (Direct to Supabase ONLY)
async function updateHR(id, hrData) {
  const sbResult = await supabase.updateGuest(id, hrData);
  if (!sbResult) {
    return { success: false, message: `Failed to update HR guest ID ${id} in Supabase database. Check RLS policies.` };
  }
  return sbResult;
}

// Delete HR (Direct to Supabase ONLY)
async function deleteHR(id) {
  const sbResult = await supabase.deleteGuest(id);
  if (!sbResult) {
    return { success: false, message: `Failed to delete HR guest ID ${id} in Supabase database. Check RLS policies.` };
  }
  return sbResult;
}

// Get Companies List (Direct from Supabase ONLY)
async function getCompanies() {
  const guests = await readGuests();
  const companyCounts = {};
  for (const g of (guests || [])) {
    const comp = g.company_name || 'Independent / Unknown';
    companyCounts[comp] = (companyCounts[comp] || 0) + 1;
  }
  return Object.keys(companyCounts)
    .sort()
    .map(company => ({
      name: company,
      count: companyCounts[company]
    }));
}

// Get HRs by Company (Direct from Supabase ONLY)
async function getHRsByCompany(companyName) {
  const guests = await readGuests();
  const checkIns = await readCheckIns();
  const normTarget = normalizeText(companyName);

  const matched = (guests || []).filter(g => normalizeText(g.company_name) === normTarget || normalizeText(g.company_name).includes(normTarget));

  return matched.map(g => {
    const checkInRecord = checkIns.find(c => c.hr_guest_id === g.id);
    return {
      ...g,
      isCheckedIn: !!checkInRecord,
      checkInInfo: checkInRecord || null
    };
  });
}

// Get Admin Stats (Direct from Supabase ONLY)
async function getAdminStats() {
  const guests = await readGuests();
  const checkIns = await readCheckIns();
  const checkOuts = await readCheckOuts();

  const totalHRs = guests.length;
  const checkedInSet = new Set(checkIns.map(c => c.hr_guest_id));
  const checkedInCount = checkedInSet.size;
  const checkedOutSet = new Set(checkOuts.map(c => c.hr_guest_id));
  const checkedOutCount = checkedOutSet.size;
  const notCheckedInCount = totalHRs - checkedInCount;

  let count22Aug = 0, count23Aug = 0, countBothDays = 0, countDatePending = 0, countWalkIns = 0;

  for (const g of guests) {
    const date = (g.attendance_dates || '').toString();
    const dLower = date.toLowerCase();
    if ((dLower.includes('22') && dLower.includes('23')) || dLower.includes('both') || dLower.includes('all')) {
      countBothDays++;
    } else if (dLower.includes('22')) {
      count22Aug++;
    } else if (dLower.includes('23')) {
      count23Aug++;
    } else {
      countDatePending++;
    }

    if (g.is_walk_in || g.status === 'Walk-in') countWalkIns++;
  }

  return {
    totalHRs,
    checkedInCount,
    checkedOutCount,
    notCheckedInCount,
    count22Aug,
    count23Aug,
    countBothDays,
    countDatePending,
    countWalkIns
  };
}

// Get Audit Logs (Direct from Supabase ONLY)
async function getAuditLogs() {
  const checkIns = await readCheckIns();
  return checkIns.slice().reverse();
}

// Get Checkout Audit Logs (Direct from Supabase ONLY)
async function getCheckoutAuditLogs() {
  const checkOuts = await readCheckOuts();
  const checkIns = await readCheckIns();
  const checkInMap = new Map(checkIns.map(c => [c.hr_guest_id, c]));

  const logs = checkOuts.slice().reverse().map(co => {
    const ci = checkInMap.get(co.hr_guest_id);
    return {
      ...co,
      check_in_date: ci ? ci.check_in_date : (co.check_out_date || 'N/A'),
      check_in_time: ci ? ci.check_in_time : 'N/A'
    };
  });
  return logs;
}

// Batch Import Records (Direct to Supabase ONLY)
async function batchImport(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { success: false, message: 'No valid records provided for import' };
  }

  const sbResult = await supabase.batchImportGuests(records);
  if (!sbResult) {
    return { success: false, message: 'Batch import failed in Supabase database. Please check connection or RLS policies.' };
  }

  return sbResult;
}

// Flush / Clear All Data (Direct to Supabase ONLY)
async function flushAll() {
  const sbResult = await supabase.flushAllData();
  if (!sbResult) {
    return { success: false, message: 'Failed to flush data in Supabase database.' };
  }

  return sbResult;
}

module.exports = {
  initDb,
  readGuests,
  readCheckIns,
  readCheckOuts,
  search,
  checkIn,
  checkOut,
  addHR,
  updateHR,
  deleteHR,
  getCompanies,
  getHRsByCompany,
  getAdminStats,
  getAuditLogs,
  getCheckoutAuditLogs,
  batchImport,
  flushAll
};
