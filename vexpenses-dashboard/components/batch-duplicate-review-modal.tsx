'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, FileText, ExternalLink, AlertCircle, CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight, SkipForward, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ComparisonExpense } from './duplicate-comparison-modal';

interface BatchDuplicatePair {
  original: ComparisonExpense;
  duplicate: ComparisonExpense;
}

interface BatchDuplicateReviewModalProps {
  open: boolean;
  onClose: () => void;
  onDismiss: (originalExpenseId: number, duplicateExpenseId: number, isDuplicate: boolean) => Promise<void> | void;
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
      <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
        <div className="text-center">
          <FileText className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-1 text-xs text-gray-500">Sem comprovante</p>
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
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      )}
      {error ? (
        <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-red-300 bg-red-50">
          <div className="text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
            <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              Abrir <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      ) : isPdf ? (
        <iframe src={url} title={label} className="h-64 w-full rounded-lg border border-gray-200" onLoad={() => setLoading(false)} onError={() => { setError(true); setLoading(false); }} />
      ) : isImage ? (
        <img src={url} alt={label} className="max-h-64 w-full rounded-lg border border-gray-200 object-contain" onLoad={() => setLoading(false)} onError={() => { setError(true); setLoading(false); }} />
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            Abrir <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
      {url && !error && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-white">
          <ExternalLink className="inline h-3 w-3" /> Abrir
        </a>
      )}
    </div>
  );
}

