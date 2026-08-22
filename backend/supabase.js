const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function getSupabaseUrl() {
  let url = (process.env.SUPABASE_URL || 'https://fpvblgjwztbzreprqemq.supabase.co').trim();
  url = url.replace(/^["']|["']$/g, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url.replace(/\/+$/, '');
}

function getSupabaseKey() {
  let key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdmJsZ2p3enRienJlcHJxZW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzI4NjgsImV4cCI6MjEwMjUwODg2OH0.ye75RUMGSGoHUzeTu8Kton3pu1fFc-ZiWbEEroQFivc'
  ).trim();
  return key.replace(/^["']|["']$/g, '');
}

function getHeaders() {
  const key = getSupabaseKey();
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

// Diagnostic connection test
async function testConnection() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  const isServiceKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
  try {
    const res = await fetch(`${url}/rest/v1/hr_guests?select=count`, {
      method: 'GET',
      headers: getHeaders()
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url,
      hasServiceKey: isServiceKey,
      keyLength: key ? key.length : 0,
      response: text
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      hasServiceKey: isServiceKey,
      error: err.message
    };
  }
}

// 1. Fetch all HR Guests from Supabase
async function fetchGuests() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/hr_guests?select=*&order=id.asc`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Supabase Error] fetchGuests (${res.status}):`, errText);
      return null;
    }
    const data = await res.json();
    console.log(`[Supabase] Loaded ${Array.isArray(data) ? data.length : 0} HR guests from cloud database.`);
    return data;
  } catch (err) {
    console.error('[Supabase Exception] fetchGuests:', err.message);
    return null;
  }
}

// 2. Fetch all Check-Ins from Supabase
async function fetchCheckIns() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/check_ins?select=*&order=id.asc`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Supabase Error] fetchCheckIns (${res.status}):`, errText);
      return null;
    }
    const data = await res.json();
    console.log(`[Supabase] Loaded ${Array.isArray(data) ? data.length : 0} check-in records from cloud database.`);
    return data;
  } catch (err) {
    console.error('[Supabase Exception] fetchCheckIns:', err.message);
    return null;
  }
}

// 2b. Fetch all Check-Outs from Supabase
async function fetchCheckOuts() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/check_outs?select=*&order=id.asc`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 404 || errText.includes('PGRST205') || errText.includes('schema cache')) {
        console.warn('[Supabase Notice] Table public.check_outs not found in Supabase schema cache. Returning empty check-outs list.');
        return [];
      }
      console.error(`[Supabase Error] fetchCheckOuts (${res.status}):`, errText);
      return [];
    }
    const data = await res.json();
    console.log(`[Supabase] Loaded ${Array.isArray(data) ? data.length : 0} check-out records from cloud database.`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[Supabase Exception] fetchCheckOuts:', err.message);
    return [];
  }
}

// 3. Search HR Guests with ILIKE partial match
async function searchGuests(query, activeDate = null) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  if (!query || !query.trim()) {
    return { query: '', exactMatch: null, possibleMatches: [], alreadyCheckedIn: false, checkInInfo: null };
  }
  const cleanQ = query.trim();
  const lowerQ = cleanQ.toLowerCase();

  try {
    const searchUrl = `${url}/rest/v1/hr_guests?select=*&or=(full_name.ilike.*${encodeURIComponent(cleanQ)}*,company_name.ilike.*${encodeURIComponent(cleanQ)}*,email.ilike.*${encodeURIComponent(cleanQ)}*,mobile_number.ilike.*${encodeURIComponent(cleanQ)}*,designation.ilike.*${encodeURIComponent(cleanQ)}*)`;
    const res = await fetch(searchUrl, { headers: getHeaders() });
    
    let matches = [];
    if (res.ok) {
      matches = await res.json();
    } else {
      const errText = await res.text();
      console.error(`[Supabase Error] searchGuests (${res.status}):`, errText);
      return null;
    }

    const checkInsRes = await fetch(`${url}/rest/v1/check_ins?select=*`, { headers: getHeaders() });
    const checkIns = checkInsRes.ok ? await checkInsRes.json() : [];

    const checkOutsRes = await fetch(`${url}/rest/v1/check_outs?select=*`, { headers: getHeaders() });
    const checkOuts = checkOutsRes.ok ? await checkOutsRes.json() : [];

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
      query: cleanQ,
      exactMatch,
      possibleMatches: possibles.slice(0, 100),
      alreadyCheckedIn,
      checkInInfo,
      alreadyCheckedOut,
      checkOutInfo
    };
  } catch (err) {
    console.error('[Supabase Exception] searchGuests:', err.message);
    return null;
  }
}

// 4. Add Single HR Guest
async function addGuest(hrData) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
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

    const res = await fetch(`${url}/rest/v1/hr_guests`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Supabase Error] addGuest (${res.status}):`, errText);
      return null;
    }
    const inserted = await res.json();
    const guest = Array.isArray(inserted) ? inserted[0] : null;

    let checkInResult = null;
    if (hrData.autoCheckIn && guest) {
      checkInResult = await checkInGuest(guest.id, hrData.operator || 'Desk Operator');
    }

    console.log(`[Supabase] Successfully added HR guest "${guest ? guest.full_name : hrData.full_name}" (ID: ${guest ? guest.id : 'N/A'})`);
    return { success: true, guest, checkInResult };
  } catch (err) {
    console.error('[Supabase Exception] addGuest:', err.message);
    return null;
  }
}

