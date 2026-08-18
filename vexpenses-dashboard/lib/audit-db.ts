import { sql } from './neon';

export interface AuditRecord {
  id?: number;
  report_id: number;
  expense_id: number;
  status: 'APROVADO_BOT' | 'PENDENTE' | 'REPROVADO';
  extracted_data: any;
  informed_data: any;
  divergences: string[];
  rules_triggered: any[];
  summary: string;
  audited_at?: string;
  audited_by?: string | null;
  created_at?: string;
}

let tableEnsured = false;

export async function ensureAuditTable(): Promise<void> {
  if (tableEnsured || !sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS expense_audit_results (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL,
        expense_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL,
        extracted_data JSONB,
        informed_data JSONB,
        divergences JSONB,
        rules_triggered JSONB,
        summary TEXT,
        audited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        audited_by VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(report_id, expense_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_report ON expense_audit_results(report_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_status ON expense_audit_results(status)`;
    tableEnsured = true;
    console.log('[Audit DB] Table ensured');
  } catch (error) {
    console.error('[Audit DB] Error ensuring table:', error);
  }
}

export async function saveAuditResult(record: AuditRecord): Promise<void> {
  if (!sql) return;
  try {
    await sql`
      INSERT INTO expense_audit_results
        (report_id, expense_id, status, extracted_data, informed_data, divergences, rules_triggered, summary, audited_by)
      VALUES
        (${record.report_id}, ${record.expense_id}, ${record.status}, ${JSON.stringify(record.extracted_data)}, ${JSON.stringify(record.informed_data)}, ${JSON.stringify(record.divergences)}, ${JSON.stringify(record.rules_triggered)}, ${record.summary}, ${record.audited_by || null})
      ON CONFLICT (report_id, expense_id) DO UPDATE SET
        status = EXCLUDED.status,
        extracted_data = EXCLUDED.extracted_data,
        informed_data = EXCLUDED.informed_data,
        divergences = EXCLUDED.divergences,
        rules_triggered = EXCLUDED.rules_triggered,
        summary = EXCLUDED.summary,
        audited_at = NOW(),
        audited_by = EXCLUDED.audited_by
    `;
  } catch (error) {
    console.error('[Audit DB] Error saving result:', error);
    throw error;
  }
}

export async function getAuditResultsForReport(reportId: number): Promise<AuditRecord[]> {
  if (!sql) {
    console.log('[Audit DB] sql is null, returning empty');
    return [];
  }
  try {
    const rows = await sql`
      SELECT id, report_id, expense_id, status,
             extracted_data::text as extracted_data,
             informed_data::text as informed_data,
             divergences::text as divergences,
             rules_triggered::text as rules_triggered,
             summary, audited_at, audited_by, created_at
      FROM expense_audit_results
      WHERE report_id = ${reportId}
      ORDER BY expense_id
    `;

    const parsed = rows.map((r: any) => ({
      ...r,
      extracted_data: r.extracted_data ? JSON.parse(r.extracted_data) : null,
      informed_data: r.informed_data ? JSON.parse(r.informed_data) : null,
      divergences: r.divergences ? JSON.parse(r.divergences) : null,
      rules_triggered: r.rules_triggered ? JSON.parse(r.rules_triggered) : null,
    }));
    return parsed as AuditRecord[];
  } catch (error) {
    console.error('[Audit DB] Error fetching results:', error);
    return [];
  }
}

export async function getAuditedReportIds(): Promise<Set<number>> {
  if (!sql) return new Set();
  try {
    const rows = await sql`
      SELECT DISTINCT report_id FROM expense_audit_results
    `;
    return new Set(rows.map((r: any) => r.report_id));
  } catch (error) {
    console.error('[Audit DB] Error fetching audited IDs:', error);
    return new Set();
  }
}
