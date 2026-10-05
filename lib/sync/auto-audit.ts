// Auto-audit: continuous OCR audit of expenses in CAIXA reports that are
// waiting on step 1 (where Letícia/891904 is the approver). Runs inside the
// sync-worker's HOT cycle — no manual clicks needed.
//
// Guardrails:
//   - only reports whose current approval step includes Letícia (step <= 1
//     per the tracking map; reports absent from tracking are treated as step 1
//     since they were never approved)
//   - FATURA/CARTAO reports are never audited (not cash workflow)
//   - expenses already audited (with extracted data) or reviewed by a human
//     are skipped; OCR failures are retried up to MAX_ATTEMPTS
//   - per-cycle expense cap so a single cycle never monopolizes the worker
import { sql } from '../db/neon';
import { getSetting } from '../db/settings';
import { isFaturaOrCartao } from '../rules/report-filters';
import { processReceiptGeminiDirect } from '../ai/gemini-direct';
import { auditExpense, extractCaixaRefMonth } from '../rules/audit-rules';
import { ensureAuditTable, saveAuditResult } from '../db/audit-db';
import { saveBotClassification } from '../db/doc-classification';
import { getWaitingStepMap } from './tracking';
import { sleep } from './client';

export const AUTO_AUDIT_KEY = 'auto_audit_enabled';

const MAX_EXPENSES_PER_CYCLE = 40;
const MAX_ATTEMPTS = 3;
const HUMAN_STATUSES = ['APROVADO_HUMANO', 'REPROVADO_HUMANO', 'ANALISAR_DEPOIS'];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export async function isAutoAuditEnabled(): Promise<boolean> {
  const v = await getSetting<boolean>(AUTO_AUDIT_KEY);
  return v === true;
}

interface AuditableReport { id: number; name: string }

/**
 * ENVIADO caixa reports that still have expenses needing a bot audit
 * (no audit row, or OCR failed and attempts < MAX_ATTEMPTS, and never
 * human-reviewed).
 */
export async function findAuditableReports(): Promise<AuditableReport[]> {
  if (!sql) return [];
  const rows = await sql`
    SELECT DISTINCT r.id, r.name
    FROM prestacao_reports r
    JOIN prestacao_expenses pe ON pe.report_id = r.id
    WHERE r.status ILIKE 'ENVIADO'
      AND r.user_cpf IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM expense_audit_results ar
        WHERE ar.report_id = pe.report_id AND ar.expense_id = pe.id
          AND (
            ar.extracted_data IS NOT NULL
            OR ar.attempts >= ${MAX_ATTEMPTS}
            OR ar.status = ANY(${HUMAN_STATUSES})
          )
      )
  `;
  const waiting = await getWaitingStepMap();
  return (rows as any[])
    .filter(r => !isFaturaOrCartao(r.name || ''))
    .filter(r => (waiting.get(r.id) ?? 1) <= 1)
    .map(r => ({ id: r.id, name: r.name }));
}

interface PendingExpense {
  id: number;
  report_id: number;
  value: number;
  date: string | null;
  title: string;
  observation: string;
  receipt_url: string;
}

async function getPendingExpenses(reportId: number): Promise<PendingExpense[]> {
  if (!sql) return [];
  const rows = await sql`
    SELECT pe.id, pe.report_id,
           COALESCE(pe.value, (pe.raw_data->>'value')::numeric) AS value,
           pe.date::text AS date,
           COALESCE(pe.raw_data->>'title', pe.description, '') AS title,
           COALESCE(pe.raw_data->>'observation', '') AS observation,
           COALESCE(pe.raw_data->>'reicept_url', pe.raw_data->>'receipt_url', '') AS receipt_url
    FROM prestacao_expenses pe
    WHERE pe.report_id = ${reportId}
      AND NOT EXISTS (
        SELECT 1 FROM expense_audit_results ar
        WHERE ar.report_id = pe.report_id AND ar.expense_id = pe.id
          AND (
            ar.extracted_data IS NOT NULL
            OR ar.attempts >= ${MAX_ATTEMPTS}
            OR ar.status = ANY(${HUMAN_STATUSES})
          )
      )
    ORDER BY pe.id
  `;
  return rows as PendingExpense[];
}

