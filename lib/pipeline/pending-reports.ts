import { ensureAuditTable, getAuditedReportIds } from '../db/audit-db';
import {
  getReportsEnviado,
  getReportsReprovado,
  getTeamMembers,
  getApprovalFlows,
  getApprovalTracking,
} from '../api/vexpenses-data';

export interface PendingReportItem {
  id: number;
  description: string;
  status: string;
  user: { name: string; email: string } | null;
  created_at: string;
  updated_at: string;
  audited: boolean;
  approval_flow_id: number | null;
  approval_flow_name: string | null;
  approval_stage_id: number | null;
  approval_date: string | null;
  current_step: number | null; // null = approval step could not be verified
  expense_count: number;
}

export interface GetPendingReportsOptions {
  approverId?: string | null;
  stepFilter?: string | null;
  includeAudit?: boolean;
}

export interface GetPendingReportsResult {
  reports: PendingReportItem[];
  reportIds: number[];
  fromCache: boolean;
  timings: {
    reports: number;
    reprovado: number;
    team: number;
    flows: number;
    tracking: number;
    total: number;
  };
}

export async function getPendingReports(
  opts: GetPendingReportsOptions = {}
): Promise<GetPendingReportsResult> {
  const totalStart = Date.now();
  await ensureAuditTable();

  const { approverId, stepFilter, includeAudit } = opts;

  const [reportsResult, reprovadoResult, teamMembersResult, flowsResult] =
    await Promise.all([
      getReportsEnviado(),
      getReportsReprovado(),
      getTeamMembers(),
      getApprovalFlows(),
    ]);
  // Tracking derives each report's current step from its v2 history feed —
  // needs the report list (id + updated_at fingerprint), already cached here.
  const trackingResult = await getApprovalTracking(reportsResult.data);

  const timings = {
    reports: reportsResult.durationMs,
    reprovado: reprovadoResult.durationMs,
    team: teamMembersResult.durationMs,
    flows: flowsResult.durationMs,
    tracking: trackingResult.durationMs,
    total: 0,
  };

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
    console.log(
      `[Pending] Filtered to EQS members: ${beforeCount} -> ${filtered.length} reports (${eqsMemberIds.size} EQS members)`
    );
    allReports.splice(0, allReports.length, ...filtered);
  }

  let auditedIds: Set<number> = new Set();
  if (includeAudit) {
    auditedIds = await getAuditedReportIds();
  }

  // Filter out stale reports. A report in the ENVIADO list is only suppressed by a
  // "rejected" signal when that signal is fresh — otherwise a report that was rejected,
  // reopened and resubmitted would stay hidden until the stale cache expired.
  const v2IdSet = new Set(allReports.map((r: any) => r.id));
  const staleIds = new Set<number>();
  if (!trackingResult.isStale) {
    for (const id of rejectedIds) staleIds.add(id);
  }
  if (!reprovadoResult.isStale || reportsResult.isStale) {
    for (const id of staleFromOtherStatuses) {
      if (v2IdSet.has(id)) {
        staleIds.add(id);
      }
    }
  }
  if (staleIds.size > 0) {
    const beforeCount = allReports.length;
    const filtered = allReports.filter((r: any) => !staleIds.has(r.id));
    allReports.splice(0, allReports.length, ...filtered);
    console.log(
      `[Pending] Filtered ${beforeCount - allReports.length} stale reports (v2-status=${staleFromOtherStatuses.size}, excel-rejected=${rejectedIds.size})`
    );
  }

  // Filter out fully-approved reports that v2 still shows as ENVIADO (stale)
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
      const waitingStep = waitingStepMap.get(r.id);
      if (waitingStep != null && waitingStep > maxStep) {
        fullyApprovedIds.add(r.id);
      }
    }
    if (fullyApprovedIds.size > 0) {
      const beforeCount = allReports.length;
      const filtered = allReports.filter((r: any) => !fullyApprovedIds.has(r.id));
      allReports.splice(0, allReports.length, ...filtered);
      console.log(
        `[Pending] Filtered ${beforeCount - allReports.length} fully-approved reports (v2 stale ENVIADO, Excel confirmed Aprovado)`
      );
    }
  }

  // Build result with approval flow info
  let result: PendingReportItem[] = allReports.map((r: any) => {
    const userId = r.user_id;
    const flowId = userId ? userFlowMap.get(userId) : undefined;
    // null when the step couldn't be derived — never silently assume step 1
    const waitingStep = waitingStepMap.get(r.id) ?? null;
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
      approval_flow_name: flowId ? flowNamesMap.get(flowId) || `Flow ${flowId}` : null,
      approval_stage_id: r.approval_stage_id || null,
      approval_date: r.approval_date || null,
      current_step: waitingStep,
      expense_count: expenseCount,
    };
  });

  // Filter by approver
  if (approverId) {
    const approverIdNum = parseInt(approverId, 10);
    result = result.filter(r => {
      if (!r.approval_flow_id || r.current_step == null) return false;
      const stepMap = flowStepApprovers.get(r.approval_flow_id);
      if (!stepMap) return false;
      const approverSet = stepMap.get(r.current_step);
      if (!approverSet) return false;
      return approverSet.has(approverIdNum);
    });
  }

  // Filter by step
  if (stepFilter === '1') {
    result = result.filter(r => r.current_step === 1);
  }

  timings.total = Date.now() - totalStart;

  return {
    reports: result,
    reportIds: result.map(r => r.id),
    fromCache,
    timings,
  };
}
