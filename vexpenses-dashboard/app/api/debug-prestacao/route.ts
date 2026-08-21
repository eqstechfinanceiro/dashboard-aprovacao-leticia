import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // 1. Total prestacao from API (matching the quinzena-complete logic)
  const reportRows = await sql`
    SELECT r.id, r.name, r.status, r.user_cpf, r.user_name
    FROM prestacao_reports r
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
    ORDER BY r.user_cpf, r.id
  `;

  // 2. Get expenses sum per report
  const expenseSums = await sql`
    SELECT
      r.user_cpf,
      r.id as report_id,
      r.name as report_name,
      r.status,
      COUNT(e.id) as expense_count,
      COALESCE(SUM(e.value), 0) as total_value,
      COALESCE(SUM(e.value) FILTER(WHERE COALESCE(e.raw_data->>'payment_method_id', '') = '627401'), 0) as excluded_value
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
    GROUP BY r.user_cpf, r.id, r.name, r.status
    ORDER BY r.user_cpf, r.id
  `;

  // 3. Per-CPF summary
  const cpfSummary = await sql`
    SELECT
      r.user_cpf,
      COUNT(DISTINCT r.id) as report_count,
      COUNT(DISTINCT r.id) FILTER(WHERE r.status ILIKE 'Aprovado') as aprovado_count,
      COUNT(DISTINCT r.id) FILTER(WHERE r.status ILIKE 'Enviado') as enviado_count,
      COALESCE(SUM(e.value), 0) as total_expenses,
      COALESCE(SUM(e.value) FILTER(WHERE COALESCE(e.raw_data->>'payment_method_id', '') != '627401'), 0) as prestacao_total
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
    GROUP BY r.user_cpf
    ORDER BY prestacao_total DESC
  `;

  // 4. Total counts
  const totalCounts = await sql`
    SELECT
      COUNT(*) as total_reports,
      COUNT(*) FILTER(WHERE status ILIKE 'Aprovado') as aprovado,
      COUNT(*) FILTER(WHERE status ILIKE 'Enviado') as enviado,
      COUNT(*) FILTER(WHERE status NOT ILIKE 'Aprovado' AND status NOT ILIKE 'Enviado') as other_status,
      COUNT(*) FILTER(WHERE user_cpf IS NULL) as no_cpf
    FROM prestacao_reports
  `;

  // 5. Total expenses
  const totalExpenses = await sql`
    SELECT
      COUNT(*) as total_expenses,
      COALESCE(SUM(e.value), 0) as total_value,
      COALESCE(SUM(e.value) FILTER(WHERE COALESCE(e.raw_data->>'payment_method_id', '') != '627401'), 0) as prestacao_value
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
  `;

  // 6. Reports with FATURA/CARTAO in name (that get filtered out)
  const faturaReports = await sql`
    SELECT id, name, status, user_cpf, user_name
    FROM prestacao_reports
    WHERE (status ILIKE 'Aprovado' OR status ILIKE 'Enviado')
      AND user_cpf IS NOT NULL
      AND (name ILIKE '%FATURA%' OR name ILIKE '%CARTAO%' OR name ILIKE '%CARTÃO%')
    ORDER BY id
  `;

  return NextResponse.json({
    total_counts: totalCounts[0],
    total_expenses: totalExpenses[0],
    cpf_summary: cpfSummary,
    expense_details: expenseSums.slice(0, 500),
    fatura_reports: faturaReports,
    report_count: reportRows.length,
  });
}
