import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reportId = params.id;

    let response: Response | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(
        `${API_URL}/v2/reports/${reportId}?include=expenses.expense_type,expenses.costs_center,expenses.payment_method`,
        {
          headers: {
            'Authorization': API_KEY,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(120000),
        }
      );

      if (response.ok) break;

      if (response.status === 403 && attempt < 2) {
        const backoff = Math.min(2000 * Math.pow(2, attempt), 10000);
        console.log(`[Expenses] 403 on report ${reportId}, attempt ${attempt + 1}, retrying in ${backoff}ms`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'No response';
      console.error(`[Expenses] API error ${response?.status}:`, errorText.slice(0, 200));
      return NextResponse.json(
        { error: `API error ${response?.status || 'timeout'}` },
        { status: response?.status || 500 }
      );
    }

    const data = await response.json();
    const report = data.data;

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

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

    const totalValue = expenses.reduce((sum: number, e: any) => sum + (e.value || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        report_id: parseInt(reportId),
        description: report.description,
        status: report.status,
        expenses,
        total_value: totalValue,
        expense_count: expenses.length,
      },
    });
  } catch (error) {
    console.error('[Expenses API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
