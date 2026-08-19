/* =========================================================
   HR Summit 2026 — Registration & Verification Portal
   Frontend Application Engine
   ========================================================= */

// --- Global State & Storage Key ---
const STORAGE_KEY_GUESTS = 'hr_summit_guests_v1';
const STORAGE_KEY_CHECKINS = 'hr_summit_checkins_v1';
const STORAGE_KEY_THEME = 'hr_summit_theme';

function getLiveDateString() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

let isBackendAvailable = true;
let currentView = 'desk'; // 'desk' | 'admin'
let currentAdminTab = 'hr'; // 'hr' | 'audit'
let searchDebounceTimer = null;
let currentCompanyFilter = null;
let adminCachedGuests = [];
let adminCachedCheckIns = [];

function populateAdminDateFilter() {
  const checkIns = (adminCachedCheckIns && adminCachedCheckIns.length > 0) ? adminCachedCheckIns : getLocalCheckIns();
  const liveDate = getLiveDateString();

  const datesSet = new Set();
  datesSet.add(liveDate);

  for (const c of checkIns) {
    if (c.check_in_date) datesSet.add(c.check_in_date);
  }

  const select = document.getElementById('filter-date');
  if (select) {
    const curVal = select.value;
    let optHtml = `<option value="">All Check-in Dates</option>`;
    for (const d of Array.from(datesSet).sort()) {
      optHtml += `<option value="${escapeHTML(d)}">${d === liveDate ? `Today (${escapeHTML(d)})` : escapeHTML(d)}</option>`;
    }
    select.innerHTML = optHtml;
    if (curVal && datesSet.has(curVal)) select.value = curVal;
  }
}

// Initial HR Data (Data-driven, populated dynamically or via CSV upload)
const INITIAL_SEED_GUESTS = [];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupKeyboardShortcuts();
  checkLocalStorageInit();
  await verifyBackendStatus();
  renderCompanyBar();
  refreshAdminData();
});

// Theme Initializer
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem(STORAGE_KEY_THEME, isDark ? 'dark' : 'light');
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      switchView('desk');
      const input = document.getElementById('search-input');
      if (input) input.focus();
    } else if (e.key === 'Escape') {
      closeWalkinModal();
      closeImportModal();
      closeEditModal();
      clearSearch();
    }
  });
}

// Local Storage Setup
function checkLocalStorageInit() {
  if (!localStorage.getItem(STORAGE_KEY_GUESTS)) {
    localStorage.setItem(STORAGE_KEY_GUESTS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEY_CHECKINS)) {
    localStorage.setItem(STORAGE_KEY_CHECKINS, JSON.stringify([]));
  }
}

// Backend Healthcheck
async function verifyBackendStatus() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      isBackendAvailable = true;
    } else {
      isBackendAvailable = false;
    }
  } catch (err) {
    isBackendAvailable = false;
  }
}

// --- Navigation Controller ---
function openDeskSearch() {
  switchView('desk');
  const landing = document.getElementById('desk-landing-view');
  const workspace = document.getElementById('desk-workspace-view');
  if (landing) landing.style.display = 'none';
  if (workspace) workspace.style.display = 'block';

  setTimeout(() => {
    const input = document.getElementById('search-input');
    if (input) input.focus();
  }, 50);
}

function showHomeScreen() {
  switchView('desk');
  const landing = document.getElementById('desk-landing-view');
  const workspace = document.getElementById('desk-workspace-view');
  if (landing) landing.style.display = 'flex';
  if (workspace) workspace.style.display = 'none';
}

function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-pill').forEach(el => el.classList.remove('active'));

  if (viewName === 'desk') {
    document.getElementById('view-desk').classList.add('active');
    document.getElementById('nav-btn-desk').classList.add('active');
  } else {
    document.getElementById('view-admin').classList.add('active');
    document.getElementById('nav-btn-admin').classList.add('active');
    refreshAdminData();
  }
}

function switchAdminTab(tabName) {
  currentAdminTab = tabName;
  document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

  if (tabName === 'hr') {
    document.getElementById('tab-btn-hr').classList.add('active');
    document.getElementById('tab-hr').classList.add('active');
  } else {
    document.getElementById('tab-btn-audit').classList.add('active');
    document.getElementById('tab-audit').classList.add('active');
    renderAuditLogsTable();
  }
}

// --- Local Engine Helper Methods (Fallback) ---
function getLocalGuests() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY_GUESTS) || '[]');
}

function saveLocalGuests(guests) {
  localStorage.setItem(STORAGE_KEY_GUESTS, JSON.stringify(guests));
}

function getLocalCheckIns() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY_CHECKINS) || '[]');
}

function saveLocalCheckIns(checkIns) {
  localStorage.setItem(STORAGE_KEY_CHECKINS, JSON.stringify(checkIns));
}

function normalize(str) {
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

// --- Desk Search Engine ---
function onSearchInput(event) {
  const query = event.target.value;
  const clearBtn = document.getElementById('btn-clear-search');
  if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    executeSearch(query);
  }, 200);
}

function handleDeskSearch(event) {
  event.preventDefault();
  const query = document.getElementById('search-input').value;
  executeSearch(query);
}

function quickSearch(queryText) {
  const input = document.getElementById('search-input');
  input.value = queryText;
  document.getElementById('btn-clear-search').style.display = 'block';
  executeSearch(queryText);
}

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('btn-clear-search').style.display = 'none';
  currentCompanyFilter = null;
  document.querySelectorAll('.comp-pill').forEach(p => p.classList.remove('active'));
  const container = document.getElementById('results-container');
  container.innerHTML = `
    <div class="empty-state" id="initial-empty-state">
      <div class="empty-icon">🔍</div>
      <h3>Ready for Verification</h3>
      <p>Enter an HR guest's name, company, email or phone number above to verify their details and record entry.</p>
    </div>
  `;
}

// Search Execution
async function executeSearch(rawQuery) {
  const query = rawQuery ? rawQuery.trim() : '';
  const container = document.getElementById('results-container');

  if (!query) {
    clearSearch();
    return;
  }

  container.innerHTML = `<div class="empty-state">Searching database for "${escapeHTML(query)}"...</div>`;

  let searchResult = null;

  if (isBackendAvailable) {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        searchResult = await res.json();
      }
    } catch (err) {
      console.warn('Backend search error, switching to local engine fallback:', err);
      isBackendAvailable = false;
    }
  }

  // Fallback to local client engine if backend is unreachable
  if (!searchResult) {
    searchResult = executeLocalSearch(query);
  }

  renderSearchResults(searchResult);
}

