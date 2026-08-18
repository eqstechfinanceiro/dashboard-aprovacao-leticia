import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // Current state of prestacao_expenses
  const expenseCount = await sql`
    SELECT COUNT(*) as total, MAX(id) as max_id
    FROM prestacao_expenses
  `;

  // Count of reports with 0 expenses
  const zeroReports = await sql`
    SELECT COUNT(*) as count
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE e.id IS NULL
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
  `;

  // Total prestacao value (non-FATURA, APROVADO+ENVIADO)
  const prestacaoTotal = await sql`
    SELECT
      COUNT(DISTINCT r.id) as report_count,
      COUNT(e.id) as expense_count,
      COALESCE(SUM(e.value), 0) as total_value
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
  `;

  // Target: BASE PREST total
  const target = 7343741.21; // BASE PREST normal (non-FATURA)

  return NextResponse.json({
    current_expenses: expenseCount[0],
    zero_expense_reports: zeroReports[0],
    prestacao_total: prestacaoTotal[0],
    target_total: target,
    diff: target - Number(prestacaoTotal[0].total_value),
    progress_pct: (Number(prestacaoTotal[0].total_value) / target * 100).toFixed(2) + '%',
  });
}
