import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // Compare expense counts between API and what we'd expect
  // Focus on reports where status is ENVIADO (these might have partial expenses)
  const enviadoReports = await sql`
    SELECT
      r.id,
      r.name,
      r.status,
      r.user_cpf,
      r.user_name,
      COUNT(e.id) as expense_count,
      COALESCE(SUM(e.value), 0) as total_value
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.status ILIKE 'Enviado'
      AND r.user_cpf IS NOT NULL
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
    GROUP BY r.id, r.name, r.status, r.user_cpf, r.user_name
    ORDER BY r.user_cpf, r.id
  `;

  // Also check APROVADO reports that might have partial data
  // Get reports with very few expenses relative to their total value
  const suspiciousAprovado = await sql`
    SELECT
      r.id,
      r.name,
      r.status,
      r.user_cpf,
      r.user_name,
      COUNT(e.id) as expense_count,
      COALESCE(SUM(e.value), 0) as total_value
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.status ILIKE 'Aprovado'
      AND r.user_cpf IS NOT NULL
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
    GROUP BY r.id, r.name, r.status, r.user_cpf, r.user_name
    HAVING COUNT(e.id) < 5
    ORDER BY total_value DESC
    LIMIT 100
  `;

  // Get total expense count and value for all non-FATURA APROVADO+ENVIADO reports
  const totals = await sql`
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

  // Check total expenses in the table
  const lastExpense = await sql`
    SELECT COUNT(*) as total_rows, MAX(id) as max_id
    FROM prestacao_expenses
  `;

  return NextResponse.json({
    totals: totals[0],
    last_expense: lastExpense[0],
    enviado_reports: enviadoReports.slice(0, 200),
    suspicious_aprovado: suspiciousAprovado.slice(0, 50),
    enviado_count: enviadoReports.length,
  });
}
