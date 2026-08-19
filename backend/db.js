const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

const DATA_DIR = path.join(__dirname, 'data');
const GUESTS_FILE = path.join(DATA_DIR, 'hr_guests.json');
const CHECKINS_FILE = path.join(DATA_DIR, 'check_ins.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Local File Helper: Read Guests
function readGuestsLocal() {
  if (!fs.existsSync(GUESTS_FILE)) {
    saveGuestsLocal([]);
    return [];
  }
  try {
    const data = fs.readFileSync(GUESTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    saveGuestsLocal([]);
    return [];
  }
}

// Local File Helper: Save Guests
function saveGuestsLocal(guests) {
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2), 'utf8');
}

// Local File Helper: Read Check-ins
function readCheckInsLocal() {
  if (!fs.existsSync(CHECKINS_FILE)) {
    saveCheckInsLocal([]);
    return [];
  }
  try {
    const data = fs.readFileSync(CHECKINS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    saveCheckInsLocal([]);
    return [];
  }
}

// Local File Helper: Save Check-ins
function saveCheckInsLocal(checkIns) {
  fs.writeFileSync(CHECKINS_FILE, JSON.stringify(checkIns, null, 2), 'utf8');
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

// Read Guests (Authoritative local storage with real-time sync)
async function readGuests() {
  return readGuestsLocal();
}

// Read Check-ins
async function readCheckIns() {
  return readCheckInsLocal();
}

// Main Search Function (100% Case-Insensitive & Diacritic-Insensitive)
async function search(rawQuery, activeDate = null) {
  const query = rawQuery ? rawQuery.trim() : '';
  if (!query) {
    return { query: '', exactMatch: null, possibleMatches: [], alreadyCheckedIn: false, checkInInfo: null };
  }

  // Local Search Engine
  const guests = readGuestsLocal();
  const checkIns = readCheckInsLocal();
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

    // 1. Strict Exact Match (Full Name, Email, Mobile)
    if (
      normName === normQuery ||
      (normEmail && normEmail === normQuery) ||
      (normMobile && normMobile === normQuery) ||
      (normMobile && normMobile.replace(/\D/g, '') === normQuery.replace(/\D/g, '') && normQuery.length >= 8)
    ) {
      exactMatches.push(g);
      continue;
    }

    // 2. Exact First/Last Name Match (e.g. query "nidhi" or "Nidhi" for "Nidhi Saxena")
    if (nameWords.includes(normQuery) && normQuery.length >= 3) {
      possibleMatchesMap.set(g.id, { guest: g, score: 95 });
      continue;
    }

    // 3. Prefix & Substring Scoring (Case-insensitive)
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

  if (exactMatch) {
    const guestCheckIns = checkIns.filter(c => c.hr_guest_id === exactMatch.id);
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
  }

  return {
    query,
    exactMatch,
    possibleMatches: remainingPossibles.slice(0, 100),
    alreadyCheckedIn,
    checkInInfo
  };
}

// Perform Check-in
async function checkIn(hrId, operator = 'Desk Operator', checkInDate = null) {
  const guests = readGuestsLocal();
  const guest = guests.find(g => g.id === parseInt(hrId, 10));
  if (!guest) return { success: false, message: 'HR guest record not found' };

  const checkIns = readCheckInsLocal();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const targetDateStr = checkInDate || now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Scope existing check-in search to the requested summit day
  const existing = checkIns.find(c => c.hr_guest_id === guest.id && (c.check_in_date === targetDateStr || (c.check_in_date || '').includes(targetDateStr.substring(0, 6))));
  if (existing) {
    return {
      success: false,
      alreadyCheckedIn: true,
      checkInInfo: existing,
      message: `${guest.full_name} from ${guest.company_name} has already checked in for ${targetDateStr} at ${existing.check_in_time}.`
    };
  }

  const record = {
    id: Date.now(),
    hr_guest_id: guest.id,
    hr_name: guest.full_name,
    company_name: guest.company_name,
    designation: guest.designation,
    check_in_date: targetDateStr,
    check_in_time: timeStr,
    timestamp: now.toISOString(),
    operator
  };

  checkIns.push(record);
  saveCheckInsLocal(checkIns);

  // Background Cloud Sync (non-blocking)
  supabase.checkInGuest(hrId, operator, targetDateStr).catch(err => console.warn('Supabase checkin sync skipped:', err.message));

  return { success: true, message: `Entry recorded successfully for ${guest.full_name} (${targetDateStr})`, checkInInfo: record };
}

// Add HR
async function addHR(hrData) {
  const guests = readGuestsLocal();
  const newId = guests.length > 0 ? Math.max(...guests.map(g => g.id || 0)) + 1 : 1;

  const newGuest = {
    id: newId,
    full_name: hrData.full_name ? hrData.full_name.trim() : 'Walk-in HR',
    designation: hrData.designation ? hrData.designation.trim() : 'HR Delegate',
    company_name: hrData.company_name ? hrData.company_name.trim() : 'Independent / Direct',
    email: hrData.email ? hrData.email.trim() : '',
    mobile_number: hrData.mobile_number ? hrData.mobile_number.trim() : '',
    address: hrData.address ? hrData.address.trim() : '',
    role: hrData.role || 'Delegate',
    attendance_dates: hrData.attendance_dates || '22 Aug 2026',
    invited_by: hrData.invited_by ? hrData.invited_by.trim() : 'Desk Registration',
    status: 'Walk-in',
    remarks: hrData.remarks ? hrData.remarks.trim() : 'Walk-in Registration',
    is_walk_in: true,
    created_at: new Date().toISOString()
  };

  guests.unshift(newGuest);
  saveGuestsLocal(guests);

  let checkInResult = null;
  if (hrData.autoCheckIn) {
    checkInResult = await checkIn(newGuest.id, hrData.operator || 'Desk Operator');
  }

  // Background Cloud Sync (non-blocking)
  supabase.addGuest(hrData).catch(err => console.warn('Supabase addGuest sync skipped:', err.message));

  return { success: true, guest: newGuest, checkInResult };
}

// Update HR
async function updateHR(id, hrData) {
  const guests = readGuestsLocal();
  const idx = guests.findIndex(g => g.id === parseInt(id, 10));
  if (idx === -1) return { success: false, message: 'HR record not found' };

  guests[idx] = {
    ...guests[idx],
    full_name: hrData.full_name || guests[idx].full_name,
    designation: hrData.designation !== undefined ? hrData.designation : guests[idx].designation,
    company_name: hrData.company_name || guests[idx].company_name,
    email: hrData.email !== undefined ? hrData.email : guests[idx].email,
    mobile_number: hrData.mobile_number !== undefined ? hrData.mobile_number : guests[idx].mobile_number,
    address: hrData.address !== undefined ? hrData.address : guests[idx].address,
    role: hrData.role || guests[idx].role,
    attendance_dates: hrData.attendance_dates || guests[idx].attendance_dates,
    invited_by: hrData.invited_by !== undefined ? hrData.invited_by : guests[idx].invited_by,
    remarks: hrData.remarks !== undefined ? hrData.remarks : guests[idx].remarks,
    updated_at: new Date().toISOString()
  };

  saveGuestsLocal(guests);

  // Background Cloud Sync (non-blocking)
  supabase.updateGuest(id, hrData).catch(err => console.warn('Supabase updateGuest sync skipped:', err.message));

  return { success: true, guest: guests[idx] };
}

// Delete HR
async function deleteHR(id) {
  let guests = readGuestsLocal();
  const initialLength = guests.length;
  const guestId = parseInt(id, 10);
  guests = guests.filter(g => g.id !== guestId);
  if (guests.length === initialLength) return { success: false, message: 'HR record not found' };
  
  saveGuestsLocal(guests);

  let checkIns = readCheckInsLocal();
  checkIns = checkIns.filter(c => c.hr_guest_id !== guestId);
  saveCheckInsLocal(checkIns);

  // Background Cloud Sync (non-blocking)
  supabase.deleteGuest(id).catch(err => console.warn('Supabase deleteGuest sync skipped:', err.message));

  return { success: true, message: 'HR record deleted successfully' };
}

// Get Companies List
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

// Get HRs by Company
async function getHRsByCompany(companyName) {
  const guests = await readGuests();
  const checkIns = readCheckInsLocal();
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

// Get Admin Stats
async function getAdminStats() {
  const guests = (await readGuests()) || [];
  const checkIns = readCheckInsLocal();

  const totalHRs = guests.length;
  const checkedInSet = new Set(checkIns.map(c => c.hr_guest_id));
  const checkedInCount = checkedInSet.size;
  const notCheckedInCount = totalHRs - checkedInCount;

  let count22Aug = 0, count23Aug = 0, countBothDays = 0, countDatePending = 0, countWalkIns = 0;

  for (const g of guests) {
    const date = g.attendance_dates || '';
    if (date.includes('22 Aug') && date.includes('23 Aug')) countBothDays++;
    else if (date.toLowerCase().includes('both')) countBothDays++;
    else if (date.includes('22 Aug')) count22Aug++;
    else if (date.includes('23 Aug')) count23Aug++;
    else countDatePending++;

    if (g.is_walk_in || g.status === 'Walk-in') countWalkIns++;
  }

  return {
    totalHRs,
    checkedInCount,
    notCheckedInCount,
    count22Aug,
    count23Aug,
    countBothDays,
    countDatePending,
    countWalkIns
  };
}

// Get Audit Logs
async function getAuditLogs() {
  const checkIns = readCheckInsLocal();
  return checkIns.slice().reverse();
}

// Batch Import Records
async function batchImport(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { success: false, message: 'No valid records provided for import' };
  }

  // Try Supabase first if available
  let sbResult = null;
  try {
    sbResult = await supabase.batchImportGuests(records);
  } catch (err) {
    console.error('Supabase batchImport caught error:', err);
    sbResult = null;
  }

  // Always update local database file hr_guests.json
  const guests = readGuestsLocal();
  const normKey = (str) => (str || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');

  const existingEmails = new Set(guests.filter(g => g.email).map(g => g.email.toLowerCase().trim()));
  const existingMobiles = new Set(guests.filter(g => g.mobile_number).map(g => (g.mobile_number || '').replace(/\D/g, '')));
  const existingNameCompanies = new Set(guests.filter(g => g.full_name).map(g => normKey(g.full_name) + '___' + normKey(g.company_name)));
  const existingNames = new Set(guests.filter(g => g.full_name).map(g => normKey(g.full_name)));

  let addedCount = 0;
  let duplicateCount = 0;
  let maxId = guests.length > 0 ? Math.max(...guests.map(g => g.id || 0)) : 0;

  for (const r of records) {
    const name = (r.full_name || r.name || r['Full Name'] || '').trim();
    if (!name) continue;

    const email = (r.email || r['Email'] || '').toString().trim().toLowerCase();
    const mobile = (r.mobile_number || r.mobile || r['Mobile'] || '').toString().trim();
    const cleanMobile = mobile.replace(/\D/g, '');
    const company = (r.company_name || r.company || r['Company'] || 'Independent').toString().trim();

    const nName = normKey(name);
    const nCompany = normKey(company);
    const nameCompKey = nName + '___' + nCompany;

    const isDup = (email && existingEmails.has(email)) ||
                  (cleanMobile.length >= 8 && existingMobiles.has(cleanMobile)) ||
                  (nName && nCompany && existingNameCompanies.has(nameCompKey)) ||
                  (nName && (!nCompany || nCompany === 'independent') && existingNames.has(nName));

    if (isDup) {
      duplicateCount++;
      continue;
    }

    if (email) existingEmails.add(email);
    if (cleanMobile) existingMobiles.add(cleanMobile);
    if (nName && nCompany) existingNameCompanies.add(nameCompKey);
    if (nName) existingNames.add(nName);

    maxId++;
    const newGuest = {
      id: maxId,
      full_name: name,
      designation: (r.designation || r['Designation'] || 'HR Professional').toString().trim(),
      company_name: company,
      email: email,
      mobile_number: mobile,
      address: (r.address || r['Address'] || '').toString().trim(),
      role: (r.role || r['Role'] || 'Delegate').toString().trim(),
      attendance_dates: (r.attendance_dates || r['Attendance Date'] || '22 Aug 2026').toString().trim(),
      invited_by: (r.invited_by || r['Invited By'] || 'CSV Import').toString().trim(),
      status: 'Registered',
      remarks: (r.remarks || r['Remarks'] || 'Imported via Admin Portal').toString().trim(),
      is_walk_in: false,
      created_at: new Date().toISOString()
    };

    guests.push(newGuest);
    addedCount++;
  }

  saveGuestsLocal(guests);

  if (sbResult && sbResult.success) {
    return sbResult;
  }

  return {
    success: true,
    addedCount,
    duplicateCount,
    totalParsed: records.length,
    message: `Successfully imported ${addedCount} HR records into database. (${duplicateCount} duplicates skipped)`
  };
}

// Flush / Clear All Data
async function flushAll() {
  try {
    await supabase.flushAllData();
  } catch (err) {
    console.error('Supabase flush caught error:', err);
  }
  saveGuestsLocal([]);
  saveCheckInsLocal([]);

  return { success: true, message: 'All HR guest and check-in records have been flushed from database.' };
}

module.exports = {
  readGuests,
  readCheckIns,
  search,
  checkIn,
  addHR,
  updateHR,
  deleteHR,
  getCompanies,
  getHRsByCompany,
  getAdminStats,
  getAuditLogs,
  batchImport,
  flushAll
};
