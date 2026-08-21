import { sql } from './neon';

// ---- Types -----------------------------------------------------------------

let dismissalsTableEnsured = false;

async function ensureDismissalsTable() {
  if (dismissalsTableEnsured || !sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS nf_duplicate_dismissals (
      id SERIAL PRIMARY KEY,
      expense_id BIGINT NOT NULL,
      duplicate_expense_id BIGINT NOT NULL,
      dismissed_by TEXT NOT NULL,
      dismissed_by_email TEXT,
      note TEXT,
      is_duplicate BOOLEAN NOT NULL DEFAULT false,
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(expense_id, duplicate_expense_id)
    )
  `;
  await sql`
    ALTER TABLE nf_duplicate_dismissals ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT false
  `;
  dismissalsTableEnsured = true;
}

export interface DuplicateMatch {
  expense_id: number;
  report_id: number;
  report_name: string;
  report_status: string;
  user_name: string;
  title: string;
  value: number;
  date: string;
  same_report: boolean;
  match_fields: string[];
  receipt_url: string | null;
  observation: string | null;
  expense_type: string | null;
  costs_center: string | null;
  dismissed: boolean;
  is_duplicate: boolean;
  dismissed_by: string | null;
  dismissed_at: string | null;
}

export interface ExpenseValidation {
  expense_id: number;
  has_duplicate: boolean;
  has_date_mismatch: boolean;
  duplicates: DuplicateMatch[];
  confirmed_duplicates: DuplicateMatch[];
  dismissed_duplicates: DuplicateMatch[];
  date_mismatch_detail: { expected_period: string; expense_date: string } | null;
}

export interface ReportValidation {
  has_duplicates: boolean;
  has_date_mismatch: boolean;
  has_total_mismatch: boolean;
  expenses: Record<number, ExpenseValidation>;
  total_expected: number | null;
  total_calculated: number;
  total_difference: number;
}

export interface ReportValidationSummary {
  has_duplicates: boolean;
  has_date_mismatch: boolean;
  has_total_mismatch: boolean;
  expense_count_with_issues: number;
}

// ---- Helpers ----------------------------------------------------------------

function isFaturaOrCartao(name: string): boolean {
  const n = name.trim().toUpperCase();
  if (n.includes('CAIXA ITAU') || n.includes('CAIXA ITAÚ')) return true;
  if (n.startsWith('CAIXA')) return false;
  if (/^(FATURA|CARTAO|CARTÃO|FATUAR|FARTUR|FATUT|FARUR|FATUTR)/.test(n)) return true;
  if (n.includes('CARTÃO DE CRÉDITO') || n.includes('CARTAO DE CREDITO') || n.includes('CARTÃO DE CREDITO')) return true;
  if (n.includes('CARTÃO CORPORATIVO')) return true;
  if ((n.includes('ITAU') || n.includes('ITAÚ')) && !n.includes('CAIXA')) return true;
  if (n.includes('DOLAR') || n.includes('DÓLAR')) return true;
  if (n.startsWith('DESPESA') && n.includes('FATURA')) return true;
  if (n.startsWith('COMPLEMENTAR') && n.includes('FATURA')) return true;
  if (n.includes('CARTÃO') && n.includes('CRÉDITO')) return true;
  if (n.includes('CARTAO') && n.includes('CREDITO')) return true;
  if (n.startsWith('CARTÃO VEXPENSES')) return true;
  return false;
}

const MONTH_NAMES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

export function parseReportPeriod(name: string): { month: number; year: number } | null {
  if (!name) return null;

  // Try MM/YYYY format (e.g., "CAIXA 07/2026")
  const mmYyyyMatch = name.match(/(\d{2})\/(\d{4})/);
  if (mmYyyyMatch) {
    const month = parseInt(mmYyyyMatch[1], 10);
    const year = parseInt(mmYyyyMatch[2], 10);
    if (month >= 1 && month <= 12) {
      return { month, year };
    }
  }

  // Try month name (e.g., "1 QZ JANEIRO 2026")
  const upperName = name.toUpperCase();
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (upperName.includes(MONTH_NAMES[i])) {
      const yearMatch = name.match(/(\d{4})/);
      if (yearMatch) {
        return { month: i + 1, year: parseInt(yearMatch[1], 10) };
      }
    }
  }

  return null;
}

function normalizeTitle(title: string | null | undefined): string {
  if (!title) return '';
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatPeriod(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

// ---- Core validation --------------------------------------------------------

interface DbExpense {
  id: number;
  report_id: number;
  value: number;
  date: string | null;
  description: string | null;
  raw_data: any;
  report_name: string;
  report_status: string;
  user_cpf: string | null;
  user_name: string | null;
  total_value: number | null;
  report_raw_data: any;
}

async function fetchReportExpenses(reportIds: number[]): Promise<Map<number, DbExpense[]>> {
  if (!sql) return new Map();
  if (reportIds.length === 0) return new Map();

  const rows = await sql`
    SELECT pe.id, pe.report_id, pe.value, pe.date, pe.description,
      pe.raw_data,
      pr.name as report_name, pr.status as report_status,
      pr.user_cpf, pr.user_name, pr.total_value,
      pr.raw_data as report_raw_data
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pe.report_id = ANY(${reportIds})
  `;

  const map = new Map<number, DbExpense[]>();
  for (const row of rows as any[]) {
    const arr = map.get(row.report_id) || [];
    arr.push(row);
    map.set(row.report_id, arr);
  }
  return map;
}

async function findDuplicates(
  targetExpenses: DbExpense[]
): Promise<Map<number, DuplicateMatch[]>> {
  if (!sql || targetExpenses.length === 0) return new Map();

  const result = new Map<number, DuplicateMatch[]>();

  // Build query to find all expenses with same (user_cpf, value, date) as any target
  // We do this in a single query using a join
  const targetTuples = targetExpenses.map(e => ({
    id: e.id,
    user_cpf: e.user_cpf,
    value: e.value,
    date: e.date,
    description: e.description,
    report_id: e.report_id,
    report_name: e.report_name,
    report_status: e.report_status,
    user_name: e.user_name,
  }));

  // Query: for each target expense, find other expenses with same value+date+user_cpf
  // Use raw query for complex join
  const reportIds = [...new Set(targetExpenses.map(e => e.report_id))];

  // Get ALL expenses that could be duplicates (same value+date as any target)
  // We fetch from DB all expenses matching value+date pairs
  // To keep it simple, we fetch all expenses for the same users and compare in JS
  const userCpfs = [...new Set(targetExpenses.map(e => e.user_cpf).filter(Boolean))] as string[];

  if (userCpfs.length === 0) return result;

  // Fetch all expenses for these users (to compare across all their reports)
  const allUserExpenses = await sql`
    SELECT pe.id, pe.report_id, pe.value, pe.date, pe.description,
      pe.raw_data,
      pr.name as report_name, pr.status as report_status,
      pr.user_cpf, pr.user_name
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pr.user_cpf = ANY(${userCpfs})
  `;

  // Build lookup: (user_cpf, value, date) -> expenses[]
  const lookup = new Map<string, any[]>();
  for (const exp of allUserExpenses as any[]) {
    if (!exp.user_cpf || !exp.date) continue;
    const key = `${exp.user_cpf}|${Number(exp.value).toFixed(2)}|${exp.date}`;
    const arr = lookup.get(key) || [];
    arr.push(exp);
    lookup.set(key, arr);
  }

  // Track seen pairs to avoid recording both A→B and B→A
  const seenPairs = new Set<string>();

  // For each target expense, find duplicates
  for (const target of targetTuples) {
    if (!target.user_cpf || !target.date) continue;
    const key = `${target.user_cpf}|${Number(target.value).toFixed(2)}|${target.date}`;
    const candidates = lookup.get(key) || [];

    const dups: DuplicateMatch[] = [];
    const targetNormTitle = normalizeTitle(target.description);

    for (const cand of candidates) {
      if (cand.id === target.id) continue;

      // Skip if we already recorded this pair from the other direction
      const pairKey = `${Math.min(target.id, cand.id)}|${Math.max(target.id, cand.id)}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const matchFields: string[] = ['value', 'date', 'user'];
      const candNormTitle = normalizeTitle(cand.description);

      if (targetNormTitle && candNormTitle && targetNormTitle === candNormTitle) {
        matchFields.push('title');
      }

      const raw = cand.raw_data;
      const receiptUrl = raw?.reicept_url || raw?.receipt_url || null;
      dups.push({
        expense_id: cand.id,
        report_id: cand.report_id,
        report_name: cand.report_name || '',
        report_status: cand.report_status || '',
        user_name: cand.user_name || '',
        title: cand.description || '',
        value: Number(cand.value),
        date: cand.date ? new Date(cand.date).toISOString().split('T')[0] : '',
        same_report: cand.report_id === target.report_id,
        match_fields: matchFields,
        receipt_url: receiptUrl,
        observation: raw?.observation || null,
        expense_type: raw?.expense_type?.data?.description || raw?.expense_type?.description || null,
        costs_center: raw?.costs_center?.data?.name || raw?.costs_center?.name || null,
        dismissed: false,
        is_duplicate: false,
        dismissed_by: null,
        dismissed_at: null,
      });
    }

    if (dups.length > 0) {
      result.set(target.id, dups);
    }
  }

  return result;
}

