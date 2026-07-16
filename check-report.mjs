import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.NEON_DATABASE_URL);

async function main() {
  // Check for report 10344046
  const r1 = await sql`SELECT * FROM expense_audit_results WHERE report_id = 10344046`;
  console.log('Report 10344046 rows:', r1.length);
  if (r1.length > 0) console.log('  First row:', r1[0]);

  // Check all reports
  const r2 = await sql`SELECT report_id, count(*) as cnt FROM expense_audit_results GROUP BY report_id ORDER BY report_id`;
  console.log('\nAll reports in DB:');
  r2.forEach(r => console.log('  ', r.report_id, ':', r.cnt));

  // Check total
  const r3 = await sql`SELECT count(*) as cnt FROM expense_audit_results`;
  console.log('\nTotal rows:', r3[0].cnt);

  // Run the exact same query as the API
  const r4 = await sql`
    SELECT report_id, expense_id, status,
           extracted_data::text as extracted_data,
           informed_data::text as informed_data,
           divergences::text as divergences,
           rules_triggered::text as rules_triggered,
           summary
    FROM expense_audit_results
    ORDER BY report_id, expense_id
  `;
  console.log('\nExact API query returned:', r4.length, 'rows');
  console.log('Report IDs:', [...new Set(r4.map(r => r.report_id))]);
}

main().catch(e => console.error(e));
