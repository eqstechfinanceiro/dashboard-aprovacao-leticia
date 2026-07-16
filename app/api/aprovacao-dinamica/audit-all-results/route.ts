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
      SELECT report_id, expense_id, status,
             extracted_data::text as extracted_data,
             informed_data::text as informed_data,
             divergences::text as divergences,
             rules_triggered::text as rules_triggered,
             summary
      FROM expense_audit_results
      ORDER BY report_id, expense_id
    `;

    console.log(`[Audit All Results] Query returned ${rows.length} rows`);
    console.log(`[Audit All Results] Report IDs:`, [...new Set(rows.map((r: any) => r.report_id))]);

    const parsed = rows.map((r: any) => ({
      ...r,
      extracted_data: r.extracted_data ? JSON.parse(r.extracted_data) : null,
      informed_data: r.informed_data ? JSON.parse(r.informed_data) : null,
      divergences: r.divergences ? JSON.parse(r.divergences) : null,
      rules_triggered: r.rules_triggered ? JSON.parse(r.rules_triggered) : null,
    }));

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