// Client-side Local Search Engine (100% Case-Insensitive)
function executeLocalSearch(rawQuery) {
  const query = rawQuery.trim();
  const guests = getLocalGuests();
  const checkIns = getLocalCheckIns();
  const normQuery = normalize(query);
  const words = normQuery.split(' ').filter(w => w.length > 0);

  let exactMatches = [];
  const possiblesMap = new Map();

  for (const g of guests) {
    const normName = normalize(g.full_name);
    const normCompany = normalize(g.company_name);
    const normEmail = normalize(g.email);
    const normMobile = normalize(g.mobile_number);
    const normDesig = normalize(g.designation);

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

    // 2. Exact First/Last Name Match
    if (nameWords.includes(normQuery) && normQuery.length >= 3) {
      possiblesMap.set(g.id, { guest: g, score: 95 });
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
    if (normDesig.includes(normQuery)) score += 20;

    for (const w of words) {
      if (normName.includes(w)) score += 15;
      if (normCompany.includes(w)) score += 10;
    }

    if (score >= 10) {
      possiblesMap.set(g.id, { guest: g, score });
    }
  }

  const sortedPossibles = Array.from(possiblesMap.values())
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
    if (guestCheckIns.length > 0) {
      alreadyCheckedIn = true;
      checkInInfo = guestCheckIns[0];
    }
  }

  return {
    query,
    exactMatch,
    possibleMatches: sortedPossibles,
    alreadyCheckedIn,
    checkInInfo
  };
}

// Render Search Result Cards
function renderSearchResults(result) {
  const container = document.getElementById('results-container');
  const { exactMatch, possibleMatches, alreadyCheckedIn, checkInInfo, query } = result;

  if (exactMatch) {
    if (alreadyCheckedIn) {
      // CASE A: CHECKED IN (GREEN CARD)
      container.innerHTML = `
        <div class="state-card state-card--checked-in">
          <div class="state-header">
            <span class="state-badge state-badge--green">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              CHECKED IN (${escapeHTML(checkInInfo.check_in_date)})
            </span>
            <span class="tag tag--accent">${escapeHTML(exactMatch.role || 'Delegate')}</span>
          </div>
          <div class="guest-profile-grid">
            <div class="guest-main">
              <h3 class="guest-name">${escapeHTML(exactMatch.full_name)}</h3>
              <p class="guest-desig">${escapeHTML(exactMatch.designation || 'HR Professional')}</p>
              <p class="guest-company">🏢 ${escapeHTML(exactMatch.company_name)}</p>
            </div>
            <div>
              <span class="tag tag--green">Invited: ${escapeHTML(exactMatch.invited_by || 'MIT Team')}</span>
            </div>
          </div>

          <div class="already-checked-box">
            <div class="already-checked-icon">🟢</div>
            <div class="already-checked-text">
              <h4>Entry Granted &amp; Verified</h4>
              <p><strong>${escapeHTML(exactMatch.full_name)}</strong> checked in at <strong>${checkInInfo.check_in_time}</strong> on <strong>${checkInInfo.check_in_date}</strong> (Operator: ${escapeHTML(checkInInfo.operator || 'Desk')}).</p>
            </div>
          </div>
        </div>
      `;
    } else {
      // CASE A: VERIFIED / NOT CHECKED IN (YELLOW CARD)
      container.innerHTML = `
        <div class="state-card state-card--verified-pending">
          <div class="state-header">
            <span class="state-badge state-badge--yellow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              VERIFIED DELEGATE &middot; NOT CHECKED IN
            </span>
            <span class="tag tag--yellow">${escapeHTML(exactMatch.role || 'Delegate')}</span>
          </div>

          <div class="guest-profile-grid">
            <div class="guest-main">
              <h3 class="guest-name">${escapeHTML(exactMatch.full_name)}</h3>
              <p class="guest-desig">${escapeHTML(exactMatch.designation || 'HR Professional')}</p>
              <p class="guest-company">🏢 ${escapeHTML(exactMatch.company_name)}</p>
            </div>
          </div>

          <div class="details-list">
            <div class="detail-item">
              <span class="detail-label">Email Address</span>
              <span class="detail-value">${escapeHTML(exactMatch.email || 'N/A')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Mobile Number</span>
              <span class="detail-value">${escapeHTML(exactMatch.mobile_number || 'N/A')}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Invited By</span>
              <span class="detail-value">${escapeHTML(exactMatch.invited_by || 'MIT Team')}</span>
            </div>
            ${exactMatch.remarks ? `
            <div class="detail-item" style="grid-column: span 2;">
              <span class="detail-label">Remarks</span>
              <span class="detail-value">${escapeHTML(exactMatch.remarks)}</span>
            </div>` : ''}
          </div>

          <div class="checkin-action-wrap" id="checkin-action-${exactMatch.id}">
            <button type="button" class="btn-checkin" onclick="processCheckIn(${exactMatch.id})">
              ALLOW ENTRY / CHECK IN
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </div>
      `;
    }
    return;
  }

  if (possibleMatches && possibleMatches.length > 0) {
    // CASE B (MULTIPLE MATCHES / COMPANY SEARCH)
    const checkIns = (adminCachedCheckIns && adminCachedCheckIns.length > 0) ? adminCachedCheckIns : getLocalCheckIns();

    const listHTML = possibleMatches.map(g => {
      const guestCheckIns = checkIns.filter(c => c.hr_guest_id === g.id);
      const checkInfo = guestCheckIns[0] || null;
      const isCheckedIn = !!checkInfo;

      return `
        <div class="possible-item ${isCheckedIn ? 'possible-item--checked' : ''}">
          <div class="possible-info">
            <div class="possible-title-line">
              <h4>${escapeHTML(g.full_name)}</h4>
              ${isCheckedIn ? 
                `<span class="tag tag--green">🟢 Checked In (${escapeHTML(checkInfo.check_in_date)})</span>` : 
                `<span class="tag tag--yellow">🟡 Verified (Not Checked In)</span>`
              }
            </div>
            <p>${escapeHTML(g.designation || 'HR Professional')} &middot; <strong>${escapeHTML(g.company_name)}</strong></p>
            <p style="font-size:0.78rem; opacity:0.8; margin-top:2px;">Email: ${escapeHTML(g.email || 'N/A')} &middot; Mobile: ${escapeHTML(g.mobile_number || 'N/A')}</p>
          </div>
          <div class="possible-actions">
            ${!isCheckedIn ? `
              <button type="button" class="btn-checkin-sm" onclick="processCheckIn(${g.id})">
                ✓ Check In
              </button>
            ` : ''}
            <button type="button" class="btn-select-possible" onclick="selectPossibleGuest('${escapeJS(g.full_name)}')">
              View &rarr;
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="state-card state-card--possibles">
        <div class="state-header">
          <span class="state-badge state-badge--yellow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            SEARCH RESULTS (${possibleMatches.length} DELEGATES)
          </span>
          <span class="tag tag--accent">Live Registration</span>
        </div>
        <h3 class="possibles-title">HR Delegates for "${escapeHTML(query)}"</h3>
        <p class="possibles-sub">Browse delegates below. Click <strong>✓ Check In</strong> to record live entry instantly:</p>

        <div class="possibles-list">
          ${listHTML}
        </div>
      </div>
    `;
    return;
  }

  // CASE C (RED/NEUTRAL NO RECORD FOUND)
  container.innerHTML = `
    <div class="state-card state-card--no-match">
      <div class="no-match-icon">❌</div>
      <h3 class="no-match-title">No HR Record Found</h3>
      <p class="no-match-desc">No registered HR record matching "<strong>${escapeHTML(query)}</strong>" was found in our database.</p>
      <button type="button" class="btn-add-walkin" onclick="openWalkinModal('${escapeJS(query)}')">
        + ADD NEW HR (WALK-IN)
      </button>
    </div>
  `;
}

function selectPossibleGuest(fullName) {
  quickSearch(fullName);
}

let pendingCheckInGuest = null;

function promptCheckIn(hrGuestId) {
  processCheckIn(hrGuestId);
}

function closeConfirmCheckinModal() {
  const modal = document.getElementById('modal-confirm-checkin');
  if (modal) modal.classList.remove('active');
  pendingCheckInGuest = null;
}

function executeConfirmedCheckIn() {
  if (!pendingCheckInGuest) return;
  const guestId = pendingCheckInGuest.id;
  closeConfirmCheckinModal();
  processCheckIn(guestId);
}

// Process Single-Click Check-In
async function processCheckIn(hrGuestId) {
  const btnWrap = document.getElementById(`checkin-action-${hrGuestId}`);
  if (btnWrap) {
    btnWrap.innerHTML = `<button type="button" class="btn-checkin" disabled>Recording Entry...</button>`;
  }

  const liveDateStr = getLiveDateString();

  let resData = null;

  if (isBackendAvailable) {
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hr_guest_id: hrGuestId,
          operator: 'Registration Desk',
          check_in_date: liveDateStr
        })
      });
      resData = await res.json();
    } catch (err) {
      isBackendAvailable = false;
    }
  }

  if (!resData) {
    resData = processLocalCheckIn(hrGuestId, liveDateStr);
  }

  if (resData.success) {
    if (resData.checkInInfo) {
      adminCachedCheckIns.push(resData.checkInInfo);
      const checkIns = getLocalCheckIns();
      checkIns.push(resData.checkInInfo);
      saveLocalCheckIns(checkIns);
    }
    showToast(`✅ ${resData.message}`);
    const input = document.getElementById('search-input');
    if (input && input.value) {
      executeSearch(input.value);
    }
    await refreshAdminData();
    populateAdminDateFilter();
  } else {
    showToast(`⚠️ ${resData.message}`, 'warning');
    const input = document.getElementById('search-input');
    if (input && input.value) {
      executeSearch(input.value);
    }
    await refreshAdminData();
    populateAdminDateFilter();
  }
}