function formatDate(d: string) {
  if (!d) return '-';
  let normalized = d.includes('T') ? d : d.replace(' ', 'T');
  if (normalized.length === 10) normalized += 'T00:00:00';
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function MiniExpenseDetail({ expense, label, highlight }: { expense: ComparisonExpense; label: string; highlight?: boolean }) {
  return (
    <div className={`flex-1 rounded-lg border p-3 ${highlight ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-semibold ${highlight ? 'text-blue-700' : 'text-gray-600'}`}>{label}</span>
        <span className="text-xs text-gray-400">#{expense.expense_id}</span>
      </div>
      <ReceiptViewer url={expense.receipt_url} label={label} />
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Título</span>
          <span className="font-medium text-gray-900 text-right">{expense.title}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Valor</span>
          <span className="font-semibold text-gray-900">{formatCurrency(expense.value)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Data</span>
          <span className="text-gray-900">{formatDate(expense.date)}</span>
        </div>
        {expense.observation && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Obs.</span>
            <span className="text-gray-900 text-right max-w-[60%] truncate">{expense.observation}</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Relatório</span>
          <span className="text-gray-900 text-right">{expense.report_name} (#{expense.report_id})</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Usuário</span>
          <span className="text-gray-900 text-right">{expense.user_name}</span>
        </div>
      </div>
    </div>
  );
}

export function BatchDuplicateReviewModal({ open, onClose, onDismiss }: BatchDuplicateReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [pairs, setPairs] = useState<BatchDuplicatePair[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [decidedSet, setDecidedSet] = useState<Set<number>>(new Set());
  const [skippedSet, setSkippedSet] = useState<Set<number>>(new Set());
  const [receiptFallbacks, setReceiptFallbacks] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Load all pairs when modal opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setPairs([]);
    setCurrentIdx(0);
    setDecidedSet(new Set());
    setSkippedSet(new Set());
    setReceiptFallbacks({});

    (async () => {
      try {
        const resp = await fetch('/api/aprovacao-dinamica/batch-duplicates');
        if (!resp.ok) throw new Error('Failed to fetch duplicates');
        const json = await resp.json();
        const fetchedPairs: BatchDuplicatePair[] = (json?.data?.pairs || []).map((p: any) => ({
          original: { ...p.original, match_fields: p.duplicate?.match_fields || [], same_report: p.duplicate?.same_report || false } as ComparisonExpense,
          duplicate: { ...p.duplicate, match_fields: p.duplicate?.match_fields || [], same_report: p.duplicate?.same_report || false } as ComparisonExpense,
        }));
        setPairs(fetchedPairs);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  // Fetch receipt fallbacks for current pair
  useEffect(() => {
    if (!open || pairs.length === 0) return;
    const pair = pairs[currentIdx];
    if (!pair) return;
    const missing: ComparisonExpense[] = [];
    if (!pair.original.receipt_url && !receiptFallbacks[pair.original.expense_id]) missing.push(pair.original);
    if (!pair.duplicate.receipt_url && !receiptFallbacks[pair.duplicate.expense_id]) missing.push(pair.duplicate);
    if (missing.length === 0) return;

    const reportIds = [...new Set(missing.map(e => e.report_id))];
    let cancelled = false;
    (async () => {
      const results: Record<number, string> = {};
      for (const rid of reportIds) {
        try {
          const resp = await fetch(`/api/aprovacao-dinamica/report/${rid}/expenses`);
          if (!resp.ok) continue;
          const json = await resp.json();
          const expenses = json?.data?.expenses || [];
          for (const exp of missing) {
            if (exp.report_id !== rid) continue;
            const expDate = exp.date ? exp.date.split('T')[0] : '';
            const match = expenses.find((e: any) => {
              if (Number(e.value) !== Number(exp.value)) return false;
              if (e.title !== exp.title) return false;
              if (!e.receipt_url) return false;
              const eDate = e.date ? e.date.split(' ')[0] : '';
              if (expDate && eDate && eDate !== expDate) return false;
              return true;
            });
            if (match) results[exp.expense_id] = match.receipt_url;
          }
        } catch {}
      }
      if (!cancelled && Object.keys(results).length > 0) {
        setReceiptFallbacks(prev => ({ ...prev, ...results }));
      }
    })();
    return () => { cancelled = true; };
  }, [open, currentIdx, pairs]);

  const handleDecision = useCallback(async (isDuplicate: boolean) => {
    const pair = pairs[currentIdx];
    if (!pair || decidedSet.has(currentIdx)) return;
    // Fire the dismiss (non-blocking in batch mode)
    onDismiss(pair.original.expense_id, pair.duplicate.expense_id, isDuplicate);
    setDecidedSet(prev => new Set(prev).add(currentIdx));
    // Auto-advance after decision
    if (currentIdx < pairs.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
  }, [pairs, currentIdx, decidedSet, onDismiss]);

  const handleSkip = useCallback(() => {
    if (currentIdx < pairs.length - 1) {
      setSkippedSet(prev => new Set(prev).add(currentIdx));
      setCurrentIdx(currentIdx + 1);
    }
  }, [currentIdx, pairs.length]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || loading || pairs.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentIdx < pairs.length - 1) setCurrentIdx(currentIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (!decidedSet.has(currentIdx)) handleDecision(true);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (!decidedSet.has(currentIdx)) handleDecision(false);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSkip();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, loading, pairs, currentIdx, decidedSet, handleDecision, handleSkip, onClose]);

  if (!open) return null;

  const decidedCount = decidedSet.size;
  const skippedCount = skippedSet.size;
  const remaining = pairs.length - decidedCount - skippedCount;
  const currentPair = pairs[currentIdx];
  const isDecided = decidedSet.has(currentIdx);
  const isSkipped = skippedSet.has(currentIdx);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">Revisão em Lote de Duplicatas</h2>
            {pairs.length > 0 && (
              <Badge className="bg-blue-100 text-blue-700">
                {currentIdx + 1} / {pairs.length}
              </Badge>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar */}
        {pairs.length > 0 && (
          <div className="border-b border-gray-100 bg-gray-50 px-6 py-2">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Decididas: <strong className="text-green-600">{decidedCount}</strong> | Puladas: <strong className="text-gray-500">{skippedCount}</strong> | Restantes: <strong className="text-orange-600">{remaining}</strong></span>
              <span>{Math.round((decidedCount / pairs.length) * 100)}% concluído</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${(decidedCount / pairs.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-500" />
                <p className="mt-2 text-sm text-gray-500">Carregando todas as duplicatas...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
                <p className="mt-2 text-sm text-red-600">{error}</p>
              </div>
            </div>
          ) : pairs.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <CheckCircle className="mx-auto h-10 w-10 text-green-400" />
                <p className="mt-2 text-sm text-gray-600">Nenhuma duplicata pendente encontrada!</p>
              </div>
            </div>
          ) : currentPair ? (
            <>
              {/* Match info bar */}
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-500">Campos:</span>
                {currentPair.duplicate.match_fields.map(field => (
                  <Badge key={field} className="bg-amber-100 text-amber-700 text-xs">{field}</Badge>
                ))}
                {currentPair.duplicate.same_report ? (
                  <Badge className="bg-purple-100 text-purple-700 text-xs">Mesmo relatório</Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">Relatórios diferentes</Badge>
                )}
                {isDecided && (
                  <Badge className="bg-green-100 text-green-700 text-xs">Decidida</Badge>
                )}
                {isSkipped && (
                  <Badge className="bg-gray-100 text-gray-500 text-xs">Pulada</Badge>
                )}
              </div>

              {/* Side-by-side comparison */}
              <div className="flex gap-3">
                <MiniExpenseDetail
                  expense={currentPair.original}
                  label="Original"
                  highlight
                />
                <MiniExpenseDetail
                  expense={{
                    ...currentPair.duplicate,
                    receipt_url: currentPair.duplicate.receipt_url || receiptFallbacks[currentPair.duplicate.expense_id] || null,
                  }}
                  label="Duplicata"
                />
              </div>

              {/* Value comparison */}
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-500">Original</p>
                    <p className="text-base font-semibold text-gray-900">{formatCurrency(currentPair.original.value)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Duplicata</p>
                    <p className="text-base font-semibold text-gray-900">{formatCurrency(currentPair.duplicate.value)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Diferença</p>
                    <p className={`text-base font-semibold ${currentPair.original.value === currentPair.duplicate.value ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(Math.abs(currentPair.original.value - currentPair.duplicate.value))}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer with decision buttons and navigation */}
        {!loading && pairs.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
            <div className="text-xs text-gray-400 hidden sm:block">
              Atalhos: <kbd className="px-1 bg-gray-100 rounded">D</kbd> = duplicata | <kbd className="px-1 bg-gray-100 rounded">N</kbd> = não | <kbd className="px-1 bg-gray-100 rounded">S</kbd> = pular | <kbd className="px-1 bg-gray-100 rounded">←→</kbd> = navegar
            </div>
            <div className="flex items-center gap-2">
              {isDecided ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Decidida
                </span>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-green-300 text-green-700 hover:bg-green-100"
                    onClick={() => handleDecision(true)}
                  >
                    <CheckCircle className="h-4 w-4" />
                    É duplicata
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-700 hover:bg-blue-100"
                    onClick={() => handleDecision(false)}
                  >
                    <XCircle className="h-4 w-4" />
                    Não é duplicata
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-600 hover:bg-gray-100"
                    onClick={handleSkip}
                    disabled={currentIdx >= pairs.length - 1}
                  >
                    <SkipForward className="h-4 w-4" />
                    Pular
                  </Button>
                </>
              )}
              <div className="mx-1 h-6 w-px bg-gray-200" />
              <Button variant="outline" size="sm" onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentIdx(i => Math.min(pairs.length - 1, i + 1))} disabled={currentIdx >= pairs.length - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
