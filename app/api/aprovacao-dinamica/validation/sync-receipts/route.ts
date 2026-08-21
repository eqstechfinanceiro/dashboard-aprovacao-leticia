import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function POST() {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // Get all expense IDs from dismissals table
  const dismissals = await sql`
    SELECT DISTINCT expense_id, duplicate_expense_id
    FROM nf_duplicate_dismissals
  `;

  const allExpenseIds: number[] = [];
  for (const d of dismissals as any[]) {
    allExpenseIds.push(Number(d.expense_id), Number(d.duplicate_expense_id));
  }

  // Find which reports those expenses belong to
  const reports = await sql`
    SELECT DISTINCT pe.report_id
    FROM prestacao_expenses pe
    WHERE pe.id = ANY(${allExpenseIds})
      AND pe.report_id IS NOT NULL
  `;

  const reportIds = (reports as any[]).map(r => r.report_id);
  let updated = 0;
  let errors = 0;
  const errorList: string[] = [];

  for (const reportId of reportIds) {
    try {
      let resp: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        resp = await fetch(
          `${API_URL}/v2/reports/${reportId}?include=expenses.expense_type,expenses.costs_center,expenses.payment_method`,
          {
            headers: { Authorization: API_KEY, Accept: 'application/json' },
            signal: AbortSignal.timeout(30000),
          }
        );
        if (resp.status !== 429 && resp.status !== 403) break;
        await new Promise(r => setTimeout(r, 5000));
      }

      if (!resp || !resp.ok) {
        errors++;
        errorList.push(`Report ${reportId}: API returned ${resp?.status || 'timeout'}`);
        continue;
      }

      const data = await resp.json();
      const apiExpenses = data.data?.expenses?.data || [];

      for (const e of apiExpenses) {
        if (!allExpenseIds.includes(e.id)) continue;

        const receiptUrl = e.receipt_url || e.reicept_url || null;
        if (!receiptUrl) continue;

        // Check if current raw_data is missing receipt URL
        const existing = await sql`
          SELECT raw_data FROM prestacao_expenses WHERE id = ${e.id}
        `;
        if (existing.length === 0) continue;

        const currentRaw = existing[0].raw_data;
        const currentUrl = currentRaw?.reicept_url || currentRaw?.receipt_url || null;

        if (!currentUrl) {
          const newRaw = { ...currentRaw, reicept_url: receiptUrl, receipt_url: receiptUrl };
          await sql`
            UPDATE prestacao_expenses
            SET raw_data = ${JSON.stringify(newRaw)}
            WHERE id = ${e.id}
          `;
          updated++;
        }
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      errors++;
      errorList.push(`Report ${reportId}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    totalReports: reportIds.length,
    updated,
    errors,
    errorList: errorList.slice(0, 20),
  });
}