function checkDateMismatch(
  expense: DbExpense,
  reportName: string
): { expected_period: string; expense_date: string } | null {
  if (!expense.date) return null;

  const period = parseReportPeriod(reportName);
  if (!period) return null;

  const expDate = new Date(expense.date + 'T00:00:00');
  if (isNaN(expDate.getTime())) return null;

  const expMonth = expDate.getMonth() + 1;
  const expYear = expDate.getFullYear();

  if (expMonth !== period.month || expYear !== period.year) {
    return {
      expected_period: formatPeriod(period.month, period.year),
      expense_date: expense.date,
    };
  }

  return null;
}

function checkTotalMismatch(
  expenses: DbExpense[],
  reportName: string,
  reportTotalValue: number | null
): { calculated: number; expected: number; difference: number } | null {
  if (!isFaturaOrCartao(reportName)) return null;
  if (reportTotalValue === null || reportTotalValue === undefined || Number(reportTotalValue) === 0) return null;
  if (expenses.length === 0) return null;

  const calculated = expenses.reduce((sum, e) => sum + Number(e.value), 0);
  const expected = Number(reportTotalValue);
  const difference = Math.round((calculated - expected) * 100) / 100;

  if (Math.abs(difference) > 0.01) {
    return { calculated, expected, difference };
  }

  return null;
}

