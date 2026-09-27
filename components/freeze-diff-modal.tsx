'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, ArrowLeftRight, Loader2, CheckCircle2, RefreshCw,
  UserPlus, UserMinus, ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DiffChange {
  cpf: string;
  colaborador: string;
  field: string;
  label: string;
  from: string;
  to: string;
  delta?: number;
}

interface DiffResult {
  frozen_at: string;
  compared_at: string;
  summary: {
    frozen_rows: number;
    calc_rows: number;
    added: number;
    removed: number;
    changed_fields: number;
    changed_cpfs: number;
    total_drift_carga_final: number;
    identical: boolean;
  };
  added: { cpf: string; colaborador: string }[];
  removed: { cpf: string; colaborador: string }[];
  changed: DiffChange[];
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  open: boolean;
  year: number;
  month: number;
  quinzena: number;
  onClose: () => void;
}

export function FreezeDiffModal({ open, year, month, quinzena, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'changed' | 'added' | 'removed'>('changed');

  const runDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/quinzena-diff?year=${year}&month=${month}&quinzena=${quinzena}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
      if (j.summary?.changed_fields > 0) setTab('changed');
      else if (j.summary?.added > 0) setTab('added');
      else setTab('removed');
    } catch (e: any) {
      setError(e?.message || 'Erro ao comparar');
    } finally {
      setLoading(false);
    }
  }, [year, month, quinzena]);

  useEffect(() => {
    if (open) {
      setResult(null);
      runDiff();
    }
  }, [open, runDiff]);

  if (!open) return null;

  const s = result?.summary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Divergências após o congelamento
            </h2>
            {s && (
              <Badge variant="outline" className="text-xs">
                congelado {new Date(result!.frozen_at).toLocaleDateString('pt-BR')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runDiff}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Recalcular
            </button>
            <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading && !result ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-600">Comparando snapshot com dados atuais…</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-600">{error}</div>
          ) : result && s ? (
            <>
              {s.identical ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                  <p className="mt-3 font-medium text-gray-900">Nenhuma divergência</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Os dados recalculados agora são idênticos ao snapshot congelado.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap gap-2 text-xs">
                    <Badge className={s.changed_fields > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}>
                      {s.changed_cpfs} colaboradores alterados · {s.changed_fields} campos
                    </Badge>
                    {s.added > 0 && (
                      <Badge className="bg-blue-100 text-blue-700">+{s.added} entraram depois</Badge>
                    )}
                    {s.removed > 0 && (
                      <Badge className="bg-red-100 text-red-700">-{s.removed} saíram depois</Badge>
                    )}
                    {s.total_drift_carga_final > 0 && (
                      <Badge className="bg-amber-100 text-amber-700">
                        drift carga final: {fmtBRL(s.total_drift_carga_final)}
                      </Badge>
                    )}
                  </div>

                  <div className="mb-3 flex gap-1 border-b border-gray-200">
                    {([
                      ['changed', `Campos (${s.changed_fields})`],
                      ['added', `Entraram (${s.added})`],
                      ['removed', `Saíram (${s.removed})`],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`border-b-2 px-3 py-1.5 text-xs font-medium ${
                          tab === key
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {tab === 'changed' && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-500">
                          <th className="pb-2 pr-2">Colaborador</th>
                          <th className="pb-2 pr-2">Campo</th>
                          <th className="pb-2 pr-2">Congelado</th>
                          <th className="pb-2 pr-2"></th>
                          <th className="pb-2 pr-2">Atual</th>
                          <th className="pb-2 text-right">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.changed.map((c, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-0">
                            <td className="py-1.5 pr-2 text-gray-700">{c.colaborador}</td>
                            <td className="py-1.5 pr-2 text-gray-500">{c.label}</td>
                            <td className="py-1.5 pr-2 text-gray-500">{c.from}</td>
                            <td className="py-1.5 pr-2"><ArrowRight className="h-3 w-3 text-gray-400" /></td>
                            <td className="py-1.5 pr-2 font-medium text-gray-900">{c.to}</td>
                            <td className={`py-1.5 text-right font-medium ${
                              c.delta === undefined ? 'text-gray-400'
                              : c.delta > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {c.delta !== undefined ? `${c.delta > 0 ? '+' : ''}${fmtBRL(c.delta)}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {tab === 'added' && (
                    <ul className="space-y-1 text-sm">
                      {result.added.map((a) => (
                        <li key={a.cpf} className="flex items-center gap-2 rounded border border-blue-100 bg-blue-50 px-3 py-1.5">
                          <UserPlus className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">{a.colaborador}</span>
                          <span className="text-xs text-gray-500">{a.cpf}</span>
                          <span className="ml-auto text-xs text-blue-600">entrou depois do freeze</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {tab === 'removed' && (
                    <ul className="space-y-1 text-sm">
                      {result.removed.map((a) => (
                        <li key={a.cpf} className="flex items-center gap-2 rounded border border-red-100 bg-red-50 px-3 py-1.5">
                          <UserMinus className="h-4 w-4 text-red-600" />
                          <span className="font-medium">{a.colaborador}</span>
                          <span className="text-xs text-gray-500">{a.cpf}</span>
                          <span className="ml-auto text-xs text-red-600">não está mais no cálculo</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
          <p className="text-xs text-gray-400">
            {result && `comparado ${new Date(result.compared_at).toLocaleTimeString('pt-BR')}`}
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
