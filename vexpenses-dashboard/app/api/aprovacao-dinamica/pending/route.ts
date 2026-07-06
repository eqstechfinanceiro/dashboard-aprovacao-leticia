import { NextRequest, NextResponse } from 'next/server';
import { ensureAuditTable, getAuditedReportIds } from '@/lib/audit-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

const PENDING_STATUSES = ['ENVIADO', 'REABERTO'];

export async function GET(request: NextRequest) {
  try {
    await ensureAuditTable();

    const { searchParams } = new URL(request.url);
    const includeAudit = searchParams.get('include_audit') === 'true';
    const approverId = searchParams.get('approver_id');
    const stepFilter = searchParams.get('step'); // '1' = only step 1 (awaiting first approval)

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

    // Build user_id → approval_flow_id mapping from team-members
    const userFlowMap = new Map<number, number>();
    const flowNamesMap = new Map<number, string>();
    try {
      const tmResp = await fetch(`${API_URL}/v2/team-members?per_page=500`, {
        headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (tmResp.ok) {
        const tmData = await tmResp.json();
        const members = tmData.data || [];
        for (const m of members) {
          if (m.approval_flow_id) {
            userFlowMap.set(m.id, m.approval_flow_id);
          }
        }
      }
    } catch (err) {
      console.log('[Pending] Error fetching team-members:', err);
    }

    // If approver_id is provided, find which flows that user is an approver in
    let approverFlowIds: Set<number> | null = null;
    if (approverId) {
      approverFlowIds = new Set<number>();
    }
    try {
      const flowsResp = await fetch(`${API_URL}/v2/approval-flows`, {
        headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (flowsResp.ok) {
        const flowsData = await flowsResp.json();
        const flows = flowsData.data || [];
        const approverIdNum = approverId ? parseInt(approverId, 10) : null;

        for (const flow of flows) {
          flowNamesMap.set(flow.id, flow.description || `Flow ${flow.id}`);
          if (approverFlowIds && approverIdNum) {
            const steps = flow.steps || [];
            const isApprover = steps.some((step: any) => {
              const groups = step.groups || [];
              return groups.some((g: any) => {
                const approvers = g.approvers || [];
                return approvers.includes(approverIdNum);
              });
            });
            if (isApprover) {
              approverFlowIds.add(flow.id);
            }
          }
        }
      }
    } catch (err) {
      console.log('[Pending] Error fetching approval flows:', err);
    }
    if (approverFlowIds) {
      console.log(`[Pending] Approver ${approverId} is approver in flows:`, Array.from(approverFlowIds));
    }

    let auditedIds: Set<number> = new Set();
    if (includeAudit) {
      auditedIds = await getAuditedReportIds();
    }

    // Build result with approval flow info
    let result = allReports.map((r: any) => {
      const userId = r.user_id;
      const flowId = userId ? userFlowMap.get(userId) : undefined;
      return {
        id: r.id,
        description: r.description,
        status: r.status,
        user: r.user?.data || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        audited: auditedIds.has(r.id),
        approval_flow_id: flowId || null,
        approval_flow_name: flowId ? (flowNamesMap.get(flowId) || `Flow ${flowId}`) : null,
        approval_stage_id: r.approval_stage_id || null,
        approval_date: r.approval_date || null,
        current_step: r.approval_date ? 2 : 1, // 1 = just sent, 2+ = already approved at least once
      };
    });

    // Filter by approver's flows if requested
    if (approverFlowIds && approverFlowIds.size > 0) {
      result = result.filter(r => r.approval_flow_id && approverFlowIds!.has(r.approval_flow_id));
    }

    // Filter by step if requested
    if (stepFilter === '1') {
      result = result.filter(r => r.current_step === 1);
    }

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