// ---- Public API -------------------------------------------------------------

export async function validateReports(
  reportIds: number[]
): Promise<Record<number, ReportValidation>> {
  const result: Record<number, ReportValidation> = {};

  if (!sql || reportIds.length === 0) return result;

  try {
    // Fetch expenses for all target reports
    const reportExpensesMap = await fetchReportExpenses(reportIds);

    // Collect all target expenses for duplicate detection
    const allTargetExpenses: DbExpense[] = [];
    for (const expenses of reportExpensesMap.values()) {
      allTargetExpenses.push(...expenses);
    }

    // Find duplicates across all reports
    const duplicateMap = await findDuplicates(allTargetExpenses);

    // Fetch dismissals for all target expense IDs
    const allExpenseIds = allTargetExpenses.map(e => e.id);
    let dismissalMap = new Map<string, { dismissed_by: string; dismissed_at: string; is_duplicate: boolean }>();
    if (allExpenseIds.length > 0) {
      try {
        await ensureDismissalsTable();
        const dismissals = await sql`
          SELECT expense_id, duplicate_expense_id, dismissed_by, dismissed_at, is_duplicate
          FROM nf_duplicate_dismissals
          WHERE expense_id = ANY(${allExpenseIds})
             OR duplicate_expense_id = ANY(${allExpenseIds})
        `;
        for (const d of dismissals as any[]) {
          dismissalMap.set(`${d.expense_id}|${d.duplicate_expense_id}`, {
            dismissed_by: d.dismissed_by,
            dismissed_at: d.dismissed_at,
            is_duplicate: d.is_duplicate,
          });
        }
      } catch (e) {
        console.error('[NF Validator] Error fetching dismissals:', e);
      }
    }

    // Validate each report
    for (const reportId of reportIds) {
      const expenses = reportExpensesMap.get(reportId) || [];
      const reportName = expenses[0]?.report_name || '';
      let reportTotalValue = expenses[0]?.total_value ?? null;
      if (reportTotalValue === null && expenses[0]?.report_raw_data) {
        const raw = expenses[0].report_raw_data;
        reportTotalValue = raw.total_value ?? raw.value ?? null;
      }

      const expenseValidations: Record<number, ExpenseValidation> = {};
      let hasDuplicates = false;
      let hasDateMismatch = false;

      for (const exp of expenses) {
        const allDups = duplicateMap.get(exp.id) || [];
        const dateMismatch = checkDateMismatch(exp, reportName);

        // Split into active, confirmed, and dismissed duplicates
        const activeDups: DuplicateMatch[] = [];
        const confirmedDups: DuplicateMatch[] = [];
        const dismissedDups: DuplicateMatch[] = [];
        for (const dup of allDups) {
          const key = `${exp.id}|${dup.expense_id}`;
          const reverseKey = `${dup.expense_id}|${exp.id}`;
          const dismissal = dismissalMap.get(key) || dismissalMap.get(reverseKey);
          if (dismissal) {
            if (dismissal.is_duplicate) {
              confirmedDups.push({
                ...dup,
                dismissed: true,
                is_duplicate: true,
                dismissed_by: dismissal.dismissed_by,
                dismissed_at: dismissal.dismissed_at,
              });
            } else {
              dismissedDups.push({
                ...dup,
                dismissed: true,
                is_duplicate: false,
                dismissed_by: dismissal.dismissed_by,
                dismissed_at: dismissal.dismissed_at,
              });
            }
          } else {
            activeDups.push(dup);
          }
        }

        if (activeDups.length > 0) hasDuplicates = true;
        if (dateMismatch) hasDateMismatch = true;

        expenseValidations[exp.id] = {
          expense_id: exp.id,
          has_duplicate: activeDups.length > 0,
          has_date_mismatch: !!dateMismatch,
          duplicates: activeDups,
          confirmed_duplicates: confirmedDups,
          dismissed_duplicates: dismissedDups,
          date_mismatch_detail: dateMismatch,
        };
      }

      // Check total mismatch for fatura-type reports
      const totalMismatch = checkTotalMismatch(expenses, reportName, reportTotalValue);

      result[reportId] = {
        has_duplicates: hasDuplicates,
        has_date_mismatch: hasDateMismatch,
        has_total_mismatch: !!totalMismatch,
        expenses: expenseValidations,
        total_expected: totalMismatch?.expected ?? null,
        total_calculated: totalMismatch?.calculated ?? expenses.reduce((s, e) => s + Number(e.value), 0),
        total_difference: totalMismatch?.difference ?? 0,
      };
    }
  } catch (error) {
    console.error('[NF Validator] Error validating reports:', error);
  }

  return result;
}