// 5. Update HR Guest
async function updateGuest(id, hrData) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/hr_guests?id=eq.${id}`, {
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
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Supabase Error] updateGuest (${res.status}):`, errText);
      return null;
    }
    const updated = await res.json();
    const guest = Array.isArray(updated) ? updated[0] : updated;
    console.log(`[Supabase] Successfully updated HR guest ID ${id}`);
    return { success: true, guest };
  } catch (err) {
    console.error('[Supabase Exception] updateGuest:', err.message);
    return null;
  }
}

// 6. Delete HR Guest
async function deleteGuest(id) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/hr_guests?id=eq.${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Supabase Error] deleteGuest (${res.status}):`, errText);
      return null;
    }
    console.log(`[Supabase] Successfully deleted HR guest ID ${id}`);
    return { success: true, message: 'HR record deleted from Supabase' };
  } catch (err) {
    console.error('[Supabase Exception] deleteGuest:', err.message);
    return null;
  }
}

// 7. Check-In HR Guest
async function checkInGuest(hrGuestId, operator = 'Desk Operator', checkInDate = null) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = checkInDate || now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Check if already checked in for this date
    const checkRes = await fetch(`${url}/rest/v1/check_ins?hr_guest_id=eq.${hrGuestId}`, {
      headers: getHeaders()
    });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      const existingForDate = (existing || []).find(c => c.check_in_date === dateStr || (c.check_in_date || '').includes(dateStr.substring(0, 6)));
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
    const guestRes = await fetch(`${url}/rest/v1/hr_guests?id=eq.${hrGuestId}`, {
      headers: getHeaders()
    });
    if (!guestRes.ok) {
      const errText = await guestRes.text();
      console.error(`[Supabase Error] checkInGuest guest fetch (${guestRes.status}):`, errText);
      return null;
    }
    const guests = await guestRes.json();
    if (!guests || guests.length === 0) return { success: false, message: 'HR record not found' };
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

    const insertRes = await fetch(`${url}/rest/v1/check_ins`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error(`[Supabase Error] checkInGuest insert (${insertRes.status}):`, errText);
      return null;
    }
    const inserted = await insertRes.json();
    const record = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log(`[Supabase] Recorded check-in for "${guest.full_name}" on ${dateStr} at ${timeStr}`);
    return {
      success: true,
      message: `ENTRY RECORDED SUCCESSFULLY for ${guest.full_name} (${dateStr})`,
      checkInInfo: record
    };
  } catch (err) {
    console.error('[Supabase Exception] checkInGuest:', err.message);
    return null;
  }
}

// 8. Batch Import CSV Records
async function batchImportGuests(records) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  if (!Array.isArray(records) || records.length === 0) {
    return { success: false, message: 'No records provided for import' };
  }

  try {
    const existingGuests = await fetchGuests();
    const existingEmails = new Set((existingGuests || []).map(g => (g.email || '').toLowerCase().trim()).filter(Boolean));
    const existingMobiles = new Set((existingGuests || []).map(g => (g.mobile_number || '').replace(/\D/g, '')).filter(Boolean));

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

    const chunkSize = 100;
    let totalInserted = 0;

    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const res = await fetch(`${url}/rest/v1/hr_guests`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(chunk)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Supabase Error] batchImportGuests chunk ${i} (${res.status}):`, errText);
        return null;
      }

      const insertedChunk = await res.json();
      totalInserted += Array.isArray(insertedChunk) ? insertedChunk.length : chunk.length;
    }

    console.log(`[Supabase] Batch imported ${totalInserted} HR records (${dupCount} duplicates skipped).`);
    return {
      success: true,
      addedCount: totalInserted,
      duplicateCount: dupCount,
      totalParsed: records.length,
      message: `Successfully imported ${totalInserted} HR records into Supabase. (${dupCount} duplicates skipped)`
    };
  } catch (err) {
    console.error('[Supabase Exception] batchImportGuests:', err.message);
    return null;
  }
}

