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
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ManualReviewModal, type ManualReviewItem } from '@/components/manual-review-modal';
import { PreApproveReviewModal, type PreApproveExpense } from '@/components/pre-approve-review-modal';
import { useAuth } from '@/lib/auth-context';
import type { HorusSummary } from '@/lib/horus';

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

interface HorusDetailData {
  has_duplicates: boolean;
  has_restrictive_tags: boolean;
  expenses: Record<number, {
    sync: string;
    has_possible_duplicates: boolean;
    has_restrictive_tags: boolean;
    duplicates: Array<{
      id: number;
      title: string;
      amount: number;
      date: string;
      score: number;
      fields: string[];
      user: { name: string } | null;
      report: { id: number; description: string; status: string } | null;
    }>;
    restrictive_tags: string[];
  }>;
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
  const [visibleCount, setVisibleCount] = useState(30);
  const [preApproveModal, setPreApproveModal] = useState<{ reportId: number; description: string } | null>(null);
  const [horusSummary, setHorusSummary] = useState<Record<number, HorusSummary | { error: string }>>({});
  const [horusDetails, setHorusDetails] = useState<Record<number, HorusDetailData>>({});
  const [loadingHorusDetails, setLoadingHorusDetails] = useState<Set<number>>(new Set());
  const [horusOnly, setHorusOnly] = useState(false);

  useEffect(() => {
    setVisibleCount(30);
  }, [searchTerm, readyOnly, stepOneOnly, approverFilter, horusOnly]);

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

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const approverParam = approverFilter ? `&approver_id=${approverFilter}` : '';
      const stepParam = stepOneOnly ? '&step=1' : '';
      const res = await fetch(`/api/aprovacao-dinamica/pending?include_audit=true${approverParam}${stepParam}`);
      if (!res.ok) throw new Error('Failed to fetch pending reports');
      const data = await res.json();
      setReports(data.data || []);
      await loadAllSavedResults();
      // Fetch expense counts for all reports in background
      fetchExpenseCounts(data.data || []);
      // Fetch existing approvals
      fetchApprovals(data.data || []);
      // Fetch Hórus batch summary
      fetchHorusBatch(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [loadAllSavedResults, approverFilter, stepOneOnly]);

  const fetchHorusBatch = useCallback(async (reportList: PendingReport[]) => {
    if (reportList.length === 0) return;
    try {
      const ids = reportList.map(r => r.id).join(',');
      const res = await fetch(`/api/aprovacao-dinamica/horus/batch?report_ids=${ids}`);
      if (res.ok) {
        const data = await res.json();
        setHorusSummary(data.data || {});
      }
    } catch (err) {
      console.error('Error fetching Hórus batch:', err);
    }
  }, []);

