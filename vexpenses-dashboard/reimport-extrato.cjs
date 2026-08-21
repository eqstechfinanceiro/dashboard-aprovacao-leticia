const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();
  console.log('Clearing extrato_movimentacao...');
  await c.query('DELETE FROM extrato_movimentacao');
  console.log('Done. Now re-running import...');
  await c.end();
  
  // Now run the import script
  const { execSync } = require('child_process');
  execSync('node import-api-data.cjs', {
    cwd: __dirname,
    stdio: 'inherit',
  });
}
main().catch(e => { console.error(e); process.exit(1); });
