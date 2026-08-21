const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const API_RESPONSES_DIR = 'C:\\Users\\italo.medrado\\Desktop\\Projects\\planilha de carga\\investigacao\\api_responses';
const extratoFiles = fs.readdirSync(API_RESPONSES_DIR)
  .filter(f => f.startsWith('v3_extrato_') && f.endsWith('.xlsx'))
  .sort();

if (extratoFiles.length === 0) {
  console.log('No extrato files found in', API_RESPONSES_DIR);
  process.exit(1);
}

console.log('Found', extratoFiles.length, 'extrato files');

// Check first file
const file = 'v3_extrato_may_2026.xlsx';
const filePath = path.join(API_RESPONSES_DIR, file);
console.log('Reading', file);

const workbook = XLSX.readFile(filePath);
console.log('All sheet names:', workbook.SheetNames);

for (const sn of workbook.SheetNames) {
  const ws = workbook.Sheets[sn];
  console.log(`Sheet "${sn}": range=${ws['!ref']}`);
}

const sheetName = workbook.SheetNames[0];
console.log('Using sheet:', sheetName);

const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true });

// Find header
let headerIdx = -1;
for (let i = 0; i < Math.min(10, rows.length); i++) {
  const row = rows[i];
  if (row && row.some(c => String(c || '').toUpperCase().includes('DATA'))) {
    headerIdx = i;
    break;
  }
}
console.log('Header at row', headerIdx);
const headers = rows[headerIdx].map(h => String(h || '').toUpperCase().trim());
console.log('Headers:', headers);

const dataCol = headers.findIndex(h => h === 'DATA');
console.log('DATA column index:', dataCol);

// Show first 5 data rows
console.log('Total rows:', rows.length);
console.log('First 3 rows raw:', JSON.stringify(rows.slice(0, 3)));

// Check raw cells
const ws = workbook.Sheets[sheetName];
console.log('Sheet range:', ws['!ref']);
const range = XLSX.utils.decode_range(ws['!ref']);
console.log('Decoded range:', JSON.stringify(range));

// Check first few cells in column A
for (let r = range.s.r; r < Math.min(range.s.r + 5, range.e.r + 1); r++) {
  const addr = XLSX.utils.encode_cell({ r, c: 0 });
  const cell = ws[addr];
  console.log(`Cell ${addr}:`, cell ? JSON.stringify({ t: cell.t, v: cell.v, w: cell.w }) : 'empty');
}

// Try sheet_to_json without header option
const jsonRows = XLSX.utils.sheet_to_json(ws);
console.log('\nWith default sheet_to_json:', jsonRows.length, 'rows');
if (jsonRows.length > 0) console.log('First row:', JSON.stringify(jsonRows[0]));

// Try with header: 1 and defval
const rowsDefval = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
console.log('\nWith defval:', rowsDefval.length, 'rows');
if (rowsDefval.length > 1) console.log('Second row:', JSON.stringify(rowsDefval[1]));
