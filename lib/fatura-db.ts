import { sql } from './neon';

export interface FaturaValidationRecord {
  id?: number;
  report_id: number;
  expense_id: number;
  status: 'VALIDATED' | 'MISMATCH' | 'NOT_FOUND';
  fatura_filename: string;
  fatura_date: string;
  fatura_description: string;
  fatura_value: number;
  expense_value: number;
  difference: number;
  validated_at?: string;
  validated_by?: string | null;
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
        status VARCHAR(20) NOT NULL,
        fatura_filename VARCHAR(255) NOT NULL,
        fatura_date VARCHAR(20),
        fatura_description VARCHAR(500),
        fatura_value NUMERIC(12,2),
        expense_value NUMERIC(12,2),
        difference NUMERIC(12,2),
        validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        validated_by VARCHAR(100),
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

export async function saveFaturaValidations(records: FaturaValidationRecord[]): Promise<void> {
  if (!sql || records.length === 0) return;
  try {
    for (const record of records) {
      await sql`
        INSERT INTO fatura_validations
          (report_id, expense_id, status, fatura_filename, fatura_date, fatura_description, fatura_value, expense_value, difference, validated_by)
        VALUES
          (${record.report_id}, ${record.expense_id}, ${record.status}, ${record.fatura_filename}, ${record.fatura_date}, ${record.fatura_description}, ${record.fatura_value}, ${record.expense_value}, ${record.difference}, ${record.validated_by || null})
        ON CONFLICT (report_id, expense_id, fatura_filename) DO UPDATE SET
          status = EXCLUDED.status,
          fatura_date = EXCLUDED.fatura_date,
          fatura_description = EXCLUDED.fatura_description,
          fatura_value = EXCLUDED.fatura_value,
          expense_value = EXCLUDED.expense_value,
          difference = EXCLUDED.difference,
          validated_at = NOW(),
          validated_by = EXCLUDED.validated_by
      `;
    }
  } catch (error) {
    console.error('[Fatura DB] Error saving validations:', error);
    throw error;
  }
}

export async function getFaturaValidationsForReport(reportId: number): Promise<FaturaValidationRecord[]> {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT id, report_id, expense_id, status,
             fatura_filename, fatura_date, fatura_description,
             fatura_value, expense_value, difference,
             validated_at, validated_by, created_at
      FROM fatura_validations
      WHERE report_id = ${reportId}
      ORDER BY expense_id, validated_at DESC
    `;
    return rows as FaturaValidationRecord[];
  } catch (error) {
    console.error('[Fatura DB] Error fetching validations:', error);
    return [];
  }
}

export async function getFaturaValidationsForReports(reportIds: number[]): Promise<Record<number, FaturaValidationRecord[]>> {
  if (!sql || reportIds.length === 0) return {};
  try {
    const rows = await sql`
      SELECT id, report_id, expense_id, status,
             fatura_filename, fatura_date, fatura_description,
             fatura_value, expense_value, difference,
             validated_at, validated_by, created_at
      FROM fatura_validations
      WHERE report_id = ANY(${reportIds})
      ORDER BY expense_id, validated_at DESC
    `;
    const result: Record<number, FaturaValidationRecord[]> = {};
    for (const row of rows as FaturaValidationRecord[]) {
      if (!result[row.report_id]) result[row.report_id] = [];
      result[row.report_id].push(row);
    }
    return result;
  } catch (error) {
    console.error('[Fatura DB] Error fetching validations for reports:', error);
    return {};
  }
}

export async function getFaturaValidationForExpense(reportId: number, expenseId: number): Promise<FaturaValidationRecord | null> {
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT id, report_id, expense_id, status,
             fatura_filename, fatura_date, fatura_description,
             fatura_value, expense_value, difference,
             validated_at, validated_by, created_at
      FROM fatura_validations
      WHERE report_id = ${reportId} AND expense_id = ${expenseId}
      ORDER BY validated_at DESC
      LIMIT 1
    `;
    return (rows as FaturaValidationRecord[])[0] || null;
  } catch (error) {
    console.error('[Fatura DB] Error fetching validation for expense:', error);
    return null;
  }
}
