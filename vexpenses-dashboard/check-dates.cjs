const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();
  
  const r1 = await c.query("SELECT MIN(data), MAX(data), COUNT(*) FROM extrato_movimentacao WHERE is_snapshot = FALSE");
  console.log('Extrato date range:', r1.rows[0]);
  
  const r2 = await c.query("SELECT data, COUNT(*) as cnt FROM extrato_movimentacao WHERE is_snapshot = FALSE GROUP BY data ORDER BY data DESC LIMIT 10");
  console.log('Top 10 dates:');
  for (const r of r2.rows) console.log('  ', r.data, '->', r.cnt, 'rows');
  
  const r3 = await c.query("SELECT data, COUNT(*) as cnt FROM extrato_movimentacao WHERE is_snapshot = FALSE GROUP BY data ORDER BY data ASC LIMIT 10");
  console.log('Bottom 10 dates:');
  for (const r of r3.rows) console.log('  ', r.data, '->', r.cnt, 'rows');
  
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