export async function validateReport(
  reportId: number
): Promise<ReportValidation | null> {
  const results = await validateReports([reportId]);
  return results[reportId] || null;
}

export function summarizeValidation(data: ReportValidation): ReportValidationSummary {
  let count = 0;
  for (const exp of Object.values(data.expenses)) {
    if (exp.has_duplicate || exp.has_date_mismatch) count++;
  }
  return {
    has_duplicates: data.has_duplicates,
    has_date_mismatch: data.has_date_mismatch,
    has_total_mismatch: data.has_total_mismatch,
    expense_count_with_issues: count,
  };
}

export async function validateBatch(
  reportIds: number[]
): Promise<Record<number, ReportValidationSummary | { error: string }>> {
  const validations = await validateReports(reportIds);
  const result: Record<number, ReportValidationSummary | { error: string }> = {};

  for (const reportId of reportIds) {
    const validation = validations[reportId];
    if (!validation) {
      result[reportId] = { error: 'no_data' };
    } else {
      result[reportId] = summarizeValidation(validation);
    }
  }

  return result;
}

export interface BatchDuplicatePair {
  original: {
    expense_id: number;
    title: string;
    value: number;
    date: string;
    observation: string | null;
    receipt_url: string | null;
    expense_type: string | null;
    costs_center: string | null;
    report_name: string;
    report_id: number;
    user_name: string;
  };
  duplicate: DuplicateMatch;
}

