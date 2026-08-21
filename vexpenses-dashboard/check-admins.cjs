const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();
  const r = await c.query("SELECT id, email, name, role, must_change_password, first_access_password FROM app_users WHERE role = 'admin'");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