  const fetchHorusDetails = useCallback(async (reportId: number) => {
    if (horusDetails[reportId] || loadingHorusDetails.has(reportId)) return;
    setLoadingHorusDetails(prev => new Set(prev).add(reportId));
    try {
      const res = await fetch(`/api/aprovacao-dinamica/horus/${reportId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setHorusDetails(prev => ({ ...prev, [reportId]: data.data as HorusDetailData }));
        }
      }
    } catch (err) {
      console.error('Error fetching Hórus details:', err);
    } finally {
      setLoadingHorusDetails(prev => { const n = new Set(prev); n.delete(reportId); return n; });
    }
  }, [horusDetails, loadingHorusDetails]);

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
      fetchPending();
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
      const hs = horusSummary[reportId];
      if (hs && !('error' in hs) && (hs.has_duplicates || hs.has_restrictive_tags)) {
        fetchHorusDetails(reportId);
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
    if (horusOnly) {
      filtered = filtered.filter(r => {
        const h = horusSummary[r.id];
        return h && !('error' in h) && (h.has_duplicates || h.has_restrictive_tags);
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
  }, [reports, searchTerm, readyOnly, isReportReadyToApprove, reportApprovals, horusOnly, horusSummary]);

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
          const horusDetail = horusDetails[preApproveModal.reportId];
          const horusExpData = horusDetail?.expenses?.[exp.id] || horusDetail?.expenses?.[exp.expense_id];
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
            horus: horusExpData ? {
              has_possible_duplicates: horusExpData.has_possible_duplicates,
              has_restrictive_tags: horusExpData.has_restrictive_tags,
              duplicates: horusExpData.duplicates,
              restrictive_tags: horusExpData.restrictive_tags,
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
        hasHorusDuplicates={preApproveModal ? (() => {
          const hs = horusSummary[preApproveModal.reportId];
          return hs && !('error' in hs) && hs.has_duplicates;
        })() : false}
        hasHorusRestrictiveTags={preApproveModal ? (() => {
          const hs = horusSummary[preApproveModal.reportId];
          return hs && !('error' in hs) && hs.has_restrictive_tags;
        })() : false}
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
          <Button onClick={fetchPending} disabled={loading || globalAuditing} variant="outline" size="sm">
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
            checked={horusOnly}
            onChange={e => setHorusOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Só com alertas Hórus
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
                      const hs = horusSummary[report.id];
                      if (!hs || 'error' in hs) return null;
                      return (
                        <>
                          {hs.has_duplicates && (
                            <Badge className="bg-red-100 text-red-800 text-xs" title="Hórus detectou possíveis duplicatas">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              Hórus: duplicatas
                            </Badge>
                          )}
                          {hs.has_restrictive_tags && (
                            <Badge className="bg-orange-100 text-orange-800 text-xs" title="Hórus detectou tags restritivas">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Hórus: tags restritivas
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
                          const hs = horusSummary[report.id];
                          if (hs && !('error' in hs) && (hs.has_duplicates || hs.has_restrictive_tags)) {
                            fetchHorusDetails(report.id);
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

              {/* Hórus Alert Panel */}
              {isExpanded && (() => {
                const hd = horusDetails[report.id];
                const hs = horusSummary[report.id];
                const isLoadingHorus = loadingHorusDetails.has(report.id);
                const hasHorusIssues = hs && !('error' in hs) && (hs.has_duplicates || hs.has_restrictive_tags);
                if (!hasHorusIssues && !isLoadingHorus) return null;
                return (
                  <div className="border-t border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <span className="font-medium text-red-800">Alerta Hórus — Antifraude VExpenses</span>
                    </div>
                    {isLoadingHorus ? (
                      <div className="flex items-center gap-2 text-sm text-red-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analisando duplicatas com IA Hórus...
                      </div>
                    ) : hd ? (
                      <div className="space-y-2">
                        {hd.has_duplicates && (
                          <p className="text-sm text-red-800">
                            <strong>Possíveis duplicatas detectadas.</strong> Revise antes de aprovar.
                          </p>
                        )}
                        {hd.has_restrictive_tags && (
                          <p className="text-sm text-orange-800">
                            <strong>Tags restritivas encontradas.</strong> Itens fora da política detectados.
                          </p>
                        )}
                        {Object.entries(hd.expenses).map(([expId, expData]) => {
                          if (!expData.has_possible_duplicates && !expData.has_restrictive_tags) return null;
                          return (
                            <div key={expId} className="rounded border border-red-200 bg-white p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-700">Despesa #{expId}</span>
                                {expData.has_possible_duplicates && (
                                  <Badge className="bg-red-100 text-red-700 text-xs">Duplicata</Badge>
                                )}
                                {expData.has_restrictive_tags && (
                                  <Badge className="bg-orange-100 text-orange-700 text-xs">Tag restritiva</Badge>
                                )}
                              </div>
                              {expData.duplicates.map((dup, idx) => (
                                <div key={idx} className="ml-4 text-xs text-gray-600">
                                  <span className="font-medium">Score: {dup.score}%</span>
                                  {' — '}
                                  <span>{dup.title}</span>
                                  {' — '}
                                  <span>R$ {dup.amount.toFixed(2)}</span>
                                  {' — '}
                                  <span>{dup.date}</span>
                                  {' — '}
                                  <span>Campos: {dup.fields.join(', ')}</span>
                                  {dup.user && <span> — {dup.user.name}</span>}
                                  {dup.report && <span> — Report #{dup.report.id} ({dup.report.status})</span>}
                                </div>
                              ))}
                              {expData.restrictive_tags.length > 0 && (
                                <div className="ml-4 text-xs text-orange-700">
                                  Tags: {expData.restrictive_tags.join(', ')}
                                </div>
                              )}
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
                                <button
                                  onClick={() => setShowReceiptFor(showReceipt ? null : expense.receipt_url)}
                                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 hover:border-blue-400"
                                >
                                  {expense.receipt_url ? (
                                    <ImageIcon className="h-5 w-5 text-gray-400" />
                                  ) : (
                                    <FileText className="h-5 w-5 text-gray-400" />
                                  )}
                                </button>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {expense.title || `Despesa #${expense.id}`}
                                  </p>
                                  <p className="text-xs font-medium text-gray-600">
                                    {formatCurrency(expense.value)}
                                  </p>
                                </div>
                              </div>

                              {expAudit ? (
                                <div className="flex flex-col items-end gap-1">
                                  <div className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[expAudit.status]?.color || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                                    {React.createElement(STATUS_CONFIG[expAudit.status]?.icon || CheckCircle, { className: 'h-3 w-3' })}
                                    {STATUS_CONFIG[expAudit.status]?.label || expAudit.status}
                                  </div>
                                  {expAudit.audited_by && (expAudit.status === 'APROVADO_HUMANO' || expAudit.status === 'REPROVADO_HUMANO') && (
                                    <span className="text-xs text-gray-500">por {expAudit.audited_by}</span>
                                  )}
                                  {expAudit.status !== 'APROVADO_HUMANO' && expAudit.status !== 'REPROVADO_HUMANO' && expAudit.status !== 'ANALISAR_DEPOIS' && !expAudit.extracted_data && !isAuditingThis && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs text-blue-600"
                                      onClick={() => auditSingleExpense(report.id, expense, true)}
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                      Re-analisar
                                    </Button>
                                  )}
                                  {isAuditingThis && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                                </div>
                              ) : isAuditingThis ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => auditSingleExpense(report.id, expense)}
                                >
                                  <ScanLine className="h-3 w-3" />
                                  Analisar
                                </Button>
                              )}
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
