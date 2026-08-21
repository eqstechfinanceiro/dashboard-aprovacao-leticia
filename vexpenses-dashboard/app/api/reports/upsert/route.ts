import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const allReports: any[] = body.reports || [];

    if (allReports.length === 0) {
      return NextResponse.json({ error: 'No reports provided' }, { status: 400 });
    }

    let upserted = 0;
    const REPORT_BATCH = 100;
    for (let i = 0; i < allReports.length; i += REPORT_BATCH) {
      const sub = allReports.slice(i, i + REPORT_BATCH);
      const valueGroups: string[] = [];
      const params: any[] = [];
      let pIdx = 1;
      for (const r of sub) {
        const placeholders = Array.from({ length: 10 }, () => `$${pIdx++}`);
        valueGroups.push(`(${placeholders.join(', ')})`);
        params.push(
          r.id,
          r.name || null,
          r.status,
          r.user_id || null,
          r.user_name || null,
          r.user_cpf || null,
          JSON.stringify(r.raw_data || r),
          r.total_value || null,
          r.created_at || null,
          r.updated_at || null
        );
      }
      const query = `INSERT INTO prestacao_reports (id, name, status, user_id, user_name, user_cpf, raw_data, total_value, created_at, updated_at)
        VALUES ${valueGroups.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, status = EXCLUDED.status, user_id = EXCLUDED.user_id,
          user_name = EXCLUDED.user_name, user_cpf = EXCLUDED.user_cpf,
          raw_data = EXCLUDED.raw_data, total_value = EXCLUDED.total_value,
          updated_at = EXCLUDED.updated_at`;
      await sql.query(query, params);
      upserted += sub.length;
    }

    return NextResponse.json({
      success: true,
      reports_received: allReports.length,
      upserted,
    });
  } catch (error) {
    console.error('[Reports Upsert] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