function processLocalCheckIn(hrGuestId, targetDate = null) {
  const guests = getLocalGuests();
  const guest = guests.find(g => g.id === parseInt(hrGuestId, 10));
  if (!guest) return { success: false, message: 'HR guest record not found' };

  const checkIns = getLocalCheckIns();
  const dateStr = targetDate || getLiveDateString();
  const existing = checkIns.find(c => c.hr_guest_id === guest.id && (c.check_in_date === dateStr || (c.check_in_date || '').includes(dateStr.substring(0, 6))));

  if (existing) {
    return {
      success: false,
      alreadyCheckedIn: true,
      checkInInfo: existing,
      message: `${guest.full_name} has already checked in for ${dateStr} at ${existing.check_in_time}.`
    };
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const record = {
    id: Date.now(),
    hr_guest_id: guest.id,
    hr_name: guest.full_name,
    company_name: guest.company_name,
    designation: guest.designation,
    check_in_date: dateStr,
    check_in_time: timeStr,
    timestamp: now.toISOString(),
    operator: 'Registration Desk'
  };

  checkIns.push(record);
  saveLocalCheckIns(checkIns);

  return {
    success: true,
    message: `ENTRY RECORDED SUCCESSFULLY for ${guest.full_name} (${dateStr})`,
    checkInInfo: record
  };
}

// --- Company Explorer Bar ---
async function renderCompanyBar() {
  let companies = [];

  if (isBackendAvailable) {
    try {
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        companies = data.companies;
      }
    } catch (err) {
      isBackendAvailable = false;
    }
  }

  if (!isBackendAvailable && companies.length === 0) {
    const guests = getLocalGuests();
    const map = {};
    for (const g of guests) {
      const c = g.company_name || 'Independent';
      map[c] = (map[c] || 0) + 1;
    }
    companies = Object.keys(map).sort().map(name => ({ name, count: map[name] }));
  }

  const container = document.getElementById('company-pills');
  if (!container) return;

  if (companies.length === 0) {
    container.innerHTML = `<span style="font-size:0.78rem; color:var(--ink-faint); font-style:italic;">No companies loaded yet. Upload CSV or add HR to populate.</span>`;
  } else {
    const topCompanies = companies.slice(0, 15);
    container.innerHTML = topCompanies.map(c => `
      <button type="button" class="comp-pill ${currentCompanyFilter === c.name ? 'active' : ''}" onclick="filterByCompany('${escapeJS(c.name)}')">
        ${escapeHTML(c.name)} (${c.count})
      </button>
    `).join('');
  }

  // Populate admin company filter select
  const select = document.getElementById('filter-company');
  if (select) {
    select.innerHTML = `<option value="">All Companies (${companies.length})</option>` +
      companies.map(c => `<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)} (${c.count})</option>`).join('');
  }
}

function filterByCompany(companyName) {
  currentCompanyFilter = companyName;
  quickSearch(companyName);
}

// --- Walk-in Modal Controller ---
function openWalkinModal(prefillQuery = '') {
  const modal = document.getElementById('modal-walkin');
  if (!modal) return;
  modal.classList.add('active');

  const nameInput = document.getElementById('w-name');
  const companyInput = document.getElementById('w-company');

  if (prefillQuery && prefillQuery.length > 0) {
    if (prefillQuery.includes('@')) {
      document.getElementById('w-email').value = prefillQuery;
    } else if (/^\+?\d+$/.test(prefillQuery.replace(/\s+/g, ''))) {
      document.getElementById('w-mobile').value = prefillQuery;
    } else {
      nameInput.value = prefillQuery;
    }
  }
  nameInput.focus();
}

function closeWalkinModal() {
  const modal = document.getElementById('modal-walkin');
  if (modal) modal.classList.remove('active');
  const form = document.getElementById('form-walkin');
  if (form) form.reset();
}

