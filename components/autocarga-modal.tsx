'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Zap, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  CreditCard, Wallet, ShieldAlert, Ban,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ---- Tipos do plano (espelham lib/autocarga/plan.ts) --------------------------

interface LoadItem {
  cpf: string;
  colaborador: string;
  amount: number;
  card_number: string;
  card_group_name: string;
  matched_by: 'cpf' | 'name';
}

interface BlockedItem {
  cpf: string;
  colaborador: string;
  amount: number;
  reason: string;
  detail: string;
  forceable: boolean;
  card_number?: string;
  card_group_name?: string;
}

interface Plan {
  pool: number;
  total_to_load: number;
  pool_sufficient: boolean;
  pool_deficit: number;
  groups: { card_group_id: string; name: string; needed: number; available: number; deposit: number }[];
  loads: LoadItem[];
  blocked: BlockedItem[];
  already_loaded: { cpf: string; colaborador: string; amount: number; transaction_id: string | null }[];
  card_map: { stale: boolean; cards: number };
}

interface ExecuteResultItem {
  cpf: string;
  colaborador: string;
  amount: number;
  status: string;
  block_reason: string | null;
  transaction_id: string | null;
}

interface ExecuteResult {
  run_id: number;
  status: 'done' | 'partial' | 'failed';
  total_loaded: number;
  pool_after: number | null;
  items: ExecuteResultItem[];
  blocked: BlockedItem[];
}

const REASON_LABEL: Record<string, string> = {
  sem_cartao: 'Sem cartão',
  funcionario_inativo: 'Funcionário inativo',
  cartao_inativo: 'Cartão inativo',
  cadastro_pendente: 'Cadastro pendente',
  cpf_nao_encontrado: 'CPF não confere',
  nome_ambiguo: 'Cartão ambíguo',
  valor_invalido: 'Valor inválido',
};

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

interface Props {
  open: boolean;
  year: number;
  month: number;
  quinzena: number;
  onClose: () => void;
  onChanged?: () => void;
}