export async function getBatchDuplicates(
  reportIds: number[]
): Promise<BatchDuplicatePair[]> {
  if (!sql || reportIds.length === 0) return [];

  const validations = await validateReports(reportIds);

  // Collect all original expense IDs that have active duplicates
  const origExpIds: number[] = [];
  for (const validation of Object.values(validations)) {
    for (const [expIdStr, expData] of Object.entries(validation.expenses)) {
      if (expData.duplicates.length > 0) {
        origExpIds.push(parseInt(expIdStr, 10));
      }
    }
  }

  if (origExpIds.length === 0) return [];

  // Batch-fetch all original expense details in one query
  const origRows = await sql`
    SELECT pe.id, pe.description, pe.value, pe.date, pe.raw_data,
      pr.name as report_name, pr.user_name, pr.id as report_id
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pe.id = ANY(${origExpIds})
  `;

  const origMap = new Map<number, any>();
  for (const row of origRows as any[]) {
    origMap.set(row.id, row);
  }

  const pairs: BatchDuplicatePair[] = [];
  for (const [reportIdStr, validation] of Object.entries(validations)) {
    const reportId = parseInt(reportIdStr, 10);
    for (const [expIdStr, expData] of Object.entries(validation.expenses)) {
      if (expData.duplicates.length === 0) continue;
      const expId = parseInt(expIdStr, 10);
      const origRow = origMap.get(expId);
      if (!origRow) continue;

      const origRaw = origRow.raw_data;
      const origReceiptUrl = origRaw?.reicept_url || origRaw?.receipt_url || null;
      const origObservation = origRaw?.observation || null;
      const origExpenseType = origRaw?.expense_type?.data?.description || origRaw?.expense_type?.description || null;
      const origCostsCenter = origRaw?.costs_center?.data?.name || origRaw?.costs_center?.name || null;

      for (const dup of expData.duplicates) {
        pairs.push({
          original: {
            expense_id: expId,
            title: origRow.description || '',
            value: Number(origRow.value),
            date: origRow.date ? new Date(origRow.date).toISOString().split('T')[0] : '',
            observation: origObservation,
            receipt_url: origReceiptUrl,
            expense_type: origExpenseType,
            costs_center: origCostsCenter,
            report_name: origRow.report_name || '',
            report_id: reportId,
            user_name: origRow.user_name || '',
          },
          duplicate: dup,
        });
      }
    }
  }

  return pairs;
}

