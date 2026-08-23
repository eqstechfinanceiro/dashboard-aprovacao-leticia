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

export async function getFaturaValidationsByReport(reportId: number): Promise<FaturaValidationRecord[]> {
  return [];
}

export async function saveFaturaValidation(record: Omit<FaturaValidationRecord, 'id'>): Promise<FaturaValidationRecord | null> {
  return null;
}
