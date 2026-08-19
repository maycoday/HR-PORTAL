const fs = require('fs');
const path = require('path');

const excelAnalysisPath = path.join(__dirname, 'data', 'excel_analysis.json');
const guestsPath = path.join(__dirname, 'data', 'hr_guests.json');

if (!fs.existsSync(excelAnalysisPath)) {
  console.error('excel_analysis.json missing!');
  process.exit(1);
}

const analysis = JSON.parse(fs.readFileSync(excelAnalysisPath, 'utf8'));
const rawRows = analysis['Sheet1'] || [];

const formattedGuests = rawRows.map((r, index) => {
  const name = (r['Full Name'] || '').trim();
  const company = (r['Company'] || 'Independent').trim();
  const designation = (r['Designation'] || 'HR Professional').trim();
  const rawDate = (r['Date of Attendance'] || '22 Aug 2026').trim();
  
  let attendance = '22 Aug 2026';
  if (rawDate.toLowerCase().includes('both')) {
    attendance = 'Both Days (22 & 23 Aug)';
  } else if (rawDate.includes('21 Aug') || rawDate.includes('22 Aug')) {
    attendance = '22 Aug 2026';
  } else if (rawDate.includes('23 Aug')) {
    attendance = '23 Aug 2026';
  } else if (rawDate.toLowerCase().includes('confirm soon')) {
    attendance = 'Date Unconfirmed';
  } else {
    attendance = rawDate;
  }

  return {
    id: index + 1,
    full_name: name,
    company_name: company,
    designation: designation,
    email: '',
    mobile_number: '',
    address: '',
    role: (r['Role'] || 'Delegate').trim(),
    attendance_dates: attendance,
    invited_by: (r['Invited by'] || 'MIT Summit Team').trim(),
    status: 'Registered',
    remarks: 'Seeded from Excel Master List',
    is_walk_in: false,
    created_at: new Date().toISOString()
  };
});

fs.writeFileSync(guestsPath, JSON.stringify(formattedGuests, null, 2), 'utf8');
console.log(`Seeded ${formattedGuests.length} HR records into ${guestsPath}`);
