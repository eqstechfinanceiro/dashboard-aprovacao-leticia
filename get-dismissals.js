const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query("SELECT expense_id, duplicate_expense_id FROM nf_duplicate_dismissals");
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
