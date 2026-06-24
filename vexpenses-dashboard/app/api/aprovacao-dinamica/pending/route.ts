import { NextRequest, NextResponse } from 'next/server';
import { ensureAuditTable, getAuditedReportIds } from '@/lib/audit-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

const PENDING_STATUSES = ['ABERTO', 'ENVIADO', 'REABERTO'];

export async function GET(request: NextRequest) {
  try {
    await ensureAuditTable();

    const { searchParams } = new URL(request.url);
    const includeAudit = searchParams.get('include_audit') === 'true';

    const allReports: any[] = [];

    for (const status of PENDING_STATUSES) {
      try {
        const response = await fetch(`${API_URL}/v2/reports/status/${status}?include=user`, {
          headers: {
            'Authorization': API_KEY,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(120000),
        });

        if (response.ok) {
          const data = await response.json();
          const reports = data.data || [];
          allReports.push(...reports);
        } else {
          console.log(`[Pending] Status ${response.status} for reports/status/${status}`);
        }
      } catch (err) {
        console.log(`[Pending] Error fetching status ${status}:`, err);
      }
    }

    let auditedIds: Set<number> = new Set();
    if (includeAudit) {
      auditedIds = await getAuditedReportIds();
    }

    const result = allReports.map((r: any) => ({
      id: r.id,
      description: r.description,
      status: r.status,
      user: r.user?.data || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      audited: auditedIds.has(r.id),
    }));

    return NextResponse.json({
      success: true,
      data: result,
      total: result.length,
    });
  } catch (error) {
    console.error('[Aprovacao Dinamica] Error fetching pending:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