async function handleWalkinSubmit(event) {
  event.preventDefault();

  const hrData = {
    full_name: document.getElementById('w-name').value,
    company_name: document.getElementById('w-company').value,
    designation: document.getElementById('w-designation').value,
    email: document.getElementById('w-email').value,
    mobile_number: document.getElementById('w-mobile').value,
    role: document.getElementById('w-role').value,
    attendance_dates: document.getElementById('w-date').value,
    invited_by: document.getElementById('w-invited').value,
    address: document.getElementById('w-address').value,
    remarks: document.getElementById('w-remarks').value,
    autoCheckIn: document.getElementById('w-autocheckin').checked,
    operator: 'Registration Desk'
  };

  let resData = null;

  if (isBackendAvailable) {
    try {
      const res = await fetch('/api/hr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hrData)
      });
      resData = await res.json();
    } catch (err) {
      isBackendAvailable = false;
    }
  }

  if (!resData) {
    resData = addLocalHR(hrData);
  }

  if (resData.success) {
    showToast(`🎉 HR ADDED SUCCESSFULLY: ${hrData.full_name}`);
    closeWalkinModal();
    renderCompanyBar();
    refreshAdminData();

    // Trigger search for instant visual feedback
    quickSearch(hrData.full_name);
  } else {
    showToast(`⚠️ Error adding HR: ${resData.message}`, 'warning');
  }
}

function addLocalHR(hrData) {
  const guests = getLocalGuests();
  const newId = guests.length > 0 ? Math.max(...guests.map(g => g.id)) + 1 : 1;

  const newGuest = {
    id: newId,
    full_name: hrData.full_name.trim(),
    designation: hrData.designation ? hrData.designation.trim() : 'HR Professional',
    company_name: hrData.company_name.trim(),
    email: hrData.email ? hrData.email.trim() : '',
    mobile_number: hrData.mobile_number ? hrData.mobile_number.trim() : '',
    address: hrData.address ? hrData.address.trim() : '',
    role: hrData.role || 'Delegate',
    attendance_dates: hrData.attendance_dates || '22 Aug 2026',
    invited_by: hrData.invited_by || 'Registration Desk',
    status: 'Walk-in',
    remarks: hrData.remarks || 'On-the-spot Walk-in',
    is_walk_in: true,
    created_at: new Date().toISOString()
  };

  guests.unshift(newGuest);
  saveLocalGuests(guests);

  if (hrData.autoCheckIn) {
    processLocalCheckIn(newGuest.id);
  }

  return { success: true, guest: newGuest };
}

// --- Admin Dashboard Controller ---
async function refreshAdminData() {
  let stats = null;
  let guests = [];

  if (isBackendAvailable) {
    try {
      const res = await fetch('/api/admin/dashboard');
      if (res.ok) {
        const data = await res.json();
        stats = data.stats;
        guests = data.guests || [];
        if (data.checkIns) {
          adminCachedCheckIns = data.checkIns;
          saveLocalCheckIns(data.checkIns);
        }
        saveLocalGuests(guests);
      }
    } catch (err) {
      isBackendAvailable = false;
    }
  }

  if (!stats) {
    guests = getLocalGuests();
    const checkIns = getLocalCheckIns();
    const checkedSet = new Set(checkIns.map(c => c.hr_guest_id));

    let c22 = 0, c23 = 0, cBoth = 0, cPending = 0, cWalk = 0;
    for (const g of guests) {
      const d = g.attendance_dates || '';
      if (d.includes('22 Aug') && d.includes('23 Aug')) cBoth++;
      else if (d.toLowerCase().includes('both')) cBoth++;
      else if (d.includes('22 Aug')) c22++;
      else if (d.includes('23 Aug')) c23++;
      else cPending++;

      if (g.is_walk_in || g.status === 'Walk-in') cWalk++;
    }

    stats = {
      totalHRs: guests.length,
      checkedInCount: checkedSet.size,
      notCheckedInCount: guests.length - checkedSet.size,
      count22Aug: c22,
      count23Aug: c23,
      countBothDays: cBoth,
      countDatePending: cPending,
      countWalkIns: cWalk
    };
  }

  // Update Stat Cards with null-safety
  const setElText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setElText('stat-total', stats.totalHRs);
  setElText('stat-checkedin', stats.checkedInCount);
  setElText('stat-pending', stats.notCheckedInCount);
  setElText('stat-aug22', stats.count22Aug);
  setElText('stat-aug23', stats.count23Aug);
  setElText('stat-both', stats.countBothDays);
  setElText('stat-unconfirmed', stats.countDatePending);
  setElText('stat-walkins', stats.countWalkIns);

  const pct = stats.totalHRs > 0 ? Math.round((stats.checkedInCount / stats.totalHRs) * 100) : 0;
  setElText('stat-checkedin-pct', `${pct}% Attended`);

  adminCachedGuests = guests || [];
  populateAdminDateFilter();
  renderAdminTable(guests);
  if (currentAdminTab === 'audit') {
    renderAuditLogsTable();
  }
}