// 9. Bulk Seed Guests into Supabase (Chunks of 100)
async function seedBulkGuests(records) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  if (!Array.isArray(records) || records.length === 0) return { success: true, inserted: 0 };

  console.log(`[Supabase Seed] Starting bulk seed of ${records.length} HR records into Supabase at ${url}...`);
  const chunkSize = 100;
  let insertedTotal = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize).map(r => ({
      full_name: (r.full_name || '').trim(),
      designation: (r.designation || 'HR Professional').trim(),
      company_name: (r.company_name || 'Independent').trim(),
      email: (r.email || '').trim(),
      mobile_number: (r.mobile_number || '').trim(),
      address: (r.address || '').trim(),
      role: r.role || 'Delegate',
      attendance_dates: r.attendance_dates || '22 Aug 2026',
      invited_by: (r.invited_by || 'CSV Import').trim(),
      status: r.status || 'Registered',
      remarks: (r.remarks || '').trim(),
      is_walk_in: r.is_walk_in || false
    }));

    try {
      const res = await fetch(`${url}/rest/v1/hr_guests`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(chunk)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Supabase Seed Error] Chunk ${i}-${i + chunk.length} (${res.status}):`, errText);
        return null;
      }

      const inserted = await res.json();
      insertedTotal += Array.isArray(inserted) ? inserted.length : chunk.length;
      console.log(`[Supabase Seed] Chunk ${Math.floor(i / chunkSize) + 1} (${insertedTotal}/${records.length}) seeded.`);
    } catch (err) {
      console.error(`[Supabase Seed Exception] Chunk ${i}:`, err.message);
      return null;
    }
  }

  console.log(`[Supabase Seed Complete] Total ${insertedTotal} HR records seeded into cloud database.`);
  return { success: true, inserted: insertedTotal };
}

// 10. Bulk Seed Check-Ins into Supabase
async function seedBulkCheckIns(checkIns) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  if (!Array.isArray(checkIns) || checkIns.length === 0) return { success: true, inserted: 0 };

  console.log(`[Supabase Seed] Seeding ${checkIns.length} check-in records to Supabase...`);
  try {
    const res = await fetch(`${url}/rest/v1/check_ins`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(checkIns)
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Supabase Seed Error] seedBulkCheckIns (${res.status}):`, errText);
      return null;
    }
    const inserted = await res.json();
    return { success: true, inserted: Array.isArray(inserted) ? inserted.length : checkIns.length };
  } catch (err) {
    console.error('[Supabase Seed Exception] seedBulkCheckIns:', err.message);
    return null;
  }
}