export function AutoCargaModal({ open, year, month, quinzena, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [forcing, setForcing] = useState<Set<string>>(new Set());
  const [forcedOk, setForcedOk] = useState<Map<string, string>>(new Map());   // cpf → transaction_id
  const [forcedErr, setForcedErr] = useState<Map<string, string>>(new Map()); // cpf → mensagem

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/quinzena-autocarga/preflight?year=${year}&month=${month}&quinzena=${quinzena}`,
        { cache: 'no-store' },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setPlan(j);
    } catch (e: any) {
      setError(e?.message || 'Erro ao montar plano de carga');
    } finally {
      setLoading(false);
    }
  }, [year, month, quinzena]);

  useEffect(() => {
    if (open) {
      setPlan(null);
      setResult(null);
      setForcedOk(new Map());
      setForcedErr(new Map());
      loadPlan();
    }
  }, [open, loadPlan]);

  if (!open) return null;

  const pendingBlocked = (plan?.blocked ?? []).filter((b) => !forcedOk.has(b.cpf));
  const totalEffective = (plan?.total_to_load ?? 0) + [...forcedOk.keys()].reduce((s, cpf) => {
    const b = plan?.blocked.find((x) => x.cpf === cpf);
    return s + (b?.amount ?? 0);
  }, 0);

  const handleForce = async (b: BlockedItem) => {
    setForcing((s) => new Set(s).add(b.cpf));
    setForcedErr((m) => { const n = new Map(m); n.delete(b.cpf); return n; });
    try {
      const r = await fetch('/api/quinzena-autocarga/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, quinzena, cpf: b.cpf }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setForcedOk((m) => new Map(m).set(b.cpf, j.transaction_id ?? ''));
      onChanged?.();
    } catch (e: any) {
      setForcedErr((m) => new Map(m).set(b.cpf, e?.message || 'Falha ao forçar'));
    } finally {
      setForcing((s) => { const n = new Set(s); n.delete(b.cpf); return n; });
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    try {
      const r = await fetch('/api/quinzena-autocarga/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, quinzena }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Erro ao executar carga');
      await loadPlan();
    } finally {
      setExecuting(false);
    }
  };

  const okItems = result?.items.filter((i) => i.status === 'ok') ?? [];
  const failItems = result?.items.filter((i) => i.status === 'failed') ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={executing ? undefined : onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Auto-carga VExpenses</h2>
            <Badge variant="outline" className="text-xs">
              {month}/{year} · {quinzena}ª QZ
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {!result && (
              <button
                onClick={loadPlan}
                disabled={loading || executing}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Recalcular plano
              </button>
            )}
            <button
              onClick={onClose}
              disabled={executing}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {result ? (
            <div className="space-y-4">
              <div className={`rounded-lg border p-4 text-center ${
                result.status === 'done' ? 'border-green-200 bg-green-50'
                : result.status === 'partial' ? 'border-amber-200 bg-amber-50'
                : 'border-red-200 bg-red-50'
              }`}>
                {result.status === 'done' ? (
                  <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-600" />
                ) : result.status === 'partial' ? (
                  <AlertTriangle className="mx-auto mb-2 h-10 w-10 text-amber-500" />
                ) : (
                  <XCircle className="mx-auto mb-2 h-10 w-10 text-red-600" />
                )}
                <p className="text-base font-semibold text-gray-900">
                  {result.status === 'done' ? 'Carga concluída'
                    : result.status === 'partial' ? 'Carga parcial — houve falhas'
                    : 'Carga falhou'}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {okItems.length} carregado(s) · {brl(result.total_loaded)}
                  {failItems.length > 0 && ` · ${failItems.length} falharam`}
                  {result.pool_after !== null && ` · pool após: ${brl(result.pool_after)}`}
                </p>
              </div>
              {failItems.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-red-700">Falhas (reexecute para tentar de novo)</p>
                  <ul className="space-y-1">
                    {failItems.map((i) => (
                      <li key={i.cpf} className="rounded border border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-800">
                        <span className="font-medium">{i.colaborador}</span> — {brl(i.amount)} — {i.block_reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.blocked.length > 0 && (
                <p className="text-xs text-gray-500">
                  {result.blocked.length} bloqueado(s) não receberam carga nesta execução.
                </p>
              )}
            </div>
          ) : loading && !plan ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              <span className="ml-2 text-sm text-gray-600">
                Descobrindo cartões e montando plano… (primeira vez pode demorar ~1 min)
              </span>
            </div>
          ) : error && !plan ? (
            <div className="py-12 text-center text-sm text-red-600">{error}</div>
          ) : plan ? (
            <div className="space-y-4">
              {/* Totais */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Wallet className="h-3.5 w-3.5" /> Pool EQS
                  </div>
                  <div className="mt-1 text-lg font-bold text-gray-900">{brl(plan.pool)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <CreditCard className="h-3.5 w-3.5" /> A carregar
                  </div>
                  <div className="mt-1 text-lg font-bold text-emerald-700">{brl(totalEffective)}</div>
                  <div className="text-xs text-gray-500">{plan.loads.length + forcedOk.size} cartão(ões)</div>
                </div>
                <div className={`rounded-lg border p-3 ${plan.blocked.length ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <ShieldAlert className="h-3.5 w-3.5" /> Bloqueados
                  </div>
                  <div className={`mt-1 text-lg font-bold ${plan.blocked.length ? 'text-amber-700' : 'text-gray-900'}`}>
                    {pendingBlocked.length}
                  </div>
                  <div className="text-xs text-gray-500">
                    {forcedOk.size > 0 && `${forcedOk.size} forçado(s) ✓ · `}
                    {plan.already_loaded.length} já carregado(s)
                  </div>
                </div>
              </div>

              {!plan.pool_sufficient && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <strong>Pool insuficiente:</strong> faltam {brl(plan.pool_deficit)} — a execução será bloqueada pelo servidor.
                </div>
              )}
              {plan.card_map.stale && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  Não foi possível atualizar a lista de cartões agora — usando o cache anterior.
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
              )}

              {/* Depósitos por grupo */}
              {plan.groups.length > 0 && (
                <details className="rounded-lg border border-gray-200 px-4 py-2 text-xs">
                  <summary className="cursor-pointer font-medium text-gray-700">
                    Depósitos pool→grupo ({plan.groups.length} grupo{plan.groups.length > 1 ? 's' : ''})
                  </summary>
                  <ul className="mt-2 space-y-1 text-gray-600">
                    {plan.groups.map((g) => (
                      <li key={g.card_group_id} className="flex justify-between">
                        <span>{g.name}</span>
                        <span className="font-mono">
                          precisa {brl(g.needed)} · livre {brl(g.available)} · depositar <strong>{brl(g.deposit)}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Cargas previstas */}
              {plan.loads.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-gray-700">
                    Serão carregados ({plan.loads.length})
                  </p>
                  <ul className="max-h-44 space-y-1 overflow-y-auto">
                    {plan.loads.map((l) => (
                      <li key={l.cpf} className="flex items-center justify-between rounded border border-gray-100 px-3 py-1.5 text-xs">
                        <span className="font-medium text-gray-800">{l.colaborador}</span>
                        <span className="text-gray-500">
                          …{l.card_number} · {l.card_group_name}
                          {l.matched_by === 'name' && ' · por nome'}
                        </span>
                        <span className="font-mono font-semibold text-emerald-700">{brl(l.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bloqueados */}
              {pendingBlocked.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-amber-700">
                    Bloqueados — não receberão carga ({pendingBlocked.length})
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {pendingBlocked.map((b) => (
                      <li key={b.cpf} className="rounded border border-amber-100 bg-amber-50/50 px-3 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-800">{b.colaborador}</span>
                            <span className="ml-2 font-mono text-gray-600">{brl(b.amount)}</span>
                            <Badge className="ml-2 bg-amber-100 text-amber-700 py-0 text-[10px]">
                              {REASON_LABEL[b.reason] ?? b.reason}
                            </Badge>
                          </div>
                          {b.forceable ? (
                            <button
                              onClick={() => handleForce(b)}
                              disabled={forcing.has(b.cpf)}
                              className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {forcing.has(b.cpf) ? 'Carregando…' : 'Carregar mesmo assim'}
                            </button>
                          ) : (
                            <span className="shrink-0 text-[11px] text-gray-400">
                              <Ban className="mr-0.5 inline h-3 w-3" />sem ação possível
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-500">{b.detail}</p>
                        {forcedErr.has(b.cpf) && (
                          <p className="mt-0.5 text-[11px] text-red-600">Falha ao forçar: {forcedErr.get(b.cpf)}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Forçados ok */}
              {forcedOk.size > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-green-700">Forçados com sucesso ({forcedOk.size})</p>
                  <ul className="space-y-1">
                    {[...forcedOk.keys()].map((cpf) => {
                      const b = plan.blocked.find((x) => x.cpf === cpf);
                      return (
                        <li key={cpf} className="flex justify-between rounded border border-green-100 bg-green-50 px-3 py-1.5 text-xs text-green-800">
                          <span>{b?.colaborador ?? cpf}</span>
                          <span className="font-mono">{b ? brl(b.amount) : ''} ✓</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Já carregados */}
              {plan.already_loaded.length > 0 && (
                <details className="rounded-lg border border-gray-200 px-4 py-2 text-xs">
                  <summary className="cursor-pointer font-medium text-gray-700">
                    Já carregados nesta quinzena ({plan.already_loaded.length}) — não serão repetidos
                  </summary>
                  <ul className="mt-2 space-y-1 text-gray-600">
                    {plan.already_loaded.map((l) => (
                      <li key={l.cpf} className="flex justify-between">
                        <span>{l.colaborador}</span>
                        <span className="font-mono">{brl(l.amount)} ✓</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={executing}>
              {result ? 'Fechar' : 'Cancelar'}
            </Button>
            {!result && plan && plan.loads.length > 0 && (
              <Button
                size="sm"
                disabled={!plan.pool_sufficient || executing || loading}
                onClick={handleExecute}
                className="bg-emerald-600 hover:bg-emerald-700"
                title={!plan.pool_sufficient ? 'Pool insuficiente' : undefined}
              >
                {executing ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-1 h-4 w-4" />
                )}
                {executing
                  ? 'Executando carga…'
                  : `Executar carga — ${plan.loads.length} cartões · ${brl(plan.total_to_load)}`}
              </Button>
            )}
            {!result && plan && plan.loads.length === 0 && (
              <span className="text-xs text-gray-500">Nenhuma carga pendente nesta quinzena</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