// Render Admin HR Table
function renderAdminTable(providedGuests = null) {
  const guests = providedGuests || (isBackendAvailable ? null : getLocalGuests());
  if (!guests) {
    // If backend is active and no list passed, re-fetch
    fetch('/api/admin/dashboard').then(r => r.json()).then(data => renderAdminTable(data.guests));
    return;
  }

  const searchVal = normalize(document.getElementById('admin-search-input').value);
  const companyVal = document.getElementById('filter-company').value;
  const dateVal = document.getElementById('filter-date').value;
  const statusVal = document.getElementById('filter-status').value;

  const checkIns = (adminCachedCheckIns && adminCachedCheckIns.length > 0) ? adminCachedCheckIns : getLocalCheckIns();
  const checkedMap = new Map(checkIns.map(c => [c.hr_guest_id, c]));

  const filtered = guests.filter(g => {
    if (searchVal) {
      const text = normalize(`${g.full_name} ${g.company_name} ${g.email} ${g.mobile_number} ${g.designation}`);
      if (!text.includes(searchVal)) return false;
    }
    if (companyVal && g.company_name !== companyVal) return false;

    const guestCheckIns = checkIns.filter(c => c.hr_guest_id === g.id);
    const isChecked = guestCheckIns.length > 0;

    if (dateVal && dateVal.trim() !== '') {
      const hasDateCheckIn = guestCheckIns.some(c => c.check_in_date === dateVal || (c.check_in_date || '').includes(dateVal));
      if (!hasDateCheckIn) return false;
    }

    if (statusVal === 'checkedin' && !isChecked) return false;
    if (statusVal === 'notcheckedin' && isChecked) return false;
    if (statusVal === 'walkin' && !g.is_walk_in && g.status !== 'Walk-in') return false;

    return true;
  });

  const tbody = document.getElementById('admin-table-body');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--ink-faint);">No matching HR records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((g, idx) => {
    const c = checkedMap.get(g.id);
    return `
      <tr>
        <td style="text-align:center; font-weight:600; color:var(--ink-faint);">${idx + 1}</td>
        <td>
          <div style="font-weight:600; font-size:0.88rem;">
            <a href="#" onclick="openGuestInfoModal(${g.id}); return false;" style="color:var(--terracotta); text-decoration:none; transition:color 0.15s;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Click to view full delegate details">
              ${escapeHTML(g.full_name)}
            </a>
          </div>
          ${g.is_walk_in ? '<span class="tag tag--accent" style="font-size:0.68rem; margin-top:3px;">Walk-in</span>' : ''}
        </td>
        <td>
          <div style="font-weight:500; font-size:0.84rem;">${escapeHTML(g.designation || 'HR Professional')}</div>
          <div style="font-size:0.78rem; color:var(--ink-muted); margin-top:3px;">${escapeHTML(g.company_name)}</div>
        </td>
        <td>
          <div style="font-size:0.82rem; word-break:break-word;">${escapeHTML(g.email || '-')}</div>
          <div style="font-size:0.78rem; color:var(--ink-faint); margin-top:3px;">${escapeHTML(g.mobile_number || '-')}</div>
        </td>
        <td>
          ${c ? `
            <span class="tag tag--green" style="font-size:0.74rem;">Checked In (${escapeHTML(c.check_in_date)})</span>
            <div style="font-size:0.74rem; color:var(--ink-faint); margin-top:3px;">${c.check_in_time}</div>
          ` : `
            <span class="tag tag--yellow" style="font-size:0.74rem;">Not Checked In</span>
          `}
        </td>
        <td style="text-align:center;">
          <div class="table-actions">
            ${!c ? `<button type="button" class="btn btn-sm btn-primary" onclick="promptCheckIn(${g.id})">Check In</button>` : `<button type="button" class="btn btn-sm btn-secondary btn-checked-slot" disabled>Checked</button>`}
            <button type="button" class="btn btn-sm btn-secondary" onclick="openEditModal(${g.id})">Edit</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="deleteHR(${g.id})">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Audit Logs Table
async function renderAuditLogsTable() {
  let logs = [];
  if (isBackendAvailable) {
    try {
      const res = await fetch('/api/admin/audit');
      if (res.ok) {
        const data = await res.json();
        logs = data.logs;
      }
    } catch (err) {
      isBackendAvailable = false;
    }
  }

  if (logs.length === 0) {
    logs = getLocalCheckIns().slice().reverse();
  }

  const tbody = document.getElementById('audit-table-body');
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--ink-faint);">No check-in audit records recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>${new Date(l.timestamp || Date.now()).toLocaleString()}</td>
      <td><strong>${escapeHTML(l.hr_name)}</strong></td>
      <td>🏢 ${escapeHTML(l.company_name)}</td>
      <td>${escapeHTML(l.designation || 'HR Professional')}</td>
      <td><span class="tag tag--green">${l.check_in_date} &middot; ${l.check_in_time}</span></td>
      <td>${escapeHTML(l.operator || 'Desk Operator')}</td>
    </tr>
  `).join('');
}

// --- Guest Info Modal ---
function openGuestInfoModal(hrId) {
  const guests = (adminCachedGuests && adminCachedGuests.length > 0) ? adminCachedGuests : getLocalGuests();
  const checkIns = (adminCachedCheckIns && adminCachedCheckIns.length > 0) ? adminCachedCheckIns : getLocalCheckIns();
  const g = guests.find(item => item.id === parseInt(hrId, 10));
  if (!g) return;

  const c = checkIns.find(ci => ci.hr_guest_id === g.id);

  const body = document.getElementById('guest-info-body');
  const foot = document.getElementById('guest-info-foot');

  if (body) {
    body.innerHTML = `
      <div class="guest-profile-grid" style="margin-bottom: 20px;">
        <div class="guest-main">
          <h3 class="guest-name" style="font-size: 1.4rem; font-family: var(--font-display); font-weight: 700; color: var(--terracotta);">${escapeHTML(g.full_name)}</h3>
          <p class="guest-desig" style="color: var(--ink-muted); font-size: 0.95rem; margin-top: 2px;">${escapeHTML(g.designation || 'HR Professional')}</p>
          <p class="guest-company" style="font-weight: 600; margin-top: 6px; font-size: 1rem;">🏢 ${escapeHTML(g.company_name)}</p>
        </div>
        <div>
          ${c ? `<span class="tag tag--green" style="font-size:0.82rem; padding: 5px 14px;">Checked In</span>` : `<span class="tag tag--yellow" style="font-size:0.82rem; padding: 5px 14px;">Not Checked In</span>`}
        </div>
      </div>

      <div class="details-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: var(--cream-bg-soft); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-soft);">
        <div class="detail-item">
          <span class="detail-label" style="font-size:0.72rem; color:var(--ink-faint); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Email Address</span>
          <div class="detail-value" style="font-weight:500; font-size:0.9rem; margin-top:3px; word-break:break-all;">${escapeHTML(g.email || 'N/A')}</div>
        </div>
        <div class="detail-item">
          <span class="detail-label" style="font-size:0.72rem; color:var(--ink-faint); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Mobile Number</span>
          <div class="detail-value" style="font-weight:500; font-size:0.9rem; margin-top:3px;">${escapeHTML(g.mobile_number || 'N/A')}</div>
        </div>
        <div class="detail-item">
          <span class="detail-label" style="font-size:0.72rem; color:var(--ink-faint); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Role</span>
          <div class="detail-value" style="font-weight:500; font-size:0.9rem; margin-top:3px;">${escapeHTML(g.role || 'Delegate')}</div>
        </div>
        <div class="detail-item">
          <span class="detail-label" style="font-size:0.72rem; color:var(--ink-faint); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Invited By</span>
          <div class="detail-value" style="font-weight:500; font-size:0.9rem; margin-top:3px;">${escapeHTML(g.invited_by || 'MIT Team')}</div>
        </div>
        ${c ? `
        <div class="detail-item" style="grid-column: span 2; background: var(--green-tint); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--green-border);">
          <span class="detail-label" style="font-size:0.72rem; color:var(--green-dark); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Check-in Status</span>
          <div class="detail-value" style="font-weight:600; color:var(--green-dark); margin-top:3px;">Checked in on ${c.check_in_date} at ${c.check_in_time} (Operator: ${escapeHTML(c.operator || 'Desk')})</div>
        </div>` : ''}
        ${g.remarks ? `
        <div class="detail-item" style="grid-column: span 2;">
          <span class="detail-label" style="font-size:0.72rem; color:var(--ink-faint); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Remarks</span>
          <div class="detail-value" style="font-weight:500; font-size:0.9rem; margin-top:3px;">${escapeHTML(g.remarks)}</div>
        </div>` : ''}
      </div>
    `;
  }

  if (foot) {
    foot.innerHTML = `
      <button type="button" class="btn btn-secondary" onclick="closeGuestInfoModal()">Close</button>
      ${!c ? `<button type="button" class="btn btn-primary" onclick="closeGuestInfoModal(); promptCheckIn(${g.id});">Check In Now</button>` : ''}
      <button type="button" class="btn btn-secondary" onclick="closeGuestInfoModal(); openEditModal(${g.id});">Edit Profile</button>
    `;
  }

  const modal = document.getElementById('modal-guest-info');
  if (modal) modal.classList.add('active');
}

