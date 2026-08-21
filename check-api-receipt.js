const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  // Get 3 expense IDs that have no receipt_url
  const r = await pool.query(`
    SELECT pe.id, pe.report_id, pe.description, pe.value, pe.date,
      pe.raw_data->>'reicept_url' as reicept_url
    FROM prestacao_expenses pe
    WHERE pe.date >= '2026-01-01'
      AND (pe.raw_data->>'reicept_url' IS NULL OR pe.raw_data->>'reicept_url' = '')
    LIMIT 5
  `);
  console.log('Expenses without receipt in raw_data:');
  for (const row of r.rows) {
    console.log(`  id=${row.id} report=${row.report_id} desc=${row.description} val=${row.value} date=${row.date} receipt=${row.reicept_url}`);
  }

  // Also check: does the VExpenses API have receipts for these?
  // Fetch one from the API
  if (r.rows.length > 0) {
    const expId = r.rows[0].id;
    const reportId = r.rows[0].report_id;
    console.log(`\nFetching report ${reportId} from VExpenses API to check expense ${expId}...`);

    const API_KEY = process.env.VEXPENSES_API_KEY;
    const resp = await fetch(`https://api.vexpenses.com/v2/reports/${reportId}?include=expenses`, {
      headers: { 'Authorization': API_KEY, 'Accept': 'application/json' }
    });
    const data = await resp.json();
    const expenses = data?.data?.expenses?.data || [];
    const match = expenses.find(e => e.id === expId);
    if (match) {
      console.log('Found expense in API!');
      console.log('  reicept_url:', match.reicept_url);
      console.log('  receipt_url:', match.receipt_url);
      console.log('  keys:', Object.keys(match).filter(k => k.toLowerCase().includes('url') || k.toLowerCase().includes('receipt') || k.toLowerCase().includes('attach') || k.toLowerCase().includes('file')).join(', '));
      // Show all keys that contain 's3' or 'amazonaws' in value
      for (const [k, v] of Object.entries(match)) {
        if (typeof v === 'string' && (v.includes('s3') || v.includes('amazonaws'))) {
          console.log(`  ${k}: ${v}`);
        }
      }
    } else {
      console.log('Expense NOT found in API response');
      console.log('  API returned', expenses.length, 'expenses');
      console.log('  First expense keys:', expenses[0] ? Object.keys(expenses[0]).join(', ') : 'none');
    }
  }
  await pool.end();
})();
