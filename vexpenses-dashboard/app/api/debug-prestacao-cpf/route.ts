import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  const cpf = request.nextUrl.searchParams.get('cpf') || '01677920599';

  // 1. All reports for this CPF in the API
  const apiReports = await sql`
    SELECT id, name, status, user_cpf, user_name, created_at
    FROM prestacao_reports
    WHERE user_cpf = ${cpf}
    ORDER BY id
  `;

  // 2. Expenses sum per report
  const apiExpenses = await sql`
    SELECT
      r.id as report_id,
      r.name as report_name,
      r.status,
      COUNT(e.id) as expense_count,
      COALESCE(SUM(e.value), 0) as total_value,
      COALESCE(SUM(e.value) FILTER(WHERE COALESCE(e.raw_data->>'payment_method_id', '') = '627401'), 0) as excluded_value
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf = ${cpf}
    GROUP BY r.id, r.name, r.status
    ORDER BY r.id
  `;

  // 3. Total by status
  const statusSummary = await sql`
    SELECT
      r.status,
      COUNT(*) as report_count,
      COALESCE(SUM(e.value), 0) as total_expenses
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf = ${cpf}
    GROUP BY r.status
    ORDER BY report_count DESC
  `;

  return NextResponse.json({
    cpf,
    api_reports: apiReports,
    api_expenses: apiExpenses,
    status_summary: statusSummary,
    total_reports: apiReports.length,
  });
}
