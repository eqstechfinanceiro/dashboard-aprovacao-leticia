import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { report_id, expense_id, decision, reviewer_name, comment } = body;

    if (!report_id || !expense_id || !decision) {
      return NextResponse.json(
        { error: 'report_id, expense_id, and decision are required' },
        { status: 400 }
      );
    }

    if (!['APROVADO_HUMANO', 'REPROVADO_HUMANO', 'ANALISAR_DEPOIS'].includes(decision)) {
      return NextResponse.json(
        { error: 'Invalid decision. Must be APROVADO_HUMANO, REPROVADO_HUMANO, or ANALISAR_DEPOIS' },
        { status: 400 }
      );
    }

    const humanSummary = decision === 'APROVADO_HUMANO'
      ? `Aprovado por revisão humana${reviewer_name ? ` (${reviewer_name})` : ''}${comment ? `: ${comment}` : ''}`
      : decision === 'REPROVADO_HUMANO'
        ? `Reprovado por revisão humana${reviewer_name ? ` (${reviewer_name})` : ''}${comment ? `: ${comment}` : ''}`
        : `Deixado para análise posterior por revisão humana${reviewer_name ? ` (${reviewer_name})` : ''}${comment ? `: ${comment}` : ''}`;

    await sql`
      UPDATE expense_audit_results
      SET
        status = ${decision},
        audited_by = ${reviewer_name || 'human'},
        audited_at = NOW(),
        summary = ${humanSummary}
      WHERE report_id = ${report_id} AND expense_id = ${expense_id}
    `;

    console.log(`[Manual Review] Expense ${expense_id} (report ${report_id}) marked as ${decision} by ${reviewer_name || 'human'}`);

    return NextResponse.json({
      success: true,
      data: { report_id, expense_id, decision, reviewer_name },
    });
  } catch (error) {
    console.error('[Manual Review Save] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