function closeGuestInfoModal() {
  const modal = document.getElementById('modal-guest-info');
  if (modal) modal.classList.remove('active');
}

// --- Edit HR Modal ---
function openEditModal(hrId) {
  const guests = getLocalGuests();
  const g = guests.find(item => item.id === parseInt(hrId, 10));
  if (!g) return;

  document.getElementById('e-id').value = g.id;
  document.getElementById('e-name').value = g.full_name || '';
  document.getElementById('e-company').value = g.company_name || '';
  document.getElementById('e-designation').value = g.designation || '';
  document.getElementById('e-email').value = g.email || '';
  document.getElementById('e-mobile').value = g.mobile_number || '';
  document.getElementById('e-role').value = g.role || 'Delegate';
  document.getElementById('e-date').value = g.attendance_dates || '22 Aug 2026';
  document.getElementById('e-invited').value = g.invited_by || '';
  document.getElementById('e-remarks').value = g.remarks || '';

  document.getElementById('modal-edit').classList.add('active');
}

function closeEditModal() {
  document.getElementById('modal-edit').classList.remove('active');
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('e-id').value;
  const updateData = {
    full_name: document.getElementById('e-name').value,
    company_name: document.getElementById('e-company').value,
    designation: document.getElementById('e-designation').value,
    email: document.getElementById('e-email').value,
    mobile_number: document.getElementById('e-mobile').value,
    role: document.getElementById('e-role').value,
    attendance_dates: document.getElementById('e-date').value,
    invited_by: document.getElementById('e-invited').value,
    remarks: document.getElementById('e-remarks').value
  };

  let success = false;
  if (isBackendAvailable) {
    try {
      const res = await fetch(`/api/hr/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      success = res.ok;
    } catch (err) {
      isBackendAvailable = false;
    }
  }

  if (!success) {
    const guests = getLocalGuests();
    const idx = guests.findIndex(g => g.id === parseInt(id, 10));
    if (idx !== -1) {
      guests[idx] = { ...guests[idx], ...updateData };
      saveLocalGuests(guests);
      success = true;
    }
  }

  if (success) {
    showToast('✅ HR guest updated successfully');
    closeEditModal();
    refreshAdminData();
    renderCompanyBar();
  }
}

// Delete HR
async function deleteHR(hrId) {
  if (!confirm('Are you sure you want to delete this HR record?')) return;

  let success = false;
  if (isBackendAvailable) {
    try {
      const res = await fetch(`/api/hr/${hrId}`, { method: 'DELETE' });
      success = res.ok;
    } catch (err) {
      isBackendAvailable = false;
    }
  }

  if (!success) {
    let guests = getLocalGuests();
    guests = guests.filter(g => g.id !== parseInt(hrId, 10));
    saveLocalGuests(guests);
    success = true;
  }

  if (success) {
    showToast('🗑️ HR record deleted');
    refreshAdminData();
    renderCompanyBar();
  }
}

// --- Excel / CSV Import Modal Controller ---
let pendingImportRecords = [];

function openImportModal() {
  document.getElementById('modal-import').classList.add('active');
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('btn-confirm-import').disabled = true;
  pendingImportRecords = [];
}

function closeImportModal() {
  document.getElementById('modal-import').classList.remove('active');
  document.getElementById('file-input').value = '';
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name.toLowerCase();
  const reader = new FileReader();

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    reader.onload = (e) => {
      try {
        if (typeof XLSX === 'undefined') {
          showToast('⚠️ Excel parser library (XLSX) loading...', 'warning');
          return;
        }
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rowsJson = XLSX.utils.sheet_to_json(sheet);
        processParsedRows(rowsJson);
      } catch (err) {
        console.error('XLSX Read Error:', err);
        showToast(`⚠️ Error reading Excel file: ${err.message}`, 'warning');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = (e) => {
      const content = e.target.result;
      parseCSVContent(content);
    };
    reader.readAsText(file);
  }
}

function processParsedRows(rowsJson) {
  if (!Array.isArray(rowsJson) || rowsJson.length === 0) {
    showToast('⚠️ Uploaded file contains no data rows', 'warning');
    return;
  }

  const records = [];

  rowsJson.forEach(row => {
    const keys = Object.keys(row);
    const getKey = (possibleNames) => keys.find(k => possibleNames.some(p => k.toLowerCase().trim() === p.toLowerCase()));

    const keyName = getKey(['full name', 'name', 'hr name', 'guest name', 'full_name']);
    const keyCompany = getKey(['company', 'company name', 'organization', 'company_name']);
    const keyDesig = getKey(['designation', 'job title', 'title']);
    const keyDate = getKey(['date of attendance', 'attendance date', 'event date', 'date', 'dates']);
    const keyRole = getKey(['role', 'category', 'guest role']);
    const keyInvited = getKey(['invited by', 'inviter', 'source']);
    const keyEmail = getKey(['email', 'email address']);
    const keyMobile = getKey(['mobile', 'phone', 'contact', 'mobile number', 'mobile_number']);
    const keyAddress = getKey(['address', 'city', 'location']);
    const keyRemarks = getKey(['remarks', 'notes']);

    const name = keyName ? (row[keyName] || '').toString().trim() : '';
    if (!name || name.toLowerCase() === 'name' || name.toLowerCase() === 'full name') return;

    records.push({
      full_name: name,
      company_name: (keyCompany ? row[keyCompany] : 'Independent').toString().trim(),
      designation: (keyDesig ? row[keyDesig] : 'HR Professional').toString().trim(),
      email: (keyEmail ? row[keyEmail] : '').toString().trim(),
      mobile_number: (keyMobile ? row[keyMobile] : '').toString().trim(),
      attendance_dates: (keyDate ? row[keyDate] : '22 Aug 2026').toString().trim(),
      role: (keyRole ? row[keyRole] : 'Delegate').toString().trim(),
      invited_by: (keyInvited ? row[keyInvited] : 'Excel Import').toString().trim(),
      address: (keyAddress ? row[keyAddress] : '').toString().trim(),
      remarks: (keyRemarks ? row[keyRemarks] : 'Imported via Excel').toString().trim()
    });
  });

  if (records.length === 0) {
    showToast('⚠️ No valid HR records could be extracted', 'warning');
    return;
  }

  validateAndPreviewImport(records);
}

// RFC 4180 Compliant CSV Line Parser (Handles quotes, internal commas, escaped quotes)
function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSVContent(csvText) {
  if (!csvText) {
    showToast('⚠️ File is empty', 'warning');
    return;
  }

  // Strip BOM if present
  let text = csvText.replace(/^\uFEFF/, '');
  
  // Split into lines preserving quoted newlines
  const rows = [];
  let curRow = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      curRow += c;
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (curRow.trim().length > 0) {
        rows.push(curRow);
      }
      curRow = '';
    } else {
      curRow += c;
    }
  }
  if (curRow.trim().length > 0) rows.push(curRow);

  if (rows.length <= 1) {
    showToast('⚠️ File is empty or missing data rows', 'warning');
    return;
  }

  const rawHeaders = parseCSVLine(rows[0]);
  const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/^"|"$/g, ''));
  
  // Dynamic header position resolver
  const getIndex = (possibleNames) => {
    return headers.findIndex(h => possibleNames.some(p => h.includes(p.toLowerCase())));
  };

  const idxName = getIndex(['full name', 'name', 'hr name', 'guest name', 'full_name']);
  const idxCompany = getIndex(['company', 'organization', 'company_name']);
  const idxDesig = getIndex(['designation', 'job title', 'title']);
  const idxEmail = getIndex(['email', 'email address']);
  const idxMobile = getIndex(['mobile', 'phone', 'contact', 'mobile_number']);
  const idxDate = getIndex(['date of attendance', 'attendance date', 'event date', 'date', 'dates']);
  const idxRole = getIndex(['guest role', 'category', 'role']);
  const idxInvited = getIndex(['invited by', 'inviter', 'source']);
  const idxAddress = getIndex(['address', 'city', 'location']);
  const idxRemarks = getIndex(['remarks', 'notes']);

  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const values = parseCSVLine(rows[i]);
    if (values.length === 0 || values.every(v => !v)) continue;

    const getValue = (idx) => (idx !== -1 && values[idx] !== undefined ? values[idx].replace(/^"|"$/g, '') : '');

    const name = (idxName !== -1 ? getValue(idxName) : values[0] || '').trim();
    if (!name || name.toLowerCase() === 'name' || name.toLowerCase() === 'full name') continue;

    records.push({
      full_name: name,
      company_name: (idxCompany !== -1 ? getValue(idxCompany) : values[1] || 'Independent').trim(),
      designation: (idxDesig !== -1 ? getValue(idxDesig) : values[2] || 'HR Professional').trim(),
      email: (idxEmail !== -1 ? getValue(idxEmail) : '').trim(),
      mobile_number: (idxMobile !== -1 ? getValue(idxMobile) : '').trim(),
      attendance_dates: (idxDate !== -1 ? getValue(idxDate) : '22 Aug 2026').trim(),
      role: (idxRole !== -1 ? getValue(idxRole) : 'Delegate').trim(),
      invited_by: (idxInvited !== -1 ? getValue(idxInvited) : 'CSV Import').trim(),
      address: (idxAddress !== -1 ? getValue(idxAddress) : '').trim(),
      remarks: (idxRemarks !== -1 ? getValue(idxRemarks) : 'Imported via CSV').trim()
    });
  }

  if (records.length === 0) {
    showToast('⚠️ No valid HR records parsed from CSV file', 'warning');
    return;
  }

  validateAndPreviewImport(records);
}

function validateAndPreviewImport(records) {
  const currentList = (adminCachedGuests && adminCachedGuests.length > 0) ? adminCachedGuests : getLocalGuests();
  
  const normKey = (str) => (str || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');

  const existingEmails = new Set(currentList.filter(g => g && g.email).map(g => (g.email || '').toLowerCase().trim()));
  const existingMobiles = new Set(currentList.filter(g => g && g.mobile_number).map(g => (g.mobile_number || '').replace(/\D/g, '')));
  const existingNameCompanies = new Set(currentList.filter(g => g && g.full_name).map(g => normKey(g.full_name) + '___' + normKey(g.company_name)));
  const existingNames = new Set(currentList.filter(g => g && g.full_name).map(g => normKey(g.full_name)));

  const seenBatchEmails = new Set();
  const seenBatchMobiles = new Set();
  const seenBatchNameCompanies = new Set();
  const seenBatchNames = new Set();

  let validCount = 0;
  let dupCount = 0;
  pendingImportRecords = [];

  const previewBody = document.getElementById('import-preview-body');
  previewBody.innerHTML = '';

  records.forEach(r => {
    const fullName = (r.full_name || '').trim();
    if (!fullName) return;

    const email = (r.email || '').toLowerCase().trim();
    const mobileClean = (r.mobile_number || '').replace(/\D/g, '');
    const company = (r.company_name || '').trim();

    const nName = normKey(fullName);
    const nCompany = normKey(company);
    const nameCompKey = nName + '___' + nCompany;

    const isDup = (email && (existingEmails.has(email) || seenBatchEmails.has(email))) ||
                  (mobileClean && mobileClean.length >= 8 && (existingMobiles.has(mobileClean) || seenBatchMobiles.has(mobileClean))) ||
                  (nName && nCompany && (existingNameCompanies.has(nameCompKey) || seenBatchNameCompanies.has(nameCompKey))) ||
                  (nName && (!nCompany || nCompany === 'independent') && (existingNames.has(nName) || seenBatchNames.has(nName)));

    if (isDup) {
      dupCount++;
    } else {
      validCount++;
      pendingImportRecords.push(r);
      if (email) seenBatchEmails.add(email);
      if (mobileClean && mobileClean.length >= 8) seenBatchMobiles.add(mobileClean);
      if (nName && nCompany) seenBatchNameCompanies.add(nameCompKey);
      if (nName) seenBatchNames.add(nName);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(fullName)}</td>
      <td>🏢 ${escapeHTML(company || 'Independent')}</td>
      <td>${escapeHTML(r.designation || 'HR Professional')}</td>
      <td>${escapeHTML(r.email || r.mobile_number || '-')}</td>
      <td>
        ${isDup ? '<span class="tag tag--warning">Duplicate (Skipped)</span>' : '<span class="tag tag--green">Valid Record</span>'}
      </td>
    `;
    previewBody.appendChild(tr);
  });

  document.getElementById('prev-count-valid').textContent = `${validCount} Valid Records`;
  document.getElementById('prev-count-dup').textContent = `${dupCount} Duplicates Skipped`;
  document.getElementById('import-preview').style.display = 'block';

  const confirmBtn = document.getElementById('btn-confirm-import');
  if (confirmBtn) {
    confirmBtn.disabled = (validCount === 0);
    confirmBtn.innerHTML = validCount === 0 ? 'No Valid Records to Import' : `Confirm &amp; Import ${validCount} Records`;
  }
}

async function confirmImport() {
  if (pendingImportRecords.length === 0) {
    showToast('⚠️ No valid records to import', 'warning');
    return;
  }

  const btn = document.getElementById('btn-confirm-import');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Importing records...';
  }

  try {
    let resData = null;
    if (isBackendAvailable) {
      try {
        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: pendingImportRecords })
        });
        if (res.ok) {
          resData = await res.json();
        } else {
          try {
            resData = await res.json();
          } catch(e) {}
        }
      } catch (err) {
        console.warn('Backend import fetch error, falling back to local:', err);
        isBackendAvailable = false;
      }
    }

    if (!resData || !resData.success) {
      resData = batchImportLocal(pendingImportRecords);
    }

    if (resData && resData.success) {
      showToast(`🎉 ${resData.message || `Successfully imported ${resData.addedCount || pendingImportRecords.length} records.`}`);
      closeImportModal();
      await refreshAdminData();
      renderCompanyBar();
    } else {
      showToast(`⚠️ Import failed: ${resData?.message || 'Unable to import records'}`, 'warning');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Confirm &amp; Import ${pendingImportRecords.length} Records`;
      }
    }
  } catch (err) {
    console.error('confirmImport error:', err);
    showToast(`⚠️ Import error: ${err.message}`, 'warning');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Confirm &amp; Import ${pendingImportRecords.length} Records`;
    }
  }
}

