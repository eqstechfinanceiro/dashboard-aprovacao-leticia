'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  RefreshCw,
  Clock,
  User,
  ScanLine,
  Database,
  PlayCircle,
  Search,
  Eye,
  Receipt,
  AlertTriangle,
  X,
  Copy,
  ScrollText,
  ExternalLink,
  CreditCard,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ManualReviewModal, type ManualReviewItem } from '@/components/manual-review-modal';
import { PreApproveReviewModal, type PreApproveExpense } from '@/components/pre-approve-review-modal';
import { useAuth } from '@/lib/auth-context';
import type { ReportValidationSummary } from '@/lib/nf-validator';
import { DuplicateComparisonModal, type ComparisonExpense } from '@/components/duplicate-comparison-modal';
import { BatchDuplicateReviewModal } from '@/components/batch-duplicate-review-modal';
import { DismissLogsModal } from '@/components/dismiss-logs-modal';
import { FaturaUploadModal } from '@/components/fatura-upload-modal';
import type { FaturaValidationRecord } from '@/lib/fatura-db';

interface ReportApproval {
  approver_name: string;
  approver_user_id: number | null;
  observation: string | null;
  approved_at: string;
}

interface PendingReport {
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
  current_step: number;
  expense_count?: number;
}

interface ReportExpense {
  id: number;
  expense_id: number;
  title: string;
  value: number;
  date: string;
  observation: string;
  receipt_url: string;
  rejected: number;
  expense_type: { description: string } | null;
  costs_center: { name: string } | null;
  payment_method: { description: string } | null;
}

interface AuditRuleResult {
  rule: string;
  reason: string;
  confidence: number;
}

interface ExpenseAuditResult {
  expense_id: number;
  status: 'APROVADO_BOT' | 'PENDENTE' | 'REPROVADO' | 'APROVADO_HUMANO' | 'REPROVADO_HUMANO' | 'ANALISAR_DEPOIS';
  audited_by?: string | null;
  rules_triggered: AuditRuleResult[];
  extracted_data: {
    valor_total: string | null;
    data: string | null;
    estabelecimento: string | null;
    categoria: string | null;
    cnpj: string | null;
    itens: string[] | null;
    forma_pagamento: string | null;
  } | null;
  informed_data: {
    value: number;
    date: string;
    title: string;
    observation: string;
  };
  divergences: string[];
  summary: string;
}

interface ReportAuditData {
  report_id: number;
  total_expenses: number;
  approved: number;
  pending: number;
  rejected: number;
  expenses: ExpenseAuditResult[];
}

interface ValidationDetailData {
  has_duplicates: boolean;
  has_date_mismatch: boolean;
  has_total_mismatch: boolean;
  expenses: Record<number, {
    expense_id: number;
    has_duplicate: boolean;
    has_date_mismatch: boolean;
    duplicates: Array<{
      expense_id: number;
      report_id: number;
      report_name: string;
      report_status: string;
      user_name: string;
      title: string;
      value: number;
      date: string;
      same_report: boolean;
      match_fields: string[];
      receipt_url: string | null;
      observation: string | null;
      expense_type: string | null;
      costs_center: string | null;
      dismissed: boolean;
      is_duplicate: boolean;
      dismissed_by: string | null;
      dismissed_at: string | null;
    }>;
    confirmed_duplicates: Array<{
      expense_id: number;
      report_id: number;
      report_name: string;
      report_status: string;
      user_name: string;
      title: string;
      value: number;
      date: string;
      same_report: boolean;
      match_fields: string[];
      receipt_url: string | null;
      observation: string | null;
      expense_type: string | null;
      costs_center: string | null;
      dismissed: boolean;
      is_duplicate: boolean;
      dismissed_by: string | null;
      dismissed_at: string | null;
    }>;
    dismissed_duplicates: Array<{
      expense_id: number;
      report_id: number;
      report_name: string;
      report_status: string;
      user_name: string;
      title: string;
      value: number;
      date: string;
      same_report: boolean;
      match_fields: string[];
      receipt_url: string | null;
      observation: string | null;
      expense_type: string | null;
      costs_center: string | null;
      dismissed: boolean;
      is_duplicate: boolean;
      dismissed_by: string | null;
      dismissed_at: string | null;
    }>;
    date_mismatch_detail: { expected_period: string; expense_date: string } | null;
  }>;
  total_expected: number | null;
  total_calculated: number;
  total_difference: number;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  icon: typeof CheckCircle;
}> = {
  APROVADO_BOT: {
    label: 'Aprovaria',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
  },
  PENDENTE: {
    label: 'Encaminhar para Humano',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: AlertCircle,
  },
  REPROVADO: {
    label: 'Reprovaria',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: XCircle,
  },
  APROVADO_HUMANO: {
    label: 'Humano Aprovou',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: CheckCircle,
  },
  REPROVADO_HUMANO: {
    label: 'Humano Reprovou',
    color: 'bg-rose-100 text-rose-800 border-rose-300',
    icon: XCircle,
  },
  ANALISAR_DEPOIS: {
    label: 'Analisar Depois',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: Clock,
  },
};

