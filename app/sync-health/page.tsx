'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Database, KeyRound, Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

// ---- Types ------------------------------------------------------------------

interface CycleHealth {
  label: string;
  interval_min: number;
  running: boolean;
  stuck: boolean;
  overdue: boolean;
  last_status: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_duration_s: number | null;
  last_summary: string;
  last_error: { at: string; error: string; context: string } | null;
  last_ok_at: string | null;
  stats_24h: { runs: number; done: number; error: number };
}

interface Domain {
  id: string;
  label: string;
  source: string;
  updated_at: string | null;
  extra?: string;
  error?: boolean;
}

interface SyncError {
  at: string;
  kind: string;
  context: string | null;
  error: string;
  retryable: boolean;
}

interface HealthResponse {
  generated_at: string;
  healthy: boolean;
  cycles: Record<'hot' | 'warm' | 'cold', CycleHealth>;
  domains: Domain[];
  recent_errors: SyncError[];
}

// ---- Helpers -----------------------------------------------------------------

const fmtAgo = (iso: string | null | undefined): string => {
  if (!iso) return 'nunca';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'agora mesmo';
  if (ms < 3_600_000) return `há ${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `há ${(ms / 3_600_000).toFixed(1)} h`;
  return `há ${(ms / 86_400_000).toFixed(1)} dias`;
};

const fmtTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('pt-BR') : '—';

const intervalLabel = (min: number): string =>
  min >= 1440 ? '24h' : min >= 60 ? `${min / 60}h` : `${min}min`;

function cycleState(c: CycleHealth): { label: string; color: string; icon: typeof CheckCircle2 } {
  if (c.stuck) return { label: 'TRAVADO', color: 'bg-red-100 text-red-700', icon: XCircle };
  if (c.overdue) return { label: 'ATRASADO', color: 'bg-red-100 text-red-700', icon: AlertTriangle };
  if (c.last_status === 'error') return { label: 'ÚLTIMO COM ERRO', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle };
  if (c.running) return { label: 'RODANDO', color: 'bg-blue-100 text-blue-700', icon: Loader2 };
  return { label: 'OK', color: 'bg-green-100 text-green-700', icon: CheckCircle2 };
}

const CYCLE_DESCR: Record<string, string> = {
  hot: 'Sync de despesas, relatórios, auto-auditoria e auto-aprovação',
  warm: 'Extrato incremental (2d), cadastro, alertas, Impacto Financeiro',
  cold: 'Extrato com overlap de 30 dias — pega liquidações tardias',
};

// ---- Page --------------------------------------------------------------------

export default function SyncHealthPage() {
  const { user } = useAuth();
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch('/api/sync-health', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <Activity className="h-5 w-5 text-blue-600" />
            Saúde dos Syncs
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ciclos do sync-worker, frescor dos dados e erros recentes · atualiza a cada 60s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <Badge className={data.healthy ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
              {data.healthy ? 'SISTEMA SAUDÁVEL' : 'ATENÇÃO NECESSÁRIA'}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : data ? (
        <>
          {/* Ciclos */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(['hot', 'warm', 'cold'] as const).map((kind) => {
              const c = data.cycles[kind];
              const st = cycleState(c);
              const Icon = st.icon;
              return (
                <Card key={kind}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        {c.label}
                        <span className="text-xs font-normal text-gray-400">a cada {intervalLabel(c.interval_min)}</span>
                      </span>
                      <Badge className={st.color}>
                        <Icon className={`mr-1 h-3 w-3 ${c.running && !c.stuck ? 'animate-spin' : ''}`} />
                        {st.label}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="!pt-2 text-sm">
                    <p className="mb-3 text-xs text-gray-400">{CYCLE_DESCR[kind]}</p>
                    <dl className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Último OK</dt>
                        <dd className="font-medium text-gray-800">{fmtAgo(c.last_ok_at)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Último ciclo</dt>
                        <dd className="text-gray-700">
                          {fmtAgo(c.last_started_at)}
                          {c.last_duration_s !== null && ` · ${c.last_duration_s}s`}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Últimas 24h</dt>
                        <dd className="text-gray-700">
                          <span className="text-green-600">{c.stats_24h.done} ok</span>
                          {c.stats_24h.error > 0 && (
                            <span className="text-red-600"> · {c.stats_24h.error} erro</span>
                          )}
                          {` · ${c.stats_24h.runs} ciclos`}
                        </dd>
                      </div>
                    </dl>
                    {c.last_summary && (
                      <p className="mt-2 truncate border-t border-gray-100 pt-2 text-xs text-gray-500" title={c.last_summary}>
                        {c.last_summary}
                      </p>
                    )}
                    {c.last_error && (
                      <div className="mt-2 rounded border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                        <span className="font-medium">{fmtAgo(c.last_error.at)}</span>
                        {c.last_error.context ? ` · ${c.last_error.context}` : ''}: {c.last_error.error}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Frescor dos domínios */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-gray-400" />
                Frescor dos dados
              </CardTitle>
            </CardHeader>
            <CardContent className="!pt-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {data.domains.map((d) => (
                  <div
                    key={d.id}
                    className={`rounded-md border px-3 py-2.5 ${
                      d.error ? 'border-red-200 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                      {d.id === 'token' && <KeyRound className="h-3.5 w-3.5" />}
                      {d.label}
                    </div>
                    <div className={`mt-1 text-sm ${d.error ? 'font-semibold text-red-600' : 'text-gray-900'}`}>
                      {d.error ? 'EXPIRADO' : fmtAgo(d.updated_at)}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {d.source}{d.extra ? ` · ${d.extra}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Erros recentes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-gray-400" />
                Erros recentes
                <Badge variant="outline" className="text-xs">{data.recent_errors.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="!pt-2">
              {data.recent_errors.length === 0 ? (
                <div className="flex items-center gap-2 py-6 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Nenhum erro registrado nos últimos ciclos.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="pb-2 pr-2 w-36">Quando</th>
                      <th className="pb-2 pr-2 w-16">Ciclo</th>
                      <th className="pb-2 pr-2 w-40">Contexto</th>
                      <th className="pb-2">Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_errors.map((e, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5 pr-2 text-gray-500" title={fmtTime(e.at)}>{fmtAgo(e.at)}</td>
                        <td className="py-1.5 pr-2">
                          <Badge variant="outline" className="text-[10px] uppercase">{e.kind}</Badge>
                        </td>
                        <td className="py-1.5 pr-2 text-gray-600">{e.context || '—'}</td>
                        <td className="py-1.5 max-w-[560px] truncate text-gray-700" title={e.error}>
                          {e.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <p className="text-right text-xs text-gray-400">
            gerado {fmtTime(data.generated_at)}
            {user?.role && ` · ${user.role}`}
          </p>
        </>
      ) : null}
    </div>
  );
}
