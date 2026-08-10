'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, FileText, ExternalLink, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ComparisonExpense {
  expense_id: number;
  title: string;
  value: number;
  date: string;
  observation: string | null;
  receipt_url: string | null;
  expense_type: string | null;
  costs_center: string | null;
  report_name: string;
  report_id: number;
  user_name: string;
  match_fields: string[];
  same_report: boolean;
}

interface DuplicateComparisonModalProps {
  open: boolean;
  onClose: () => void;
  originalExpense: ComparisonExpense | null;
  duplicateExpenses: ComparisonExpense[];
  onDismiss?: (originalExpenseId: number, duplicateExpenseId: number, isDuplicate: boolean) => Promise<void> | void;
  dismissedBy?: string;
}

function ReceiptViewer({ url, label }: { url: string | null; label: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [url]);

  if (!url) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
        <div className="text-center">
          <FileText className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">Sem comprovante</p>
        </div>
      </div>
    );
  }

  const isPdf = url.toLowerCase().includes('.pdf') || url.includes('/pdfs/');
  const isImage = /\.(jpg|jpeg|png|gif|bmp|webp|svg|tiff|heic|heif)$/i.test(url);

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-gray-50">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="mt-2 text-xs text-gray-500">Carregando {label}...</p>
          </div>
        </div>
      )}
      {error ? (
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-red-300 bg-red-50">
          <div className="text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
            <p className="mt-2 text-sm text-red-600">Erro ao carregar</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Abrir em nova aba <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      ) : isPdf ? (
        <iframe
          src={url}
          title={label}
          className="h-96 w-full rounded-lg border border-gray-200"
          onLoad={() => setLoading(false)}
          onError={() => { setError(true); setLoading(false); }}
        />
      ) : isImage ? (
        <img
          src={url}
          alt={label}
          className="max-h-96 w-full rounded-lg border border-gray-200 object-contain"
          onLoad={() => setLoading(false)}
          onError={() => { setError(true); setLoading(false); }}
        />
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
          <div className="text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">Formato não suportado</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Abrir em nova aba <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
      {url && !error && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-white"
        >
          <ExternalLink className="inline h-3 w-3" /> Abrir
        </a>
      )}
    </div>
  );
}

function ExpenseDetail({ expense, label, highlight }: {
  expense: ComparisonExpense;
  label: string;
  highlight?: boolean;
}) {
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const formatDate = (d: string) => {
    if (!d) return '-';
    let normalized = d.includes('T') ? d : d.replace(' ', 'T');
    if (normalized.length === 10) normalized += 'T00:00:00';
    const date = new Date(normalized);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className={`flex-1 rounded-lg border p-4 ${highlight ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-xs font-semibold ${highlight ? 'text-blue-700' : 'text-gray-600'}`}>{label}</span>
        <span className="text-xs text-gray-400">#{expense.expense_id}</span>
      </div>

      <ReceiptViewer url={expense.receipt_url} label={label} />

      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Título</span>
          <span className="font-medium text-gray-900 text-right">{expense.title}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Valor</span>
          <span className="font-semibold text-gray-900">{formatCurrency(expense.value)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Data</span>
          <span className="text-gray-900">{formatDate(expense.date)}</span>
        </div>
        {expense.expense_type && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tipo</span>
            <span className="text-gray-900">{expense.expense_type}</span>
          </div>
        )}
        {expense.costs_center && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Centro de custo</span>
            <span className="text-gray-900 text-right">{expense.costs_center}</span>
          </div>
        )}
        {expense.observation && (
          <div className="pt-1">
            <span className="text-sm text-gray-500">Observação</span>
            <p className="mt-0.5 text-sm text-gray-700 italic">{expense.observation}</p>
          </div>
        )}
        <div className="flex justify-between text-xs pt-1 border-t border-gray-100">
          <span className="text-gray-400">Relatório</span>
          <span className="text-gray-600">{expense.report_name} (#{expense.report_id})</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Usuário</span>
          <span className="text-gray-600">{expense.user_name}</span>
        </div>
      </div>
    </div>
  );
}

