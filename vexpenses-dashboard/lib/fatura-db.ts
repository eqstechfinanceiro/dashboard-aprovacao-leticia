import { sql } from './neon';

export interface FaturaValidationRecord {
  id: number;
  report_id: number;
  expense_id: number;
  expense_value: number;
  fatura_filename: string;
  fatura_date: string | null;
  fatura_description: string | null;
  fatura_value: number;
  difference: number;
  status: 'VALIDATED' | 'MISMATCH' | 'NOT_FOUND';
  validated_by: string | null;
  validated_at: string | null;
}

let tableEnsured = false;

export async function ensureFaturaTable(): Promise<void> {
  if (tableEnsured || !sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS fatura_validations (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL,
        expense_id INTEGER NOT NULL,
        expense_value NUMERIC(12,2) NOT NULL,
        fatura_filename VARCHAR(255) NOT NULL,
        fatura_date VARCHAR(20),
        fatura_description VARCHAR(255),
        fatura_value NUMERIC(12,2) NOT NULL,
        difference NUMERIC(12,2) NOT NULL,
        status VARCHAR(20) NOT NULL,
        validated_by VARCHAR(100),
        validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(report_id, expense_id, fatura_filename)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_fatura_report ON fatura_validations(report_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fatura_expense ON fatura_validations(expense_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_fatura_status ON fatura_validations(status)`;
    tableEnsured = true;
    console.log('[Fatura DB] Table ensured');
  } catch (error) {
    console.error('[Fatura DB] Error ensuring table:', error);
  }
}

export async function getFaturaValidationsByReport(reportId: number): Promise<FaturaValidationRecord[]> {
  if (!sql) return [];
  await ensureFaturaTable();
  try {
    const rows = await sql`
      SELECT * FROM fatura_validations
      WHERE report_id = ${reportId}
      ORDER BY validated_at DESC
    `;
    return rows as FaturaValidationRecord[];
  } catch (error) {
    console.error('[Fatura DB] Error fetching validations:', error);
    return [];
  }
}

export async function getFaturaValidationsByReports(reportIds: number[]): Promise<Record<number, FaturaValidationRecord[]>> {
  if (!sql) return {};
  await ensureFaturaTable();
  try {
    const rows = reportIds.length > 0
      ? await sql`SELECT * FROM fatura_validations WHERE report_id = ANY(${reportIds}) ORDER BY validated_at DESC`
      : await sql`SELECT * FROM fatura_validations ORDER BY validated_at DESC`;
    const map: Record<number, FaturaValidationRecord[]> = {};
    for (const row of rows as FaturaValidationRecord[]) {
      if (!map[row.report_id]) map[row.report_id] = [];
      map[row.report_id].push(row);
    }
    return map;
  } catch (error) {
    console.error('[Fatura DB] Error fetching batch validations:', error);
    return {};
  }
}

export async function saveFaturaValidation(record: Omit<FaturaValidationRecord, 'id' | 'validated_at' | 'created_at'>): Promise<FaturaValidationRecord | null> {
  if (!sql) return null;
  await ensureFaturaTable();
  try {
    const rows = await sql`
      INSERT INTO fatura_validations
        (report_id, expense_id, expense_value, fatura_filename, fatura_date, fatura_description, fatura_value, difference, status, validated_by)
      VALUES
        (${record.report_id}, ${record.expense_id}, ${record.expense_value}, ${record.fatura_filename}, ${record.fatura_date || null}, ${record.fatura_description || null}, ${record.fatura_value}, ${record.difference}, ${record.status}, ${record.validated_by || null})
      ON CONFLICT (report_id, expense_id, fatura_filename) DO UPDATE SET
        expense_value = EXCLUDED.expense_value,
        fatura_date = EXCLUDED.fatura_date,
        fatura_description = EXCLUDED.fatura_description,
        fatura_value = EXCLUDED.fatura_value,
        difference = EXCLUDED.difference,
        status = EXCLUDED.status,
        validated_by = EXCLUDED.validated_by,
        validated_at = NOW()
      RETURNING *
    `;
    return (rows as FaturaValidationRecord[])[0] || null;
  } catch (error) {
    console.error('[Fatura DB] Error saving validation:', error);
    return null;
  }
}

export async function saveFaturaValidationsBatch(records: Omit<FaturaValidationRecord, 'id' | 'validated_at' | 'created_at'>[]): Promise<void> {
  if (!sql || records.length === 0) return;
  await ensureFaturaTable();
  const CHUNK_SIZE = 50;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(r => saveFaturaValidation(r)));
  }
}
