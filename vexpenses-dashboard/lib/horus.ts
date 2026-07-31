import { getLaravelCookieString } from './laravel-token';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';

export interface HorusDuplicate {
  id: number;
  uuid: string;
  title: string;
  amount: number;
  date: string;
  score: number;
  fields: string[];
  user: { id: number; name: string } | null;
  report: { id: number; description: string; status: string } | null;
  receipt_url: string | null;
  cost_center: { id: number; nome: string } | null;
  is_reimbursable: boolean;
}

export interface HorusExpenseData {
  sync: string;
  has_possible_duplicates: boolean;
  has_restrictive_tags: boolean;
  duplicates: HorusDuplicate[];
  restrictive_tags: string[];
}

export interface HorusReportData {
  has_duplicates: boolean;
  has_restrictive_tags: boolean;
  expenses: Record<number, HorusExpenseData>;
}

export interface HorusSummary {
  has_duplicates: boolean;
  has_restrictive_tags: boolean;
  expense_count_with_issues: number;
}

interface ApprovalListItem {
  id: number;
  report: { id: number; uuid: string; description: string; status: string } | null;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Origin': 'https://app.vexpenses.com',
  'Referer': 'https://app.vexpenses.com/',
};

export async function getApprovalIdMap(): Promise<Map<number, number>> {
  const cookies = await getLaravelCookieString();
  if (!cookies) return new Map();

  const map = new Map<number, number>();

  for (const status of ['aguardando_voce', 'aguardando_outros']) {
    try {
      const resp = await fetch(
        `${API_URL}/web/approvals/list-by-user?status=${status}&per_page=500&page=1`,
        {
          headers: { ...BROWSER_HEADERS, Cookie: cookies },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!resp.ok) continue;

      const data = await resp.json();
      const items: ApprovalListItem[] = data.data || [];

      for (const item of items) {
        if (item.report?.id) {
          map.set(item.report.id, item.id);
        }
      }
    } catch {
      // skip
    }
  }

  return map;
}

export async function fetchHorusInconsistencies(
  approvalId: number
): Promise<HorusReportData | null> {
  const cookies = await getLaravelCookieString();
  if (!cookies) return null;

  try {
    const resp = await fetch(
      `${API_URL}/web/approvals/${approvalId}/inconsistencies?include_horus_details=true&include_expenses=true`,
      {
        headers: { ...BROWSER_HEADERS, Cookie: cookies },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!resp.ok) return null;

    const data = await resp.json();

    const expenses: Record<number, HorusExpenseData> = {};
    let hasDuplicates = false;
    let hasRestrictiveTags = false;

    const rawExpenses = data.expenses || [];
    for (const exp of rawExpenses) {
      const horusInfo = exp.horus_informations || exp.horus;
      if (!horusInfo) continue;

      const expDuplicates: HorusDuplicate[] = [];
      const rawDups = horusInfo.details?.duplicates || [];
      for (const dup of rawDups) {
        expDuplicates.push({
          id: dup.id,
          uuid: dup.uuid || '',
          title: dup.title || '',
          amount: dup.amount || 0,
          date: dup.date || '',
          score: dup.score || 0,
          fields: dup.fields || [],
          user: dup.user ? { id: dup.user.id, name: dup.user.name } : null,
          report: dup.report ? { id: dup.report.id, description: dup.report.description, status: dup.report.status } : null,
          receipt_url: dup.receipt?.original_url || dup.receipt_url || null,
          cost_center: dup.cost_center ? { id: dup.cost_center.id, nome: dup.cost_center.nome } : null,
          is_reimbursable: dup.is_reimbursable ?? false,
        });
      }

      const expTags = horusInfo.details?.restrictive_tags || [];

      const expenseData: HorusExpenseData = {
        sync: horusInfo.sync || 'unknown',
        has_possible_duplicates: horusInfo.has_possible_duplicates || false,
        has_restrictive_tags: horusInfo.has_restrictive_tags || false,
        duplicates: expDuplicates,
        restrictive_tags: expTags,
      };

      const expenseId = exp.id || exp.expense_id;
      if (expenseId) {
        expenses[expenseId] = expenseData;
        if (expenseData.has_possible_duplicates) hasDuplicates = true;
        if (expenseData.has_restrictive_tags) hasRestrictiveTags = true;
      }
    }

    const topHorus = data.inconsistencies?.horus;
    if (topHorus?.content?.has_possible_duplicates) hasDuplicates = true;
    if (topHorus?.content?.has_restrictive_tags) hasRestrictiveTags = true;

    return { has_duplicates: hasDuplicates, has_restrictive_tags: hasRestrictiveTags, expenses };
  } catch {
    return null;
  }
}

export function summarizeHorus(data: HorusReportData): HorusSummary {
  let count = 0;
  for (const exp of Object.values(data.expenses)) {
    if (exp.has_possible_duplicates || exp.has_restrictive_tags) count++;
  }
  return {
    has_duplicates: data.has_duplicates,
    has_restrictive_tags: data.has_restrictive_tags,
    expense_count_with_issues: count,
  };
}
