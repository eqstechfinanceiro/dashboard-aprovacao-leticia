'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Snowflake, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Download,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Severity = 'ok' | 'warn' | 'error';

interface PrecheckItem {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  items?: string[];
}

interface PrecheckResult {
  can_freeze: boolean;
  summary?: { errors: number; warnings: number; oks: number };
  checks: PrecheckItem[];
  period?: { month_name?: string; year?: number; quinzena?: number };
  generated_at?: string;
}

const SEV_META: Record<Severity, { icon: any; cls: string; label: string }> = {
  ok:    { icon: CheckCircle2,  cls: 'text-green-600', label: 'OK' },
  warn:  { icon: AlertTriangle, cls: 'text-amber-500', label: 'Atenção' },
  error: { icon: XCircle,       cls: 'text-red-600',   label: 'Bloqueio' },
};

export interface FreezeResult {
  download_url?: string;
  rows_frozen?: number;
  already_frozen?: boolean;
}

interface Props {
  open: boolean;
  year: number;
  month: number;
  quinzena: number;
  onClose: () => void;
  onConfirm: () => Promise<FreezeResult | void> | FreezeResult | void;
}

export function FreezePrecheckModal({ open, year, month, quinzena, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<PrecheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [done, setDone] = useState<FreezeResult | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/quinzena-precheck?year=${year}&month=${month}&quinzena=${quinzena}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
    } catch (e: any) {
      setError(e?.message || 'Erro ao verificar');
    } finally {
      setLoading(false);
    }
  }, [year, month, quinzena]);

  useEffect(() => {
    if (open) {
      setResult(null);
      setAck(false);
      setDone(null);
      runCheck();
    }
  }, [open, runCheck]);

  if (!open) return null;

  const hasWarnings = (result?.summary?.warnings ?? 0) > 0;
  const canFreeze = !!result?.can_freeze && (!hasWarnings || ack);

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const r = await onConfirm();
      if (r?.download_url) {
        setDone(r);
      } else {
        onClose();
      }
    } catch {
      // erro já tratado pelo onConfirm — reverifica o estado atual
      await runCheck();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Verificação antes de congelar
            </h2>
            {result?.period && (
              <Badge variant="outline" className="text-xs">
                {result.period.month_name ?? month}/{result.period.year ?? year} · {quinzena}ª QZ
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runCheck}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Reverificar
            </button>
            <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {done ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="mb-3 h-12 w-12 text-green-600" />
              <p className="text-base font-semibold text-gray-900">
                Quinzena {done.already_frozen ? 'já estava congelada' : 'congelada'} e planilha gerada
              </p>
              {!!done.rows_frozen && (
                <p className="mt-1 text-sm text-gray-600">
                  {done.rows_frozen} colaboradores no snapshot
                </p>
              )}
              <a
                href={done.download_url}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Baixar planilha da quinzena
              </a>
              <p className="mt-3 text-xs text-gray-500">
                Também disponível no sino de notificações.
              </p>
            </div>
          ) : loading && !result ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-600">Verificando dados da quinzena…</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-600">{error}</div>
          ) : result ? (
            <div className="space-y-2">
              {result.summary && (
                <div className="mb-3 flex gap-2 text-xs">
                  {result.summary.errors > 0 && (
                    <Badge className="bg-red-100 text-red-700">{result.summary.errors} bloqueio(s)</Badge>
                  )}
                  {result.summary.warnings > 0 && (
                    <Badge className="bg-amber-100 text-amber-700">{result.summary.warnings} alerta(s)</Badge>
                  )}
                  <Badge className="bg-green-100 text-green-700">{result.summary.oks} ok</Badge>
                </div>
              )}
              {result.checks.map((c) => {
                const meta = SEV_META[c.severity];
                const Icon = meta.icon;
                return (
                  <div
                    key={c.id}
                    className={`flex gap-3 rounded-lg border p-3 ${
                      c.severity === 'error'
                        ? 'border-red-200 bg-red-50'
                        : c.severity === 'warn'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-gray-200 bg-white'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${meta.cls}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{c.title}</p>
                      {c.detail && <p className="mt-0.5 text-xs text-gray-600">{c.detail}</p>}
                      {c.items && c.items.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                          {c.items.map((it, i) => <li key={i}>• {it}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="border-t border-gray-200 px-6 py-3">
          {!done && hasWarnings && result?.can_freeze && (
            <label className="mb-3 flex cursor-pointer items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>
                Li os alertas acima e entendo que congelar agora grava um snapshot
                permanente com os dados como estão.
              </span>
            </label>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {done ? 'Fechar' : 'Cancelar'}
            </Button>
            {!done && (
              <Button
                size="sm"
                variant={hasWarnings ? 'destructive' : 'default'}
                disabled={!canFreeze || confirming || loading}
                onClick={handleConfirm}
                title={!result?.can_freeze ? 'Corrija os bloqueios antes de congelar' : undefined}
              >
                {confirming ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Snowflake className="mr-1 h-4 w-4" />
                )}
                {confirming
                  ? 'Congelando e gerando planilha…'
                  : hasWarnings ? 'Congelar e gerar mesmo assim' : 'Congelar e gerar planilha'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
