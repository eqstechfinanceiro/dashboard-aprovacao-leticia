// Excel parser for VExpenses approval-tracking Excel export
// Uses SheetJS (xlsx) to parse the downloaded Excel file

export interface ParsedApprovalTracking {
  waitingStepMap: [number, number][];
  rejectedIds: number[];
  approvedLastActionIds: number[];
}

export function parseApprovalTrackingExcel(arrayBuffer: ArrayBuffer): ParsedApprovalTracking {
  // Dynamic import of xlsx — we do it sync via require in the route
  // This function is designed to be called from the data layer
  // The xlsx import is done at call site to avoid build issues
  throw new Error('Use parseApprovalTrackingExcelAsync instead');
}

export async function parseApprovalTrackingExcelAsync(arrayBuffer: ArrayBuffer): Promise<ParsedApprovalTracking> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  if (rows.length < 2) {
    return { waitingStepMap: [], rejectedIds: [], approvedLastActionIds: [] };
  }

  // Group by reportId, find last action, determine waitingStep
  const reportsMap = new Map<string, any[]>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    const reportId = String(row[0]);
    if (!reportsMap.has(reportId)) reportsMap.set(reportId, []);
    reportsMap.get(reportId)!.push(row);
  }

  const waitingStepMap: [number, number][] = [];
  for (const [reportId, reportRows] of reportsMap) {
    const lastRow = reportRows[reportRows.length - 1];
    const action = String(lastRow[5] || '');
    const step = lastRow[7] ? parseInt(String(lastRow[7]), 10) : null;

    let waitingStep = 1;
    if (action === 'Aprovado' && step !== null) {
      waitingStep = step + 1;
    } else if (action === 'Enviado') {
      waitingStep = 1;
    } else if (action === 'Reaberto') {
      waitingStep = 0;
    }

    waitingStepMap.push([parseInt(reportId, 10), waitingStep]);
  }

  const rejectedIds: number[] = [];
  const approvedLastActionIds: number[] = [];
  for (const [reportId, reportRows] of reportsMap) {
    const lastRow = reportRows[reportRows.length - 1];
    const action = String(lastRow[5] || '');
    if (action === 'Reprovado' || action === 'Reprovado pelo administrador') {
      rejectedIds.push(parseInt(reportId, 10));
    } else if (action === 'Aprovado') {
      approvedLastActionIds.push(parseInt(reportId, 10));
    }
  }

  return { waitingStepMap, rejectedIds, approvedLastActionIds };
}
