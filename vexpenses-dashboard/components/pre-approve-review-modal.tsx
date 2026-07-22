'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  CheckCircle,
  FileText,
  ImageIcon,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Receipt,
} from 'lucide-react';

export interface PreApproveExpense {
  id: number;
  expense_id: number;
  title: string;
  value: number;
  date: string;
  observation: string;
  receipt_url: string;
  expense_type: { description: string } | null;
  costs_center: { name: string } | null;
  audit: {
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
    divergences: string[];
    rules_triggered: { rule: string; reason: string; confidence: number }[];
    summary: string;
  } | null;
}

interface PreApproveReviewModalProps {
  open: boolean;
  onClose: () => void;
  reportId: number;
  reportDescription: string;
  userName: string | null;
  expenses: PreApproveExpense[];
  onApprove: () => void;
  approving: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function PreApproveReviewModal({
  open,
  onClose,
  reportId,
  reportDescription,
  userName,
  expenses,
  onApprove,
  approving,
}: PreApproveReviewModalProps) {
  const [expandedExpense, setExpandedExpense] = useState<number | null>(null);
  const [showReceiptFor, setShowReceiptFor] = useState<number | null>(null);

  const totalValue = useMemo(() => expenses.reduce((sum, e) => sum + e.value, 0), [expenses]);
  const withDivergences = useMemo(() => expenses.filter(e => e.audit && e.audit.divergences.length > 0).length, [expenses]);
  const withRules = useMemo(() => expenses.filter(e => e.audit && e.audit.rules_triggered.length > 0).length, [expenses]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <Receipt className="h-6 w-6 text-green-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Revisão pré-aprovação</h2>
              <p className="text-sm text-gray-500">
                #{reportId} — {reportDescription || `Report #${reportId}`}
                {userName && ` • ${userName}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-4 border-b border-gray-100 bg-green-50 px-4 py-3 text-sm">
          <span className="flex items-center gap-1 font-medium text-green-800">
            <CheckCircle className="h-4 w-4" />
            {expenses.length} despesa{expenses.length !== 1 ? 's' : ''} — todas aprovadas pelo bot
          </span>
          <span className="text-gray-600">Total: <strong className="text-gray-900">{formatCurrency(totalValue)}</strong></span>
          {withDivergences > 0 && (
            <span className="flex items-center gap-1 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              {withDivergences} com divergência{withDivergences !== 1 ? 's' : ''}
            </span>
          )}
          {withRules > 0 && (
            <span className="flex items-center gap-1 text-gray-600">
              <FileText className="h-4 w-4" />
              {withRules} com regras
            </span>
          )}
        </div>

        {/* Expense list */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {expenses.map((expense, idx) => {
              const isExpanded = expandedExpense === expense.id;
              const showReceipt = showReceiptFor === expense.id;
              const audit = expense.audit;

              return (
                <div
                  key={expense.id}
                  className={`rounded-lg border transition-all ${
                    isExpanded ? 'border-blue-300 shadow-sm' : 'border-gray-200'
                  }`}
                >
                  {/* Expense row */}
                  <div
                    className="flex cursor-pointer items-center gap-3 p-3 hover:bg-gray-50"
                    onClick={() => setExpandedExpense(isExpanded ? null : expense.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    )}
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">
                          {expense.title || `Despesa #${expense.expense_id}`}
                        </span>
                        <Badge className="bg-green-100 text-green-700 text-xs">Aprovado</Badge>
                        {audit?.divergences && audit.divergences.length > 0 && (
                          <Badge className="bg-orange-100 text-orange-700 text-xs">
                            {audit.divergences.length} divergência{audit.divergences.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{formatCurrency(expense.value)}</span>
                        <span>•</span>
                        <span>{expense.date}</span>
                        {expense.expense_type && (
                          <>
                            <span>•</span>
                            <span>{expense.expense_type.description}</span>
                          </>
                        )}
                        {audit?.extracted_data?.estabelecimento && (
                          <>
                            <span>•</span>
                            <span className="truncate">{audit.extracted_data.estabelecimento}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowReceiptFor(showReceipt ? null : expense.id);
                      }}
                      className="flex-shrink-0 rounded-md border border-gray-200 p-1.5 text-gray-400 hover:border-blue-400 hover:text-blue-600"
                      title="Ver comprovante"
                    >
                      {expense.receipt_url ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* Informed data */}
                        <div className="rounded border border-gray-200 bg-gray-50 p-2">
                          <p className="mb-1 text-xs font-medium text-gray-700">Dados informados:</p>
                          <div className="space-y-0.5 text-xs text-gray-600">
                            <div><strong>Título:</strong> {expense.title || '-'}</div>
                            <div><strong>Valor:</strong> {formatCurrency(expense.value)}</div>
                            <div><strong>Data:</strong> {expense.date}</div>
                            {expense.expense_type && <div><strong>Tipo:</strong> {expense.expense_type.description}</div>}
                            {expense.costs_center && <div><strong>Centro de custo:</strong> {expense.costs_center.name}</div>}
                            {expense.observation && <div><strong>Obs:</strong> {expense.observation}</div>}
                          </div>
                        </div>

                        {/* Extracted data */}
                        {audit?.extracted_data ? (
                          <div className="rounded border border-blue-200 bg-blue-50 p-2">
                            <p className="mb-1 text-xs font-medium text-blue-800">Gemini extraiu:</p>
                            <div className="space-y-0.5 text-xs text-blue-700">
                              {audit.extracted_data.valor_total && <div><strong>Valor:</strong> {audit.extracted_data.valor_total}</div>}
                              {audit.extracted_data.data && <div><strong>Data:</strong> {audit.extracted_data.data}</div>}
                              {audit.extracted_data.estabelecimento && <div><strong>Estab:</strong> {audit.extracted_data.estabelecimento}</div>}
                              {audit.extracted_data.categoria && <div><strong>Categoria:</strong> {audit.extracted_data.categoria}</div>}
                              {audit.extracted_data.cnpj && <div><strong>CNPJ:</strong> {audit.extracted_data.cnpj}</div>}
                              {audit.extracted_data.forma_pagamento && <div><strong>Pagamento:</strong> {audit.extracted_data.forma_pagamento}</div>}
                              {audit.extracted_data.itens && audit.extracted_data.itens.length > 0 && (
                                <div><strong>Itens:</strong> {audit.extracted_data.itens.join(', ')}</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded border border-gray-200 bg-gray-50 p-2">
                            <p className="text-xs text-gray-400">Sem dados extraídos</p>
                          </div>
                        )}
                      </div>

                      {/* Divergences */}
                      {audit?.divergences && audit.divergences.length > 0 && (
                        <div className="mt-2 rounded border border-orange-200 bg-orange-50 p-2">
                          <p className="text-xs font-medium text-orange-800">Divergências:</p>
                          {audit.divergences.map((d, i) => (
                            <p key={i} className="text-xs text-orange-700">• {d}</p>
                          ))}
                        </div>
                      )}

                      {/* Rules */}
                      {audit?.rules_triggered && audit.rules_triggered.length > 0 && (
                        <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2">
                          <p className="text-xs font-medium text-gray-700">Regras acionadas:</p>
                          {audit.rules_triggered.map((r, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
                              <Badge variant="outline" className="text-xs">{r.rule}</Badge>
                              <span className="flex-1">{r.reason}</span>
                              <span className="text-gray-400">{r.confidence}%</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Summary */}
                      {audit?.summary && (
                        <p className="mt-2 text-xs italic text-gray-500">{audit.summary}</p>
                      )}

                      {/* Receipt preview */}
                      {showReceipt && expense.receipt_url && (
                        <div className="mt-3">
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
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer with approve button */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Total: <strong className="text-gray-900">{formatCurrency(totalValue)}</strong> em {expenses.length} despesa{expenses.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={approving}>
                Cancelar
              </Button>
              <Button
                onClick={onApprove}
                disabled={approving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {approving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Aprovar no VExpenses
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
