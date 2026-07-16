import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    await sql`
      CREATE TABLE IF NOT EXISTS report_approvals (
        report_id INT PRIMARY KEY,
        approver_name TEXT,
        approver_user_id INT,
        observation TEXT,
        approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    const { searchParams } = new URL(request.url);
    const reportIdsParam = searchParams.get('report_ids');

    let query;
    let rows: any[];

    if (reportIdsParam) {
      const reportIds = reportIdsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (reportIds.length === 0) {
        return NextResponse.json({ success: true, data: {} });
      }
      rows = await sql`
        SELECT report_id, approver_name, approver_user_id, observation, approved_at
        FROM report_approvals
        WHERE report_id = ANY(${reportIds}::int[])
      `;
    } else {
      rows = await sql`
        SELECT report_id, approver_name, approver_user_id, observation, approved_at
        FROM report_approvals
        ORDER BY approved_at DESC
        LIMIT 200
      `;
    }

    const approvalsMap: Record<number, any> = {};
    for (const row of rows) {
      approvalsMap[row.report_id] = {
        approver_name: row.approver_name,
        approver_user_id: row.approver_user_id,
        observation: row.observation,
        approved_at: row.approved_at,
      };
    }

    return NextResponse.json({
      success: true,
      data: approvalsMap,
    });
  } catch (error) {
    console.error('[Approvals] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
