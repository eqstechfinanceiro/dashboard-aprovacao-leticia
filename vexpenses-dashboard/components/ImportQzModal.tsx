'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { parseQzFile, type QzEntry } from '@/lib/parse-qz-file';
import {
  Upload,
  FileSpreadsheet,
  X,
  Check,
  AlertTriangle,
  RefreshCw,
  Info,
} from 'lucide-react';

// ---- types ------------------------------------------------------------------

interface ImportQzModalProps {
  open: boolean;
  onClose: () => void;
  /** Period currently selected on the page */
  year: number;
  month: number;
  quinzena: number;
  /** Called after a successful import so the page can refetch */
  onImported: (count: number) => void;
}

type Step = 'drop' | 'preview' | 'importing' | 'done' | 'error';

// ---- helpers ----------------------------------------------------------------

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

const MONTH_FULL = [
  '', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ---- component --------------------------------------------------------------

export function ImportQzModal({
  open, onClose,
  year, month, quinzena,
  onImported,
}: ImportQzModalProps) {
  const [step, setStep]         = useState<Step>('drop');
  const [dragging, setDragging] = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [parsing, setParsing]   = useState(false);
  const [entries, setEntries]   = useState<QzEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skipped, setSkipped]   = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number; failed: number; errors?: string[];
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep('drop');
      setFile(null);
      setEntries([]);
      setWarnings([]);
      setSkipped(0);
      setParseError(null);
      setImportResult(null);
      setDragging(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseQzFile(f);
      setEntries(result.entries);
      setWarnings(result.warnings);
      setSkipped(result.skippedRows);
      if (result.entries.length === 0) {
        setParseError('Nenhum registro válido encontrado. Verifique se o arquivo contém CPF e valor.');
        setStep('drop');
      } else {
        setStep('preview');
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      setStep('drop');
    } finally {
      setParsing(false);
    }
  }, []);

  // Drag events
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };
  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  };

  // Import
  const handleImport = async () => {
    setStep('importing');
    try {
      const res = await fetch('/api/quinzena/import-qz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, quinzena, entries }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro desconhecido');
      setImportResult(json);
      setStep('done');
      onImported(json.imported);
    } catch (err) {
      setImportResult({ imported: 0, failed: entries.length, errors: [String(err)] });
      setStep('error');
    }
  };

  if (!open) return null;

  const periodLabel = `${MONTH_FULL[month]} ${year} — ${quinzena}ª Quinzena`;
  const totalValue  = entries.reduce((s, e) => s + e.valor, 0);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              Importar valores de quinzena
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{periodLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── STEP: drop ── */}
          {(step === 'drop' || parsing) && (
            <>
              {/* Info banner */}
              <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-0.5">Formato esperado</p>
                  <p>Qualquer arquivo <strong>xlsx, xls ou csv</strong> com colunas de <strong>Nome</strong>, <strong>CPF</strong> e <strong>Valor</strong> — pode estar em qualquer ordem e as linhas de cabeçalho são detectadas automaticamente.</p>
                  <p className="mt-1 text-blue-600">Quem não estiver no arquivo terá o valor de QZ zerado.</p>
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !parsing && inputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors select-none ${
                  dragging
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40'
                }`}
              >
                {parsing ? (
                  <>
                    <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-gray-600">Lendo arquivo...</p>
                  </>
                ) : (
                  <>
                    <Upload className={`h-8 w-8 ${dragging ? 'text-blue-600' : 'text-gray-400'}`} />
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700">
                        Arraste o arquivo aqui ou clique para selecionar
                      </p>
                      <p className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv</p>
                    </div>
                  </>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={onFileInput}
              />

              {/* Parse error */}
              {parseError && (
                <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}
            </>
          )}

          {/* ── STEP: preview ── */}
          {step === 'preview' && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                  <div className="text-xl font-bold text-green-700">{entries.length}</div>
                  <div className="text-xs text-green-600">registros encontrados</div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                  <div className="text-sm font-bold text-blue-700 leading-tight">{brl(totalValue)}</div>
                  <div className="text-xs text-blue-600">total de carga</div>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-center">
                  <div className="text-xl font-bold text-gray-500">{skipped}</div>
                  <div className="text-xs text-gray-500">linhas ignoradas</div>
                </div>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {warnings.length} aviso(s)
                  </p>
                  {warnings.slice(0, 5).map((w, i) => (
                    <p key={i} className="text-xs text-amber-600 pl-5">{w}</p>
                  ))}
                  {warnings.length > 5 && (
                    <p className="text-xs text-amber-500 pl-5">...e mais {warnings.length - 5}</p>
                  )}
                </div>
              )}

              {/* Preview table */}
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 border-b flex justify-between">
                  <span>Arquivo: <span className="text-gray-700">{file?.name}</span></span>
                  <span>{entries.length} registros</span>
                </div>
                <div className="overflow-y-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-gray-600">CPF</th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-600">Nome</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-600">Valor QZ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={e.cpf} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="px-3 py-1.5 font-mono text-gray-500">{e.cpf}</td>
                          <td className="px-3 py-1.5 text-gray-700 max-w-[200px] truncate">{e.nome || '—'}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-blue-700">{brl(e.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Warning about zeroing */}
              <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Colaboradores <strong>não presentes</strong> neste arquivo terão o valor de{' '}
                  <strong>{quinzena}ª QZ zerado</strong> para {MONTH_FULL[month]} {year}.
                </span>
              </div>

              {/* Re-upload link */}
              <button
                onClick={() => { setStep('drop'); setFile(null); setEntries([]); }}
                className="text-xs text-blue-500 hover:text-blue-700 underline"
              >
                Usar outro arquivo
              </button>
            </>
          )}

          {/* ── STEP: importing ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-600">
                Importando {entries.length} registros para o Neon...
              </p>
            </div>
          )}

          {/* ── STEP: done ── */}
          {step === 'done' && importResult && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-7 w-7 text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-gray-800">
                  {importResult.imported} valores importados com sucesso!
                </p>
                <p className="text-sm text-gray-500 mt-1">{periodLabel}</p>
                {importResult.failed > 0 && (
                  <p className="text-xs text-red-500 mt-1">{importResult.failed} falhas</p>
                )}
              </div>
            </div>
          )}

          {/* ── STEP: error ── */}
          {step === 'error' && importResult && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-gray-800">Erro ao importar</p>
                {importResult.errors?.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 mt-1">{e}</p>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
          {step === 'drop' && (
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
          )}

          {step === 'preview' && (
            <>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleImport}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors shadow-sm"
              >
                <Upload className="h-4 w-4" />
                Carregar {entries.length} valores
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={onClose}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              Fechar
            </button>
          )}

          {step === 'error' && (
            <>
              <button onClick={() => setStep('drop')} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100">
                Tentar novamente
              </button>
              <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">
                Fechar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
