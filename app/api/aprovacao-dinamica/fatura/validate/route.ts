import { NextRequest, NextResponse } from 'next/server';
import { getApiHeaders, getApiUrl } from '@/lib/vexpenses-client';
import { ensureFaturaTable, saveFaturaValidations, FaturaValidationRecord } from '@/lib/fatura-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
    if (cols.length < 15) continue;

    const valorReais = parseFloat(cols[14]?.replace(',', '.') || '0');
    if (isNaN(valorReais) || valorReais === 0) continue;

    entries.push({
      data: cols[0]?.trim() || '',
      nomePortador: cols[1]?.trim() || '',
      numFuncional: cols[2]?.trim() || '',
      descricao: cols[6]?.trim() || '',
      valorReais,
      numeroAutorizacao: cols[23]?.trim() || '',
      cnpj: cols[24]?.trim() || '',
    });
  }

  return entries;
}

function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function namesMatch(csvName: string, userName: string): boolean {
  const csv = normalizeName(csvName);
  const user = normalizeName(userName);
  if (!csv || !user) return false;
  if (csv === user) return true;
  if (csv.length > 0 && user.startsWith(csv)) return true;
  if (user.length > 0 && csv.startsWith(user)) return true;
  const csvParts = csv.split(' ').filter(p => p.length > 2);
  const userParts = user.split(' ').filter(p => p.length > 2);
  if (csvParts.length >= 2 && userParts.length >= 2) {
    if (csvParts[0] === userParts[0] && csvParts[csvParts.length - 1] === userParts[userParts.length - 1]) {
      return true;
    }
  }
  return false;
}

interface ReportWithExpenses {
  reportId: number;
  reportDescription: string;
  userName: string;
  expenses: Array<{ id: number; expense_id: number; value: number; title: string; date: string }>;
}

async function fetchPendingItauReports(): Promise<ReportWithExpenses[]> {
  const PENDING_STATUSES = ['ENVIADO'];
  const allReports: any[] = [];
  const seenIds = new Set<number>();

  for (const status of PENDING_STATUSES) {
    let page = 1;
    while (page <= 20) {
      const response = await fetch(
        `${getApiUrl()}/v2/reports/status/${status}?include=user,expenses.payment_method&per_page=100&page=${page}`,
        {
          headers: getApiHeaders(),
          signal: AbortSignal.timeout(120000),
        }
      );
      if (!response.ok) break;
      const data = await response.json();
      const reports = data.data || [];
      let newCount = 0;
      for (const r of reports) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          allReports.push(r);
          newCount++;
        }
      }
      if (newCount === 0 || reports.length === 0) break;
      page++;
    }
  }

  const itauReports: ReportWithExpenses[] = [];
  for (const r of allReports) {
    const expenses = r.expenses?.data || r.expenses || [];
    const hasItau = expenses.some((e: any) => {
      const pm = e.payment_method?.data || e.payment_method;
      const desc = pm?.description || '';
      return desc.toUpperCase().includes('ITAU') || desc.toUpperCase().includes('ITAÚ');
    });
    if (!hasItau) continue;

    const userName = r.user?.data?.name || r.user?.name || '';
    const mappedExpenses = expenses.map((e: any) => ({
      id: e.id,
      expense_id: e.expense_id,
      value: e.value,
      title: e.title,
      date: e.date,
    }));

    itauReports.push({
      reportId: r.id,
      reportDescription: r.description || `Report #${r.id}`,
      userName,
      expenses: mappedExpenses,
    });
  }

  return itauReports;
}

function matchExpensesToFatura(
  reports: ReportWithExpenses[],
  faturaEntries: FaturaEntry[],
  filename: string,
  validatedBy: string
): FaturaValidationRecord[] {
  const results: FaturaValidationRecord[] = [];
  const usedFaturaIndices = new Set<number>();

  for (const report of reports) {
    for (const expense of report.expenses) {
      const expenseValue = Math.round(expense.value * 100) / 100;

      let matchedIndex = -1;
      for (let i = 0; i < faturaEntries.length; i++) {
        if (usedFaturaIndices.has(i)) continue;
        const fatura = faturaEntries[i];
        const faturaValue = Math.round(fatura.valorReais * 100) / 100;
        if (expenseValue !== faturaValue) continue;
        if (report.userName && fatura.nomePortador) {
          if (!namesMatch(fatura.nomePortador, report.userName)) continue;
        }
        matchedIndex = i;
        break;
      }

      if (matchedIndex >= 0) {
        usedFaturaIndices.add(matchedIndex);
        const fatura = faturaEntries[matchedIndex];
        const difference = Math.round((expense.value - fatura.valorReais) * 100) / 100;

        results.push({
          report_id: report.reportId,
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
          report_id: report.reportId,
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
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const validatedBy = (formData.get('validatedBy') as string) || 'Sistema';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const csvText = await file.text();
    const faturaEntries = parseCsv(csvText);

    if (faturaEntries.length === 0) {
      return NextResponse.json({ error: 'No valid entries found in CSV' }, { status: 400 });
    }

    const reports = await fetchPendingItauReports();

    if (reports.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          filename: file.name,
          total_fatura_entries: faturaEntries.length,
          reports_validated: 0,
          total_expenses: 0,
          validated: 0,
          mismatched: 0,
          not_found: 0,
          unmatched_fatura_count: faturaEntries.length,
          results: [],
          message: 'No pending reports with Itau payment method found',
        },
      });
    }

    const validationRecords = matchExpensesToFatura(
      reports,
      faturaEntries,
      file.name,
      validatedBy
    );

    await ensureFaturaTable();
    await saveFaturaValidations(validationRecords);

    const validated = validationRecords.filter(r => r.status === 'VALIDATED').length;
    const mismatched = validationRecords.filter(r => r.status === 'MISMATCH').length;
    const notFound = validationRecords.filter(r => r.status === 'NOT_FOUND').length;

    const usedFaturaIndices = new Set<number>();
    for (const r of validationRecords) {
      if (r.status !== 'NOT_FOUND') {
        for (let i = 0; i < faturaEntries.length; i++) {
          if (usedFaturaIndices.has(i)) continue;
          if (faturaEntries[i].descricao === r.fatura_description && faturaEntries[i].valorReais === r.fatura_value) {
            usedFaturaIndices.add(i);
            break;
          }
        }
      }
    }
    const unmatchedFaturaCount = faturaEntries.length - usedFaturaIndices.size;

    const reportSummaries = reports.map(r => {
      const reportResults = validationRecords.filter(v => v.report_id === r.reportId);
      return {
        report_id: r.reportId,
        report_description: r.reportDescription,
        user_name: r.userName,
        total_expenses: r.expenses.length,
        validated: reportResults.filter(v => v.status === 'VALIDATED').length,
        mismatched: reportResults.filter(v => v.status === 'MISMATCH').length,
        not_found: reportResults.filter(v => v.status === 'NOT_FOUND').length,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        filename: file.name,
        total_fatura_entries: faturaEntries.length,
        reports_validated: reports.length,
        total_expenses: validationRecords.length,
        validated,
        mismatched,
        not_found: notFound,
        unmatched_fatura_count: unmatchedFaturaCount,
        report_summaries: reportSummaries,
        results: validationRecords,
      },
    });
  } catch (error) {
    console.error('[Fatura Validate API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
