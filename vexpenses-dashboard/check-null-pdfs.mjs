import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL);
const rows = await sql`
  SELECT ear.expense_id, ear.report_id, ear.status, ear.extracted_data, ear.summary
  FROM expense_audit_results ear
  WHERE ear.status IN ('PENDENTE', 'REPROVADO')
    AND ear.extracted_data IS NULL
  ORDER BY ear.id
  LIMIT 10
`;
console.log(JSON.stringify(rows, null, 2));