export default function AprovacaoDinamicaPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<number | null>(null);
  const [reportExpenses, setReportExpenses] = useState<Record<number, ReportExpense[]>>({});
  const [auditResults, setAuditResults] = useState<Record<number, Record<number, ExpenseAuditResult>>>({});
  const auditResultsRef = useRef(auditResults);
  const excludedReportsRef = useRef<Set<number>>(new Set());
  const validationBatchFetchedRef = useRef(false);
  const [auditingExpense, setAuditingExpense] = useState<string | null>(null);
  const [loadingExpenses, setLoadingExpenses] = useState<number | null>(null);
  const [showReceiptFor, setShowReceiptFor] = useState<string | null>(null);
  const [auditProgress, setAuditProgress] = useState<Record<number, { done: number; total: number }>>({});
  const [globalAuditing, setGlobalAuditing] = useState(false);
  const [globalProgress, setGlobalProgress] = useState<{ current: number; total: number; reportDesc: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [approverFilter, setApproverFilter] = useState<string>('');
  const [stepOneOnly, setStepOneOnly] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<ManualReviewItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [expenseCounts, setExpenseCounts] = useState<Record<number, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [reportApprovals, setReportApprovals] = useState<Record<number, ReportApproval>>({});
  const [readyOnly, setReadyOnly] = useState(false);
  const [approvingReport, setApprovingReport] = useState<number | null>(null);
  const [approveObservation, setApproveObservation] = useState<Record<number, string>>({});
  const [showApproveUI, setShowApproveUI] = useState<Set<number>>(new Set());
  const [approveError, setApproveError] = useState<Record<number, string>>({});
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);
  const [preApproveModal, setPreApproveModal] = useState<{ reportId: number; description: string } | null>(null);
  const [validationSummary, setValidationSummary] = useState<Record<number, ReportValidationSummary | { error: string }>>({});
  const [validationDetails, setValidationDetails] = useState<Record<number, ValidationDetailData>>({});
  const [loadingValidationDetails, setLoadingValidationDetails] = useState<Set<number>>(new Set());
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [comparisonModal, setComparisonModal] = useState<{ original: ComparisonExpense; duplicates: ComparisonExpense[] } | null>(null);
  const [batchDupModalOpen, setBatchDupModalOpen] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [rejectingExpense, setRejectingExpense] = useState<string | null>(null);
  const [rejectObservation, setRejectObservation] = useState<Record<string, string>>({});
  const [rejectingReport, setRejectingReport] = useState<number | null>(null);
  const [faturaModalReport, setFaturaModalReport] = useState<number | null>(null);
  const [faturaValidations, setFaturaValidations] = useState<Record<number, Record<number, FaturaValidationRecord>>>({});

  useEffect(() => {
    setVisibleCount(30);
    excludedReportsRef.current = new Set();
    setApprovalNotice(null);
  }, [searchTerm, readyOnly, stepOneOnly, approverFilter, alertsOnly]);

  // Keep ref in sync with auditResults
  useEffect(() => {
    auditResultsRef.current = auditResults;
  }, [auditResults]);

  const loadAllSavedResults = useCallback(async () => {
    try {
      const res = await fetch('/api/aprovacao-dinamica/audit-all-results');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.data) return;

      const resultsMap: Record<number, Record<number, ExpenseAuditResult>> = {};
      const progressMap: Record<number, { done: number; total: number }> = {};

      for (const [reportIdStr, expenses] of Object.entries(data.data)) {
        const reportId = parseInt(reportIdStr);
        const expResults: Record<number, ExpenseAuditResult> = {};
        (expenses as any[]).forEach(e => {
          expResults[e.expense_id] = e;
        });
        resultsMap[reportId] = expResults;
        progressMap[reportId] = { done: (expenses as any[]).length, total: 0 };
      }

      setAuditResults(resultsMap);
      setAuditProgress(progressMap);

      const auditedIds = new Set(Object.keys(resultsMap).map(Number));
      setReports(prev => prev.map(r => auditedIds.has(r.id) ? { ...r, audited: true } : r));
    } catch (err) {
      console.error('Error loading saved results:', err);
    }
  }, []);

  const fetchPending = useCallback(async (opts?: { skipValidation?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const approverParam = approverFilter ? `&approver_id=${approverFilter}` : '';
      const stepParam = stepOneOnly ? '&step=1' : '';
      const res = await fetch(`/api/aprovacao-dinamica/pending?include_audit=true${approverParam}${stepParam}`);
      if (!res.ok) throw new Error('Failed to fetch pending reports');
      const data = await res.json();
      const filtered = (data.data || []).filter((r: PendingReport) => !excludedReportsRef.current.has(r.id));
      setReports(filtered);
      await loadAllSavedResults();
      // Use expense_count from pending response (avoids separate API call that gets 403'd by WAF)
      const counts: Record<number, number> = {};
      for (const r of (data.data || []) as PendingReport[]) {
        if (r.expense_count !== undefined && r.expense_count > 0) {
          counts[r.id] = r.expense_count;
        }
      }
      if (Object.keys(counts).length > 0) {
        setExpenseCounts(counts);
      }
      // Only fetch expense counts separately if pending response didn't include them
      if (Object.keys(counts).length === 0) {
        fetchExpenseCounts(data.data || []);
      }
      // Fetch existing approvals
      fetchApprovals(data.data || []);
      // Fetch NF validation batch summary only on first load or explicit refresh
      if (!opts?.skipValidation && !validationBatchFetchedRef.current) {
        validationBatchFetchedRef.current = true;
        fetchValidationBatch(data.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [loadAllSavedResults, approverFilter, stepOneOnly]);

  const fetchValidationBatch = useCallback(async (reportList: PendingReport[]) => {
    if (reportList.length === 0) return;
    try {
      const ids = reportList.map(r => r.id).join(',');
      const res = await fetch(`/api/aprovacao-dinamica/validation/batch?report_ids=${ids}`);
      if (res.ok) {
        const data = await res.json();
        setValidationSummary(data.data || {});
      }
    } catch (err) {
      console.error('Error fetching NF validation batch:', err);
    }
  }, []);

  const fetchValidationDetails = useCallback(async (reportId: number) => {
    if (validationDetails[reportId] || loadingValidationDetails.has(reportId)) return;
    setLoadingValidationDetails(prev => new Set(prev).add(reportId));
    try {
      const res = await fetch(`/api/aprovacao-dinamica/validation/${reportId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setValidationDetails(prev => ({ ...prev, [reportId]: data.data as ValidationDetailData }));
        }
      }
    } catch (err) {
      console.error('Error fetching NF validation details:', err);
    } finally {
      setLoadingValidationDetails(prev => { const n = new Set(prev); n.delete(reportId); return n; });
    }
  }, [validationDetails, loadingValidationDetails]);

  const fetchApprovals = useCallback(async (reportList: PendingReport[]) => {
    if (reportList.length === 0) return;
    try {
      const ids = reportList.map(r => r.id).join(',');
      const res = await fetch(`/api/aprovacao-dinamica/approvals?report_ids=${ids}`);
      if (res.ok) {
        const data = await res.json();
        setReportApprovals(data.data || {});
      }
    } catch (err) {
      console.error('Error fetching approvals:', err);
    }
  }, []);

  const fetchExpenseCounts = useCallback(async (reportList: PendingReport[]) => {
    if (reportList.length === 0) return;
    setLoadingCounts(true);
    try {
      const ids = reportList.map(r => r.id).join(',');
      const res = await fetch(`/api/aprovacao-dinamica/expense-counts?ids=${ids}`);
      if (res.ok) {
        const data = await res.json();
        setExpenseCounts(data.data || {});
      }
    } catch (err) {
      console.error('Error fetching expense counts:', err);
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Auto-refresh every 60 seconds, but NOT while auditing
  useEffect(() => {
    if (globalAuditing || auditingExpense) return;
    const interval = setInterval(() => {
      fetchPending({ skipValidation: true });
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchPending, globalAuditing, auditingExpense]);

  const loadExpenses = async (reportId: number) => {
    if (reportExpenses[reportId]) return;
    setLoadingExpenses(reportId);
    try {
      const res = await fetch(`/api/aprovacao-dinamica/report/${reportId}/expenses`);
      if (!res.ok) throw new Error('Failed to fetch expenses');
      const data = await res.json();
      setReportExpenses(prev => ({ ...prev, [reportId]: data.data.expenses }));

      const savedRes = await fetch(`/api/aprovacao-dinamica/audit-results/${reportId}`);
      if (savedRes.ok) {
        const savedData = await savedRes.json();
        if (savedData.data?.expenses?.length > 0) {
          const resultsMap: Record<number, ExpenseAuditResult> = {};
          savedData.data.expenses.forEach((e: ExpenseAuditResult) => {
            resultsMap[e.expense_id] = e;
          });
          setAuditResults(prev => ({ ...prev, [reportId]: resultsMap }));
          setAuditProgress(prev => ({
            ...prev,
            [reportId]: { done: savedData.data.expenses.length, total: data.data.expenses.length },
          }));
        }
      }

      const faturaRes = await fetch(`/api/aprovacao-dinamica/fatura/status?reportId=${reportId}`);
      if (faturaRes.ok) {
        const faturaData = await faturaRes.json();
        if (faturaData.data && Array.isArray(faturaData.data)) {
          const vMap: Record<number, FaturaValidationRecord> = {};
          for (const v of faturaData.data as FaturaValidationRecord[]) {
            const existing = vMap[v.expense_id];
            if (!existing || (v.validated_at && existing.validated_at && new Date(v.validated_at) > new Date(existing.validated_at))) {
              vMap[v.expense_id] = v;
            }
          }
          setFaturaValidations(prev => ({ ...prev, [reportId]: vMap }));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading expenses');
    } finally {
      setLoadingExpenses(null);
    }
  };

  const toggleReport = (reportId: number) => {
    const isExpanded = expandedReport === reportId;
    setExpandedReport(isExpanded ? null : reportId);
    if (!isExpanded) {
      loadExpenses(reportId);
      const vs = validationSummary[reportId];
      if (vs && !('error' in vs) && (vs.has_duplicates || vs.has_date_mismatch || vs.has_total_mismatch)) {
        fetchValidationDetails(reportId);
      }
    }
  };

  const auditSingleExpense = async (reportId: number, expense: ReportExpense, force = false) => {
    const key = `${reportId}-${expense.id}`;
    setAuditingExpense(key);
    try {
      const res = await fetch('/api/aprovacao-dinamica/audit-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          expense,
          force,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Audit failed');
      }

      const data = await res.json();
      setAuditResults(prev => ({
        ...prev,
        [reportId]: {
          ...(prev[reportId] || {}),
          [expense.id]: data.data,
        },
      }));

      setReports(prev => prev.map(r => r.id === reportId ? { ...r, audited: true } : r));

      const currentResults = auditResults[reportId] || {};
      const newCount = Object.keys({ ...currentResults, [expense.id]: data.data }).length;
      const total = reportExpenses[reportId]?.length || 0;
      setAuditProgress(prev => ({
        ...prev,
        [reportId]: { done: newCount, total },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit error');
    } finally {
      setAuditingExpense(null);
    }
  };

  const auditAllExpenses = async (reportId: number) => {
    const expenses = reportExpenses[reportId];
    if (!expenses || expenses.length === 0) return;

    for (let i = 0; i < expenses.length; i++) {
      const expense = expenses[i];
      const existing = auditResultsRef.current[reportId]?.[expense.id];
      if (existing && existing.extracted_data) continue;
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      await auditSingleExpense(reportId, expense, !!existing);
    }
  };

  const auditAllReports = async () => {
    setGlobalAuditing(true);
    try {
      for (let r = 0; r < reports.length; r++) {
        const report = reports[r];
        setGlobalProgress({ current: r + 1, total: reports.length, reportDesc: report.description || `Report #${report.id}` });

        let expenses = reportExpenses[report.id];
        if (!expenses) {
          try {
            const res = await fetch(`/api/aprovacao-dinamica/report/${report.id}/expenses`);
            if (res.ok) {
              const data = await res.json();
              expenses = data.data.expenses;
              setReportExpenses(prev => ({ ...prev, [report.id]: expenses! }));

              const savedRes = await fetch(`/api/aprovacao-dinamica/audit-results/${report.id}`);
              if (savedRes.ok) {
                const savedData = await savedRes.json();
                if (savedData.data?.expenses?.length > 0) {
                  const resultsMap: Record<number, ExpenseAuditResult> = {};
                  savedData.data.expenses.forEach((e: ExpenseAuditResult) => {
                    resultsMap[e.expense_id] = e;
                  });
                  setAuditResults(prev => ({ ...prev, [report.id]: resultsMap }));
                  setAuditProgress(prev => ({
                    ...prev,
                    [report.id]: { done: savedData.data.expenses.length, total: expenses!.length },
                  }));
                }
              }
            }
          } catch (err) {
            console.error(`Error loading expenses for report ${report.id}:`, err);
            continue;
          }
        }

        if (!expenses || expenses.length === 0) continue;

        for (let i = 0; i < expenses.length; i++) {
          const expense = expenses[i];
          const existing = auditResultsRef.current[report.id]?.[expense.id];
          if (existing && existing.extracted_data) continue;
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          await auditSingleExpense(report.id, expense, !!existing);
        }
      }
    } finally {
      setGlobalAuditing(false);
      setGlobalProgress(null);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const isReportReadyToApprove = useCallback((reportId: number) => {
    const results = auditResults[reportId] || {};
    const count = expenseCounts[reportId];
    if (!count || count === 0) return false;
    const auditedCount = Object.keys(results).length;
    if (auditedCount < count) return false;
    const allApproved = Object.values(results).every(r => r.status === 'APROVADO_BOT' || r.status === 'APROVADO_HUMANO');
    return allApproved;
  }, [auditResults, expenseCounts]);

  const filteredReports = useMemo(() => {
    let filtered = reports;
    if (readyOnly) {
      filtered = filtered.filter(r => isReportReadyToApprove(r.id) && !reportApprovals[r.id]);
    }
    if (alertsOnly) {
      filtered = filtered.filter(r => {
        const v = validationSummary[r.id];
        return v && !('error' in v) && (v.has_duplicates || v.has_date_mismatch || v.has_total_mismatch);
      });
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.description?.toLowerCase().includes(term) ||
        String(r.id).includes(term) ||
        r.user?.name?.toLowerCase().includes(term) ||
        r.user?.email?.toLowerCase().includes(term) ||
        r.approval_flow_name?.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [reports, searchTerm, readyOnly, isReportReadyToApprove, reportApprovals, alertsOnly, validationSummary]);

  const visibleReports = useMemo(() => filteredReports.slice(0, visibleCount), [filteredReports, visibleCount]);

  const filteredExpenses = useCallback((reportId: number, expenses: ReportExpense[]): ReportExpense[] => {
    if (!searchTerm.trim()) return expenses;
    const term = searchTerm.toLowerCase();
    return expenses.filter(e =>
      e.title?.toLowerCase().includes(term) ||
      String(e.expense_id).includes(term) ||
      String(e.id).includes(term) ||
      e.observation?.toLowerCase().includes(term) ||
      e.expense_type?.description?.toLowerCase().includes(term) ||
      e.costs_center?.name?.toLowerCase().includes(term) ||
      formatCurrency(e.value).toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const stats = useMemo(() => {
    const total = filteredReports.length;
    const auditedReports = filteredReports.filter(r => r.audited).length;

    const reportIds = new Set(filteredReports.map(r => r.id));
    let approvedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;
    let totalAuditedExpenses = 0;
    Object.entries(auditResults).forEach(([reportIdStr, reportResults]) => {
      if (!reportIds.has(Number(reportIdStr))) return;
      Object.values(reportResults).forEach(e => {
        if (e.status === 'APROVADO_BOT' || e.status === 'APROVADO_HUMANO') approvedCount++;
        else if (e.status === 'PENDENTE' || e.status === 'ANALISAR_DEPOIS') pendingCount++;
        else if (e.status === 'REPROVADO' || e.status === 'REPROVADO_HUMANO') rejectedCount++;
        totalAuditedExpenses++;
      });
    });

    const totalExpenses = filteredReports.reduce((sum, r) => sum + (expenseCounts[r.id] || 0), 0);

    return { total, auditedReports, approvedCount, pendingCount, rejectedCount, totalExpenses, totalAuditedExpenses };
  }, [filteredReports, auditResults, expenseCounts]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const pendingReviewCount = useMemo(() => {
    const reportIds = new Set(reports.map(r => r.id));
    let count = 0;
    Object.entries(auditResults).forEach(([reportIdStr, reportResults]) => {
      if (!reportIds.has(Number(reportIdStr))) return;
      Object.values(reportResults).forEach(e => {
        if (e.status === 'PENDENTE' || e.status === 'REPROVADO') count++;
      });
    });
    return count;
  }, [auditResults, reports]);

  const handleApproveReport = async (reportId: number) => {
    setApprovingReport(reportId);
    setApproveError(prev => { const n = { ...prev }; delete n[reportId]; return n; });
    try {
      const approverId = parseInt(approverFilter) || 891904;
      const observation = approveObservation[reportId] || '';
      const res = await fetch('/api/aprovacao-dinamica/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          approver_id: approverId,
          approver_name: user?.name || 'unknown',
          observation,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'Failed to approve report';
        setApproveError(prev => ({ ...prev, [reportId]: errMsg }));

        if (data.error_type === 'not_approver_in_step') {
          setShowApproveUI(prev => { const n = new Set(prev); n.delete(reportId); return n; });
          excludedReportsRef.current.add(reportId);
          setReports(prev => prev.filter(r => r.id !== reportId));
          setApprovalNotice(`Relatório #${reportId} removido: ${errMsg}`);
          fetchPending();
        }
        return;
      }
      setReportApprovals(prev => ({
        ...prev,
        [reportId]: {
          approver_name: user?.name || 'unknown',
          approver_user_id: approverId,
          observation: observation || null,
          approved_at: new Date().toISOString(),
        },
      }));
      setShowApproveUI(prev => { const n = new Set(prev); n.delete(reportId); return n; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setApproveError(prev => ({ ...prev, [reportId]: msg }));
    } finally {
      setApprovingReport(null);
    }
  };

  const handleRejectExpense = async (reportId: number, expense: ReportExpense) => {
    const key = `${reportId}-${expense.id}`;
    const observation = rejectObservation[key]?.trim();
    if (!observation) return;
    setRejectingReport(reportId);
    try {
      const approverId = parseInt(approverFilter) || 891904;
      const allExpenses = reportExpenses[reportId] || [];
      const expensesPayload: Record<string, boolean> = {};
      for (const exp of allExpenses) {
        expensesPayload[String(exp.expense_id)] = exp.id === expense.id ? false : true;
      }
      const res = await fetch('/api/aprovacao-dinamica/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          approver_id: approverId,
          comment: `Despesa "${expense.title}" (#${expense.expense_id}) reprovada via dashboard por ${user?.name || 'approver'}. Motivo: ${observation}`,
          expenses: expensesPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApproveError(prev => ({ ...prev, [reportId]: data.error || 'Failed to reject expense' }));
        return;
      }
      setRejectingExpense(null);
      setRejectObservation(prev => { const n = { ...prev }; delete n[key]; return n; });
      setApprovalNotice(`Despesa "${expense.title}" do relatório #${reportId} reprovada com sucesso.`);
      excludedReportsRef.current.add(reportId);
      setReports(prev => prev.filter(r => r.id !== reportId));
      fetchPending();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setApproveError(prev => ({ ...prev, [reportId]: msg }));
    } finally {
      setRejectingReport(null);
    }
  };

  const loadReviewQueue = async (reportId?: number) => {
    setReviewLoading(true);
    try {
      let url: string;
      if (reportId) {
        url = `/api/aprovacao-dinamica/manual-review-queue?report_id=${reportId}`;
      } else {
        const filteredReportIds = reports.map(r => r.id).join(',');
        url = `/api/aprovacao-dinamica/manual-review-queue?report_ids=${filteredReportIds}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load review queue');
      const data = await res.json();
      setReviewItems(data.data || []);
      setReviewModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading review queue');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleDismissDuplicate = useCallback(async (originalExpenseId: number, duplicateExpenseId: number, isDuplicate: boolean) => {
    if (!user) return;
    await fetch('/api/aprovacao-dinamica/validation/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_id: originalExpenseId,
        duplicate_expense_id: duplicateExpenseId,
        dismissed_by: user.name,
        dismissed_by_email: user.email,
        note: isDuplicate ? 'Confirmado como duplicata' : 'Descartado — não é duplicata',
        is_duplicate: isDuplicate,
      }),
    });
    // Find which report this expense belongs to and re-fetch validation
    for (const [reportIdStr, expenses] of Object.entries(reportExpenses)) {
      if (expenses.some(e => e.id === originalExpenseId)) {
        const reportId = parseInt(reportIdStr);
        try {
          const res = await fetch(`/api/aprovacao-dinamica/validation/${reportId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.data) {
              setValidationDetails(prev => ({ ...prev, [reportId]: data.data }));
            }
          }
        } catch {}
        break;
      }
    }
  }, [user, reportExpenses]);

  const handleBatchDismissDuplicate = useCallback(async (originalExpenseId: number, duplicateExpenseId: number, isDuplicate: boolean) => {
    if (!user) return;
    // Fire-and-forget: only POST, don't wait for re-validation
    fetch('/api/aprovacao-dinamica/validation/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_id: originalExpenseId,
        duplicate_expense_id: duplicateExpenseId,
        dismissed_by: user.name,
        dismissed_by_email: user.email,
        note: isDuplicate ? 'Confirmado como duplicata' : 'Descartado — não é duplicata',
        is_duplicate: isDuplicate,
      }),
    }).catch(() => {});
  }, [user]);

  const lookupReceiptUrl = useCallback((reportId: number, value: number, title: string, date?: string, excludeId?: number): string | null => {
    const expenses = reportExpenses[reportId];
    if (!expenses) return null;
    const found = expenses.find(e =>
      Number(e.value) === Number(value) &&
      e.title === title &&
      (!date || e.date?.split(' ')[0] === date) &&
      (!excludeId || e.id !== excludeId)
    );
    return found?.receipt_url || null;
  }, [reportExpenses]);

  const handleReviewComplete = useCallback((reportId: number, expenseId: number, decision: string, reviewerName?: string) => {
    setAuditResults(prev => {
      const reportResults = prev[reportId];
      if (!reportResults) return prev;
      return {
        ...prev,
        [reportId]: {
          ...reportResults,
          [expenseId]: {
            ...reportResults[expenseId],
            status: decision as any,
            audited_by: reviewerName || 'human',
            summary: decision === 'APROVADO_HUMANO'
              ? `Aprovado por revisão humana (${reviewerName || 'human'})`
              : decision === 'REPROVADO_HUMANO'
                ? `Reprovado por revisão humana (${reviewerName || 'human'})`
                : `Deixado para análise posterior (${reviewerName || 'human'})`,
          },
        },
      };
    });
  }, []);

  return (
    <div className="space-y-6">
      <ManualReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        items={reviewItems}
        reviewerName={user?.name}
        onReviewComplete={handleReviewComplete}
      />

      <PreApproveReviewModal
        open={!!preApproveModal}
        onClose={() => setPreApproveModal(null)}
        reportId={preApproveModal?.reportId || 0}
        reportDescription={preApproveModal?.description || ''}
        userName={preApproveModal ? reports.find(r => r.id === preApproveModal.reportId)?.user?.name || null : null}
        expenses={preApproveModal ? (reportExpenses[preApproveModal.reportId] || []).map(exp => {
          const audit = auditResults[preApproveModal.reportId]?.[exp.id] || null;
          const valDetail = validationDetails[preApproveModal.reportId];
          const valExpData = valDetail?.expenses?.[exp.id] || valDetail?.expenses?.[exp.expense_id];
          return {
            id: exp.id,
            expense_id: exp.expense_id,
            title: exp.title,
            value: exp.value,
            date: exp.date,
            observation: exp.observation,
            receipt_url: exp.receipt_url,
            expense_type: exp.expense_type,
            costs_center: exp.costs_center,
            audit: audit ? {
              status: audit.status,
              extracted_data: audit.extracted_data,
              divergences: audit.divergences,
              rules_triggered: audit.rules_triggered,
              summary: audit.summary,
            } : null,
            validation: valExpData ? {
              has_duplicate: valExpData.has_duplicate,
              has_date_mismatch: valExpData.has_date_mismatch,
              duplicates: valExpData.duplicates,
              date_mismatch_detail: valExpData.date_mismatch_detail,
            } : null,
          } as PreApproveExpense;
        }) : []}
        onApprove={() => {
          if (preApproveModal) {
            setShowApproveUI(prev => new Set(prev).add(preApproveModal.reportId));
            setPreApproveModal(null);
          }
        }}
        approving={false}
        hasValidationDuplicates={preApproveModal ? (() => {
          const vs = validationSummary[preApproveModal.reportId];
          return vs && !('error' in vs) && vs.has_duplicates;
        })() : false}
        hasValidationDateMismatch={preApproveModal ? (() => {
          const vs = validationSummary[preApproveModal.reportId];
          return vs && !('error' in vs) && vs.has_date_mismatch;
        })() : false}
        hasValidationTotalMismatch={preApproveModal ? (() => {
          const vs = validationSummary[preApproveModal.reportId];
          return vs && !('error' in vs) && vs.has_total_mismatch;
        })() : false}
        onCompareDuplicate={(origExp, dup) => {
          const original: ComparisonExpense = {
            expense_id: origExp.id,
            title: origExp.title,
            value: origExp.value,
            date: origExp.date,
            observation: origExp.observation,
            receipt_url: origExp.receipt_url,
            expense_type: origExp.expense_type?.description ?? null,
            costs_center: origExp.costs_center?.name ?? null,
            report_name: preApproveModal?.description ?? '',
            report_id: preApproveModal?.reportId ?? 0,
            user_name: reports.find(r => r.id === preApproveModal?.reportId)?.user?.name ?? '',
            match_fields: dup.match_fields,
            same_report: dup.same_report,
          };
          const dupExp: ComparisonExpense = {
            expense_id: dup.expense_id,
            title: dup.title,
            value: dup.value,
            date: dup.date,
            observation: dup.observation,
            receipt_url: dup.receipt_url || lookupReceiptUrl(dup.report_id, dup.value, dup.title, dup.date, origExp.id),
            expense_type: dup.expense_type,
            costs_center: dup.costs_center,
            report_name: dup.report_name,
            report_id: dup.report_id,
            user_name: dup.user_name,
            match_fields: dup.match_fields,
            same_report: dup.same_report,
          };
          setComparisonModal({ original, duplicates: [dupExp] });
        }}
      />

      <DuplicateComparisonModal
        open={!!comparisonModal}
        onClose={() => setComparisonModal(null)}
        originalExpense={comparisonModal?.original ?? null}
        duplicateExpenses={comparisonModal?.duplicates ?? []}
        onDismiss={handleDismissDuplicate}
        dismissedBy={user?.name}
      />

      <BatchDuplicateReviewModal
        open={batchDupModalOpen}
        onClose={() => setBatchDupModalOpen(false)}
        onDismiss={handleBatchDismissDuplicate}
        dismissedBy={user?.name}
        currentUserName={user?.name}
      />

      <DismissLogsModal
        open={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
      />

      <FaturaUploadModal
        open={faturaModalReport !== null}
        onClose={() => setFaturaModalReport(null)}
        reportId={faturaModalReport || 0}
        reportDescription={reports.find(r => r.id === faturaModalReport)?.description || ''}
        validatedBy={user?.name || 'Sistema'}
        onValidationComplete={() => {
          if (faturaModalReport) {
            fetch(`/api/aprovacao-dinamica/fatura/status?reportId=${faturaModalReport}`)
              .then(res => res.json())
              .then(data => {
                if (data.data && Array.isArray(data.data)) {
                  const vMap: Record<number, FaturaValidationRecord> = {};
                  for (const v of data.data as FaturaValidationRecord[]) {
                    const existing = vMap[v.expense_id];
                    if (!existing || (v.validated_at && existing.validated_at && new Date(v.validated_at) > new Date(existing.validated_at))) {
                      vMap[v.expense_id] = v;
                    }
                  }
                  setFaturaValidations(prev => ({ ...prev, [faturaModalReport]: vMap }));
                }
              })
              .catch(err => console.error('Error refreshing fatura validations:', err));
          }
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bot className="h-7 w-7 text-blue-600" />
            Aprovação Dinâmica
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Bot analisa comprovantes e sugere aprovação, reprovação ou encaminhamento humano
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => loadReviewQueue()}
            disabled={reviewLoading || pendingReviewCount === 0}
            size="sm"
          >
            {reviewLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Revisão Manual
            {pendingReviewCount > 0 && (
              <Badge className="ml-1.5 bg-orange-500 text-white text-xs">
                {pendingReviewCount}
              </Badge>
            )}
          </Button>
          <Button
            onClick={() => setBatchDupModalOpen(true)}
            size="sm"
            variant="outline"
            className="border-orange-300 text-orange-700 hover:bg-orange-100"
          >
            <Copy className="h-4 w-4" />
            Revisar Duplicadas
          </Button>
          <Button
            onClick={() => setLogsModalOpen(true)}
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            <ScrollText className="h-4 w-4" />
            Logs
          </Button>
          <Button
            onClick={auditAllReports}
            disabled={globalAuditing || loading || reports.length === 0}
            size="sm"
          >
            {globalAuditing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Auditar Tudo
          </Button>
          <Button onClick={() => { validationBatchFetchedRef.current = false; fetchPending(); }} disabled={loading || globalAuditing} variant="outline" size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Global Audit Progress */}
      {globalProgress && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center justify-between text-sm text-blue-700">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Auditando report {globalProgress.current}/{globalProgress.total}: {globalProgress.reportDesc}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${(globalProgress.current / globalProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Search Bar + Approver Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por report, despesa, colaborador, valor..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
        </div>
        <select
          value={approverFilter}
          onChange={e => setApproverFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos os aprovadores</option>
          <option value="891904">Letícia (891904)</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={stepOneOnly}
            onChange={e => setStepOneOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Só etapa 1
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={readyOnly}
            onChange={e => setReadyOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Prontos para aprovar
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={alertsOnly}
            onChange={e => setAlertsOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Só com alertas NF
        </label>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reports Pendentes</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Despesas</CardDescription>
            <CardTitle className="text-2xl">
              {loadingCounts ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : stats.totalExpenses}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Despesas Auditadas</CardDescription>
            <CardTitle className="flex items-center gap-1 text-2xl text-blue-600">
              <Database className="h-5 w-5" />
              {stats.totalAuditedExpenses}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bot Aprovaria</CardDescription>
            <CardTitle className="flex items-center gap-1 text-2xl text-green-600">
              <CheckCircle className="h-5 w-5" />
              {stats.approvedCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Encaminhar Humano</CardDescription>
            <CardTitle className="flex items-center gap-1 text-2xl text-yellow-600">
              <AlertCircle className="h-5 w-5" />
              {stats.pendingCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bot Reprovaria</CardDescription>
            <CardTitle className="flex items-center gap-1 text-2xl text-red-600">
              <XCircle className="h-5 w-5" />
              {stats.rejectedCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reports Auditados</CardDescription>
            <CardTitle className="flex items-center gap-1 text-2xl text-blue-600">
              <Database className="h-5 w-5" />
              {stats.auditedReports}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              ×
            </button>
          </div>
        </div>
      )}

      {/* Approval notice */}
      {approvalNotice && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{approvalNotice}</span>
          </div>
          <button onClick={() => setApprovalNotice(null)} className="text-amber-600 hover:text-amber-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && reports.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-500">Carregando reports pendentes...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredReports.length === 0 && reports.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-gray-300" />
            <p className="mt-3 text-gray-500">Nenhum resultado para "{searchTerm}"</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setSearchTerm('')}>
              Limpar busca
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && reports.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bot className="h-12 w-12 text-gray-300" />
            <p className="mt-3 text-gray-500">Nenhum report pendente encontrado</p>
            <p className="text-sm text-gray-400">Todos os reports já foram processados</p>
          </CardContent>
        </Card>
      )}

      {/* Reports List */}
      <div className="space-y-3">
        {visibleReports.map(report => {
          const isExpanded = expandedReport === report.id;
          const expenses = reportExpenses[report.id] || [];
          const results = auditResults[report.id] || {};
          const progress = auditProgress[report.id];
          const isLoadingExp = loadingExpenses === report.id;
          const auditedCount = Object.keys(results).length;
          const hasResults = auditedCount > 0;

          const approvedInReport = Object.values(results).filter(r => r.status === 'APROVADO_BOT' || r.status === 'APROVADO_HUMANO').length;
          const pendingInReport = Object.values(results).filter(r => r.status === 'PENDENTE' || r.status === 'ANALISAR_DEPOIS').length;
          const rejectedInReport = Object.values(results).filter(r => r.status === 'REPROVADO' || r.status === 'REPROVADO_HUMANO').length;
          const isReadyToApprove = isReportReadyToApprove(report.id);
          const reportApproval = reportApprovals[report.id];
          const isApproved = !!reportApproval;

          const cardClass = isApproved
            ? 'overflow-hidden transition-all border-gray-300 bg-gray-50 opacity-75'
            : isReadyToApprove
            ? 'overflow-hidden transition-all border-green-300 bg-green-50'
            : 'overflow-hidden';

          return (
            <Card key={report.id} className={cardClass}>
              {/* Report Header */}
              <div
                className="flex cursor-pointer items-center gap-3 p-4 hover:bg-gray-50"
                onClick={() => toggleReport(report.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{report.description || `Report #${report.id}`}</span>
                    <Badge variant="outline" className="text-xs">
                      #{report.id}
                    </Badge>
                    {report.approval_flow_name && (
                      <Badge variant="secondary" className="text-xs">
                        {report.approval_flow_name}
                      </Badge>
                    )}
                    {report.status === 'REABERTO' && (
                      <Badge className="bg-orange-100 text-orange-700 text-xs">
                        Reaberto
                      </Badge>
                    )}
                    {report.current_step > 1 && (
                      <Badge className="bg-purple-100 text-purple-700 text-xs" title="Relatório já passou por pelo menos uma aprovação">
                        Etapa 2+
                      </Badge>
                    )}
                    {report.audited && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs">
                        <Database className="mr-1 h-3 w-3" />
                        Auditado
                      </Badge>
                    )}
                    {isApproved && (
                      <Badge className="bg-gray-200 text-gray-600 text-xs">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Aprovado por {reportApproval.approver_name}
                      </Badge>
                    )}
                    {isReadyToApprove && !isApproved && (
                      <Badge className="bg-green-200 text-green-800 text-xs">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Pronto para aprovar
                      </Badge>
                    )}
                    {expenseCounts[report.id] !== undefined && hasResults && auditedCount < expenseCounts[report.id] && (
                      <Badge className="bg-orange-100 text-orange-700 text-xs">
                        {auditedCount}/{expenseCounts[report.id]}
                      </Badge>
                    )}
                    {(() => {
                      const vs = validationSummary[report.id];
                      if (!vs || 'error' in vs) return null;
                      return (
                        <>
                          {vs.has_duplicates && (
                            <Badge className="bg-red-100 text-red-800 text-xs" title="Despesas duplicadas detectadas">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              NF: duplicadas
                            </Badge>
                          )}
                          {vs.has_date_mismatch && (
                            <Badge className="bg-orange-100 text-orange-800 text-xs" title="Despesas com data fora do período do relatório">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              NF: data divergente
                            </Badge>
                          )}
                          {vs.has_total_mismatch && (
                            <Badge className="bg-purple-100 text-purple-800 text-xs" title="Soma das despesas não bate com o total do relatório">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              NF: total divergente
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    {report.user && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {report.user.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(report.created_at)}
                    </span>
                    {expenseCounts[report.id] !== undefined && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {expenseCounts[report.id]} despesas
                      </span>
                    )}
                    {hasResults && expenseCounts[report.id] !== undefined && (
                      <span className={`flex items-center gap-1 ${auditedCount === expenseCounts[report.id] ? 'text-green-600' : 'text-orange-600'}`}>
                        {auditedCount}/{expenseCounts[report.id]} auditadas
                      </span>
                    )}
                    {hasResults && (
                      <span className="flex items-center gap-2">
                        <span className="text-green-600">✓ {approvedInReport}</span>
                        <span className="text-yellow-600">⚠ {pendingInReport}</span>
                        <span className="text-red-600">✗ {rejectedInReport}</span>
                      </span>
                    )}
                    {isApproved && reportApproval.observation && (
                      <span className="text-gray-500 italic" title={reportApproval.observation}>
                        Obs: {reportApproval.observation.length > 40 ? reportApproval.observation.slice(0, 40) + '...' : reportApproval.observation}
                      </span>
                    )}
                    {isApproved && (
                      <span className="text-gray-400">
                        {new Date(reportApproval.approved_at).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Audit All + Manual Review Buttons */}
                {isExpanded && expenses.length > 0 && (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {(pendingInReport > 0 || rejectedInReport > 0) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadReviewQueue(report.id)}
                        disabled={reviewLoading}
                      >
                        {reviewLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        Revisar
                        {(pendingInReport + rejectedInReport) > 0 && (
                          <Badge className="ml-1 bg-orange-500 text-white text-xs">
                            {pendingInReport + rejectedInReport}
                          </Badge>
                        )}
                      </Button>
                    )}
                    {(() => {
                      const vs = validationSummary[report.id];
                      const vd = validationDetails[report.id];
                      const hasDups = vs && !('error' in vs) && vs.has_duplicates;
                      const hasDismissed = vd && Object.values(vd.expenses).some(e => (e as any).dismissed_duplicates?.length > 0);
                      if (!hasDups && !hasDismissed) return null;
                      const dupCount = vd ? Object.values(vd.expenses).filter(e => e.has_duplicate).length : 0;
                      const dismissedCount = vd ? Object.values(vd.expenses).reduce((s, e) => s + ((e as any).dismissed_duplicates?.length || 0), 0) : 0;
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-100"
                          onClick={() => {
                            if (!vd) {
                              fetchValidationDetails(report.id);
                            }
                            const exps = reportExpenses[report.id] || [];
                            const dupEntries: { original: ComparisonExpense; duplicates: ComparisonExpense[] }[] = [];
                            for (const [expIdStr, expData] of Object.entries(vd?.expenses || {})) {
                              const allDups = [...expData.duplicates, ...((expData as any).confirmed_duplicates || []), ...((expData as any).dismissed_duplicates || [])];
                              if (allDups.length === 0) continue;
                              const origExp = exps.find(e => e.id === parseInt(expIdStr));
                              if (!origExp) continue;
                              const original: ComparisonExpense = {
                                expense_id: origExp.id,
                                title: origExp.title,
                                value: origExp.value,
                                date: origExp.date,
                                observation: origExp.observation,
                                receipt_url: origExp.receipt_url,
                                expense_type: origExp.expense_type?.description ?? null,
                                costs_center: origExp.costs_center?.name ?? null,
                                report_name: report.description || '',
                                report_id: report.id,
                                user_name: report.user?.name ?? '',
                                match_fields: [],
                                same_report: false,
                              };
                              const dupExps: ComparisonExpense[] = allDups.map((dup: any) => ({
                                expense_id: dup.expense_id,
                                title: dup.title,
                                value: dup.value,
                                date: dup.date,
                                observation: dup.observation,
                                receipt_url: dup.receipt_url || lookupReceiptUrl(dup.report_id, dup.value, dup.title, dup.date, origExp.id),
                                expense_type: dup.expense_type,
                                costs_center: dup.costs_center,
                                report_name: dup.report_name,
                                report_id: dup.report_id,
                                user_name: dup.user_name,
                                match_fields: dup.match_fields,
                                same_report: dup.same_report,
                              }));
                              dupEntries.push({ original, duplicates: dupExps });
                            }
                            if (dupEntries.length > 0) {
                              setComparisonModal(dupEntries[0]);
                            }
                          }}
                        >
                          <AlertTriangle className="h-4 w-4" />
                          Analisar duplicadas
                          {dupCount > 0 && (
                            <Badge className="ml-1 bg-red-500 text-white text-xs">{dupCount}</Badge>
                          )}
                          {dupCount === 0 && dismissedCount > 0 && (
                            <Badge className="ml-1 bg-green-500 text-white text-xs">{dismissedCount}</Badge>
                          )}
                        </Button>
                      );
                    })()}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => auditAllExpenses(report.id)}
                      disabled={auditingExpense !== null || isLoadingExp}
                    >
                      {auditingExpense && auditingExpense.startsWith(`${report.id}-`) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ScanLine className="h-4 w-4" />
                      )}
                      Auditar Tudo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-purple-300 text-purple-700 hover:bg-purple-100"
                      onClick={() => setFaturaModalReport(report.id)}
                    >
                      <CreditCard className="h-4 w-4" />
                      Validar Fatura
                    </Button>
                    <a
                      href={`https://amp.vexpenses.com/relatorios/${report.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-100"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Ir para o relatório
                      </Button>
                    </a>
                  </div>
                )}
              </div>

              {/* Approve Panel for Ready Reports */}
              {isExpanded && isReadyToApprove && !isApproved && (
                <div className="border-t border-green-200 bg-green-50 p-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800">Todas as despesas aprovadas — pronto para aprovar no VExpenses</span>
                  </div>
                  {showApproveUI.has(report.id) ? (
                    <div className="space-y-3">
                      <textarea
                        placeholder="Observação (opcional)..."
                        value={approveObservation[report.id] || ''}
                        onChange={e => setApproveObservation(prev => ({ ...prev, [report.id]: e.target.value }))}
                        className="w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                        rows={2}
                      />
                      {approveError[report.id] && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                          {approveError[report.id]}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveReport(report.id)}
                          disabled={approvingReport === report.id}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {approvingReport === report.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Confirmar Aprovação
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowApproveUI(prev => { const n = new Set(prev); n.delete(report.id); return n; })}
                          disabled={approvingReport === report.id}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPreApproveModal({ reportId: report.id, description: report.description || '' });
                          const vs = validationSummary[report.id];
                          if (vs && !('error' in vs) && (vs.has_duplicates || vs.has_date_mismatch || vs.has_total_mismatch)) {
                            fetchValidationDetails(report.id);
                          }
                        }}
                        className="border-green-300 text-green-700 hover:bg-green-100"
                      >
                        <Receipt className="h-4 w-4" />
                        Revisar despesas
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setShowApproveUI(prev => new Set(prev).add(report.id))}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Aprovar no VExpenses
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Approved Info Panel */}
              {isExpanded && isApproved && (
                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-gray-500" />
                    <span className="font-medium text-gray-700">
                      Aprovado por {reportApproval.approver_name} em {new Date(reportApproval.approved_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {reportApproval.observation && (
                    <p className="text-sm text-gray-600 italic">
                      Observação: {reportApproval.observation}
                    </p>
                  )}
                </div>
              )}

              {/* NF Validation Alert Panel */}
              {isExpanded && (() => {
                const vd = validationDetails[report.id];
                const vs = validationSummary[report.id];
                const isLoadingValidation = loadingValidationDetails.has(report.id);
                const hasValidationIssues = vs && !('error' in vs) && (vs.has_duplicates || vs.has_date_mismatch || vs.has_total_mismatch);
                const hasDismissedOnly = vd && !vd.has_duplicates && !vd.has_date_mismatch && !vd.has_total_mismatch &&
                  Object.values(vd.expenses).some(e => (e as any).dismissed_duplicates?.length > 0 && !((e as any).confirmed_duplicates?.length > 0));
                const hasConfirmedOnly = vd && !vd.has_duplicates && !vd.has_date_mismatch && !vd.has_total_mismatch &&
                  Object.values(vd.expenses).some(e => (e as any).confirmed_duplicates?.length > 0);
                if (!hasValidationIssues && !hasDismissedOnly && !hasConfirmedOnly && !isLoadingValidation) return null;
                const isAlert = hasValidationIssues && !isLoadingValidation;
                const isConfirmedOnly = hasConfirmedOnly && !isAlert;
                const panelClass = isAlert ? 'border-red-200 bg-red-50' : isConfirmedOnly ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50';
                const panelIcon = isAlert ? <AlertCircle className="h-5 w-5 text-red-600" /> : isConfirmedOnly ? <AlertTriangle className="h-5 w-5 text-orange-600" /> : <CheckCircle className="h-5 w-5 text-green-600" />;
                const panelTitle = isAlert ? 'Alerta NF — Validação de Notas Fiscais' : isConfirmedOnly ? 'NF — Duplicatas confirmadas' : 'NF — Duplicatas descartadas';
                const panelTitleClass = isAlert ? 'text-red-800' : isConfirmedOnly ? 'text-orange-800' : 'text-green-800';
                return (
                  <div className={`border-t p-4 ${panelClass}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {panelIcon}
                      <span className={`font-medium ${panelTitleClass}`}>
                        {panelTitle}
                      </span>
                    </div>
                    {isLoadingValidation ? (
                      <div className="flex items-center gap-2 text-sm text-red-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analisando duplicatas e divergências...
                      </div>
                    ) : vd ? (
                      <div className="space-y-2">
                        {isConfirmedOnly && (
                          <p className="text-sm text-orange-800">
                            <strong>Duplicatas confirmadas pelo revisor.</strong> Necessária atenção antes de aprovar.
                          </p>
                        )}
                        {!isAlert && !isConfirmedOnly && (
                          <p className="text-sm text-green-800">
                            <strong>Todas as duplicatas foram revisadas e descartadas.</strong>
                          </p>
                        )}
                        {vd.has_duplicates && (
                          <p className="text-sm text-red-800">
                            <strong>Possíveis duplicatas detectadas.</strong> Revise antes de aprovar.
                          </p>
                        )}
                        {vd.has_date_mismatch && (
                          <p className="text-sm text-orange-800">
                            <strong>Despesas com data fora do período do relatório.</strong> Verifique as datas.
                          </p>
                        )}
                        {vd.has_total_mismatch && (
                          <p className="text-sm text-purple-800">
                            <strong>Soma das despesas não confere com o total do relatório.</strong>{' '}
                            Esperado: R$ {vd.total_expected?.toFixed(2)} — Calculado: R$ {vd.total_calculated.toFixed(2)}{' '}
                            — Diferença: R$ {vd.total_difference.toFixed(2)}
                          </p>
                        )}
                        {Object.entries(vd.expenses).map(([expId, expData]) => {
                          const confirmedDups = (expData as any).confirmed_duplicates || [];
                          if (!expData.has_duplicate && !expData.has_date_mismatch && !confirmedDups.length && !(expData as any).dismissed_duplicates?.length) return null;
                          const dismissedDups = (expData as any).dismissed_duplicates || [];
                          return (
                            <div key={expId} className="rounded border border-red-200 bg-white p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-700">Despesa #{expId}</span>
                                {expData.has_duplicate && (
                                  <Badge className="bg-red-100 text-red-700 text-xs">Duplicata</Badge>
                                )}
                                {expData.has_date_mismatch && (
                                  <Badge className="bg-orange-100 text-orange-700 text-xs">Data divergente</Badge>
                                )}
                                {confirmedDups.length > 0 && (
                                  <Badge className="bg-orange-100 text-orange-700 text-xs">Duplicata confirmada</Badge>
                                )}
                                {dismissedDups.length > 0 && !expData.has_duplicate && (
                                  <Badge className="bg-green-100 text-green-700 text-xs">Duplicata descartada</Badge>
                                )}
                              </div>
                              {expData.duplicates.map((dup, idx) => (
                                <div key={idx} className="ml-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                                  <span>{dup.title}</span>
                                  <span>—</span>
                                  <span>R$ {dup.value.toFixed(2)}</span>
                                  <span>—</span>
                                  <span>{dup.date}</span>
                                  <span>—</span>
                                  <span>Campos: {dup.match_fields.join(', ')}</span>
                                  {dup.same_report
                                    ? <span>— Mesmo relatório</span>
                                    : <span>— Report #{dup.report_id} ({dup.report_status})</span>}
                                  {dup.user_name && <span>— {dup.user_name}</span>}
                                  <button
                                    onClick={() => {
                                      const origExp = expenses.find(e => e.id === parseInt(expId));
                                      const original: ComparisonExpense = {
                                        expense_id: origExp?.id ?? parseInt(expId),
                                        title: origExp?.title ?? '',
                                        value: origExp?.value ?? 0,
                                        date: origExp?.date ?? '',
                                        observation: origExp?.observation ?? null,
                                        receipt_url: origExp?.receipt_url ?? null,
                                        expense_type: origExp?.expense_type?.description ?? null,
                                        costs_center: origExp?.costs_center?.name ?? null,
                                        report_name: report.description || '',
                                        report_id: report.id,
                                        user_name: report.user?.name ?? '',
                                        match_fields: dup.match_fields,
                                        same_report: dup.same_report,
                                      };
                                      const dupExp: ComparisonExpense = {
                                        expense_id: dup.expense_id,
                                        title: dup.title,
                                        value: dup.value,
                                        date: dup.date,
                                        observation: dup.observation,
                                        receipt_url: dup.receipt_url || lookupReceiptUrl(dup.report_id, dup.value, dup.title, dup.date, origExp?.id),
                                        expense_type: dup.expense_type,
                                        costs_center: dup.costs_center,
                                        report_name: dup.report_name,
                                        report_id: dup.report_id,
                                        user_name: dup.user_name,
                                        match_fields: dup.match_fields,
                                        same_report: dup.same_report,
                                      };
                                      setComparisonModal({ original, duplicates: [dupExp] });
                                    }}
                                    className="ml-1 inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-blue-700 hover:bg-blue-200"
                                  >
                                    <Eye className="h-3 w-3" />
                                    Comparar comprovantes
                                  </button>
                                </div>
                              ))}
                              {expData.date_mismatch_detail && (
                                <div className="ml-4 text-xs text-orange-700">
                                  Data da despesa: {expData.date_mismatch_detail.expense_date}{' '}
                                  — Período esperado: {expData.date_mismatch_detail.expected_period}
                                </div>
                              )}
                              {confirmedDups.map((dup: any, idx: number) => (
                                <div key={`confirmed-${idx}`} className="ml-4 mt-1 flex flex-wrap items-center gap-2 text-xs text-orange-700">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>{dup.title}</span>
                                  <span>—</span>
                                  <span>R$ {dup.value.toFixed(2)}</span>
                                  <span>—</span>
                                  <span>Confirmada como duplicata por <strong>{dup.dismissed_by}</strong></span>
                                  {dup.dismissed_at && (
                                    <span>— {new Date(dup.dismissed_at).toLocaleString('pt-BR')}</span>
                                  )}
                                  <button
                                    onClick={() => {
                                      const origExp = expenses.find(e => e.id === parseInt(expId));
                                      const original: ComparisonExpense = {
                                        expense_id: origExp?.id ?? parseInt(expId),
                                        title: origExp?.title ?? '',
                                        value: origExp?.value ?? 0,
                                        date: origExp?.date ?? '',
                                        observation: origExp?.observation ?? null,
                                        receipt_url: origExp?.receipt_url ?? null,
                                        expense_type: origExp?.expense_type?.description ?? null,
                                        costs_center: origExp?.costs_center?.name ?? null,
                                        report_name: report.description || '',
                                        report_id: report.id,
                                        user_name: report.user?.name ?? '',
                                        match_fields: dup.match_fields,
                                        same_report: dup.same_report,
                                      };
                                      const dupExp: ComparisonExpense = {
                                        expense_id: dup.expense_id,
                                        title: dup.title,
                                        value: dup.value,
                                        date: dup.date,
                                        observation: dup.observation,
                                        receipt_url: dup.receipt_url || lookupReceiptUrl(dup.report_id, dup.value, dup.title, dup.date, origExp?.id),
                                        expense_type: dup.expense_type,
                                        costs_center: dup.costs_center,
                                        report_name: dup.report_name,
                                        report_id: dup.report_id,
                                        user_name: dup.user_name,
                                        match_fields: dup.match_fields,
                                        same_report: dup.same_report,
                                      };
                                      setComparisonModal({ original, duplicates: [dupExp] });
                                    }}
                                    className="ml-1 inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-gray-600 hover:bg-gray-200"
                                  >
                                    <Eye className="h-3 w-3" />
                                    Ver comprovantes
                                  </button>
                                </div>
                              ))}
                              {dismissedDups.map((dup: any, idx: number) => (
                                <div key={`dismissed-${idx}`} className="ml-4 mt-1 flex flex-wrap items-center gap-2 text-xs text-green-700">
                                  <CheckCircle className="h-3 w-3" />
                                  <span>{dup.title}</span>
                                  <span>—</span>
                                  <span>R$ {dup.value.toFixed(2)}</span>
                                  <span>—</span>
                                  <span>Descartada por <strong>{dup.dismissed_by}</strong></span>
                                  {dup.dismissed_at && (
                                    <span>— {new Date(dup.dismissed_at).toLocaleString('pt-BR')}</span>
                                  )}
                                  <button
                                    onClick={() => {
                                      const origExp = expenses.find(e => e.id === parseInt(expId));
                                      const original: ComparisonExpense = {
                                        expense_id: origExp?.id ?? parseInt(expId),
                                        title: origExp?.title ?? '',
                                        value: origExp?.value ?? 0,
                                        date: origExp?.date ?? '',
                                        observation: origExp?.observation ?? null,
                                        receipt_url: origExp?.receipt_url ?? null,
                                        expense_type: origExp?.expense_type?.description ?? null,
                                        costs_center: origExp?.costs_center?.name ?? null,
                                        report_name: report.description || '',
                                        report_id: report.id,
                                        user_name: report.user?.name ?? '',
                                        match_fields: dup.match_fields,
                                        same_report: dup.same_report,
                                      };
                                      const dupExp: ComparisonExpense = {
                                        expense_id: dup.expense_id,
                                        title: dup.title,
                                        value: dup.value,
                                        date: dup.date,
                                        observation: dup.observation,
                                        receipt_url: dup.receipt_url || lookupReceiptUrl(dup.report_id, dup.value, dup.title, dup.date, origExp?.id),
                                        expense_type: dup.expense_type,
                                        costs_center: dup.costs_center,
                                        report_name: dup.report_name,
                                        report_id: dup.report_id,
                                        user_name: dup.user_name,
                                        match_fields: dup.match_fields,
                                        same_report: dup.same_report,
                                      };
                                      setComparisonModal({ original, duplicates: [dupExp] });
                                    }}
                                    className="ml-1 inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-gray-600 hover:bg-gray-200"
                                  >
                                    <Eye className="h-3 w-3" />
                                    Ver comprovantes
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {/* Loading expenses */}
                  {isLoadingExp && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span className="ml-2 text-sm text-gray-500">Carregando despesas...</span>
                    </div>
                  )}

                  {/* Progress bar */}
                  {progress && progress.total > 0 && (
                    <div className="border-b border-gray-100 bg-blue-50 px-4 py-2">
                      <div className="flex items-center justify-between text-xs text-blue-700">
                        <span>Progresso da auditoria: {progress.done}/{progress.total}</span>
                        <span>{Math.round((progress.done / progress.total) * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${(progress.done / progress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expenses as dynamic cards */}
                  {!isLoadingExp && expenses.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
                      {filteredExpenses(report.id, expenses).map(expense => {
                        const expAudit = results[expense.id];
                        const isAuditingThis = auditingExpense === `${report.id}-${expense.id}`;
                        const showReceipt = showReceiptFor === expense.receipt_url;

                        return (
                          <div
                            key={expense.id}
                            className={`rounded-lg border-2 p-3 transition-all ${
                              expAudit
                                ? STATUS_CONFIG[expAudit.status].color
                                : 'border-gray-200 bg-white'
                            }`}
                          >
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="flex flex-shrink-0 items-center gap-1">
                                  <button
                                    onClick={() => setShowReceiptFor(showReceipt ? null : expense.receipt_url)}
                                    className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-gray-50 hover:border-blue-400"
                                  >
                                    {expense.receipt_url ? (
                                      <ImageIcon className="h-5 w-5 text-gray-400" />
                                    ) : (
                                      <FileText className="h-5 w-5 text-gray-400" />
                                    )}
                                  </button>
                                  {expense.receipt_url && (
                                    <a
                                      href={expense.receipt_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-gray-50 hover:border-blue-400"
                                      title="Abrir comprovante em nova aba"
                                    >
                                      <ExternalLink className="h-5 w-5 text-gray-400" />
                                    </a>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {expense.title || `Despesa #${expense.id}`}
                                  </p>
                                  <p className="text-xs font-medium text-gray-600">
                                    {formatCurrency(expense.value)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1">
                                {(() => {
                                  const fatura = faturaValidations[report.id]?.[expense.expense_id];
                                  if (!fatura) return null;
                                  if (fatura.status === 'VALIDATED') {
                                    return (
                                      <div className="flex items-center gap-1 rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700" title={`Validado contra ${fatura.fatura_filename} em ${fatura.validated_at ? new Date(fatura.validated_at).toLocaleString('pt-BR') : '-'}`}>
                                        <CheckCircle className="h-3 w-3" />
                                        Fatura OK
                                      </div>
                                    );
                                  }
                                  if (fatura.status === 'MISMATCH') {
                                    return (
                                      <div className="flex items-center gap-1 rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700" title={`Divergência: R$ ${fatura.difference.toFixed(2)} — ${fatura.fatura_filename}`}>
                                        <AlertCircle className="h-3 w-3" />
                                        Fatura Divergente
                                      </div>
                                    );
                                  }
                                  if (fatura.status === 'NOT_FOUND') {
                                    return (
                                      <div className="flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" title={`Não encontrada na fatura ${fatura.fatura_filename}`}>
                                        <XCircle className="h-3 w-3" />
                                        Sem Fatura
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                                {expAudit && (
                                  <div className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[expAudit.status]?.color || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                                    {React.createElement(STATUS_CONFIG[expAudit.status]?.icon || CheckCircle, { className: 'h-3 w-3' })}
                                    {STATUS_CONFIG[expAudit.status]?.label || expAudit.status}
                                  </div>
                                )}
                                {expAudit?.audited_by && (expAudit.status === 'APROVADO_HUMANO' || expAudit.status === 'REPROVADO_HUMANO') && (
                                  <span className="text-xs text-gray-500">por {expAudit.audited_by}</span>
                                )}
                              </div>
                              {isAuditingThis && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                            </div>

                            {/* Card Body */}
                            <div className="mt-2 space-y-1.5">
                              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                <span>{expense.date}</span>
                                {expense.expense_type && <span>• {expense.expense_type.description}</span>}
                                {expense.costs_center && <span>• {expense.costs_center.name}</span>}
                              </div>

                              {expense.observation && (
                                <p className="text-xs text-gray-400">Obs: {expense.observation}</p>
                              )}

                              {(() => {
                                const fatura = faturaValidations[report.id]?.[expense.expense_id];
                                if (!fatura || fatura.status === 'NOT_FOUND') return null;
                                return (
                                  <div className="rounded border border-purple-200 bg-purple-50 p-1.5">
                                    <p className="text-xs font-medium text-purple-800">Fatura Itaú:</p>
                                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-purple-700">
                                      <span>Arquivo: {fatura.fatura_filename}</span>
                                      {fatura.fatura_date && <span>• Data: {fatura.fatura_date}</span>}
                                      {fatura.fatura_description && <span>• {fatura.fatura_description}</span>}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-purple-700">
                                      <span>Fatura: R$ {fatura.fatura_value.toFixed(2)}</span>
                                      <span>• Despesa: R$ {fatura.expense_value.toFixed(2)}</span>
                                      {fatura.difference !== 0 && <span className="font-medium text-orange-700">• Diferença: R$ {fatura.difference.toFixed(2)}</span>}
                                    </div>
                                    {fatura.validated_at && (
                                      <p className="mt-0.5 text-xs text-purple-400">
                                        Validado em {new Date(fatura.validated_at).toLocaleString('pt-BR')}
                                        {fatura.validated_by ? ` por ${fatura.validated_by}` : ''}
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Audit Result Details */}
                              {expAudit && (
                                <div className="mt-2 space-y-1.5">
                                  {expAudit.divergences.length > 0 && (
                                    <div className="rounded border border-orange-200 bg-orange-50 p-1.5">
                                      <p className="text-xs font-medium text-orange-800">Divergências:</p>
                                      {expAudit.divergences.map((d, i) => (
                                        <p key={i} className="text-xs text-orange-700">• {d}</p>
                                      ))}
                                    </div>
                                  )}

                                  {expAudit.rules_triggered.length > 0 && (
                                    <div className="rounded border border-gray-200 bg-gray-50 p-1.5">
                                      <p className="text-xs font-medium text-gray-700">Regras:</p>
                                      {expAudit.rules_triggered.map((r, i) => (
                                        <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
                                          <Badge variant="outline" className="text-xs">{r.rule}</Badge>
                                          <span className="flex-1">{r.reason}</span>
                                          <span className="text-gray-400">{r.confidence}%</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {expAudit.extracted_data && (
                                    <div className="rounded border border-blue-200 bg-blue-50 p-1.5">
                                      <p className="text-xs font-medium text-blue-800">Gemini extraiu:</p>
                                      <div className="mt-1 grid grid-cols-2 gap-0.5 text-xs text-blue-700">
                                        {expAudit.extracted_data.valor_total && <span>Valor: {expAudit.extracted_data.valor_total}</span>}
                                        {expAudit.extracted_data.data && <span>Data: {expAudit.extracted_data.data}</span>}
                                        {expAudit.extracted_data.estabelecimento && <span>Estab: {expAudit.extracted_data.estabelecimento}</span>}
                                        {expAudit.extracted_data.categoria && <span>Cat: {expAudit.extracted_data.categoria}</span>}
                                        {expAudit.extracted_data.cnpj && <span>CNPJ: {expAudit.extracted_data.cnpj}</span>}
                                        {expAudit.extracted_data.forma_pagamento && <span>Pag: {expAudit.extracted_data.forma_pagamento}</span>}
                                      </div>
                                      {expAudit.extracted_data.itens && expAudit.extracted_data.itens.length > 0 && (
                                        <p className="mt-0.5 text-xs text-blue-700">
                                          Itens: {expAudit.extracted_data.itens.join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  <p className="text-xs italic text-gray-500">{expAudit.summary}</p>
                                </div>
                              )}

                              {/* Receipt preview */}
                              {showReceipt && expense.receipt_url && (
                                <div className="mt-2">
                                  {expense.receipt_url.toLowerCase().endsWith('.pdf') || expense.receipt_url.toLowerCase().includes('/pdfs/') ? (
                                    <iframe
                                      src={`/api/aprovacao-dinamica/receipt-proxy?url=${encodeURIComponent(expense.receipt_url)}`}
                                      title="Comprovante PDF"
                                      className="h-96 w-full rounded-lg border border-gray-200"
                                    />
                                  ) : (
                                    <img
                                      src={expense.receipt_url}
                                      alt="Comprovante"
                                      className="max-h-64 rounded-lg border border-gray-200"
                                      onError={e => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Card Footer */}
                            <div className="mt-3 border-t border-gray-100 pt-2">
                              {rejectingExpense === `${report.id}-${expense.id}` ? (
                                <div className="space-y-2">
                                  <Input
                                    placeholder="Motivo da reprovação (obrigatório)..."
                                    value={rejectObservation[`${report.id}-${expense.id}`] || ''}
                                    onChange={e => setRejectObservation(prev => ({ ...prev, [`${report.id}-${expense.id}`]: e.target.value }))}
                                    className="h-8 text-xs"
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="h-7 bg-red-600 hover:bg-red-700 text-white text-xs"
                                      disabled={!rejectObservation[`${report.id}-${expense.id}`]?.trim() || rejectingReport === report.id}
                                      onClick={() => handleRejectExpense(report.id, expense)}
                                    >
                                      {rejectingReport === report.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                      Confirmar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => { setRejectingExpense(null); setRejectObservation(prev => { const n = { ...prev }; delete n[`${report.id}-${expense.id}`]; return n; }); }}
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {expAudit ? (
                                    expAudit.status !== 'APROVADO_HUMANO' && expAudit.status !== 'REPROVADO_HUMANO' && expAudit.status !== 'ANALISAR_DEPOIS' && !expAudit.extracted_data && !isAuditingThis ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                                        onClick={() => auditSingleExpense(report.id, expense, true)}
                                      >
                                        <RefreshCw className="h-3 w-3" />
                                        Re-analisar
                                      </Button>
                                    ) : null
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => auditSingleExpense(report.id, expense)}
                                    >
                                      <ScanLine className="h-3 w-3" />
                                      Analisar
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => setRejectingExpense(`${report.id}-${expense.id}`)}
                                  >
                                    <XCircle className="h-3 w-3" />
                                    Reprovar
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* No expenses */}
                  {!isLoadingExp && filteredExpenses(report.id, expenses).length === 0 && (
                    <div className="py-8 text-center text-sm text-gray-400">
                      {searchTerm ? `Nenhuma despesa encontrada para "${searchTerm}"` : 'Nenhuma despesa encontrada neste report'}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Load More */}
      {visibleCount < filteredReports.length && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            onClick={() => setVisibleCount(c => c + 30)}
          >
            Carregar mais ({filteredReports.length - visibleCount} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}
