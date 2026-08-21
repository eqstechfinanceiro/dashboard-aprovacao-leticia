'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ScrollText, ExternalLink, CheckCircle, XCircle, Loader2, ImageIcon, RefreshCw, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import * as XLSX from 'xlsx';

interface DismissLog {
  id: number;
  expense_id: number;
  duplicate_expense_id: number;
  dismissed_by: string;
  dismissed_by_email: string | null;
  note: string | null;
  is_duplicate: boolean;
  dismissed_at: string;
  expense_value: number | null;
  expense_report_id: number | null;
  expense_report_name: string | null;
  expense_user_name: string | null;
  expense_raw_data: any;
  duplicate_value: number | null;
  duplicate_report_id: number | null;
  duplicate_report_name: string | null;
  duplicate_user_name: string | null;
  duplicate_raw_data: any;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getReceiptUrl(rawData: any): string | null {
  if (!rawData) return null;
  return rawData?.reicept_url || rawData?.receipt_url || null;
}

function LogCard({ log, onToggleStatus, togglingId }: { log: DismissLog; onToggleStatus: (log: DismissLog) => void; togglingId: number | null }) {
  const reportUrl1 = log.expense_report_id
    ? `https://amp.vexpenses.com/relatorios/${log.expense_report_id}`
    : null;
  const reportUrl2 = log.duplicate_report_id
    ? `https://amp.vexpenses.com/relatorios/${log.duplicate_report_id}`
    : null;
  const receiptUrl1 = getReceiptUrl(log.expense_raw_data);
  const receiptUrl2 = getReceiptUrl(log.duplicate_raw_data);
  const isToggling = togglingId === log.id;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {log.expense_user_name || log.duplicate_user_name || 'Usuário desconhecido'}
          </span>
        </div>
        <span className="text-xs text-gray-400">{formatDate(log.dismissed_at)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Despesa #{log.expense_id}</span>
            <span className="font-medium text-gray-900">{formatCurrency(log.expense_value)}</span>
          </div>
          {log.expense_report_name && (
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Relatório:</span>
              {reportUrl1 ? (
                <a
                  href={reportUrl1}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                >
                  {log.expense_report_name} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-gray-900">{log.expense_report_name}</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Despesa #{log.duplicate_expense_id}</span>
            <span className="font-medium text-gray-900">{formatCurrency(log.duplicate_value)}</span>
          </div>
          {log.duplicate_report_name && (
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Relatório:</span>
              {reportUrl2 ? (
                <a
                  href={reportUrl2}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                >
                  {log.duplicate_report_name} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-gray-900">{log.duplicate_report_name}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Marcado por: <span className="font-medium text-gray-700">{log.dismissed_by}</span>
          </span>
          {receiptUrl1 && (
            <a
              href={receiptUrl1}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
              title="Ver comprovante despesa"
            >
              <ImageIcon className="h-3 w-3" /> #1
            </a>
          )}
          {receiptUrl2 && (
            <a
              href={receiptUrl2}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
              title="Ver comprovante duplicada"
            >
              <ImageIcon className="h-3 w-3" /> #2
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {log.note && (
            <span className="text-xs italic text-gray-400">"{log.note}"</span>
          )}
          <button
            onClick={() => onToggleStatus(log)}
            disabled={isToggling}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors ${
              log.is_duplicate
                ? 'border-green-200 text-green-700 hover:bg-green-100'
                : 'border-red-200 text-red-700 hover:bg-red-100'
            } ${isToggling ? 'opacity-50 cursor-wait' : ''}`}
          >
            {isToggling ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : log.is_duplicate ? (
              <XCircle className="h-3 w-3" />
            ) : (
              <CheckCircle className="h-3 w-3" />
            )}
            {log.is_duplicate ? 'Descartar' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DismissLogsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<DismissLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/aprovacao-dinamica/validation/dismiss-logs');
      if (!resp.ok) throw new Error('Failed to fetch logs');
      const json = await resp.json();
      setLogs(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const exportToExcel = useCallback((allLogs: DismissLog[]) => {
    const confirmed = allLogs.filter(l => l.is_duplicate);
    const dismissed = allLogs.filter(l => !l.is_duplicate);

    const buildRows = (logs: DismissLog[]) => logs.map(l => ({
      'ID': l.id,
      'Despesa ID': l.expense_id,
      'Despesa Valor': l.expense_value,
      'Despesa Relatório ID': l.expense_report_id,
      'Despesa Relatório': l.expense_report_name,
      'Despesa Usuário': l.expense_user_name,
      'Duplicada ID': l.duplicate_expense_id,
      'Duplicada Valor': l.duplicate_value,
      'Duplicada Relatório ID': l.duplicate_report_id,
      'Duplicada Relatório': l.duplicate_report_name,
      'Duplicada Usuário': l.duplicate_user_name,
      'Marcado Por': l.dismissed_by,
      'Email': l.dismissed_by_email,
      'Nota': l.note,
      'É Duplicata': l.is_duplicate ? 'Sim' : 'Não',
      'Data': formatDate(l.dismissed_at),
    }));

    const wb = XLSX.utils.book_new();
    const wsConfirmed = XLSX.utils.json_to_sheet(buildRows(confirmed));
    const wsDismissed = XLSX.utils.json_to_sheet(buildRows(dismissed));
    XLSX.utils.book_append_sheet(wb, wsConfirmed, 'Confirmadas');
    XLSX.utils.book_append_sheet(wb, wsDismissed, 'Descartadas');
    XLSX.writeFile(wb, `logs_duplicadas_${new Date().toISOString().split('T')[0]}.xlsx`);
  }, []);

  const toggleStatus = useCallback(async (log: DismissLog) => {
    setTogglingId(log.id);
    try {
      const resp = await fetch('/api/aprovacao-dinamica/validation/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_id: log.expense_id,
          duplicate_expense_id: log.duplicate_expense_id,
          dismissed_by: log.dismissed_by,
          dismissed_by_email: log.dismissed_by_email,
          note: log.note,
          is_duplicate: !log.is_duplicate,
        }),
      });
      if (!resp.ok) throw new Error('Failed to toggle status');
      setLogs(prev => prev.map(l =>
        l.id === log.id ? { ...l, is_duplicate: !l.is_duplicate } : l
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setTogglingId(null);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, fetchLogs]);

  if (!open) return null;

  const confirmedLogs = logs.filter(l => l.is_duplicate);
  const dismissedLogs = logs.filter(l => !l.is_duplicate);
  const confirmedTotal = confirmedLogs.reduce((sum, l) => sum + (Number(l.expense_value) || 0), 0);
  const dismissedTotal = dismissedLogs.reduce((sum, l) => sum + (Number(l.expense_value) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Logs de Duplicadas</h2>
            {logs.length > 0 && (
              <Badge className="bg-blue-100 text-blue-700">{logs.length} registros</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <button
                onClick={() => exportToExcel(logs)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                <Download className="h-4 w-4" />
                Exportar Excel
              </button>
            )}
            <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden px-6 py-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-600">Carregando logs...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-600">{error}</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">Nenhum registro encontrado.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4" style={{ height: 'calc(90vh - 60px)' }}>
              {/* Confirmed as duplicates */}
              <div className="flex flex-col min-h-0">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-red-600" />
                    <h3 className="text-sm font-semibold text-red-800">
                      Confirmadas ({confirmedLogs.length})
                    </h3>
                  </div>
                  <span className="text-sm font-bold text-red-700">{formatCurrency(confirmedTotal)}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {confirmedLogs.length === 0 ? (
                    <p className="text-xs text-gray-400">Nenhum registro.</p>
                  ) : (
                    confirmedLogs.map(log => (
                      <LogCard key={log.id} log={log} onToggleStatus={toggleStatus} togglingId={togglingId} />
                    ))
                  )}
                </div>
              </div>

              {/* Dismissed as not duplicates */}
              <div className="flex flex-col min-h-0">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-green-600" />
                    <h3 className="text-sm font-semibold text-green-800">
                      Descartadas ({dismissedLogs.length})
                    </h3>
                  </div>
                  <span className="text-sm font-bold text-green-700">{formatCurrency(dismissedTotal)}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {dismissedLogs.length === 0 ? (
                    <p className="text-xs text-gray-400">Nenhum registro.</p>
                  ) : (
                    dismissedLogs.map(log => (
                      <LogCard key={log.id} log={log} onToggleStatus={toggleStatus} togglingId={togglingId} />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
