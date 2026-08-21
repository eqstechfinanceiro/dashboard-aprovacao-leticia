import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL);
const rows = await sql`
  SELECT ear.expense_id, ear.report_id, ear.status, ear.extracted_data
  FROM expense_audit_results ear
  WHERE ear.status IN ('PENDENTE', 'REPROVADO')
  ORDER BY ear.id
  LIMIT 10
`;
console.log(JSON.stringify(rows, null, 2));