/** How many expenses are currently waiting for a bot audit (for UI preview). */
export async function countPendingAudit(): Promise<{ reports: number; expenses: number }> {
  const reports = await findAuditableReports();
  if (reports.length === 0) return { reports: 0, expenses: 0 };
  const ids = reports.map(r => r.id);
  const rows = await sql!`
    SELECT COUNT(*)::int AS n
    FROM prestacao_expenses pe
    WHERE pe.report_id = ANY(${ids})
      AND NOT EXISTS (
        SELECT 1 FROM expense_audit_results ar
        WHERE ar.report_id = pe.report_id AND ar.expense_id = pe.id
          AND (
            ar.extracted_data IS NOT NULL
            OR ar.attempts >= ${MAX_ATTEMPTS}
            OR ar.status = ANY(${HUMAN_STATUSES})
          )
      )
  `;
  return { reports: reports.length, expenses: (rows[0] as any)?.n ?? 0 };
}

export interface AutoAuditResult {
  enabled: boolean;
  candidates: number;
  audited: number;
  succeeded: number;
  failedOcr: number;
  remaining: number;
}

export async function runAutoAudit(): Promise<AutoAuditResult> {
  const result: AutoAuditResult = { enabled: false, candidates: 0, audited: 0, succeeded: 0, failedOcr: 0, remaining: 0 };
  if (!sql) return result;
  if (!(await isAutoAuditEnabled())) return result;
  result.enabled = true;
  if (!GEMINI_API_KEY) {
    console.error('[AutoAudit] GEMINI_API_KEY not configured');
    return result;
  }

  await ensureAuditTable();
  const reports = await findAuditableReports();
  result.candidates = reports.length;

  for (const report of reports) {
    if (result.audited >= MAX_EXPENSES_PER_CYCLE) break;
    const pending = await getPendingExpenses(report.id);
    // reports aqui já são caixa (fatura/cartão filtrados em findAuditableReports)
    const caixaRef = extractCaixaRefMonth(report.name || '');

    for (const expense of pending) {
      if (result.audited >= MAX_EXPENSES_PER_CYCLE) break;
      result.audited++;

      let extractedData = null;
      if (expense.receipt_url) {
        try {
          const r = await processReceiptGeminiDirect(expense.receipt_url, GEMINI_API_KEY, 3);
          if (r.success && r.structured_data) extractedData = r.structured_data;
        } catch (e: any) {
          console.error(`[AutoAudit] OCR error expense ${expense.id}:`, e?.message);
        }
        if (extractedData) {
          try {
            await saveBotClassification(report.id, expense.id, extractedData.tipo_documento, extractedData.chave_acesso);
          } catch (e: any) {
            console.error(`[AutoAudit] doc-class error expense ${expense.id}:`, e?.message);
          }
        }
      }

      const auditResult = auditExpense(expense.id, extractedData, {
        value: Number(expense.value) || 0,
        date: String(expense.date || ''),
        title: expense.title || '',
        observation: expense.observation || '',
      }, { caixaRef });

      try {
        await saveAuditResult({
          report_id: report.id,
          expense_id: expense.id,
          status: auditResult.status,
          extracted_data: auditResult.extracted_data,
          informed_data: auditResult.informed_data,
          divergences: auditResult.divergences,
          rules_triggered: auditResult.rules_triggered,
          summary: auditResult.summary,
          audited_by: 'bot-auto',
        });
        if (extractedData) result.succeeded++; else result.failedOcr++;
      } catch (e: any) {
        console.error(`[AutoAudit] save error expense ${expense.id}:`, e?.message);
      }

      await sleep(300);
    }
  }

  const pendingLeft = await countPendingAudit();
  result.remaining = pendingLeft.expenses;
  if (result.audited > 0) {
    console.log(`[AutoAudit] ciclo: ${result.audited} despesas auditadas (${result.succeeded} ok, ${result.failedOcr} sem OCR) — restam ${result.remaining}`);
  }
  return result;
}
