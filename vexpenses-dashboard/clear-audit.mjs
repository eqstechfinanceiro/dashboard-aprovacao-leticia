import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.NEON_DATABASE_URL);

async function main() {
  // Delete all audit results so they get reprocessed with new model and rules
  const result = await sql`DELETE FROM expense_audit_results`;
  console.log('Deleted all audit results. Rows affected:', result.count || 'unknown');
  
  const remaining = await sql`SELECT count(*) as cnt FROM expense_audit_results`;
  console.log('Remaining rows:', remaining[0].cnt);
}

main().catch(e => console.error(e));
