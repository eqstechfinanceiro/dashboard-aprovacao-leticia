import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/vexpenses-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Origin': 'https://app.vexpenses.com',
  'Referer': 'https://app.vexpenses.com',
};

export async function GET(request: NextRequest) {
  try {
    const include = 'expenses.expense_type,expenses.costs_center,expenses.payment_method,user';
    const bulkUrl = `${getApiUrl()}/v2/reports/status/ENVIADO?include=${include}&paginate=true&page=1&per_page=300`;

    const headers: Record<string, string> = {
      ...BROWSER_HEADERS,
      Authorization: process.env.VEXPENSES_API_KEY || '',
    };

    const response = await fetch(bulkUrl, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `API error ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const allReports = data.data || [];

    const result: Record<number, {
      report_id: number;
      description: string;
      status: string;
      user_name: string;
      user_email: string;
      expenses: any[];
      total_value: number;
      expense_count: number;
    }> = {};

    for (const report of allReports) {
      const expenses = (report.expenses?.data || []).map((e: any) => ({
        id: e.id,
        expense_id: e.expense_id,
        title: e.title,
        value: e.value,
        date: e.date,
        observation: e.observation,
        receipt_url: e.reicept_url || e.receipt_url || '',
        rejected: e.rejected,
        expense_type: e.expense_type?.data || null,
        costs_center: e.costs_center?.data || null,
        payment_method: e.payment_method?.data || null,
      }));

      const totalValue = expenses.reduce((sum: number, e: any) => sum + (parseFloat(e.value) || 0), 0);

      result[report.id] = {
        report_id: report.id,
        description: report.description,
        status: report.status,
        user_name: report.user?.data?.name || report.user?.name || '',
        user_email: report.user?.data?.email || report.user?.email || '',
        expenses,
        total_value: totalValue,
        expense_count: expenses.length,
      };
    }

    return NextResponse.json({
      success: true,
      data: result,
      total_reports: allReports.length,
    });
  } catch (error) {
    console.error('[Bulk Expenses API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
