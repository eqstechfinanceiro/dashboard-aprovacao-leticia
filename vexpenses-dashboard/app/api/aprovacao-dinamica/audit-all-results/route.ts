import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { ensureAuditTable } from '@/lib/audit-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const revalidate = 0;

export async function GET() {
  try {
    await ensureAuditTable();

    if (!sql) {
      return NextResponse.json({ success: true, data: {} });
    }

    console.log(`[Audit All Results] sql function available, NEON_DATABASE_URL starts with: ${process.env.NEON_DATABASE_URL?.substring(0, 50)}...`);

    const rows = await sql`
      SELECT report_id, expense_id, status, summary
      FROM expense_audit_results
      ORDER BY report_id, expense_id
    `;

    console.log(`[Audit All Results] Query returned ${rows.length} rows, ${new Set(rows.map((r: any) => r.report_id)).size} reports`);

    const parsed = rows;

    const byReport: Record<number, any[]> = {};
    for (const r of parsed) {
      if (!byReport[r.report_id]) byReport[r.report_id] = [];
      byReport[r.report_id].push(r);
    }

    console.log(`[Audit All Results] Grouped into ${Object.keys(byReport).length} reports`);

    const response = NextResponse.json({
      success: true,
      data: byReport,
      _debug: { totalRows: rows.length, reportCount: Object.keys(byReport).length },
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (error) {
    console.error('[Audit All Results API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
