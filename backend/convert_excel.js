const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = path.join(__dirname, '..', 'IRs - MIT data Pune.xlsx');
const outputPath = path.join(__dirname, 'data', 'hr_guests.json');

try {
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const formatted = rows.map((r, i) => {
    const rawDate = (r['Date of Attendance'] || '22 Aug 2026').toString().trim();
    let dates = '22 Aug 2026';
    if (rawDate.toLowerCase().includes('both')) dates = 'Both Days (22 & 23 Aug)';
    else if (rawDate.toLowerCase().includes('confirm')) dates = 'Date Unconfirmed';
    else if (rawDate.includes('21 Aug') || rawDate.includes('22 Aug')) dates = '22 Aug 2026';
    else if (rawDate.includes('23 Aug')) dates = '23 Aug 2026';

    return {
      id: i + 1,
      full_name: (r['Full Name'] || r['Name'] || '').toString().trim(),
      company_name: (r['Company'] || r['Company Name'] || 'Independent').toString().trim(),
      designation: (r['Designation'] || 'HR Professional').toString().trim(),
      email: (r['Email'] || '').toString().trim(),
      mobile_number: (r['Mobile'] || r['Contact'] || '').toString().trim(),
      address: '',
      role: (r['Role'] || 'Delegate').toString().trim(),
      attendance_dates: dates,
      invited_by: (r['Invited by'] || 'MIT Summit Team').toString().trim(),
      status: 'Registered',
      remarks: 'Master Excel Import',
      is_walk_in: false,
      created_at: new Date().toISOString()
    };
  }).filter(g => g.full_name.length > 0);

  fs.writeFileSync(outputPath, JSON.stringify(formatted, null, 2), 'utf8');
  console.log(`Successfully generated hr_guests.json with ${formatted.length} records.`);
} catch (err) {
  console.error('Error generating hr_guests.json:', err.message);
}