export function DuplicateComparisonModal({
  open,
  onClose,
  originalExpense,
  duplicateExpenses,
  onDismiss,
  dismissedBy,
}: DuplicateComparisonModalProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [dismissedSet, setDismissedSet] = useState<Set<number>>(new Set());
  const [receiptFallbacks, setReceiptFallbacks] = useState<Record<number, string>>({});

  useEffect(() => {
    if (open) {
      setCurrentIdx(0);
      setDismissedSet(new Set());
      setReceiptFallbacks({});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const missing = duplicateExpenses.filter(d => !d.receipt_url && !receiptFallbacks[d.expense_id]);
    if (missing.length === 0) return;
    const reportIds = [...new Set(missing.map(d => d.report_id))];
    let cancelled = false;
    (async () => {
      const results: Record<number, string> = {};
      for (const rid of reportIds) {
        try {
          const resp = await fetch(`/api/aprovacao-dinamica/report/${rid}/expenses`);
          if (!resp.ok) continue;
          const json = await resp.json();
          const expenses = json?.data?.expenses || [];
          for (const dup of missing) {
            if (dup.report_id !== rid) continue;
            const dupDate = dup.date ? dup.date.split('T')[0] : '';
            const dupObs = dup.observation || '';
            const origReceipt = originalExpense?.receipt_url;
            const match = expenses.find(e => {
              if (Number(e.value) !== Number(dup.value)) return false;
              if (e.title !== dup.title) return false;
              if (!e.receipt_url) return false;
              if (origReceipt && e.receipt_url === origReceipt) return false;
              const expDate = e.date ? e.date.split(' ')[0] : '';
              if (dupDate && expDate && expDate !== dupDate) return false;
              if (dupObs && e.observation && e.observation !== dupObs) return false;
              return true;
            });
            if (match) {
              results[dup.expense_id] = match.receipt_url;
            }
          }
        } catch {}
      }
      if (!cancelled && Object.keys(results).length > 0) {
        setReceiptFallbacks(prev => ({ ...prev, ...results }));
      }
    })();
    return () => { cancelled = true; };
  }, [open, duplicateExpenses, originalExpense]);

  if (!open || !originalExpense) return null;

  const currentDup = duplicateExpenses[currentIdx];
  const hasMultiple = duplicateExpenses.length > 1;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">Comparação de Possível Duplicata</h2>
            {hasMultiple && (
              <Badge className="bg-blue-100 text-blue-700">
                {currentIdx + 1} de {duplicateExpenses.length}
              </Badge>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Match info bar */}
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-6 py-2">
          <span className="text-xs text-gray-500">Campos coincidentes:</span>
          {currentDup.match_fields.map(field => (
            <Badge key={field} className="bg-amber-100 text-amber-700 text-xs">
              {field}
            </Badge>
          ))}
          {currentDup.same_report ? (
            <Badge className="bg-purple-100 text-purple-700 text-xs">Mesmo relatório</Badge>
          ) : (
            <Badge className="bg-blue-100 text-blue-700 text-xs">Relatórios diferentes</Badge>
          )}
        </div>

        {/* Side-by-side comparison */}
        <div className="flex-1 overflow-auto p-6">
          <div className="flex gap-4">
            <ExpenseDetail
              expense={originalExpense}
              label="Despesa Original"
              highlight
            />
            <ExpenseDetail
              expense={{ ...currentDup, receipt_url: currentDup.receipt_url || receiptFallbacks[currentDup.expense_id] || null }}
              label={`Duplicata Suspeita ${hasMultiple ? `(${currentIdx + 1}/${duplicateExpenses.length})` : ''}`}
            />
          </div>

          {/* Value comparison summary */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500">Original</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(originalExpense.value)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Duplicata</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(currentDup.value)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Diferença</p>
                <p className={`text-lg font-semibold ${originalExpense.value === currentDup.value ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatCurrency(Math.abs(originalExpense.value - currentDup.value))}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with decision buttons and navigation */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
          <div className="text-sm text-gray-500">
            Compare os comprovantes e dados das despesas lado a lado.
          </div>
          <div className="flex items-center gap-2">
            {onDismiss && (
              <>
                {dismissedSet.has(currentIdx) ? (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Decisão registrada
                  </span>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-green-300 text-green-700 hover:bg-green-100"
                      disabled={dismissing}
                      onClick={async () => {
                        if (!originalExpense) return;
                        setDismissing(true);
                        try {
                          await onDismiss(originalExpense.expense_id, currentDup.expense_id, true);
                          setDismissedSet(prev => new Set(prev).add(currentIdx));
                        } finally {
                          setDismissing(false);
                        }
                      }}
                    >
                      {dismissing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      É duplicata
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-blue-300 text-blue-700 hover:bg-blue-100"
                      disabled={dismissing}
                      onClick={async () => {
                        if (!originalExpense) return;
                        setDismissing(true);
                        try {
                          await onDismiss(originalExpense.expense_id, currentDup.expense_id, false);
                          setDismissedSet(prev => new Set(prev).add(currentIdx));
                        } finally {
                          setDismissing(false);
                        }
                      }}
                    >
                      {dismissing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Não é duplicata
                    </Button>
                  </>
                )}
              </>
            )}
            {hasMultiple && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIdx(i => Math.min(duplicateExpenses.length - 1, i + 1))}
                  disabled={currentIdx === duplicateExpenses.length - 1}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
