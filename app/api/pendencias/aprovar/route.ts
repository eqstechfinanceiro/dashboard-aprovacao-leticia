import { NextResponse } from 'next/server';
import { getPendingReports } from '@/lib/pipeline/pending-reports';
import { DEFAULT_APPROVER_ID } from '@/lib/sync/auto-approve';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// "Caixas para aprovar" = reports VExpenses cuja etapa atual do fluxo de
// aprovação é da Letícia (mesmo filtro `approver_id` da página de aprovação
// dinâmica — tracking derivado, não só step 1 estático).
export async function GET() {
  try {
    const result = await getPendingReports({
      approverId: String(DEFAULT_APPROVER_ID),
      includeAudit: false,
    });
    return NextResponse.json({
      success: true,
      count: result.reports.length,
      from_cache: result.fromCache,
    });
  } catch (error) {
    console.error('[Pendencias Aprovar] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
