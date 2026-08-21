const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query("SELECT raw_data FROM prestacao_expenses WHERE raw_data IS NOT NULL AND raw_data::text LIKE '%receipt%' LIMIT 1");
  if (r.rows.length > 0) {
    const rd = r.rows[0].raw_data;
    const keys = Object.keys(rd);
    console.log('Keys:', keys.join(', '));
    console.log('reicept_url:', rd.reicept_url);
    console.log('receipt_url:', rd.receipt_url);
  } else {
    console.log('No receipt field found');
  }
  // Check for any URL-like fields
  const r2 = await pool.query("SELECT raw_data FROM prestacao_expenses WHERE raw_data IS NOT NULL LIMIT 5");
  for (const row of r2.rows) {
    const rd = row.raw_data;
    const keys = Object.keys(rd);
    const urlKeys = keys.filter(k => k.toLowerCase().includes('url') || k.toLowerCase().includes('receipt') || k.toLowerCase().includes('file') || k.toLowerCase().includes('attach') || k.toLowerCase().includes('image'));
    console.log('ID fields:', keys.slice(0, 10).join(', '), '... URL-ish:', urlKeys.join(', '));
    for (const k of urlKeys) console.log('  ', k, '=', rd[k]);
  }
  await pool.end();
})();
