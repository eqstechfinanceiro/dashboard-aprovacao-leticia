'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, CheckCircle, XCircle, AlertCircle, Loader2, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface FaturaUploadModalProps {
  open: boolean;
  onClose: () => void;
  reportId: number;
  reportDescription: string;
  validatedBy: string;
  onValidationComplete: () => void;
}

interface ValidationResult {
  report_id: number;
  filename: string;
  total_fatura_entries: number;
  total_expenses: number;
  validated: number;
  mismatched: number;
  not_found: number;
  unmatched_fatura_count: number;
  results: Array<{
    expense_id: number;
    status: 'VALIDATED' | 'MISMATCH' | 'NOT_FOUND';
    fatura_filename: string;
    fatura_date: string;
    fatura_description: string;
    fatura_value: number;
    expense_value: number;
    difference: number;
  }>;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export function FaturaUploadModal({
  open,
  onClose,
  reportId,
  reportDescription,
  validatedBy,
  onValidationComplete,
}: FaturaUploadModalProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Apenas arquivos CSV são suportados');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('reportId', String(reportId));
      formData.append('validatedBy', validatedBy);

      const res = await fetch('/api/aprovacao-dinamica/fatura/validate', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data.data);
      onValidationComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar fatura');
    } finally {
      setUploading(false);
    }
  }, [reportId, validatedBy, onValidationComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Validar Fatura Itaú</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          Report: <strong>{reportDescription || `#${reportId}`}</strong>
        </p>

        {/* Upload Area */}
        {!result && !uploading && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-all ${
              dragOver
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <Upload className="mb-3 h-10 w-10 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">
              Arraste o arquivo CSV da fatura aqui
            </p>
            <p className="mt-1 text-xs text-gray-500">
              ou clique para selecionar do computador
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Formato: CSV separado por ponto e vírgula (;)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* Uploading */}
        {uploading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="mt-3 text-sm text-gray-600">Validando despesas contra a fatura...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Erro</span>
            </div>
            <p className="mt-1 text-sm text-red-600">{error}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => { setError(null); }}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                <CheckCircle className="mx-auto h-6 w-6 text-green-600" />
                <p className="mt-1 text-2xl font-bold text-green-700">{result.validated}</p>
                <p className="text-xs text-green-600">Validadas</p>
              </div>
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-center">
                <AlertCircle className="mx-auto h-6 w-6 text-orange-600" />
                <p className="mt-1 text-2xl font-bold text-orange-700">{result.mismatched}</p>
                <p className="text-xs text-orange-600">Divergentes</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                <XCircle className="mx-auto h-6 w-6 text-red-600" />
                <p className="mt-1 text-2xl font-bold text-red-700">{result.not_found}</p>
                <p className="text-xs text-red-600">Não encontradas</p>
              </div>
            </div>

            {/* File info */}
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
              <FileText className="h-4 w-4" />
              <span>{result.filename}</span>
              <span>—</span>
              <span>{result.total_fatura_entries} entradas na fatura</span>
              <span>—</span>
              <span>{result.total_expenses} despesas no relatório</span>
              {result.unmatched_fatura_count > 0 && (
                <>
                  <span>—</span>
                  <span className="text-orange-600">{result.unmatched_fatura_count} entradas sem despesa correspondente</span>
                </>
              )}
            </div>

            {/* Detailed results */}
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Despesa</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Valor Despesa</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Valor Fatura</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Diferença</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-700">
                        #{r.expense_id}
                        {r.fatura_description && (
                          <span className="block text-xs text-gray-400">{r.fatura_description}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(r.expense_value)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {r.status === 'NOT_FOUND' ? '-' : formatCurrency(r.fatura_value)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {r.status === 'NOT_FOUND' ? '-' : formatCurrency(r.difference)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.status === 'VALIDATED' && (
                          <Badge className="bg-green-100 text-green-700 text-xs">Validada</Badge>
                        )}
                        {r.status === 'MISMATCH' && (
                          <Badge className="bg-orange-100 text-orange-700 text-xs">Divergente</Badge>
                        )}
                        {r.status === 'NOT_FOUND' && (
                          <Badge className="bg-red-100 text-red-700 text-xs">Não encontrada</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setResult(null); }}
              >
                Validar outro arquivo
              </Button>
              <Button
                size="sm"
                onClick={onClose}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Concluir
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
