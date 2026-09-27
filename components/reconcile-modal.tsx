'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Loader2, CheckCircle2, RefreshCw, Scale, AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface SemDespesaItem {
  cpf: string | null;
  colaborador: string;
  usuario_extrato: string;
  data: string;
  tipo: string;
  descricao: string | null;
  valor: number;
}

interface PendenteItem {
  cpf: string | null;
  colaborador: string;
  status: string;
  n: number;
  total: number;
}

interface ReconcileResult {
  cutoff: string;
  generated_at: string;
  summary: {
    sem_despesa_n: number;
    sem_despesa_total: number;
    pendente_n: number;
    pendente_total: number;
    pendente_por_status: Record<string, { n: number; total: number }>;
    conciliado_n: number;
    conciliado_total: number;
    saque_n: number;
    saque_total: number;
  };
  sem_despesa: SemDespesaItem[];
  pendente: PendenteItem[];
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (iso: string) => iso.split('-').reverse().join('/');

interface Props {
  open: boolean;
  year: number;
  month: number;
  quinzena: number;
  onClose: () => void;
}

export function ReconcileModal({ open, year, month, quinzena, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'sem' | 'pend'>('sem');

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/quinzena-reconcile?year=${year}&month=${month}&quinzena=${quinzena}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
      setTab(j.summary?.sem_despesa_n > 0 ? 'sem' : 'pend');
    } catch (e: any) {
      setError(e?.message || 'Erro na reconciliação');
    } finally {
      setLoading(false);
    }
  }, [year, month, quinzena]);

  useEffect(() => {
    if (open) {
      setResult(null);
      run();
    }
  }, [open, run]);

  if (!open) return null;

  const s = result?.summary;
  const limpo = s && s.sem_despesa_n === 0 && s.pendente_n === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Reconciliação extrato × prestação
            </h2>
            {result && (
              <Badge variant="outline" className="text-xs">
                até {fmtDate(result.cutoff)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={run}
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
              <span className="ml-2 text-sm text-gray-600">Cruzando extrato com prestações…</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-600">{error}</div>
          ) : result && s ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                <Badge className="bg-green-100 text-green-700">
                  Conciliado: {s.conciliado_n} gastos · {fmtBRL(s.conciliado_total)}
                </Badge>
                <Badge className={s.sem_despesa_n > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
                  Sem despesa: {s.sem_despesa_n} · {fmtBRL(s.sem_despesa_total)}
                </Badge>
                <Badge className={s.pendente_n > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}>
                  Em relatório não-final: {s.pendente_n} · {fmtBRL(s.pendente_total)}
                </Badge>
                <Badge variant="outline" className="text-gray-500">
                  Saque espécie: {s.saque_n} · {fmtBRL(s.saque_total)}
                </Badge>
              </div>

              {s.pendente_n > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
                  {Object.entries(s.pendente_por_status).map(([st, v]) => (
                    <Badge key={st} variant="outline" className="text-amber-700 border-amber-300">
                      {st}: {v.n} ({fmtBRL(v.total)})
                    </Badge>
                  ))}
                </div>
              )}

              {limpo ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                  <p className="mt-3 font-medium text-gray-900">Extrato reconciliado</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Todo gasto de Compra/Pix está vinculado a despesa em relatório finalizado.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>Sem despesa</strong> = gasto no cartão que nunca virou prestação
                      (fica como saldo a prestar pra sempre).{' '}
                      <strong>Não-final</strong> = a despesa existe mas o relatório está
                      Aberto/Reaberto/Reprovado, então não conta na prestação.
                    </span>
                  </div>

                  <div className="mb-3 flex gap-1 border-b border-gray-200">
                    {([
                      ['sem', `Sem despesa (${s.sem_despesa_n})`],
                      ['pend', `Não-finalizados (${s.pendente_n})`],
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

                  {tab === 'sem' && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-500">
                          <th className="pb-2 pr-2">Colaborador</th>
                          <th className="pb-2 pr-2">Data</th>
                          <th className="pb-2 pr-2">Tipo</th>
                          <th className="pb-2 pr-2">Descrição</th>
                          <th className="pb-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.sem_despesa.map((r, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-0">
                            <td className="py-1.5 pr-2">
                              <div className="text-gray-700">{r.colaborador}</div>
                              {r.cpf === null && (
                                <div className="text-[10px] text-red-500">sem CPF no cadastro</div>
                              )}
                            </td>
                            <td className="py-1.5 pr-2 text-gray-500">{fmtDate(r.data)}</td>
                            <td className="py-1.5 pr-2 text-gray-500">{r.tipo}</td>
                            <td className="py-1.5 pr-2 max-w-[280px] truncate text-gray-500" title={r.descricao ?? ''}>
                              {r.descricao || '—'}
                            </td>
                            <td className="py-1.5 text-right font-medium text-red-600">{fmtBRL(r.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {tab === 'pend' && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-500">
                          <th className="pb-2 pr-2">Colaborador</th>
                          <th className="pb-2 pr-2">Status do relatório</th>
                          <th className="pb-2 pr-2 text-right">Gastos</th>
                          <th className="pb-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.pendente.map((r, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-0">
                            <td className="py-1.5 pr-2">
                              <div className="text-gray-700">{r.colaborador}</div>
                              {r.cpf === null && (
                                <div className="text-[10px] text-red-500">sem CPF no cadastro</div>
                              )}
                            </td>
                            <td className="py-1.5 pr-2">
                              <Badge variant="outline" className="text-amber-700 border-amber-300">{r.status}</Badge>
                            </td>
                            <td className="py-1.5 pr-2 text-right text-gray-500">{r.n}</td>
                            <td className="py-1.5 text-right font-medium text-amber-700">{fmtBRL(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
          <p className="text-xs text-gray-400">
            {result && `gerado ${new Date(result.generated_at).toLocaleTimeString('pt-BR')} · saques conciliam via saldo final`}
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
