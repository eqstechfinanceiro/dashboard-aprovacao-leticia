'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  History,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistRow {
  id: number;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any> | null;
}

// Rótulo amigável por action — o usuário lê "confirmou erro na NF" em vez de
// "fiscal.revisar". Famílias por prefixo agrupam cor.
const ACTION_LABEL: Record<string, string> = {
  'fiscal.revisar': 'Revisou nota fiscal',
  'fiscal.bordero_refresh': 'Reverificou borderôs',
  'fiscal.bordero_removida_auto': 'Nota saiu do borderô (auto)',
  'fiscal.bordero_paga': 'Nota paga em borderô (auto)',
  'fiscal.bordero_remocao_confirmada': 'Confirmou remoção do borderô',
  'fiscal.relancada_detectada': 'Re-lançamento detectado (auto)',
  'changelog.create': 'Publicou versão no changelog',
  'changelog.update': 'Editou versão do changelog',
  'changelog.delete': 'Excluiu versão do changelog',
  'quinzena.freeze': 'Congelou quinzena',
  'quinzena.unfreeze': 'Descongelou quinzena',
  'quinzena.import_qz': 'Importou quinzena',
  'relatorio.approve': 'Aprovou relatório',
  'relatorio.reject': 'Reprovou relatório',
  'impacto.titulo_edit': 'Editou título (impacto)',
  'auth.login': 'Login',
  'auth.login_failed': 'Login falhou',
  'auth.password_change': 'Trocou senha',
  'users.create': 'Criou usuário',
  'users.update': 'Editou usuário',
};

const ACTION_COLOR: [RegExp, string][] = [
  [/^fiscal\./, 'bg-blue-100 text-blue-700'],
  [/^changelog\./, 'bg-violet-100 text-violet-700'],
  [/^quinzena\./, 'bg-indigo-100 text-indigo-700'],
  [/^relatorio\.(approve)/, 'bg-green-100 text-green-700'],
  [/^relatorio\.(reject)/, 'bg-red-100 text-red-700'],
  [/^impacto\./, 'bg-purple-100 text-purple-700'],
  [/^auth\./, 'bg-slate-100 text-slate-600'],
  [/^users\./, 'bg-cyan-100 text-cyan-700'],
];

function actionBadge(a: string): string {
  for (const [re, cls] of ACTION_COLOR) if (re.test(a)) return cls;
  return 'bg-gray-100 text-gray-700';
}

function actionLabel(a: string): string {
  return ACTION_LABEL[a] || a;
}

// Resumo humano do details JSON — extrai os campos que contam a história.
function detailSummary(r: HistRow): string {
  const d = r.details || {};
  const parts: string[] = [];
  if (d.decisao) parts.push(`decisão: ${d.decisao}`);
  if (d.doc) parts.push(`NF ${d.doc}${d.serie ? '/' + d.serie : ''}`);
  if (d.erro_tipo) parts.push(`erro: ${d.erro_tipo}`);
  if (d.cancel_motivo) parts.push(`motivo: ${d.cancel_motivo}`);
  if (d.corrigida_nota) parts.push(d.corrigida_nota);
  if (d.status) parts.push(d.status);
  if (d.nota) parts.push(d.nota);
  if (d.title) parts.push(d.title);
  if (!parts.length && d.decisao_anterior) parts.push(`era ${d.decisao_anterior}`);
  return parts.join(' · ');
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const PAGE_SIZE = 25;

export default function HistoricoPage() {
  const [data, setData] = useState<{ rows: HistRow[]; total: number; actions: string[]; entity_types: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (action) params.set('action', action);
      if (entityType) params.set('entity_type', entityType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('page', String(page));
      params.set('per_page', String(PAGE_SIZE));
      const r = await fetch(`/api/historico?${params}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setData(b);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, action, entityType, from, to, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-indigo-600" />
            Histórico de atividades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quem fez o quê no sistema — revisões fiscais, borderôs, aprovações e automações.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          className="rounded-md border bg-white px-3 py-1.5 text-sm w-64"
          placeholder="Buscar usuário ou entidade…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <select
          className="rounded-md border bg-white px-2 py-1.5 text-sm"
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
        >
          <option value="">Todas as ações</option>
          {(data?.actions || []).map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <select
          className="rounded-md border bg-white px-2 py-1.5 text-sm"
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
        >
          <option value="">Todas as entidades</option>
          {(data?.entity_types || []).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          De
          <input type="date" className="rounded-md border bg-white px-2 py-1.5 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          até
          <input type="date" className="rounded-md border bg-white px-2 py-1.5 text-sm" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </label>
        {(q || action || entityType || from || to) && (
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => { setQInput(''); setQ(''); setAction(''); setEntityType(''); setFrom(''); setTo(''); setPage(1); }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{data ? `${data.total} registro(s)` : 'Atividades'}</span>
            <span className="text-xs font-normal text-muted-foreground">página {page} de {totalPages}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : !data || data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade no período.</p>
          ) : (
            <div className="space-y-1">
              {data.rows.map((r) => {
                const isOpen = expanded.has(r.id);
                const summary = detailSummary(r);
                return (
                  <div key={r.id} className="rounded-md border">
                    <button
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                      onClick={() => {
                        const next = new Set(expanded);
                        if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                        setExpanded(next);
                      }}
                    >
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <span className="text-xs text-muted-foreground w-32 shrink-0">{fmtTime(r.created_at)}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0', actionBadge(r.action))}>
                        {actionLabel(r.action)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{r.user_name || r.user_email || 'sistema'}</span>
                        {summary && <span className="text-xs text-muted-foreground"> — {summary}</span>}
                      </div>
                      {(r.entity_type || r.entity_id) && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {r.entity_type}{r.entity_id ? ` #${r.entity_id}` : ''}
                        </span>
                      )}
                    </button>
                    {isOpen && r.details && (
                      <pre className="border-t bg-muted/30 px-3 py-2 text-[11px] overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(r.details, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {data && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
