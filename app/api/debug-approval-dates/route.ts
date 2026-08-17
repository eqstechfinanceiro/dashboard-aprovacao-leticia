import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const diffCpfs = searchParams.get('cpfs'); // comma-separated CPFs with diffs

  // Get all non-FATURA APROVADO/ENVIADO reports with their approval dates and expense sums
  let reports;
  if (diffCpfs) {
    const cpfList = diffCpfs.split(',').map(c => c.trim()).filter(Boolean);
    reports = await sql`
      SELECT
        r.id,
        r.name,
        r.status,
        r.user_cpf,
        r.user_name,
        r.created_at,
        r.updated_at,
        r.raw_data->>'approval_date' as approval_date,
        r.raw_data->>'updated_at' as api_updated_at,
        r.raw_data->>'created_at' as api_created_at,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(e.value), 0) as total_value
      FROM prestacao_reports r
      LEFT JOIN prestacao_expenses e ON e.report_id = r.id
      WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
        AND r.user_cpf = ANY(${cpfList}::text[])
        AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
      GROUP BY r.id, r.name, r.status, r.user_cpf, r.user_name, r.created_at, r.updated_at, r.raw_data
      ORDER BY r.user_cpf, r.id
    `;
  } else {
    reports = await sql`
      SELECT
        r.id,
        r.name,
        r.status,
        r.user_cpf,
        r.user_name,
        r.created_at,
        r.updated_at,
        r.raw_data->>'approval_date' as approval_date,
        r.raw_data->>'updated_at' as api_updated_at,
        r.raw_data->>'created_at' as api_created_at,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(e.value), 0) as total_value
      FROM prestacao_reports r
      LEFT JOIN prestacao_expenses e ON e.report_id = r.id
      WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
        AND r.user_cpf IS NOT NULL
        AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTÃO%')
      GROUP BY r.id, r.name, r.status, r.user_cpf, r.user_name, r.created_at, r.updated_at, r.raw_data
      ORDER BY r.user_cpf, r.id
    `;
  }

  // Categorize by approval date - day 11 of August 2026 is the cutoff
  // 1ª QZ August: period 26/Jul → 10/Aug, closing day 11
  // Reports approved before Aug 11 should be in the CONTROLE sheet
  // Reports approved on/after Aug 11 are time-related diffs (not yet in CONTROLE)
  const before11: any[] = [];
  const onOrAfter11: any[] = [];
  const noDate: any[] = [];

  for (const r of reports) {
    const dateStr = r.approval_date || r.api_updated_at;
    const row = {
      id: r.id,
      name: r.name,
      status: r.status,
      user_cpf: r.user_cpf,
      user_name: r.user_name,
      expense_count: Number(r.expense_count),
      total_value: Number(r.total_value),
      approval_date: r.approval_date,
      api_updated_at: r.api_updated_at,
      date_used: dateStr,
    };

    if (!dateStr) {
      noDate.push(row);
    } else {
      const date = new Date(dateStr + 'Z');
      const cutoff = new Date('2026-08-11T00:00:00Z');
      if (date >= cutoff) {
        onOrAfter11.push(row);
      } else {
        before11.push(row);
      }
    }
  }

  return NextResponse.json({
    total: reports.length,
    before_day_11: before11.length,
    on_or_after_day_11: onOrAfter11.length,
    no_date: noDate.length,
    before_11_with_expenses: before11.filter(r => r.expense_count > 0).length,
    before_11_zero_expenses: before11.filter(r => r.expense_count === 0).length,
    after_11_with_expenses: onOrAfter11.filter(r => r.expense_count > 0).length,
    after_11_zero_expenses: onOrAfter11.filter(r => r.expense_count === 0).length,
    before_11_total_value: before11.reduce((s: number, r: any) => s + r.total_value, 0),
    after_11_total_value: onOrAfter11.reduce((s: number, r: any) => s + r.total_value, 0),
    before_11: before11,
    after_11: onOrAfter11,
    no_date_samples: noDate.slice(0, 20),
  });
}
