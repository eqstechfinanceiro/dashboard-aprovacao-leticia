import { NextRequest, NextResponse } from 'next/server';
import { ensureAuditTable, getAuditedReportIds } from '@/lib/audit-db';
import { getReportsEnviado, getReportsReprovado, getTeamMembers, getApprovalFlows, getApprovalTracking } from '@/lib/vexpenses-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const totalStart = Date.now();
  try {
    await ensureAuditTable();

    const { searchParams } = new URL(request.url);
    const includeAudit = searchParams.get('include_audit') === 'true';
    const approverId = searchParams.get('approver_id');
    const stepFilter = searchParams.get('step');

    // Fetch all data in parallel via the unified data layer (with cache)
    const [reportsResult, reprovadoResult, teamMembersResult, flowsResult, trackingResult] = await Promise.all([
      getReportsEnviado(),
      getReportsReprovado(),
      getTeamMembers(),
      getApprovalFlows(),
      getApprovalTracking(),
    ]);

    console.log(`[Pending] Data layer timings: reports=${reportsResult.durationMs}ms, reprovado=${reprovadoResult.durationMs}ms, team=${teamMembersResult.durationMs}ms, flows=${flowsResult.durationMs}ms, tracking=${trackingResult.durationMs}ms`);

    let allReports = reportsResult.data;
    const staleFromOtherStatuses = new Set(reprovadoResult.data);
    const eqsMemberIds = new Set(teamMembersResult.data.memberIds);
    const userFlowMap = new Map(teamMembersResult.data.flowMap);
    const flowNamesMap = new Map(flowsResult.data.namesMap);
    const flowStepApprovers = new Map<number, Map<number, Set<number>>>();
    for (const [flowId, stepList] of flowsResult.data.stepApprovers) {
      const stepMap = new Map<number, Set<number>>();
      for (const [stepOrder, approvers] of stepList) {
        stepMap.set(stepOrder, new Set(approvers));
      }
      flowStepApprovers.set(flowId, stepMap);
    }
    const waitingStepMap = new Map(trackingResult.data.waitingStepMap);
    const rejectedIds = new Set(trackingResult.data.rejectedIds);
    const approvedLastActionIds = new Set(trackingResult.data.approvedLastActionIds);

    const fromCache = reportsResult.fromCache || trackingResult.fromCache;

    // Filter reports to only include EQS team members
    if (eqsMemberIds.size > 0) {
      const beforeCount = allReports.length;
      const filtered = allReports.filter((r: any) => eqsMemberIds.has(r.user_id));
      console.log(`[Pending] Filtered to EQS members: ${beforeCount} -> ${filtered.length} reports (${eqsMemberIds.size} EQS members)`);
      allReports.splice(0, allReports.length, ...filtered);
    }

    let hasApproverFilter = false;
    if (approverId) {
      hasApproverFilter = true;
    }

    let auditedIds: Set<number> = new Set();
    if (includeAudit) {
      auditedIds = await getAuditedReportIds();
    }

    // Filter out stale reports:
    // 1. Reports that appear in APROVADO/REPROVADO v2 lists (v2 ENVIADO list is stale)
    // 2. Reports that the admin Excel shows as rejected (also stale in v2)
    // Reports with Excel "Aprovado" at step N are NOT filtered — they're partially approved,
    // still pending at step N+1, and the v2 API correctly keeps them as ENVIADO.
    const v2IdSet = new Set(allReports.map((r: any) => r.id));
    const staleIds = new Set<number>(rejectedIds);
    for (const id of staleFromOtherStatuses) {
      if (v2IdSet.has(id)) {
        staleIds.add(id);
      }
    }
    if (staleIds.size > 0) {
      const beforeCount = allReports.length;
      const filtered = allReports.filter((r: any) => !staleIds.has(r.id));
      allReports.splice(0, allReports.length, ...filtered);
      console.log(`[Pending] Filtered ${beforeCount - allReports.length} stale reports (v2-status=${staleFromOtherStatuses.size}, excel-rejected=${rejectedIds.size})`);
    }

    // Filter out fully-approved reports that v2 still shows as ENVIADO (stale).
    // A report is fully approved if:
    // - Its last action in the admin Excel is "Aprovado" (approvedLastActionIds)
    // - AND its waitingStep exceeds the max step of its approval flow (all steps done)
    // This avoids fetching the 6974+ APROVADO reports from v2 — we use the Excel data we already have.
    {
      const fullyApprovedIds = new Set<number>();
      for (const r of allReports) {
        if (!approvedLastActionIds.has(r.id)) continue;
        const userId = r.user_id;
        const flowId = userId ? userFlowMap.get(userId) : undefined;
        if (!flowId) continue;
        const stepMap = flowStepApprovers.get(flowId);
        if (!stepMap || stepMap.size === 0) continue;
        const maxStep = Math.max(...stepMap.keys());
        const waitingStep = waitingStepMap.has(r.id) ? waitingStepMap.get(r.id)! : 1;
        if (waitingStep > maxStep) {
          fullyApprovedIds.add(r.id);
        }
      }
      if (fullyApprovedIds.size > 0) {
        const beforeCount = allReports.length;
        const filtered = allReports.filter((r: any) => !fullyApprovedIds.has(r.id));
        allReports.splice(0, allReports.length, ...filtered);
        console.log(`[Pending] Filtered ${beforeCount - allReports.length} fully-approved reports (v2 stale ENVIADO, Excel confirmed Aprovado)`);
      }
    }

    // NOTE: Individual status verification (265 API calls) was here and caused >60s load times.
    // Removed — we rely on the REPROVADO bulk filter + approval-tracking data to catch stale reports.
    // The approve route also checks individual status before approving, so this is safe to skip.

    // Build result with approval flow info
    let result = allReports.map((r: any) => {
      const userId = r.user_id;
      const flowId = userId ? userFlowMap.get(userId) : undefined;
      const waitingStep = waitingStepMap.has(r.id) ? waitingStepMap.get(r.id)! : 1;
      const expenseCount = r.expenses?.data?.length ?? r.expenses?.length ?? 0;
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
        current_step: waitingStep,
        expense_count: expenseCount,
      };
    });

    // Filter by approver: only show reports where the approver is in the CURRENT waiting step
    if (hasApproverFilter && approverId) {
      const approverIdNum = parseInt(approverId, 10);
      result = result.filter(r => {
        if (!r.approval_flow_id) return false;
        const stepMap = flowStepApprovers.get(r.approval_flow_id);
        if (!stepMap) return false;
        const approverSet = stepMap.get(r.current_step);
        if (!approverSet) return false;
        return approverSet.has(approverIdNum);
      });
    }

    // Filter by step if requested
    if (stepFilter === '1') {
      result = result.filter(r => r.current_step === 1);
    }

    return NextResponse.json({
      success: true,
      data: result,
      total: result.length,
      from_cache: fromCache,
      timing_ms: Date.now() - totalStart,
    });
  } catch (error) {
    console.error('[Aprovacao Dinamica] Error fetching pending:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
