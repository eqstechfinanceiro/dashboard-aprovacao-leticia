const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const total = await pool.query("SELECT COUNT(*) FROM prestacao_expenses");
  const withReceipt = await pool.query("SELECT COUNT(*) FROM prestacao_expenses WHERE raw_data->>'reicept_url' IS NOT NULL AND raw_data->>'reicept_url' != ''");
  const withoutReceipt = await pool.query("SELECT COUNT(*) FROM prestacao_expenses WHERE raw_data->>'reicept_url' IS NULL OR raw_data->>'reicept_url' = ''");
  console.log('Total expenses:', total.rows[0].count);
  console.log('With reicept_url:', withReceipt.rows[0].count);
  console.log('Without reicept_url:', withoutReceipt.rows[0].count);

  // Check if receipt exists in a different place
  const sample = await pool.query("SELECT id, raw_data->>'reicept_url' as reicept, raw_data->>'receipt_url' as receipt, raw_data->>'attachement_url' as attach, raw_data->>'file_url' as file FROM prestacao_expenses WHERE raw_data->>'reicept_url' IS NULL LIMIT 3");
  for (const r of sample.rows) {
    console.log('No-receipt expense', r.id, ': reicept=', r.reicept, 'receipt=', r.receipt, 'attach=', r.attach, 'file=', r.file);
  }
  await pool.end();
})();
