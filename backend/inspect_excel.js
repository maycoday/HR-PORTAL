const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'IRs - MIT data Pune.xlsx');
console.log('Reading Excel file:', filePath);

try {
  const workbook = XLSX.readFile(filePath);
  console.log('Sheet Names:', workbook.SheetNames);
  
  workbook.SheetNames.forEach(sheetName => {
    console.log(`\n=== SHEET: ${sheetName} ===`);
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log('Total Rows:', data.length);
    if (data.length > 0) {
      console.log('Header Row (Row 0):', data[0]);
      console.log('Sample Row 1:', data[1]);
      console.log('Sample Row 2:', data[2]);
      console.log('Sample Row 3:', data[3]);
    }
  });
} catch (err) {
  console.error('Error reading excel:', err);
}
