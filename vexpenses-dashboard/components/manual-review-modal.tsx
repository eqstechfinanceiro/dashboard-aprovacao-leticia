'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Check,
  Clock,
  Ban,
  ChevronRight,
  ChevronLeft,
  Loader2,
  ImageIcon,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Space,
} from 'lucide-react';

export interface ManualReviewItem {
  report_id: number;
  expense_id: number;
  status: string;
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
  rules_triggered: { rule: string; reason: string; confidence: number }[];
  summary: string;
  audited_by: string | null;
}

interface ManualReviewModalProps {
  open: boolean;
  onClose: () => void;
  items: ManualReviewItem[];
  reviewerName?: string;
  onReviewComplete: (reportId: number, expenseId: number, decision: string) => void;
}

type Decision = 'APROVADO_HUMANO' | 'ANALISAR_DEPOIS' | 'REPROVADO_HUMANO';

const DECISION_CONFIG: Record<Decision, {
  label: string;
  icon: typeof Check;
  color: string;
  bgColor: string;
  borderColor: string;
  hoverColor: string;
}> = {
  APROVADO_HUMANO: {
    label: 'Aprovar',
    icon: Check,
    color: 'text-green-600',
    bgColor: 'bg-green-500',
    borderColor: 'border-green-500',
    hoverColor: 'hover:bg-green-600',
  },
  ANALISAR_DEPOIS: {
    label: 'Analisar Depois',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500',
    borderColor: 'border-yellow-500',
    hoverColor: 'hover:bg-yellow-600',
  },
  REPROVADO_HUMANO: {
    label: 'Reprovar',
    icon: Ban,
    color: 'text-red-600',
    bgColor: 'bg-red-500',
    borderColor: 'border-red-500',
    hoverColor: 'hover:bg-red-600',
  },
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

export function ManualReviewModal({
  open,
  onClose,
  items,
  reviewerName = 'human',
  onReviewComplete,
}: ManualReviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDir, setAnimationDir] = useState<'left' | 'right' | 'down'>('down');
  const [reviewedCount, setReviewedCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [expenseDetails, setExpenseDetails] = useState<{
    title: string;
    value: number;
    date: string;
    observation: string;
    receipt_url: string;
    expense_type: string;
    costs_center: string;
    report_description: string;
    user_name: string;
  } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const savingRef = useRef(false);

  const currentItem = items[currentIndex];
  const isFinished = currentIndex >= items.length;

  const fetchExpenseDetails = useCallback(async (reportId: number, expenseId: number) => {
    setDetailsLoading(true);
    setExpenseDetails(null);
    try {
      const res = await fetch(`/api/aprovacao-dinamica/report/${reportId}/expenses`);
      if (!res.ok) return;
      const data = await res.json();
      const expense = data.data.expenses?.find((e: any) => e.id === expenseId);
      if (expense) {
        setExpenseDetails({
          title: expense.title || '',
          value: expense.value,
          date: expense.date,
          observation: expense.observation || '',
          receipt_url: expense.receipt_url || '',
          expense_type: expense.expense_type?.description || '',
          costs_center: expense.costs_center?.name || '',
          report_description: data.data.description || '',
          user_name: '',
        });
        if (expense.receipt_url) {
          setImageLoading(true);
          setImageError(false);
          setImageUrl(expense.receipt_url);
        } else {
          setImageUrl(null);
        }
      }
    } catch (err) {
      console.error('Error fetching expense details:', err);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && currentItem && !isFinished) {
      fetchExpenseDetails(currentItem.report_id, currentItem.expense_id);
    }
  }, [open, currentItem, isFinished, fetchExpenseDetails]);

  const handleDecision = useCallback(async (decision: Decision) => {
    if (!currentItem || isSaving || savingRef.current || isAnimating) return;

    savingRef.current = true;
    setIsSaving(true);

    try {
      const res = await fetch('/api/aprovacao-dinamica/manual-review-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: currentItem.report_id,
          expense_id: currentItem.expense_id,
          decision,
          reviewer_name: reviewerName,
        }),
      });

      if (!res.ok) {
        console.error('Failed to save review decision');
      }

      onReviewComplete(currentItem.report_id, currentItem.expense_id, decision);
      setReviewedCount(prev => prev + 1);

      const dir = decision === 'APROVADO_HUMANO' ? 'right' : decision === 'REPROVADO_HUMANO' ? 'left' : 'down';
      setAnimationDir(dir);
      setIsAnimating(true);

      setTimeout(() => {
        setIsAnimating(false);
        setCurrentIndex(prev => prev + 1);
        setImageUrl(null);
        setImageError(false);
        savingRef.current = false;
        setIsSaving(false);
      }, 400);
    } catch (err) {
      console.error('Error saving decision:', err);
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [currentItem, isSaving, isAnimating, reviewerName, onReviewComplete]);

  const handleClose = useCallback(() => {
    setCurrentIndex(0);
    setReviewedCount(0);
    setImageUrl(null);
    setImageError(false);
    setExpenseDetails(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (isSaving || isAnimating || isFinished) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleDecision('APROVADO_HUMANO');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleDecision('REPROVADO_HUMANO');
      } else if (e.key === ' ') {
        e.preventDefault();
        handleDecision('ANALISAR_DEPOIS');
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, isSaving, isAnimating, isFinished, handleDecision, handleClose]);

  if (!open) return null;

  const progress = items.length > 0 ? ((currentIndex) / items.length) * 100 : 0;
  const remaining = items.length - currentIndex;

  const animationClass = isAnimating
    ? animationDir === 'right'
      ? 'translate-x-full opacity-0 transition-all duration-300'
      : animationDir === 'left'
        ? '-translate-x-full opacity-0 transition-all duration-300'
        : 'translate-y-full opacity-0 transition-all duration-300'
    : 'translate-x-0 translate-y-0 opacity-100 transition-all duration-300';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/95 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-700 px-6 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            Revisão Manual
          </h2>
          <Badge variant="outline" className="border-gray-600 text-gray-300">
            {isFinished ? `${reviewedCount} revisadas` : `${currentIndex + 1} / ${items.length}`}
          </Badge>
          {!isFinished && (
            <span className="text-sm text-gray-400">
              {remaining} restante{remaining !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isFinished && (
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-gray-300">
                  <ArrowRight className="inline h-3 w-3" />
                </kbd>
                Aprovar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-gray-300">
                  <Space className="inline h-3 w-3" />
                </kbd>
                Depois
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-gray-300">
                  <ArrowLeft className="inline h-3 w-3" />
                </kbd>
                Reprovar
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
            Fechar
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {!isFinished && items.length > 0 && (
        <div className="h-1 w-full bg-gray-800">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Main content */}
      {isFinished ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle className="h-10 w-10 text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Revisão Concluída!</h3>
            <p className="text-gray-400">
              Você revisou {reviewedCount} despesa{reviewedCount !== 1 ? 's' : ''} no total.
            </p>
            <Button onClick={handleClose} className="mt-4">
              Concluir
            </Button>
          </div>
        </div>
      ) : !currentItem ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Receipt image */}
          <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-950 p-6">
            {imageLoading && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                <span className="text-sm text-gray-500">Carregando comprovante...</span>
              </div>
            )}
            {!imageLoading && !imageUrl && (
              <div className="flex flex-col items-center gap-3">
                <FileText className="h-16 w-16 text-gray-700" />
                <span className="text-sm text-gray-500">Sem comprovante disponível</span>
              </div>
            )}
            {imageUrl && imageError && (
              <div className="flex flex-col items-center gap-3">
                <ImageIcon className="h-16 w-16 text-gray-700" />
                <span className="text-sm text-gray-500">Erro ao carregar imagem</span>
              </div>
            )}
            {imageUrl && !imageError && (
              <img
                src={imageUrl}
                alt="Comprovante"
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
                style={{ display: imageLoading ? 'none' : 'block' }}
              />
            )}
          </div>

          {/* Right: Details + Actions */}
          <div className="flex w-[480px] flex-col border-l border-gray-700 bg-gray-900">
            <div className={`flex-1 overflow-y-auto p-6 ${animationClass}`}>
              {/* Report info */}
              <div className="mb-4 flex items-center gap-2">
                <Badge variant="outline" className="border-gray-600 text-gray-300">
                  Report #{currentItem.report_id}
                </Badge>
                <Badge variant="outline" className="border-gray-600 text-gray-300">
                  Despesa #{currentItem.expense_id}
                </Badge>
              </div>

              {/* Status badge */}
              <div className="mb-4">
                <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
                  currentItem.status === 'REPROVADO'
                    ? 'border-red-500/50 bg-red-500/10 text-red-400'
                    : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                }`}>
                  {currentItem.status === 'REPROVADO' ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {currentItem.status === 'REPROVADO' ? 'Bot Reprovou' : 'Bot Encaminhou'}
                </div>
              </div>

              {/* Expense details from API */}
              {detailsLoading && (
                <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando detalhes...
                </div>
              )}

              {expenseDetails && (
                <div className="mb-4 space-y-3 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Título</p>
                    <p className="text-sm font-medium text-white">
                      {expenseDetails.title || `Despesa #${currentItem.expense_id}`}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
                      <p className="text-sm font-semibold text-white">
                        {formatCurrency(expenseDetails.value)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Data</p>
                      <p className="text-sm text-white">{formatDate(expenseDetails.date)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {expenseDetails.expense_type && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Tipo</p>
                        <p className="text-sm text-white">{expenseDetails.expense_type}</p>
                      </div>
                    )}
                    {expenseDetails.costs_center && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Centro de Custo</p>
                        <p className="text-sm text-white">{expenseDetails.costs_center}</p>
                      </div>
                    )}
                  </div>

                  {expenseDetails.observation && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Observação</p>
                      <p className="text-sm text-gray-300">{expenseDetails.observation}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Bot summary */}
              <div className={`mb-4 rounded-lg border p-4 ${
                currentItem.status === 'REPROVADO'
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-yellow-500/30 bg-yellow-500/5'
              }`}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Motivo do Bot
                </p>
                <p className="text-sm text-gray-200">{currentItem.summary}</p>
              </div>

              {/* Divergences */}
              {currentItem.divergences && currentItem.divergences.length > 0 && (
                <div className="mb-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-400">
                    Divergências Detectadas
                  </p>
                  <ul className="space-y-1.5">
                    {currentItem.divergences.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-orange-200">
                        <span className="mt-0.5 text-orange-400">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Rules triggered */}
              {currentItem.rules_triggered && currentItem.rules_triggered.length > 0 && (
                <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Regras Acionadas
                  </p>
                  <div className="space-y-2">
                    {currentItem.rules_triggered.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                          {r.rule}
                        </Badge>
                        <span className="flex-1 text-sm text-gray-300">{r.reason}</span>
                        <span className="text-xs text-gray-500">{r.confidence}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted data */}
              {currentItem.extracted_data && (
                <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-400">
                    Dados Extraídos pelo OCR
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {currentItem.extracted_data.valor_total && (
                      <div>
                        <span className="text-gray-500">Valor: </span>
                        <span className="text-white">{currentItem.extracted_data.valor_total}</span>
                      </div>
                    )}
                    {currentItem.extracted_data.data && (
                      <div>
                        <span className="text-gray-500">Data: </span>
                        <span className="text-white">{currentItem.extracted_data.data}</span>
                      </div>
                    )}
                    {currentItem.extracted_data.estabelecimento && (
                      <div>
                        <span className="text-gray-500">Estabelecimento: </span>
                        <span className="text-white">{currentItem.extracted_data.estabelecimento}</span>
                      </div>
                    )}
                    {currentItem.extracted_data.categoria && (
                      <div>
                        <span className="text-gray-500">Categoria: </span>
                        <span className="text-white">{currentItem.extracted_data.categoria}</span>
                      </div>
                    )}
                    {currentItem.extracted_data.cnpj && (
                      <div>
                        <span className="text-gray-500">CNPJ: </span>
                        <span className="text-white">{currentItem.extracted_data.cnpj}</span>
                      </div>
                    )}
                    {currentItem.extracted_data.forma_pagamento && (
                      <div>
                        <span className="text-gray-500">Pagamento: </span>
                        <span className="text-white">{currentItem.extracted_data.forma_pagamento}</span>
                      </div>
                    )}
                  </div>
                  {currentItem.extracted_data.itens && currentItem.extracted_data.itens.length > 0 && (
                    <div className="mt-2">
                      <span className="text-gray-500 text-sm">Itens: </span>
                      <span className="text-white text-sm">{currentItem.extracted_data.itens.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Informed data */}
              {currentItem.informed_data && (
                <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800/30 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Dados Informados pelo Colaborador
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Valor: </span>
                      <span className="text-white">{formatCurrency(currentItem.informed_data.value)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Data: </span>
                      <span className="text-white">{formatDate(currentItem.informed_data.date)}</span>
                    </div>
                    {currentItem.informed_data.title && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Título: </span>
                        <span className="text-white">{currentItem.informed_data.title}</span>
                      </div>
                    )}
                    {currentItem.informed_data.observation && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Obs: </span>
                        <span className="text-white">{currentItem.informed_data.observation}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons - fixed at bottom */}
            <div className="border-t border-gray-700 bg-gray-900 p-4">
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  className={`border-2 ${DECISION_CONFIG.REPROVADO_HUMANO.borderColor} ${DECISION_CONFIG.REPROVADO_HUMANO.color} ${DECISION_CONFIG.REPROVADO_HUMANO.hoverColor} hover:text-white transition-all`}
                  onClick={() => handleDecision('REPROVADO_HUMANO')}
                  disabled={isSaving || isAnimating}
                >
                  {isSaving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Ban className="h-5 w-5" />
                  )}
                  <span className="ml-1.5">Reprovar</span>
                  <kbd className="ml-1.5 hidden rounded bg-black/20 px-1 text-xs sm:inline">
                    ←
                  </kbd>
                </Button>

                <Button
                  variant="outline"
                  className={`border-2 ${DECISION_CONFIG.ANALISAR_DEPOIS.borderColor} ${DECISION_CONFIG.ANALISAR_DEPOIS.color} ${DECISION_CONFIG.ANALISAR_DEPOIS.hoverColor} hover:text-white transition-all`}
                  onClick={() => handleDecision('ANALISAR_DEPOIS')}
                  disabled={isSaving || isAnimating}
                >
                  {isSaving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Clock className="h-5 w-5" />
                  )}
                  <span className="ml-1.5">Depois</span>
                  <kbd className="ml-1.5 hidden rounded bg-black/20 px-1 text-xs sm:inline">
                    ⎵
                  </kbd>
                </Button>

                <Button
                  className={`border-2 ${DECISION_CONFIG.APROVADO_HUMANO.borderColor} ${DECISION_CONFIG.APROVADO_HUMANO.bgColor} hover:${DECISION_CONFIG.APROVADO_HUMANO.hoverColor} text-white transition-all`}
                  onClick={() => handleDecision('APROVADO_HUMANO')}
                  disabled={isSaving || isAnimating}
                >
                  {isSaving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Check className="h-5 w-5" />
                  )}
                  <span className="ml-1.5">Aprovar</span>
                  <kbd className="ml-1.5 hidden rounded bg-black/20 px-1 text-xs sm:inline">
                    →
                  </kbd>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
