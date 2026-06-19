'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  AlertCircle,
  Users,
  Building2,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  Hourglass,
  FileCheck,
  ArrowRight,
  Download,
  DollarSign,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { usePendingApprovals, useApprovalFlows, useTeamMembers, ApprovalTrackingReport } from '@/lib/hooks';
import { ApprovalFlow } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default function PendingApprovalsPage() {
  const [regionalFilter, setRegionalFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'days' | 'regional' | 'gestor' | 'value'>('days');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [stepFilter, setStepFilter] = useState<number | null>(null);
  const [approverFilter, setApproverFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | 'gestor' | 'diretor'>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'regional' | 'approver' | 'step' | 'costCenter' | 'owner' | 'level'>('none');

  const { data: reports = [], isLoading } = usePendingApprovals();
  const { data: flows = [] } = useApprovalFlows();
  const { data: teamMembers = [] } = useTeamMembers();

  // Build approver name lookup from team members
  const memberNameMap = useMemo(() => {
    const map = new Map<number, string>();
    teamMembers.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [teamMembers]);

  // Build flow lookup by description (flowName from Excel matches flow description)
  const flowMap = useMemo(() => {
    const map = new Map<string, ApprovalFlow>();
    flows.forEach((f) => map.set(f.description, f));
    return map;
  }, [flows]);

  // Get approvers for a report's waiting step
  const getApprovers = (report: ApprovalTrackingReport): string => {
    if (report.waitingStep <= 0) return '';
    const flow = flowMap.get(report.flowName);
    if (!flow) return '';
    const step = flow.steps.find((s) => s.order === report.waitingStep);
    if (!step) return '';
    const approverIds: number[] = [];
    step.groups.forEach((g) => {
      g.approvers.forEach((a) => {
        const id = parseInt(a, 10);
        if (!isNaN(id) && !approverIds.includes(id)) approverIds.push(id);
      });
    });
    const names = approverIds.map((id) => memberNameMap.get(id)).filter(Boolean) as string[];
    return names.map((n) => `@${n}`).join(';');
  };

  const regionals = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => set.add(r.regional));
    return Array.from(set).sort();
  }, [reports]);

  const uniqueApprovers = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      const approvers = getApprovers(r);
      if (approvers) {
        approvers.split(';').forEach((a) => {
          const name = a.replace(/^@/, '').trim();
          if (name) set.add(name);
        });
      }
    });
    return Array.from(set).sort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, flowMap, memberNameMap]);

  const filteredReports = useMemo(() => {
    let filtered = [...reports];

    if (regionalFilter !== 'all') {
      filtered = filtered.filter((r) => r.regional === regionalFilter);
    }

    if (stepFilter !== null) {
      filtered = filtered.filter((r) => r.waitingStep === stepFilter);
    }

    if (approverFilter !== 'all') {
      filtered = filtered.filter((r) => {
        const approvers = getApprovers(r);
        return approvers.includes(approverFilter);
      });
    }

    if (levelFilter !== 'all') {
      filtered = filtered.filter((r) => {
        if (levelFilter === 'gestor') return r.waitingStep > 0 && r.waitingStep <= 2;
        if (levelFilter === 'diretor') return r.waitingStep > 2;
        return false;
      });
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.owner.toLowerCase().includes(term) ||
          r.reportName.toLowerCase().includes(term) ||
          r.flowName.toLowerCase().includes(term) ||
          r.costCenter?.toLowerCase().includes(term) ||
          r.lastActor.toLowerCase().includes(term)
      );
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'days') cmp = a.daysSinceLastInteraction - b.daysSinceLastInteraction;
      else if (sortBy === 'regional') cmp = a.regional.localeCompare(b.regional);
      else if (sortBy === 'gestor') cmp = a.lastActor.localeCompare(b.lastActor);
      else if (sortBy === 'value') cmp = (a.value ?? 0) - (b.value ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [reports, regionalFilter, searchTerm, sortBy, sortDir, stepFilter, approverFilter, levelFilter, flowMap, memberNameMap]);

  const summaryByRegional = useMemo(() => {
    const map = new Map<string, { regional: string; count: number; totalValue: number; oldestDays: number; costCenters: Set<string> }>();
    filteredReports.forEach((r) => {
      const existing = map.get(r.regional) || { regional: r.regional, count: 0, totalValue: 0, oldestDays: 0, costCenters: new Set<string>() };
      existing.count++;
      existing.totalValue += r.value ?? 0;
      existing.oldestDays = Math.max(existing.oldestDays, r.daysSinceLastInteraction);
      if (r.costCenter) existing.costCenters.add(r.costCenter);
      map.set(r.regional, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredReports]);

  const summaryByActor = useMemo(() => {
    const map = new Map<string, { actor: string; count: number; regionais: Set<string>; totalValue: number; oldestDays: number }>();
    filteredReports.forEach((r) => {
      if (!r.lastActor || r.lastAction !== 'Aprovado') return;
      const existing = map.get(r.lastActor) || { actor: r.lastActor, count: 0, regionais: new Set<string>(), totalValue: 0, oldestDays: 0 };
      existing.count++;
      existing.totalValue += r.value ?? 0;
      existing.regionais.add(r.regional);
      existing.oldestDays = Math.max(existing.oldestDays, r.daysSinceLastInteraction);
      map.set(r.lastActor, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredReports]);

  const approverSummary = useMemo(() => {
    const map = new Map<string, { approver: string; count: number; totalValue: number; regionais: Set<string>; oldestDays: number }>();
    filteredReports.forEach((r) => {
      const approvers = getApprovers(r);
      if (!approvers) return;
      const existing = map.get(approvers) || { approver: approvers, count: 0, totalValue: 0, regionais: new Set<string>(), oldestDays: 0 };
      existing.count++;
      existing.totalValue += r.value ?? 0;
      existing.regionais.add(r.regional);
      existing.oldestDays = Math.max(existing.oldestDays, r.daysSinceLastInteraction);
      map.set(approvers, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredReports, flowMap, memberNameMap]);

  const summaryByStep = useMemo(() => {
    const map = new Map<number, { step: number; count: number; totalValue: number }>();
    filteredReports.forEach((r) => {
      const existing = map.get(r.waitingStep) || { step: r.waitingStep, count: 0, totalValue: 0 };
      existing.count++;
      existing.totalValue += r.value ?? 0;
      map.set(r.waitingStep, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.step - b.step);
  }, [filteredReports]);

  const groupedReports = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = new Map<string, typeof filteredReports>();
    filteredReports.forEach((r) => {
      let key = '';
      if (groupBy === 'regional') key = r.regional;
      else if (groupBy === 'approver') key = getApprovers(r) || 'Sem aprovador';
      else if (groupBy === 'step') key = r.waitingStep === 0 ? 'Reaberto' : `Etapa ${r.waitingStep}`;
      else if (groupBy === 'costCenter') key = r.costCenter || 'Sem centro de custo';
      else if (groupBy === 'owner') key = r.owner;
      else if (groupBy === 'level') key = r.waitingStep <= 0 ? 'Reaberto' : r.waitingStep <= 2 ? 'Gestor' : 'Diretor';
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReports, groupBy, flowMap, memberNameMap]);

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const match = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[1]}/${match[2]}/${match[3]}`;
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const exportToXLSX = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Formato antigo - Aguardando Aprovação
    const approvalData = filteredReports.map((r) => {
      const approvers = getApprovers(r);
      const nivel = r.waitingStep <= 0 ? 'Reaberto' : r.waitingStep <= 2 ? 'Gestor' : 'Diretor';
      return {
        'ID do Relatório': r.reportId,
        'Cobrar Aprovação de': approvers ? `${nivel}: ${approvers}` : '-',
        'Regional': r.regional,
        'Centro de Custo': r.costCenter || '',
        'Colaborador': r.owner,
        'Caixa': r.reportName,
        'Fluxo': r.flowName,
        'Etapa Aguardando': r.waitingStep === 0 ? 'Reaberto' : r.waitingStep,
        'Valor reembolsável': '',
        'Valor não reembolsável': r.value ?? 0,
        'Valor do Adiantamento': '',
        'Saldo': 0,
        'Moeda': r.currency || 'BRL',
        'Última Ação': r.lastAction,
        'Último Ator': r.lastActor,
        'Última Interação': r.lastInteractionDate || '',
        'Dias parado': r.daysSinceLastInteraction,
        'Criado em': formatDate(r.createdAt),
      };
    });
    const wsApproval = XLSX.utils.json_to_sheet(approvalData);
    wsApproval['!cols'] = [
      { wch: 15 }, { wch: 70 }, { wch: 15 }, { wch: 25 }, { wch: 35 },
      { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 20 },
      { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 35 },
      { wch: 20 }, { wch: 12 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsApproval, 'Aguardando Aprovação');

    // Sheet 2: Por Regional
    const regionalData = summaryByRegional.map((s) => ({
      'Regional': s.regional,
      'Caixas Pendentes': s.count,
      'Valor Total': s.totalValue,
      'Centros de Custo': Array.from(s.costCenters).join('; '),
      'Mais Antigo (dias)': s.oldestDays,
    }));
    const wsRegional = XLSX.utils.json_to_sheet(regionalData);
    wsRegional['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 20 }, { wch: 50 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsRegional, 'Por Regional');

    // Sheet 3: Por Aprovador (quem pode aprovar a etapa atual)
    const approverData = approverSummary.map((s) => {
      const sampleReport = filteredReports.find((r) => getApprovers(r) === s.approver);
      const level = sampleReport ? (sampleReport.waitingStep <= 0 ? 'Reaberto' : sampleReport.waitingStep <= 2 ? 'Gestor' : 'Diretor') : '-';
      return {
        'Cobrar Aprovação de': `${level}: ${s.approver}`,
        'Caixas': s.count,
        'Valor Total': s.totalValue,
        'Regionais': Array.from(s.regionais).join(', '),
        'Mais Antigo (dias)': s.oldestDays,
      };
    });
    const wsApprover = XLSX.utils.json_to_sheet(approverData);
    wsApprover['!cols'] = [{ wch: 70 }, { wch: 12 }, { wch: 20 }, { wch: 40 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsApprover, 'Por Aprovador (etapa atual)');

    // Sheet 4: Por Etapa
    const stepData = summaryByStep.map((s) => ({
      'Etapa Aguardando': s.step === 0 ? 'Reaberto' : `Etapa ${s.step}`,
      'Caixas': s.count,
      'Valor Total': s.totalValue,
    }));
    const wsStep = XLSX.utils.json_to_sheet(stepData);
    wsStep['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsStep, 'Por Etapa');

    // Sheet 5: Detalhado
    const detailData = filteredReports.map((r) => {
      const approvers = getApprovers(r);
      const nivel = r.waitingStep <= 0 ? 'Reaberto' : r.waitingStep <= 2 ? 'Gestor' : 'Diretor';
      return {
        'ID': r.reportId,
        'Regional': r.regional,
        'Fluxo': r.flowName,
        'Centro de Custo': r.costCenter || '',
        'Colaborador': r.owner,
        'Caixa': r.reportName,
        'Valor': r.value ?? 0,
        'Cobrar Aprovação de': approvers ? `${nivel}: ${approvers}` : '-',
        'Etapa Atual': r.currentStep || '-',
        'Aguardando Etapa': r.waitingStep === 0 ? 'Reaberto' : r.waitingStep,
        'Última Ação': r.lastAction,
        'Último Ator': r.lastActor,
        'Última Interação': r.lastInteractionDate || '',
        'Dias parado': r.daysSinceLastInteraction,
        'Criado em': formatDate(r.createdAt),
      };
    });
    const wsDetail = XLSX.utils.json_to_sheet(detailData);
    wsDetail['!cols'] = [
      { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 35 },
      { wch: 25 }, { wch: 15 }, { wch: 70 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 35 }, { wch: 20 }, { wch: 12 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalhado');

    // Sheet 6: Histórico
    const historyData: any[] = [];
    filteredReports.forEach((r) => {
      r.history.forEach((h) => {
        historyData.push({
          'ID': r.reportId,
          'Regional': r.regional,
          'Colaborador': r.owner,
          'Caixa': r.reportName,
          'Ação': h.action,
          'Ator': h.actor,
          'Etapa': h.step || '-',
          'Data': h.interactionDate || '',
        });
      });
    });
    const wsHistory = XLSX.utils.json_to_sheet(historyData);
    wsHistory['!cols'] = [
      { wch: 12 }, { wch: 15 }, { wch: 35 }, { wch: 25 }, { wch: 25 },
      { wch: 35 }, { wch: 8 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, wsHistory, 'Histórico');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `aprovacoes_pendentes_${dateStr}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Carregando caixas pendentes...</p>
        </div>
      </div>
    );
  }

  const ReportRow = ({ r }: { r: ApprovalTrackingReport }) => (
    <React.Fragment key={r.reportId}>
      <tr
        className="border-b hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpandedRow(expandedRow === r.reportId ? null : r.reportId)}
      >
        <td className="py-2 px-3">
          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">{r.regional}</Badge>
        </td>
        <td className="py-2 px-3 font-medium text-gray-900">{r.owner}</td>
        <td className="py-2 px-3 text-gray-600">{r.reportName}</td>
        <td className="py-2 px-3 text-gray-500 text-xs">{r.costCenter || '-'}</td>
        <td className="py-2 px-3 text-right font-medium text-gray-700">{formatCurrency(r.value ?? 0)}</td>
        <td className="py-2 px-3 text-center">
          <Badge className={
            r.waitingStep === 1 ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' :
            r.waitingStep === 2 ? 'bg-orange-100 text-orange-800 hover:bg-orange-200' :
            r.waitingStep === 0 ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' :
            'bg-red-100 text-red-800 hover:bg-red-200'
          }>
            {r.waitingStep === 0 ? 'Reaberto' : `Etapa ${r.waitingStep}`}
          </Badge>
        </td>
        <td className="py-2 px-3">
          <div className="flex flex-col gap-1">
            <Badge className={
              r.waitingStep <= 0 ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' :
              r.waitingStep <= 2 ? 'bg-teal-100 text-teal-700 hover:bg-teal-200' :
              'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            }>
              {r.waitingStep <= 0 ? 'Reaberto' : r.waitingStep <= 2 ? 'Gestor' : 'Diretor'}
            </Badge>
            <span className="text-gray-700 text-xs font-medium">
              {getApprovers(r) || '-'}
            </span>
          </div>
        </td>
        <td className="py-2 px-3 text-gray-700 text-xs">
          {r.lastAction === 'Aprovado' ? r.lastActor : r.lastAction}
        </td>
        <td className="py-2 px-3 text-center">
          <span
            className={`font-medium ${
              r.daysSinceLastInteraction > 60 ? 'text-red-600' : r.daysSinceLastInteraction > 30 ? 'text-orange-600' : 'text-gray-600'
            }`}
          >
            {r.daysSinceLastInteraction}
          </span>
        </td>
        <td className="py-2 px-3 text-center">
          <button className="text-blue-600 hover:text-blue-800 text-xs">
            {expandedRow === r.reportId ? (
              <ChevronUp className="h-4 w-4 inline" />
            ) : (
              <ChevronDown className="h-4 w-4 inline" />
            )}
          </button>
        </td>
      </tr>
      {expandedRow === r.reportId && (
        <tr className="bg-gray-50">
          <td colSpan={10} className="py-4 px-6">
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-gray-700">Fluxo:</span>
                <span className="text-gray-600">{r.flowName}</span>
                <span className="font-medium text-gray-700">Criado em:</span>
                <span className="text-gray-600">{formatDate(r.createdAt)}</span>
              </div>

              <div className="space-y-2">
                <span className="font-medium text-gray-700 text-sm">Histórico de aprovação:</span>
                {r.history.map((h, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        h.action === 'Aprovado' ? 'bg-green-100 text-green-700' :
                        h.action === 'Reprovado' || h.action === 'Reprovado pelo administrador' ? 'bg-red-100 text-red-700' :
                        h.action === 'Enviado' ? 'bg-blue-100 text-blue-700' :
                        h.action === 'Reaberto' ? 'bg-gray-100 text-gray-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {h.step ?? '-'}
                      </div>
                    </div>
                    <div className="flex-1 flex items-center gap-3 text-sm">
                      <Badge className={
                        h.action === 'Aprovado' ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                        h.action === 'Reprovado' || h.action === 'Reprovado pelo administrador' ? 'bg-red-100 text-red-800 hover:bg-red-200' :
                        h.action === 'Enviado' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' :
                        'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }>
                        {h.action}
                      </Badge>
                      <span className="text-gray-700 font-medium">{h.actor}</span>
                      <span className="text-gray-400 text-xs">{h.interactionDate}</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-3 pt-2 border-t">
                  <div className="flex items-center gap-2 min-w-[100px]">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      r.waitingStep === 1 ? 'bg-blue-100 text-blue-700' :
                      r.waitingStep === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {r.waitingStep === 0 ? 'R' : r.waitingStep}
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-3 text-sm">
                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                      Aguardando
                    </Badge>
                    <span className="text-gray-500">Etapa {r.waitingStep === 0 ? 'Reaberto' : r.waitingStep}</span>
                    <span className="text-gray-400 text-xs">há {r.daysSinceLastInteraction} dias</span>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );

  const totalValue = filteredReports.reduce((sum, r) => sum + (r.value ?? 0), 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aprovações Pendentes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Caixas com status ENVIADO aguardando aprovação • {filteredReports.length} pendências • {formatCurrency(totalValue)} em valor
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            {filteredReports.length} caixas parados
          </Badge>
          <button
            onClick={exportToXLSX}
            disabled={filteredReports.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar XLSX
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Filtros:</span>
            </div>

            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <select
                value={regionalFilter}
                onChange={(e) => setRegionalFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas as regionais</option>
                {regionals.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por colaborador, caixa, centro de custo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos os níveis</option>
                <option value="gestor">Gestor</option>
                <option value="diretor">Diretor</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <select
                value={approverFilter}
                onChange={(e) => setApproverFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos os aprovadores</option>
                {uniqueApprovers.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {(regionalFilter !== 'all' || searchTerm || stepFilter !== null || approverFilter !== 'all' || levelFilter !== 'all') && (
              <button
                onClick={() => { setRegionalFilter('all'); setSearchTerm(''); setStepFilter(null); setApproverFilter('all'); setLevelFilter('all'); }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Pendente</p>
                <p className="text-3xl font-bold text-blue-600">{filteredReports.length}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-50">
                <Hourglass className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Valor Total</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalValue)}</p>
              </div>
              <div className="p-3 rounded-full bg-green-50">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Regionais</p>
                <p className="text-3xl font-bold text-purple-600">{summaryByRegional.length}</p>
              </div>
              <div className="p-3 rounded-full bg-purple-50">
                <Building2 className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Aprovadores com Pendência</p>
                <p className="text-3xl font-bold text-orange-600">{approverSummary.length}</p>
              </div>
              <div className="p-3 rounded-full bg-orange-50">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Mais Antigo (dias)</p>
                <p className="text-3xl font-bold text-red-600">
                  {filteredReports.length > 0 ? Math.max(...filteredReports.map((r) => r.daysSinceLastInteraction)) : 0}
                </p>
              </div>
              <div className="p-3 rounded-full bg-red-50">
                <Clock className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary by Step */}
      {summaryByStep.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-blue-600" />
              Pendências por Etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {summaryByStep.map((s) => (
                <div
                  key={s.step}
                  onClick={() => setStepFilter(stepFilter === s.step ? null : s.step)}
                  className={`border rounded-lg p-3 min-w-[140px] cursor-pointer transition-all hover:shadow-md ${stepFilter === s.step ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      s.step === 1 ? 'bg-blue-100 text-blue-700' :
                      s.step === 2 ? 'bg-orange-100 text-orange-700' :
                      s.step === 0 ? 'bg-gray-100 text-gray-600' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {s.step === 0 ? 'R' : s.step}
                    </div>
                    <span className="font-semibold text-gray-900">
                      {s.step === 0 ? 'Reaberto' : `Etapa ${s.step}`}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">{s.count} caixas</Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatCurrency(s.totalValue)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary by Regional */}
      {summaryByRegional.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-600" />
              Pendências por Regional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {summaryByRegional.map((s) => (
                <div
                  key={s.regional}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    regionalFilter === s.regional
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setRegionalFilter(regionalFilter === s.regional ? 'all' : s.regional)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">{s.regional}</span>
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">{s.count}</Badge>
                  </div>
                  <div className="text-xs text-gray-600 font-medium">
                    {formatCurrency(s.totalValue)}
                  </div>
                  {s.costCenters.size > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      {Array.from(s.costCenters).slice(0, 3).join(', ')}
                      {s.costCenters.size > 3 && ` +${s.costCenters.size - 3}`}
                    </div>
                  )}
                  {s.oldestDays > 0 && (
                    <div className="text-xs mt-1">
                      <span className={s.oldestDays > 30 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        Mais antigo: {s.oldestDays} dias
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary by Actor */}
      {summaryByActor.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-600" />
              Pendências por Último Aprovador (aguardando próxima etapa)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Aprovador</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-600">Caixas</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Valor Total</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Regionais</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-600">Mais Antigo</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryByActor.map((s) => (
                    <tr key={s.actor} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-900">{s.actor}</td>
                      <td className="py-2 px-3 text-center">
                        <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">{s.count}</Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-gray-700">{formatCurrency(s.totalValue)}</td>
                      <td className="py-2 px-3 text-gray-600">{Array.from(s.regionais).join(', ')}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={s.oldestDays > 30 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {s.oldestDays} dias
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-blue-600" />
              Caixas Pendentes ({filteredReports.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Agrupar por:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">Sem agrupamento</option>
                <option value="regional">Regional</option>
                <option value="approver">Aguardando Aprovação de</option>
                <option value="step">Etapa</option>
                <option value="costCenter">Centro de Custo</option>
                <option value="owner">Colaborador</option>
                <option value="level">Nível (Gestor/Diretor)</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th
                    className="text-left py-2 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleSort('regional')}
                  >
                    Regional {sortBy === 'regional' && (sortDir === 'asc' ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />)}
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Colaborador</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Caixa</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Centro de Custo</th>
                  <th
                    className="text-right py-2 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleSort('value')}
                  >
                    Valor {sortBy === 'value' && (sortDir === 'asc' ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />)}
                  </th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Aguardando</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Cobrar Aprovação de</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Último Aprovador</th>
                  <th
                    className="text-center py-2 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleSort('days')}
                  >
                    Dias parado {sortBy === 'days' && (sortDir === 'asc' ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />)}
                  </th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Histórico</th>
                </tr>
              </thead>
              <tbody>
                {groupedReports ? (
                  groupedReports.map(([groupKey, groupItems]) => (
                    <React.Fragment key={groupKey}>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <td colSpan={10} className="py-2 px-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-800 text-sm">{groupKey}</span>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>{groupItems.length} caixas</span>
                              <span>{formatCurrency(groupItems.reduce((sum, r) => sum + (r.value ?? 0), 0))}</span>
                              <span>Mais antigo: {Math.max(...groupItems.map((r) => r.daysSinceLastInteraction))} dias</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {groupItems.map((r) => (
                        <ReportRow key={r.reportId} r={r} />
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  filteredReports.map((r) => (
                    <ReportRow key={r.reportId} r={r} />
                  ))
                )}
              </tbody>
            </table>

            {filteredReports.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <FileCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhuma pendência encontrada com os filtros selecionados.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
