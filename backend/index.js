const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files & assets
const frontendPath = path.join(__dirname, '..', 'frontend');
const assetsPath = path.join(__dirname, '..', 'assets');
const frontendAssetsPath = path.join(__dirname, '..', 'frontend', 'assets');

try {
  if (fs.existsSync(assetsPath)) {
    if (!fs.existsSync(frontendAssetsPath)) {
      fs.mkdirSync(frontendAssetsPath, { recursive: true });
    }
    fs.readdirSync(assetsPath).forEach(file => {
      fs.copyFileSync(path.join(assetsPath, file), path.join(frontendAssetsPath, file));
    });
  }
} catch (err) {
  console.error('Assets sync error:', err.message);
}

app.use(express.static(frontendPath));
app.use('/assets', express.static(assetsPath));

// API Routes

// 1. Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', event: 'HR Summit 2026', time: new Date().toISOString() });
});

// 2. Search HR
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const activeDate = req.query.date || null;
    const result = await db.search(query, activeDate);
    res.json(result);
  } catch (err) {
    console.error('API /api/search error:', err.message);
    res.status(500).json({ error: err.message, query: req.query.q || '' });
  }
});

// 3. Check-In HR
app.post('/api/checkin', async (req, res) => {
  try {
    const { hr_guest_id, operator, check_in_date } = req.body;
    if (!hr_guest_id) {
      return res.status(400).json({ success: false, message: 'hr_guest_id is required' });
    }

    const result = await db.checkIn(hr_guest_id, operator || 'Desk Operator', check_in_date || null);
    if (!result.success && !result.alreadyCheckedIn) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('API /api/checkin error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Add New Walk-In HR
app.post('/api/hr', async (req, res) => {
  try {
    const result = await db.addHR(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error('API /api/hr error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Update HR
app.put('/api/hr/:id', async (req, res) => {
  try {
    const result = await db.updateHR(req.params.id, req.body);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('API /api/hr/:id error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Delete HR
app.delete('/api/hr/:id', async (req, res) => {
  try {
    const result = await db.deleteHR(req.params.id);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('API /api/hr/:id delete error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Get Companies List
app.get('/api/companies', async (req, res) => {
  try {
    const companies = await db.getCompanies();
    res.json({ success: true, companies });
  } catch (err) {
    console.error('API /api/companies error:', err.message);
    res.json({ success: true, companies: [] });
  }
});

// 8. Get HRs by Company
app.get('/api/company/:name', async (req, res) => {
  try {
    const companyName = req.params.name;
    const hrs = await db.getHRsByCompany(companyName);
    res.json({ success: true, company: companyName, count: hrs.length, hrs });
  } catch (err) {
    console.error('API /api/company/:name error:', err.message);
    res.json({ success: true, company: req.params.name, count: 0, hrs: [] });
  }
});

// 9. Admin Dashboard Metrics
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const stats = await db.getAdminStats();
    const allGuests = await db.readGuests();
    const allCheckIns = await db.readCheckIns();
    res.json({ success: true, stats, guests: allGuests, checkIns: allCheckIns });
  } catch (err) {
    console.error('API /api/admin/dashboard error:', err.message);
    res.json({
      success: true,
      stats: { totalHRs: 0, checkedInCount: 0, notCheckedInCount: 0, count22Aug: 0, count23Aug: 0, countBothDays: 0, countDatePending: 0, countWalkIns: 0 },
      guests: [],
      checkIns: []
    });
  }
});

// 10. Audit Log History
app.get('/api/admin/audit', async (req, res) => {
  try {
    const logs = await db.getAuditLogs();
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    console.error('API /api/admin/audit error:', err.message);
    res.json({ success: true, count: 0, logs: [] });
  }
});

// 11. Batch Import (CSV / JSON data array)
app.post('/api/admin/import', async (req, res) => {
  try {
    const { records } = req.body;
    const result = await db.batchImport(records);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('API /api/admin/import error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 12. Flush / Clear All Data (Admin Only)
app.post('/api/admin/flush', async (req, res) => {
  try {
    const result = await db.flushAll();
    res.json(result);
  } catch (err) {
    console.error('API /api/admin/flush error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 13. Export Attendance Data as CSV (Supports Date-wise & Status-wise filtering)
app.get('/api/admin/export', async (req, res) => {
  try {
    const targetDate = (req.query.date || '').trim();
    const statusFilter = (req.query.status || '').trim();

    const guests = (await db.readGuests()) || [];
    const checkIns = (await db.readCheckIns()) || [];

    const headers = ['ID', 'Full Name', 'Designation', 'Company', 'Email', 'Mobile', 'Role', 'Check-In Status', 'Check-In Date', 'Check-In Time', 'Invited By', 'Remarks'];

    const normTarget = targetDate.toLowerCase();
    const isFilteredByDate = targetDate && normTarget !== 'all' && normTarget !== 'all dates';

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

    const csvContent = [headers.join(','), ...rows].join('\n');
    const filenameDate = isFilteredByDate ? targetDate.replace(/[^a-zA-Z0-9]/g, '_') : 'All_Dates';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="HR_Summit_Attendance_${filenameDate}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('API /api/admin/export error:', err.message);
    res.status(500).send('Error generating export CSV');
  }
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server
app.listen(PORT, async () => {
  console.log(`=================================================`);
  console.log(`HR Summit 2026 Portal Running on http://localhost:${PORT}`);
  console.log(`=================================================`);
  try {
    await db.initDb();
  } catch (err) {
    console.error('Database initialization warning:', err.message);
  }
});
