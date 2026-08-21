import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // Dump all expenses joined with report data - like BASE PREST sheet
  const rows = await sql`
    SELECT
      r.id as report_id,
      r.name as report_name,
      r.status,
      r.user_cpf,
      r.user_name,
      r.created_at,
      r.updated_at,
      r.raw_data->>'approval_date' as approval_date,
      r.total_value as report_total,
      e.id as expense_id,
      e.description as expense_description,
      e.value as expense_value,
      e.date as expense_date,
      e.status as expense_status
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf IS NOT NULL
    ORDER BY r.user_cpf, r.id, e.id
  `;

  // Also get per-CPF summary
  const cpfSummary = await sql`
    SELECT
      r.user_cpf,
      r.user_name,
      COUNT(DISTINCT r.id) as report_count,
      COUNT(e.id) as expense_count,
      COALESCE(SUM(e.value), 0) as total_prestacao
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf IS NOT NULL
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
    GROUP BY r.user_cpf, r.user_name
    ORDER BY r.user_name
  `;

  // Per-report summary
  const reportSummary = await sql`
    SELECT
      r.id as report_id,
      r.name as report_name,
      r.status,
      r.user_cpf,
      r.user_name,
      r.raw_data->>'approval_date' as approval_date,
      COUNT(e.id) as expense_count,
      COALESCE(SUM(e.value), 0) as total_value
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf IS NOT NULL
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
    GROUP BY r.id, r.name, r.status, r.user_cpf, r.user_name, r.raw_data
    ORDER BY r.user_cpf, r.id
  `;

  return NextResponse.json({
    expenses: rows,
    cpf_summary: cpfSummary,
    report_summary: reportSummary,
  });
}
