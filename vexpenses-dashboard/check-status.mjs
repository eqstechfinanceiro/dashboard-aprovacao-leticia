import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.NEON_DATABASE_URL);

async function main() {
  const r = await sql`SELECT status, count(*) as cnt FROM expense_audit_results GROUP BY status ORDER BY cnt DESC`;
  console.log('Status counts:');
  r.forEach(row => console.log('  ', row.status, ':', row.cnt));

  const pending = await sql`SELECT summary, count(*) as cnt FROM expense_audit_results WHERE status = 'PENDENTE' GROUP BY summary ORDER BY cnt DESC LIMIT 10`;
  console.log('\nTop PENDING reasons:');
  pending.forEach(row => console.log('  [' + row.cnt + ']', row.summary?.substring(0, 200)));

  const rules = await sql`SELECT rules_triggered FROM expense_audit_results WHERE status = 'PENDENTE'`;
  const ruleCounts = {};
  rules.forEach(row => {
    try {
      const parsed = typeof row.rules_triggered === 'string' ? JSON.parse(row.rules_triggered) : row.rules_triggered;
      if (Array.isArray(parsed)) {
        parsed.forEach(r => {
          ruleCounts[r.rule] = (ruleCounts[r.rule] || 0) + 1;
        });
      }
    } catch(e) {}
  });
  console.log('\nRule distribution in PENDING (' + rules.length + ' total):');
  Object.entries(ruleCounts).sort((a,b) => b[1] - a[1]).forEach(([rule, cnt]) => {
    console.log('  ', rule, ':', cnt);
  });
}

main().catch(e => console.error(e));
