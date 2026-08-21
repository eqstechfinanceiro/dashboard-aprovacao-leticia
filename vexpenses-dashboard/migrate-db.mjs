import { Client } from 'pg';

const NEON_URL = 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const client = new Client({ connectionString: NEON_URL });
  await client.connect();
  console.log('Connected via TCP!');

  // Get all tables
  const { rows: tables } = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log('Tables:', tables.map(t => t.table_name).join(', '));

  // Get row counts
  for (const t of tables) {
    const { rows } = await client.query(`SELECT COUNT(*) as cnt FROM "${t.table_name}"`);
    console.log(`  ${t.table_name}: ${rows[0].cnt} rows`);
  }

  // Get schema
  for (const t of tables) {
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [t.table_name]);
    console.log(`\nTable: ${t.table_name}`);
    for (const c of cols) {
      console.log(`  ${c.column_name} | ${c.data_type}${c.character_maximum_length ? `(${c.character_maximum_length})` : ''} | ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} | ${c.column_default || ''}`);
    }
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