export async function getBatchDuplicatesSince(
  sinceDate: string
): Promise<BatchDuplicatePair[]> {
  if (!sql) return [];

  // Find duplicate groups: expenses with same (user_cpf, value, date) from 2026+
  const duplicateGroups = await sql`
    SELECT pr.user_cpf, pe.value, pe.date, array_agg(pe.id ORDER BY pe.id) as expense_ids
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pe.date >= ${sinceDate}
      AND pr.user_cpf IS NOT NULL AND pr.user_cpf != ''
      AND pe.value IS NOT NULL
      AND pe.date IS NOT NULL
    GROUP BY pr.user_cpf, pe.value, pe.date
    HAVING COUNT(*) > 1
  `;

  if ((duplicateGroups as any[]).length === 0) return [];

  // Collect all expense IDs involved in duplicates
  const allExpIds: number[] = [];
  for (const g of duplicateGroups as any[]) {
    allExpIds.push(...g.expense_ids);
  }

  // Fetch full details for all involved expenses
  const allRows = await sql`
    SELECT pe.id, pe.report_id, pe.value, pe.date, pe.description,
      pe.raw_data,
      pr.name as report_name, pr.status as report_status,
      pr.user_cpf, pr.user_name, pr.id as report_id_ref
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pe.id = ANY(${allExpIds})
  `;

  const expMap = new Map<number, any>();
  for (const row of allRows as any[]) {
    expMap.set(row.id, row);
  }

  // Fetch dismissals for all involved expense IDs
  let dismissalSet = new Set<string>();
  try {
    await ensureDismissalsTable();
    const dismissals = await sql`
      SELECT expense_id, duplicate_expense_id
      FROM nf_duplicate_dismissals
      WHERE expense_id = ANY(${allExpIds})
         OR duplicate_expense_id = ANY(${allExpIds})
    `;
    for (const d of dismissals as any[]) {
      dismissalSet.add(`${d.expense_id}|${d.duplicate_expense_id}`);
      dismissalSet.add(`${d.duplicate_expense_id}|${d.expense_id}`);
    }
  } catch (e) {
    console.error('[Batch Duplicates] Error fetching dismissals:', e);
  }

  const pairs: BatchDuplicatePair[] = [];
  const seenPairs = new Set<string>();

  for (const g of duplicateGroups as any[]) {
    const ids: number[] = g.expense_ids;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = expMap.get(ids[i]);
        const b = expMap.get(ids[j]);
        if (!a || !b) continue;

        const pairKey = `${Math.min(a.id, b.id)}|${Math.max(a.id, b.id)}`;
        if (seenPairs.has(pairKey) || dismissalSet.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const aRaw = a.raw_data;
        const bRaw = b.raw_data;

        const matchFields: string[] = ['value', 'date', 'user'];
        const aTitle = (a.description || '').trim().toLowerCase();
        const bTitle = (b.description || '').trim().toLowerCase();
        if (aTitle && bTitle && aTitle === bTitle) matchFields.push('title');

        pairs.push({
          original: {
            expense_id: a.id,
            title: a.description || '',
            value: Number(a.value),
            date: a.date ? new Date(a.date).toISOString().split('T')[0] : '',
            observation: aRaw?.observation || null,
            receipt_url: aRaw?.reicept_url || aRaw?.receipt_url || null,
            expense_type: aRaw?.expense_type?.data?.description || aRaw?.expense_type?.description || null,
            costs_center: aRaw?.costs_center?.data?.name || aRaw?.costs_center?.name || null,
            report_name: a.report_name || '',
            report_id: a.report_id_ref,
            user_name: a.user_name || '',
          },
          duplicate: {
            expense_id: b.id,
            report_id: b.report_id_ref,
            report_name: b.report_name || '',
            report_status: b.report_status || '',
            user_name: b.user_name || '',
            title: b.description || '',
            value: Number(b.value),
            date: b.date ? new Date(b.date).toISOString().split('T')[0] : '',
            same_report: a.report_id_ref === b.report_id_ref,
            match_fields: matchFields,
            receipt_url: bRaw?.reicept_url || bRaw?.receipt_url || null,
            observation: bRaw?.observation || null,
            expense_type: bRaw?.expense_type?.data?.description || bRaw?.expense_type?.description || null,
            costs_center: bRaw?.costs_center?.data?.name || bRaw?.costs_center?.name || null,
            dismissed: false,
            is_duplicate: false,
            dismissed_by: null,
            dismissed_at: null,
          },
        });
      }
    }
  }

  return pairs;
}
