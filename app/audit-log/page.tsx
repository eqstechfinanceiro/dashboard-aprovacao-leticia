'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollText, RefreshCw, Loader2, Search, ChevronDown, ChevronRight } from 'lucide-react';

interface AuditRow {
  id: number;
  created_at: string;
  user_id: number | null;
  user_email: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

interface AuditResponse {
  total: number;
  page: number;
  per_page: number;
  rows: AuditRow[];
  actions: string[];
}

const fmtTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

const ACTION_COLORS: Record<string, string> = {
  'quinzena.freeze': 'bg-blue-100 text-blue-700',
  'quinzena.unfreeze': 'bg-amber-100 text-amber-700',
  'quinzena.import_qz': 'bg-indigo-100 text-indigo-700',
  'relatorio.approve': 'bg-green-100 text-green-700',
  'relatorio.reject': 'bg-red-100 text-red-700',
  'impacto.titulo_edit': 'bg-purple-100 text-purple-700',
};

function actionBadge(a: string) {
  return ACTION_COLORS[a] || 'bg-gray-100 text-gray-700';
}

export default function AuditLogPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [fAction, setFAction] = useState('');
  const [fEntity, setFEntity] = useState('');
  const [fUser, setFUser] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fQ, setFQ] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(p), per_page: '50' });
      if (fAction) sp.set('action', fAction);
      if (fEntity) sp.set('entity_type', fEntity);
      if (fUser) sp.set('user', fUser);
      if (fFrom) sp.set('from', fFrom);
      if (fTo) sp.set('to', fTo);
      if (fQ) sp.set('q', fQ);
      const r = await fetch(`/api/audit-log?${sp}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [page, fAction, fEntity, fUser, fFrom, fTo, fQ]);

  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => { setPage(1); load(1); };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  const toggle = (id: number) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <ScrollText className="h-5 w-5 text-blue-600" />
            Log de Auditoria
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Quem fez o quê: congelamentos, aprovações, edições e gestão de usuários
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="!pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-500">
              Ação
              <select
                className="mt-1 block w-48 rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={fAction}
                onChange={(e) => setFAction(e.target.value)}
              >
                <option value="">todas</option>
                {(data?.actions ?? []).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Entidade
              <select
                className="mt-1 block w-36 rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={fEntity}
                onChange={(e) => setFEntity(e.target.value)}
              >
                <option value="">todas</option>
                {['quinzena', 'report', 'titulo', 'usuario'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Usuário
              <input
                className="mt-1 block w-44 rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="email"
                value={fUser}
                onChange={(e) => setFUser(e.target.value)}
              />
            </label>
            <label className="text-xs text-gray-500">
              De
              <input type="date" className="mt-1 block rounded border border-gray-300 px-2 py-1.5 text-sm" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </label>
            <label className="text-xs text-gray-500">
              Até
              <input type="date" className="mt-1 block rounded border border-gray-300 px-2 py-1.5 text-sm" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </label>
            <label className="text-xs text-gray-500">
              Busca livre
              <input
                className="mt-1 block w-52 rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="ação, entidade, detalhes…"
                value={fQ}
                onChange={(e) => setFQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />
            </label>
            <Button size="sm" onClick={applyFilters} disabled={loading}>
              <Search className="mr-1 h-4 w-4" />
              Filtrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Eventos</span>
            {data && <Badge variant="outline" className="text-xs">{data.total} registros</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="!pt-2">
          {loading && !data ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : !data || data.rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">
              Nenhum evento registrado{data ? ' para os filtros aplicados' : ' ainda'}.
            </p>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="w-6 pb-2"></th>
                    <th className="w-40 pb-2 pr-2">Quando</th>
                    <th className="w-48 pb-2 pr-2">Usuário</th>
                    <th className="w-44 pb-2 pr-2">Ação</th>
                    <th className="w-40 pb-2 pr-2">Entidade</th>
                    <th className="pb-2">Resumo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                        onClick={() => toggle(r.id)}
                      >
                        <td className="py-2 pr-1 text-gray-400">
                          {expanded.has(r.id)
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </td>
                        <td className="py-2 pr-2 text-gray-500">{fmtTime(r.created_at)}</td>
                        <td className="py-2 pr-2">
                          <div className="font-medium text-gray-800">{r.user_name || '—'}</div>
                          <div className="text-[10px] text-gray-400">{r.user_email}</div>
                        </td>
                        <td className="py-2 pr-2">
                          <Badge className={actionBadge(r.action)}>{r.action}</Badge>
                        </td>
                        <td className="py-2 pr-2 text-gray-700">
                          {r.entity_type && <span className="text-gray-400">{r.entity_type} </span>}
                          {r.entity_id}
                        </td>
                        <td className="max-w-[300px] truncate py-2 text-gray-500">
                          {r.details ? JSON.stringify(r.details).slice(0, 120) : '—'}
                        </td>
                      </tr>
                      {expanded.has(r.id) && (
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <td></td>
                          <td colSpan={5} className="py-2 pr-4">
                            <pre className="max-h-48 overflow-auto rounded bg-white p-2 text-[11px] text-gray-700">
                              {JSON.stringify(r.details, null, 2)}
                            </pre>
                            {r.ip && <p className="mt-1 text-[10px] text-gray-400">ip: {r.ip}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Página {data.page} de {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
