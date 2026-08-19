const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fpvblgjwztbzreprqemq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function getHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

// 1. Fetch all HR Guests
async function fetchGuests() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hr_guests?select=*&order=id.desc`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Supabase fetchGuests error:', err.message);
    return null;
  }
}

// 2. Search HR Guests with ILIKE partial match
async function searchGuests(query, activeDate = null) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!query || !query.trim()) {
    return { query: '', exactMatch: null, possibleMatches: [], alreadyCheckedIn: false, checkInInfo: null };
  }
  const cleanQ = query.trim();
  const lowerQ = cleanQ.toLowerCase();

  try {
    // Search across full_name, company_name, email, mobile_number, designation
    const searchUrl = `${SUPABASE_URL}/rest/v1/hr_guests?select=*&or=(full_name.ilike.*${encodeURIComponent(cleanQ)}*,company_name.ilike.*${encodeURIComponent(cleanQ)}*,email.ilike.*${encodeURIComponent(cleanQ)}*,mobile_number.ilike.*${encodeURIComponent(cleanQ)}*,designation.ilike.*${encodeURIComponent(cleanQ)}*)`;
    const res = await fetch(searchUrl, { headers: getHeaders() });
    
    let matches = [];
    if (res.ok) {
      matches = await res.json();
    } else {
      // If table missing or error, return null to fallback
      return null;
    }

    const checkInsRes = await fetch(`${SUPABASE_URL}/rest/v1/check_ins?select=*`, { headers: getHeaders() });
    const checkIns = checkInsRes.ok ? await checkInsRes.json() : [];

    let exactMatch = null;
    const possibles = [];

    for (const g of matches) {
      const normName = (g.full_name || '').toLowerCase().trim();
      const normEmail = (g.email || '').toLowerCase().trim();
      const normMobile = (g.mobile_number || '').replace(/\D/g, '');
      const cleanQMobile = cleanQ.replace(/\D/g, '');

      if (
        normName === lowerQ ||
        (normEmail && normEmail === lowerQ) ||
        (normMobile && cleanQMobile.length >= 8 && normMobile === cleanQMobile)
      ) {
        if (!exactMatch) exactMatch = g;
      } else {
        possibles.push(g);
      }
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
      query: cleanQ,
      exactMatch,
      possibleMatches: possibles.slice(0, 100),
      alreadyCheckedIn,
      checkInInfo
    };
  } catch (err) {
    console.error('Supabase search error:', err.message);
    return null;
  }
}

// 3. Add Single HR Guest
async function addGuest(hrData) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const payload = [{
      full_name: (hrData.full_name || '').trim(),
      designation: (hrData.designation || 'HR Professional').trim(),
      company_name: (hrData.company_name || 'Independent').trim(),
      email: (hrData.email || '').trim(),
      mobile_number: (hrData.mobile_number || '').trim(),
      address: (hrData.address || '').trim(),
      role: hrData.role || 'Delegate',
      attendance_dates: hrData.attendance_dates || '22 Aug 2026',
      invited_by: (hrData.invited_by || 'Registration Desk').trim(),
      status: hrData.status || 'Walk-in',
      remarks: (hrData.remarks || '').trim(),
      is_walk_in: hrData.is_walk_in !== undefined ? hrData.is_walk_in : true
    }];

    const res = await fetch(`${SUPABASE_URL}/rest/v1/hr_guests`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) return null;
    const inserted = await res.json();
    const guest = inserted[0];

    let checkInResult = null;
    if (hrData.autoCheckIn && guest) {
      checkInResult = await checkInGuest(guest.id, hrData.operator || 'Desk Operator');
    }

    return { success: true, guest, checkInResult };
  } catch (err) {
    console.error('Supabase addGuest error:', err.message);
    return null;
  }
}

// 4. Update HR Guest
async function updateGuest(id, hrData) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hr_guests?id=eq.${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({
        full_name: hrData.full_name,
        company_name: hrData.company_name,
        designation: hrData.designation,
        email: hrData.email,
        mobile_number: hrData.mobile_number,
        address: hrData.address,
        role: hrData.role,
        attendance_dates: hrData.attendance_dates,
        invited_by: hrData.invited_by,
        remarks: hrData.remarks,
        updated_at: new Date().toISOString()
      })
    });
    if (!res.ok) return null;
    const updated = await res.json();
    return { success: true, guest: updated[0] };
  } catch (err) {
    console.error('Supabase updateGuest error:', err.message);
    return null;
  }
}

// 5. Delete HR Guest
async function deleteGuest(id) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hr_guests?id=eq.${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) return null;
    return { success: true, message: 'HR record deleted from Supabase' };
  } catch (err) {
    console.error('Supabase deleteGuest error:', err.message);
    return null;
  }
}

// 6. Check-In HR Guest
async function checkInGuest(hrGuestId, operator = 'Desk Operator', checkInDate = null) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = checkInDate || now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Check if already checked in for this date
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/check_ins?hr_guest_id=eq.${hrGuestId}`, {
      headers: getHeaders()
    });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      const existingForDate = existing.find(c => c.check_in_date === dateStr || (c.check_in_date || '').includes(dateStr.substring(0, 6)));
      if (existingForDate) {
        return {
          success: false,
          alreadyCheckedIn: true,
          checkInInfo: existingForDate,
          message: `${existingForDate.hr_name} has already checked in for ${dateStr} at ${existingForDate.check_in_time}.`
        };
      }
    }

    // Fetch guest details
    const guestRes = await fetch(`${SUPABASE_URL}/rest/v1/hr_guests?id=eq.${hrGuestId}`, {
      headers: getHeaders()
    });
    if (!guestRes.ok) return null;
    const guests = await guestRes.json();
    if (guests.length === 0) return { success: false, message: 'HR record not found' };
    const guest = guests[0];

    const payload = [{
      hr_guest_id: guest.id,
      hr_name: guest.full_name,
      company_name: guest.company_name,
      designation: guest.designation || '',
      check_in_date: dateStr,
      check_in_time: timeStr,
      timestamp: now.toISOString(),
      operator
    }];

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/check_ins`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!insertRes.ok) return null;
    const inserted = await insertRes.json();
    return {
      success: true,
      message: `ENTRY RECORDED SUCCESSFULLY for ${guest.full_name} (${dateStr})`,
      checkInInfo: inserted[0]
    };
  } catch (err) {
    console.error('Supabase checkInGuest error:', err.message);
    return null;
  }
}

// 7. Batch Import CSV Records
async function batchImportGuests(records) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!Array.isArray(records) || records.length === 0) {
    return { success: false, message: 'No records provided for import' };
  }

  try {
    const existingGuests = await fetchGuests();
    const existingEmails = new Set((existingGuests || []).map(g => (g.email || '').toLowerCase().trim()));
    const existingMobiles = new Set((existingGuests || []).map(g => (g.mobile_number || '').replace(/\D/g, '')));

    const toInsert = [];
    let dupCount = 0;

    for (const r of records) {
      const name = r.full_name || r.name || r['Full Name'];
      if (!name) continue;

      const email = (r.email || r['Email'] || '').toString().trim();
      const mobile = (r.mobile_number || r.mobile || r['Mobile'] || '').toString().trim();
      const cleanMobile = mobile.replace(/\D/g, '');

      if ((email && existingEmails.has(email.toLowerCase())) || (cleanMobile && cleanMobile.length >= 8 && existingMobiles.has(cleanMobile))) {
        dupCount++;
        continue;
      }

      if (email) existingEmails.add(email.toLowerCase());
      if (cleanMobile) existingMobiles.add(cleanMobile);

      toInsert.push({
        full_name: name.trim(),
        company_name: (r.company_name || r.company || r['Company'] || 'Independent').toString().trim(),
        designation: (r.designation || r['Designation'] || 'HR Professional').toString().trim(),
        email: email,
        mobile_number: mobile,
        address: (r.address || r['Address'] || '').toString().trim(),
        role: (r.role || r['Role'] || 'Delegate').toString().trim(),
        attendance_dates: (r.attendance_dates || r['Attendance Date'] || '22 Aug 2026').toString().trim(),
        invited_by: (r.invited_by || r['Invited By'] || 'CSV Import').toString().trim(),
        status: 'Registered',
        remarks: (r.remarks || r['Remarks'] || 'Imported via CSV').toString().trim(),
        is_walk_in: false
      });
    }

    if (toInsert.length === 0) {
      return { success: true, addedCount: 0, duplicateCount: dupCount, message: `All ${dupCount} records were duplicates and skipped.` };
    }

    // Batch insert into Supabase PostgREST endpoint
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hr_guests`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(toInsert)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('Supabase batch import failed, falling back to local storage:', res.status, errText);
      return null;
    }

    let inserted = [];
    try {
      inserted = await res.json();
    } catch (e) {
      inserted = toInsert;
    }

    return {
      success: true,
      addedCount: Array.isArray(inserted) ? inserted.length : toInsert.length,
      duplicateCount: dupCount,
      totalParsed: records.length,
      message: `Successfully imported ${Array.isArray(inserted) ? inserted.length : toInsert.length} HR records into database. (${dupCount} duplicates skipped)`
    };
  } catch (err) {
    console.error('Supabase batchImport error:', err.message);
    return null;
  }
}

// 8. Flush / Clear All Data from Supabase
async function flushAllData() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    // Delete check-ins first (FK reference)
    await fetch(`${SUPABASE_URL}/rest/v1/check_ins?id=gte.0`, {
      method: 'DELETE',
      headers: getHeaders()
    });

    // Delete hr_guests
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hr_guests?id=gte.0`, {
      method: 'DELETE',
      headers: getHeaders()
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('Supabase flush warning:', res.status, errText);
      return null;
    }

    return { success: true, message: 'All HR guest and check-in records have been flushed from Supabase.' };
  } catch (err) {
    console.error('Supabase flushAllData error:', err.message);
    return null;
  }
}

module.exports = {
  fetchGuests,
  searchGuests,
  addGuest,
  updateGuest,
  deleteGuest,
  checkInGuest,
  batchImportGuests,
  flushAllData
};
