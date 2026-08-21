import { NextRequest, NextResponse } from 'next/server';
import { getApiHeaders, getApiUrl } from '@/lib/vexpenses-client';
import { ensureFaturaTable, saveFaturaValidations, FaturaValidationRecord } from '@/lib/fatura-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface FaturaEntry {
  data: string;
  nomePortador: string;
  numFuncional: string;
  descricao: string;
  valorReais: number;
  numeroAutorizacao: string;
  cnpj: string;
}

function parseCsv(csvText: string): FaturaEntry[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const entries: FaturaEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(';');
    if (cols.length < 14) continue;

    const valorReais = parseFloat(cols[13]?.replace(',', '.') || '0');
    if (isNaN(valorReais) || valorReais === 0) continue;

    entries.push({
      data: cols[0]?.trim() || '',
      nomePortador: cols[1]?.trim() || '',
      numFuncional: cols[2]?.trim() || '',
      descricao: cols[6]?.trim() || '',
      valorReais,
      numeroAutorizacao: cols[21]?.trim() || '',
      cnpj: cols[22]?.trim() || '',
    });
  }

  return entries;
}

function matchExpensesToFatura(
  expenses: Array<{ id: number; expense_id: number; value: number; title: string; date: string }>,
  faturaEntries: FaturaEntry[],
  filename: string,
  reportId: number,
  validatedBy: string
): FaturaValidationRecord[] {
  const results: FaturaValidationRecord[] = [];
  const usedFaturaIndices = new Set<number>();

  for (const expense of expenses) {
    const expenseValue = Math.round(expense.value * 100) / 100;

    let matchedIndex = -1;
    for (let i = 0; i < faturaEntries.length; i++) {
      if (usedFaturaIndices.has(i)) continue;
      const faturaValue = Math.round(faturaEntries[i].valorReais * 100) / 100;
      if (expenseValue === faturaValue) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex >= 0) {
      usedFaturaIndices.add(matchedIndex);
      const fatura = faturaEntries[matchedIndex];
      const difference = Math.round((expense.value - fatura.valorReais) * 100) / 100;

      results.push({
        report_id: reportId,
        expense_id: expense.expense_id,
        status: difference === 0 ? 'VALIDATED' : 'MISMATCH',
        fatura_filename: filename,
        fatura_date: fatura.data,
        fatura_description: fatura.descricao,
        fatura_value: fatura.valorReais,
        expense_value: expense.value,
        difference,
        validated_by: validatedBy,
      });
    } else {
      results.push({
        report_id: reportId,
        expense_id: expense.expense_id,
        status: 'NOT_FOUND',
        fatura_filename: filename,
        fatura_date: '',
        fatura_description: '',
        fatura_value: 0,
        expense_value: expense.value,
        difference: expense.value,
        validated_by: validatedBy,
      });
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const reportIdStr = formData.get('reportId') as string | null;
    const validatedBy = (formData.get('validatedBy') as string) || 'Sistema';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!reportIdStr) {
      return NextResponse.json({ error: 'No reportId provided' }, { status: 400 });
    }

    const reportId = parseInt(reportIdStr);
    if (isNaN(reportId)) {
      return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
    }

    const csvText = await file.text();
    const faturaEntries = parseCsv(csvText);

    if (faturaEntries.length === 0) {
      return NextResponse.json({ error: 'No valid entries found in CSV' }, { status: 400 });
    }

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(
        `${getApiUrl()}/v2/reports/${reportId}?include=expenses.expense_type,expenses.costs_center,expenses.payment_method,user`,
        {
          headers: getApiHeaders(),
          signal: AbortSignal.timeout(120000),
        }
      );
      if (response.ok) break;
      if (response.status === 403 && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt)));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch report expenses: ${response?.status || 'timeout'}` },
        { status: 502 }
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
      value: e.value,
      title: e.title,
      date: e.date,
    }));

    const validationRecords = matchExpensesToFatura(
      expenses,
      faturaEntries,
      file.name,
      reportId,
      validatedBy
    );

    await ensureFaturaTable();
    await saveFaturaValidations(validationRecords);

    const validated = validationRecords.filter(r => r.status === 'VALIDATED').length;
    const mismatched = validationRecords.filter(r => r.status === 'MISMATCH').length;
    const notFound = validationRecords.filter(r => r.status === 'NOT_FOUND').length;

    const unmatchedFaturaEntries = faturaEntries.filter((_, i) => {
      return !validationRecords.some(r => r.fatura_description === faturaEntries[i].descricao && r.fatura_value === faturaEntries[i].valorReais);
    });

    return NextResponse.json({
      success: true,
      data: {
        report_id: reportId,
        filename: file.name,
        total_fatura_entries: faturaEntries.length,
        total_expenses: expenses.length,
        validated,
        mismatched,
        not_found: notFound,
        unmatched_fatura_count: unmatchedFaturaEntries.length,
        results: validationRecords,
      },
    });
  } catch (error) {
    console.error('[Fatura Validate API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
