import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.NEON_DATABASE_URL);

async function main() {
  const count = await sql`SELECT count(*) as cnt FROM expense_audit_results`;
  console.log('Total rows in DB:', count[0].cnt);
  
  const rows = await sql`SELECT report_id, count(*) as cnt FROM expense_audit_results GROUP BY report_id ORDER BY report_id`;
  console.log('Reports in DB:', rows.length);
  rows.forEach(r => console.log('  report', r.report_id, ':', r.cnt, 'expenses'));
  
  // Test the exact query from audit-all-results
  const allRows = await sql`
    SELECT report_id, expense_id, status,
           extracted_data::text as extracted_data,
           informed_data::text as informed_data,
           divergences::text as divergences,
           rules_triggered::text as rules_triggered,
           summary
    FROM expense_audit_results
    ORDER BY report_id, expense_id
  `;
  console.log('\nTotal rows returned by query:', allRows.length);
  console.log('Unique reports:', new Set(allRows.map(r => r.report_id)).size);
}

main().catch(e => console.error(e));