function batchImportLocal(records) {
  const guests = getLocalGuests();
  let maxId = guests.length > 0 ? Math.max(...guests.map(g => g.id || 0)) : 0;
  let count = 0;

  for (const r of records) {
    maxId++;
    guests.push({
      id: maxId,
      full_name: (r.full_name || '').trim(),
      designation: (r.designation || 'HR Professional').trim(),
      company_name: (r.company_name || 'Independent').trim(),
      email: (r.email || '').trim(),
      mobile_number: (r.mobile_number || '').trim(),
      address: (r.address || '').trim(),
      role: r.role || 'Delegate',
      attendance_dates: r.attendance_dates || '22 Aug 2026',
      invited_by: (r.invited_by || 'Excel / CSV Import').trim(),
      status: 'Registered',
      remarks: (r.remarks || 'Imported via Admin Portal').trim(),
      is_walk_in: false,
      created_at: new Date().toISOString()
    });
    count++;
  }

  saveLocalGuests(guests);
  adminCachedGuests = guests;
  return {
    success: true,
    addedCount: count,
    message: `Imported ${count} HR records successfully into database.`
  };
}

// Export CSV (Date-wise & Status-wise)
function exportCSV() {
  const dateSelect = document.getElementById('filter-date');
  const statusSelect = document.getElementById('filter-status');
  
  const dateFilter = dateSelect ? dateSelect.value.trim() : '';
  const statusFilter = statusSelect ? statusSelect.value.trim() : '';

  if (isBackendAvailable) {
    const url = `/api/admin/export?date=${encodeURIComponent(dateFilter)}&status=${encodeURIComponent(statusFilter)}`;
    window.location.href = url;
    return;
  }

  // Client-side CSV generation
  const guests = getLocalGuests();
  const checkIns = getLocalCheckIns();

  const headers = ['ID', 'Full Name', 'Designation', 'Company', 'Email', 'Mobile', 'Role', 'Check-In Status', 'Check-In Date', 'Check-In Time', 'Invited By', 'Remarks'];

  const normTarget = dateFilter.toLowerCase();
  const isFilteredByDate = dateFilter && normTarget !== 'all' && normTarget !== 'all dates';

  let filteredGuests = guests;
  if (isFilteredByDate) {
    filteredGuests = guests.filter(g => {
      const guestCheckIns = checkIns.filter(c => c.hr_guest_id === g.id);
      return guestCheckIns.some(c => {
        const d = (c.check_in_date || '').toLowerCase();
        return d === normTarget || d.includes(normTarget) || normTarget.includes(d);
      });
    });
  }

  const rows = filteredGuests.map(g => {
    const guestCheckIns = checkIns.filter(c => c.hr_guest_id === g.id);
    let c = null;
    if (isFilteredByDate) {
      c = guestCheckIns.find(ci => {
        const d = (ci.check_in_date || '').toLowerCase();
        return d === normTarget || d.includes(normTarget) || normTarget.includes(d);
      });
    } else {
      c = guestCheckIns[0] || null;
    }

    if (statusFilter === 'checkedin' && !c) return null;
    if (statusFilter === 'notcheckedin' && c) return null;

    return [
      g.id,
      `"${(g.full_name || '').replace(/"/g, '""')}"`,
      `"${(g.designation || '').replace(/"/g, '""')}"`,
      `"${(g.company_name || '').replace(/"/g, '""')}"`,
      `"${(g.email || '').replace(/"/g, '""')}"`,
      `"${(g.mobile_number || '').replace(/"/g, '""')}"`,
      `"${(g.role || '').replace(/"/g, '""')}"`,
      c ? 'CHECKED IN' : 'NOT CHECKED IN',
      c ? c.check_in_date : '',
      c ? c.check_in_time : '',
      `"${(g.invited_by || '').replace(/"/g, '""')}"`,
      `"${(g.remarks || '').replace(/"/g, '""')}"`
    ].join(',');
  }).filter(Boolean);

  const csvStr = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const fileDate = isFilteredByDate ? dateFilter.replace(/[^a-zA-Z0-9]/g, '_') : 'All_Dates';
  link.setAttribute('download', `HR_Summit_Attendance_${fileDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- Flush / Clear All Data Controller ---
function openFlushModal() {
  const modal = document.getElementById('modal-flush');
  if (modal) modal.classList.add('active');
}

function closeFlushModal() {
  const modal = document.getElementById('modal-flush');
  if (modal) modal.classList.remove('active');
}

async function confirmFlushData() {
  closeFlushModal();
  showToast('⏳ Flushing all data from database...', 'info');

  let resData = null;
  if (isBackendAvailable) {
    try {
      const res = await fetch('/api/admin/flush', { method: 'POST' });
      if (res.ok) {
        resData = await res.json();
      }
    } catch (err) {
      console.warn('Backend flush fetch error:', err);
      isBackendAvailable = false;
    }
  }

  // Clear local storage
  localStorage.setItem(STORAGE_KEY_GUESTS, JSON.stringify([]));
  localStorage.setItem(STORAGE_KEY_CHECKINS, JSON.stringify([]));
  adminCachedGuests = [];

  showToast(resData && resData.message ? `🗑️ ${resData.message}` : '🗑️ All records flushed successfully.');
  clearSearch();
  await refreshAdminData();
  renderCompanyBar();
}

// Toast Notifications
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'warning' ? 'toast--warning' : type === 'error' ? 'toast--error' : ''}`;
  toast.textContent = msg;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// Helper XSS Escape
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJS(str) {
  if (!str) return '';
  return str.toString().replace(/'/g, "\\'").replace(/"/g, '\\"');
}
