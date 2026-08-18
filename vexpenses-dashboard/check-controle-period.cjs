const XLSX = require('xlsx');

const CONTROLE_FILE = 'C:\\Users\\italo.medrado\\Desktop\\Projects\\planilha de carga\\data\\CONTROLE - VEXPENSES - JULHO 2026.xlsx';

const wb = XLSX.readFile(CONTROLE_FILE);
const ws = wb.Sheets['PAINEL'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

// Print first 12 rows to see title/header info
for (let i = 0; i < Math.min(12, rows.length); i++) {
  const row = rows[i];
  // Only show non-empty cells
  const nonEmpty = row?.map((c, idx) => c !== null && c !== '' ? `[${idx}]=${c}` : null).filter(Boolean);
  console.log(`Row ${i}: ${nonEmpty?.join('  ') || '(empty)'}`);
}

// Check the QUINZENAS sheet for period info
console.log('\n--- QUINZENAS sheet ---');
const ws2 = wb.Sheets['QUINZENAS'];
const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null });
for (let i = 0; i < Math.min(5, rows2.length); i++) {
  const nonEmpty = rows2[i]?.map((c, idx) => c !== null && c !== '' ? `[${idx}]=${c}` : null).filter(Boolean);
  console.log(`Row ${i}: ${nonEmpty?.join('  ') || '(empty)'}`);
}

// Check EXTRATO sheet for date range
console.log('\n--- EXTRATO sheet (first 5 rows) ---');
const ws3 = wb.Sheets['EXTRATO'];
const rows3 = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: null });
for (let i = 0; i < Math.min(5, rows3.length); i++) {
  const nonEmpty = rows3[i]?.map((c, idx) => c !== null && c !== '' ? `[${idx}]=${c}` : null).filter(Boolean);
  console.log(`Row ${i}: ${nonEmpty?.join('  ') || '(empty)'}`);
}

// Check the last date in EXTRATO
console.log('\n--- EXTRATO last rows ---');
const lastRows = rows3.slice(-5);
for (let i = 0; i < lastRows.length; i++) {
  const nonEmpty = lastRows[i]?.map((c, idx) => c !== null && c !== '' ? `[${idx}]=${c}` : null).filter(Boolean);
  console.log(`Row ${rows3.length - 5 + i}: ${nonEmpty?.join('  ') || '(empty)'}`);
}
