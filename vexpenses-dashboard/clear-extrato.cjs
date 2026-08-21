const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();
  console.log('Deleting all extrato rows...');
  const r = await c.query('DELETE FROM extrato_movimentacao');
  console.log('Deleted', r.rowCount, 'rows');
  console.log('Verifying...');
  const v = await c.query('SELECT COUNT(*) as cnt FROM extrato_movimentacao');
  console.log('Remaining:', v.rows[0].cnt);
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
