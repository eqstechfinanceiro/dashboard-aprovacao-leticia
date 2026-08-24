import { NextRequest, NextResponse } from 'next/server';
import { ensureFaturaTable, saveFaturaValidationsBatch } from '@/lib/fatura-db';
import { parseFaturaCsv, matchExpenseToFatura } from '@/lib/fatura-parser';
import { getApiUrl } from '@/lib/vexpenses-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Origin': 'https://app.vexpenses.com',
  'Referer': 'https://app.vexpenses.com',
};

function isItauExpense(expense: any): boolean {
  const pm = expense.payment_method;
  if (!pm) return false;
  const desc = (pm.data?.description || pm.description || '').toLowerCase();
  return desc.includes('itaú') || desc.includes('itau');
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const validatedBy = (formData.get('validatedBy') as string) || 'Sistema';

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    await ensureFaturaTable();

    const csvText = await file.text();
    const faturaRows = parseFaturaCsv(csvText);
    console.log(`[Fatura Validate] Parsed ${faturaRows.length} rows from ${file.name}`);

    if (faturaRows.length === 0) {
      return NextResponse.json({ results: [], message: 'No valid rows found in CSV', totalRows: 0 });
    }

    // Single bulk API call: get all ENVIADO reports with expenses + payment_method embedded
    // Bypass rate limiter — single request, no need for queue
    console.log(`[Fatura Validate] Fetching all reports with expenses in bulk...`);
    const include = 'expenses.expense_type,expenses.costs_center,expenses.payment_method,expenses.user,user';
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

    if (!response || !response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch reports: ${response?.status || 'no response'}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const allReports = data.data || [];
    console.log(`[Fatura Validate] Got ${allReports.length} reports with expenses in ${Date.now() - startTime}ms`);

    // Filter to Itaú reports (reports that have at least one Itaú expense)
    const itauReports = allReports.filter((report: any) => {
      const expenses = report.expenses?.data || [];
      return expenses.some(isItauExpense);
    });

    console.log(`[Fatura Validate] Itaú reports: ${itauReports.length}/${allReports.length}`);

    // Validate Itaú expenses against fatura
    const results: Array<any> = [];
    const recordsToSave: Array<any> = [];
    let validatedCount = 0;
    let mismatchCount = 0;
    let notFoundCount = 0;

    for (const report of itauReports) {
      const expenses = report.expenses?.data || [];
      const itauExpenses = expenses.filter(isItauExpense);

      for (const expense of itauExpenses) {
        const expenseData = {
          value: parseFloat(expense.value) || 0,
          date: expense.date || '',
          title: expense.title || '',
          observation: expense.observation || '',
        };

        const match = matchExpenseToFatura(expenseData, faturaRows);

        const record = {
          report_id: report.id,
          expense_id: expense.id,
          expense_value: expenseData.value,
          fatura_filename: file.name,
          fatura_date: match.faturaRow?.data || null,
          fatura_description: match.faturaRow?.descricao || null,
          fatura_value: match.faturaRow?.valorReais || 0,
          difference: match.difference,
          status: match.status,
          validated_by: validatedBy,
        };

        results.push(record);

        if (match.status === 'VALIDATED') validatedCount++;
        else if (match.status === 'MISMATCH') mismatchCount++;
        else notFoundCount++;

        if (match.matched) {
          recordsToSave.push(record);
        }
      }
    }

    // Batch save all matched records to DB
    if (recordsToSave.length > 0) {
      console.log(`[Fatura Validate] Saving ${recordsToSave.length} records to DB...`);
      await saveFaturaValidationsBatch(recordsToSave);
      console.log(`[Fatura Validate] DB save complete`);
    }

    const durationMs = Date.now() - startTime;
    console.log(`[Fatura Validate] Done in ${durationMs}ms: ${validatedCount} validated, ${mismatchCount} mismatch, ${notFoundCount} not found (total ${results.length} Itaú expenses from ${itauReports.length} reports)`);

    return NextResponse.json({
      results,
      summary: {
        totalExpenses: results.length,
        validated: validatedCount,
        mismatch: mismatchCount,
        notFound: notFoundCount,
        totalFaturaRows: faturaRows.length,
        totalReports: allReports.length,
        itauReports: itauReports.length,
        reportsProcessed: itauReports.length,
        durationMs,
      },
      message: `Validated ${validatedCount}/${results.length} Itaú expenses from ${itauReports.length} reports (of ${allReports.length} total)`,
    });
  } catch (error: any) {
    console.error('[Fatura Validate] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
