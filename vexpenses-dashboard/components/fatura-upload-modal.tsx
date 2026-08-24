'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreditCard, Upload, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface FaturaUploadModalProps {
  open: boolean;
  onClose: () => void;
  validatedBy: string;
  onValidationComplete: () => void;
}

export function FaturaUploadModal({ open, onClose, validatedBy, onValidationComplete }: FaturaUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResults(null);
      setSummary(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('validatedBy', validatedBy);

      const res = await fetch('/api/aprovacao-dinamica/fatura/validate', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results || []);
      setSummary(data.summary || null);
      onValidationComplete();
    } catch (err: any) {
      setError(err.message || 'Erro ao validar fatura');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResults(null);
    setSummary(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CreditCard className="h-5 w-5 text-purple-600" />
            Validar Fatura Itaú
          </h2>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Arquivo CSV da fatura
            </label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleUpload} disabled={!file || loading} size="sm">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Validar
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleClose}>
              Fechar
            </Button>
          </div>

          {summary && (
            <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
              <div className="flex flex-wrap gap-4">
                <span className="font-medium text-blue-900">Resumo:</span>
                <span className="text-green-700">✓ {summary.validated} validadas</span>
                <span className="text-orange-700">⚠ {summary.mismatch} divergentes</span>
                <span className="text-red-700">✗ {summary.notFound} não encontradas</span>
                <span className="text-gray-600">Total: {summary.totalExpenses} despesas</span>
                <span className="text-gray-600">Fatura: {summary.totalFaturaRows} linhas</span>
                {summary.durationMs && <span className="text-gray-400">({(summary.durationMs / 1000).toFixed(1)}s)</span>}
              </div>
            </div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700">Resultados ({results.length})</h3>
              <div className="max-h-60 overflow-auto rounded border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Report</th>
                      <th className="p-2 text-left">Despesa</th>
                      <th className="p-2 text-left">Fatura</th>
                      <th className="p-2 text-right">Valor Despesa</th>
                      <th className="p-2 text-right">Valor Fatura</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-2">{r.report_id}</td>
                        <td className="p-2">{r.expense_id}</td>
                        <td className="p-2">{r.fatura_description || r.fatura_filename}</td>
                        <td className="p-2 text-right">R$ {r.expense_value?.toFixed(2)}</td>
                        <td className="p-2 text-right">R$ {r.fatura_value?.toFixed(2)}</td>
                        <td className="p-2 text-center">
                          {r.status === 'VALIDATED' && <CheckCircle className="inline h-4 w-4 text-green-600" />}
                          {r.status === 'MISMATCH' && <AlertCircle className="inline h-4 w-4 text-orange-600" />}
                          {r.status === 'NOT_FOUND' && <XCircle className="inline h-4 w-4 text-red-600" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {results && results.length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma validação encontrada.</p>
          )}
        </div>
      </div>
    </div>
  );
}
