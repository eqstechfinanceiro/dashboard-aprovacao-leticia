const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name='prestacao_expenses' AND column_name='raw_data'");
  console.log('raw_data column type:', r.rows[0]?.data_type);

  // Test: what does raw_data look like when queried?
  const r2 = await pool.query("SELECT id, raw_data FROM prestacao_expenses WHERE raw_data->>'reicept_url' IS NOT NULL LIMIT 1");
  if (r2.rows.length > 0) {
    const rd = r2.rows[0].raw_data;
    console.log('Type of raw_data:', typeof rd);
    console.log('reicept_url:', rd.reicept_url);
  }
  await pool.end();
})();