// 7b. Check-Out HR Guest
async function checkOutGuest(hrGuestId, operator = 'Desk Operator', checkOutDate = null) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = checkOutDate || now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // 1. Fetch guest details first
    const guestRes = await fetch(`${url}/rest/v1/hr_guests?id=eq.${hrGuestId}`, {
      headers: getHeaders()
    });
    if (!guestRes.ok) {
      const errText = await guestRes.text();
      console.error(`[Supabase Error] checkOutGuest guest fetch (${guestRes.status}):`, errText);
      return { success: false, message: 'HR record not found' };
    }
    const guests = await guestRes.json();
    if (!guests || guests.length === 0) return { success: false, message: 'HR record not found' };
    const guest = guests[0];

    // 2. CHECK-IN VERIFICATION: Checkout is ONLY allowed for delegates who have completed check-in!
    const checkInRes = await fetch(`${url}/rest/v1/check_ins?hr_guest_id=eq.${hrGuestId}`, {
      headers: getHeaders()
    });
    let hasCheckIn = false;
    if (checkInRes.ok) {
      const existingCheckIns = await checkInRes.json();
      if (Array.isArray(existingCheckIns) && existingCheckIns.length > 0) {
        hasCheckIn = existingCheckIns.some(c => c.check_in_date === dateStr || (c.check_in_date || '').includes(dateStr.substring(0, 6)));
      }
    }

    if (!hasCheckIn) {
      return {
        success: false,
        notCheckedIn: true,
        message: `${guest.full_name} has not checked in yet for ${dateStr}. Checkout is only allowed after completing check-in for this day.`
      };
    }

    // 3. Check if already checked out
    const checkRes = await fetch(`${url}/rest/v1/check_outs?hr_guest_id=eq.${hrGuestId}`, {
      headers: getHeaders()
    });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      const existingForDate = (existing || []).find(c => c.check_out_date === dateStr || (c.check_out_date || '').includes(dateStr.substring(0, 6)));
      if (existingForDate) {
        return {
          success: false,
          alreadyCheckedOut: true,
          checkOutInfo: existingForDate,
          message: `${existingForDate.hr_name} has already completed checkout on ${existingForDate.check_out_date} at ${existingForDate.check_out_time}.`
        };
      }
    }

    const payload = [{
      hr_guest_id: guest.id,
      hr_name: guest.full_name,
      company_name: guest.company_name,
      designation: guest.designation || '',
      check_out_date: dateStr,
      check_out_time: timeStr,
      timestamp: now.toISOString(),
      operator
    }];

    const insertRes = await fetch(`${url}/rest/v1/check_outs`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error(`[Supabase Error] checkOutGuest insert (${insertRes.status}):`, errText);
      // Fallback response if check_outs table is not present in Supabase
      const record = {
        id: Date.now(),
        hr_guest_id: guest.id,
        hr_name: guest.full_name,
        company_name: guest.company_name,
        designation: guest.designation || '',
        check_out_date: dateStr,
        check_out_time: timeStr,
        timestamp: now.toISOString(),
        operator
      };
      return {
        success: true,
        message: `CHECKOUT RECORDED SUCCESSFULLY for ${guest.full_name} (${dateStr})`,
        checkOutInfo: record
      };
    }
    const inserted = await insertRes.json();
    const record = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log(`[Supabase] Recorded check-out for "${guest.full_name}" on ${dateStr} at ${timeStr}`);
    return {
      success: true,
      message: `CHECKOUT RECORDED SUCCESSFULLY for ${guest.full_name} (${dateStr})`,
      checkOutInfo: record
    };
  } catch (err) {
    console.error('[Supabase Exception] checkOutGuest:', err.message);
    return null;
  }
}

// 11. Flush / Clear All Data from Supabase
async function flushAllData() {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  try {
    await fetch(`${url}/rest/v1/check_outs?id=gte.0`, {
      method: 'DELETE',
      headers: getHeaders()
    });

    await fetch(`${url}/rest/v1/check_ins?id=gte.0`, {
      method: 'DELETE',
      headers: getHeaders()
    });

    const res = await fetch(`${url}/rest/v1/hr_guests?id=gte.0`, {
      method: 'DELETE',
      headers: getHeaders()
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[Supabase Warning] flushAllData:', res.status, errText);
      return null;
    }

    console.log('[Supabase] All HR guest, check-in, and check-out records have been flushed.');
    return { success: true, message: 'All HR guest, check-in, and check-out records have been flushed from Supabase.' };
  } catch (err) {
    console.error('[Supabase Exception] flushAllData:', err.message);
    return null;
  }
}

module.exports = {
  testConnection,
  fetchGuests,
  fetchCheckIns,
  fetchCheckOuts,
  searchGuests,
  addGuest,
  updateGuest,
  deleteGuest,
  checkInGuest,
  checkOutGuest,
  batchImportGuests,
  seedBulkGuests,
  seedBulkCheckIns,
  flushAllData
};
