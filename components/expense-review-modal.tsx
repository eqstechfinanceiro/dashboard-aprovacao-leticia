'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Check,
  Clock,
  Ban,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ImageIcon,
  FileText,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  ExternalLink,
  SkipForward,
} from 'lucide-react';

export interface ReviewExpense {
  id: number;
  expense_id?: number;
  title: string;
  value: number;
  date: string;
  observation?: string | null;
  receipt_url?: string | null;
  expense_type?: { description?: string } | null;
  costs_center?: { name?: string } | null;
  payment_method?: { description?: string } | null;
}

export interface ReviewAudit {
  status: string;
  audited_by?: string | null;
  extracted_data: {
    valor_total: string | null;
    data: string | null;
    estabelecimento: string | null;
    categoria: string | null;
    cnpj: string | null;
    itens: string[] | null;
    forma_pagamento: string | null;
  } | null;
  divergences: string[];
  summary: string;
}

type Decision = 'APROVADO_HUMANO' | 'ANALISAR_DEPOIS' | 'REPROVADO_HUMANO';

interface ExpenseReviewModalProps {
  open: boolean;
  onClose: () => void;
  expenses: ReviewExpense[];
  startExpenseId: number;
  reportId: number;
  reportDescription: string;
  auditResults: Record<number, ReviewAudit>;
  reviewerName?: string;
  onDecision: (expenseId: number, decision: Decision) => void;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  APROVADO_BOT: { label: 'Aprovado pelo bot', className: 'bg-green-100 text-green-800 border-green-200' },
  APROVADO_HUMANO: { label: 'Aprovado (humano)', className: 'bg-green-100 text-green-800 border-green-200' },
  PENDENTE: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  ANALISAR_DEPOIS: { label: 'Analisar depois', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  REPROVADO: { label: 'Reprovado pelo bot', className: 'bg-red-100 text-red-800 border-red-200' },
  REPROVADO_HUMANO: { label: 'Reprovado (humano)', className: 'bg-red-100 text-red-800 border-red-200' },
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR');
}

export function ExpenseReviewModal({
  open,
  onClose,
  expenses,
  startExpenseId,
  reportId,
  reportDescription,
  auditResults,
  reviewerName = 'human',
  onDecision,
}: ExpenseReviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [paneSize, setPaneSize] = useState({ w: 0, h: 0 });
  const paneRef = useRef<HTMLDivElement>(null);
  const panStart = useRef({ x: 0, y: 0 });
  const savingRef = useRef(false);

  const expense = expenses[currentIndex] || null;
  const audit = expense ? auditResults[expense.id] || null : null;
  const receiptUrl = expense?.receipt_url || null;
  const isPdf = !!receiptUrl && (receiptUrl.toLowerCase().endsWith('.pdf') || receiptUrl.toLowerCase().includes('/pdfs/'));
  const proxyUrl = receiptUrl
    ? (/amazonaws|cloudfront/i.test(receiptUrl)
        ? receiptUrl
        : `/api/aprovacao-dinamica/receipt-proxy?url=${encodeURIComponent(receiptUrl)}`)
    : null;

  // Reset position when opened / when target expense changes
  useEffect(() => {
    if (!open) return;
    const idx = expenses.findIndex(e => e.id === startExpenseId);
    setCurrentIndex(idx >= 0 ? idx : 0);
  }, [open, startExpenseId, expenses]);

  // Reset zoom/pan on navigation
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setImageError(false);
  }, [currentIndex, receiptUrl]);

  // Measure image pane so rotated images can be constrained to the swapped dimension
  useEffect(() => {
    if (!open) return;
    const el = paneRef.current;
    if (!el) return;
    const update = () => setPaneSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= expenses.length) return;
    setCurrentIndex(idx);
  }, [expenses.length]);

  const handleDecision = useCallback(async (decision: Decision) => {
    if (!expense || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const res = await fetch('/api/aprovacao-dinamica/manual-review-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          expense_id: expense.id,
          decision,
          reviewer_name: reviewerName,
        }),
      });
      if (!res.ok) {
        console.error('Failed to save review decision');
      }
      onDecision(expense.id, decision);
      if (currentIndex < expenses.length - 1) {
        setCurrentIndex(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error saving decision:', err);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [expense, reportId, reviewerName, onDecision, currentIndex, expenses.length]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (savingRef.current) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); handleDecision('APROVADO_HUMANO'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); handleDecision('REPROVADO_HUMANO'); }
      else if (e.key === ' ') { e.preventDefault(); handleDecision('ANALISAR_DEPOIS'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); goTo(currentIndex + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); goTo(currentIndex - 1); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, handleDecision, goTo, currentIndex, onClose]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Preload next receipt
  useEffect(() => {
    if (!open) return;
    const next = expenses[currentIndex + 1];
    if (next?.receipt_url && !next.receipt_url.toLowerCase().endsWith('.pdf')) {
      const img = new Image();
      img.src = /amazonaws|cloudfront/i.test(next.receipt_url)
        ? next.receipt_url
        : `/api/aprovacao-dinamica/receipt-proxy?url=${encodeURIComponent(next.receipt_url)}`;
    }
  }, [open, currentIndex, expenses]);

  if (!open || !expense) return null;

  const statusInfo = audit ? STATUS_LABEL[audit.status] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex h-[88vh] w-[94vw] max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">Revisar despesa</h2>
            <Badge variant="outline" className="border-gray-300 text-gray-600">
              {currentIndex + 1} / {expenses.length}
            </Badge>
            <span className="max-w-md truncate text-sm text-gray-500">
              #{reportId} — {reportDescription}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0 || isSaving}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex >= expenses.length - 1 || isSaving}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-500">
              <X className="h-5 w-5" />
              Sair
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: receipt image with zoom */}
          <div
            ref={paneRef}
            className="relative flex flex-1 items-center justify-center overflow-hidden bg-gray-950 p-4"
            onMouseDown={e => {
              if (zoom > 1) {
                setIsPanning(true);
                panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
              }
            }}
            onMouseMove={e => {
              if (isPanning && zoom > 1) {
                setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
              }
            }}
            onMouseUp={() => setIsPanning(false)}
            onMouseLeave={() => setIsPanning(false)}
            onWheel={e => {
              if (proxyUrl && !isPdf) {
                setZoom(z => Math.max(1, Math.min(4, z + (e.deltaY < 0 ? 0.25 : -0.25))));
                if (zoom <= 1) setPan({ x: 0, y: 0 });
              }
            }}
          >
            {!proxyUrl && (
              <div className="flex flex-col items-center gap-3">
                <FileText className="h-16 w-16 text-gray-700" />
                <span className="text-sm text-gray-500">Sem comprovante disponível</span>
              </div>
            )}
            {proxyUrl && imageError && (
              <div className="flex flex-col items-center gap-3">
                <ImageIcon className="h-16 w-16 text-gray-700" />
                <span className="text-sm text-gray-500">Erro ao carregar imagem</span>
              </div>
            )}
            {proxyUrl && !imageError && isPdf && (
              <iframe
                key={proxyUrl}
                src={proxyUrl}
                title="Comprovante PDF"
                className="h-full w-full rounded-lg shadow-2xl"
              />
            )}
            {proxyUrl && !imageError && !isPdf && (
              <img
                key={proxyUrl}
                src={proxyUrl}
                alt="Comprovante"
                className="rounded-lg object-contain shadow-2xl"
                draggable={false}
                onError={() => setImageError(true)}
                style={{
                  maxWidth: rotation % 180 !== 0 && paneSize.h > 0 ? paneSize.h - 32 : '100%',
                  maxHeight: rotation % 180 !== 0 && paneSize.w > 0 ? paneSize.w - 32 : '100%',
                  transform: `rotate(${rotation}deg) scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                  transition: isPanning ? 'none' : 'transform 0.15s',
                }}
              />
            )}

            {/* Zoom controls */}
            {proxyUrl && !imageError && !isPdf && (
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/90 px-2 py-1 shadow-lg backdrop-blur">
                <button
                  onClick={() => { setZoom(z => Math.max(1, z - 0.5)); setPan({ x: 0, y: 0 }); }}
                  disabled={zoom <= 1}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-30"
                  title="Reduzir zoom"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[3rem] text-center text-xs text-gray-300">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom(z => Math.min(4, z + 0.5))}
                  disabled={zoom >= 4}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-30"
                  title="Aumentar zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
                  title="Girar 90°"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setRotation(0); }}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
                  title="Resetar zoom e rotação"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                {receiptUrl && (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
                    title="Abrir em nova aba"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Right: expense details + actions */}
          <div className="flex w-[380px] flex-shrink-0 flex-col border-l border-gray-200">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* Expense info */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-gray-900">
                    {expense.title || `Despesa #${expense.id}`}
                  </h3>
                  {statusInfo && (
                    <Badge variant="outline" className={statusInfo.className}>
                      {statusInfo.label}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(expense.value)}</p>
                <p className="text-sm text-gray-500">{formatDate(expense.date)}</p>
              </div>

              <div className="space-y-1.5 text-sm">
                {expense.expense_type?.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tipo</span>
                    <span className="font-medium text-gray-800">{expense.expense_type.description}</span>
                  </div>
                )}
                {expense.costs_center?.name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Centro de custo</span>
                    <span className="font-medium text-gray-800">{expense.costs_center.name}</span>
                  </div>
                )}
                {expense.payment_method?.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pagamento</span>
                    <span className="font-medium text-gray-800">{expense.payment_method.description}</span>
                  </div>
                )}
              </div>

              {expense.observation && (
                <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                  <p className="mb-1 text-xs font-medium uppercase text-gray-400">Observação</p>
                  {expense.observation}
                </div>
              )}

              {/* Audit info */}
              {audit && (
                <div className="space-y-3 border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium uppercase text-gray-400">
                    Auditoria {audit.audited_by ? `· ${audit.audited_by}` : ''}
                  </p>
                  {audit.extracted_data && (
                    <div className="space-y-1.5 text-sm">
                      {audit.extracted_data.estabelecimento && (
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-500">Estabelecimento</span>
                          <span className="text-right font-medium text-gray-800">{audit.extracted_data.estabelecimento}</span>
                        </div>
                      )}
                      {audit.extracted_data.valor_total && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Valor extraído</span>
                          <span className="font-medium text-gray-800">{audit.extracted_data.valor_total}</span>
                        </div>
                      )}
                      {audit.extracted_data.data && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Data extraída</span>
                          <span className="font-medium text-gray-800">{audit.extracted_data.data}</span>
                        </div>
                      )}
                      {audit.extracted_data.cnpj && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">CNPJ</span>
                          <span className="font-medium text-gray-800">{audit.extracted_data.cnpj}</span>
                        </div>
                      )}
                      {audit.extracted_data.categoria && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Categoria</span>
                          <span className="font-medium text-gray-800">{audit.extracted_data.categoria}</span>
                        </div>
                      )}
                      {audit.extracted_data.itens && audit.extracted_data.itens.length > 0 && (
                        <p className="pt-1 text-xs text-blue-700">
                          Itens: {audit.extracted_data.itens.join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                  {audit.divergences && audit.divergences.length > 0 && (
                    <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
                      <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase text-orange-600">
                        <AlertTriangle className="h-3 w-3" /> Divergências
                      </p>
                      <ul className="list-inside list-disc space-y-0.5 text-xs text-orange-800">
                        {audit.divergences.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    </div>
                  )}
                  {audit.summary && (
                    <p className="text-xs italic text-gray-500">{audit.summary}</p>
                  )}
                </div>
              )}
              {!audit && (
                <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                  Esta despesa ainda não foi auditada pelo bot.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="border-t border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between text-[11px] text-gray-400">
                <span>→ aprovar · ← reprovar · espaço depois · ↑↓ navegar</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDecision('REPROVADO_HUMANO')}
                  disabled={isSaving}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                  Reprovar
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDecision('APROVADO_HUMANO')}
                  disabled={isSaving}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Aprovar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDecision('ANALISAR_DEPOIS')}
                  disabled={isSaving}
                  className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                >
                  <Clock className="h-4 w-4" />
                  Analisar depois
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goTo(currentIndex + 1)}
                  disabled={isSaving || currentIndex >= expenses.length - 1}
                >
                  <SkipForward className="h-4 w-4" />
                  Pular
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
