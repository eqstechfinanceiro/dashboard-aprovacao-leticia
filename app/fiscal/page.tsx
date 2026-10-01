'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Package,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  Clock,
  Maximize2,
  X,
  FileText,
  History,
  Ban,
  Upload,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Check {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
  missing_xml?: boolean;
}

interface FiscalNota {
  id: number;
  run_id: number;
  tipo: 'mercadoria' | 'servico';
  doc: string;
  serie: string | null;
  filial: string | null;
  fornecedor: string | null;
  cnpj: string | null;
  valor: number | null;
  emissao: string | null;
  chave_acesso: string | null;
  auto_status: 'match' | 'divergente' | 'erro' | 'pendente';
  auto_resumo: string | null;
  checks: Check[] | Check[][] | null;
  extra: Record<string, any> | null;
  review_status: 'auto_ok' | 'pendente' | 'falha_tecnica' | 'confirmado_ok' | 'confirmado_erro' | 'cancelado';
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_motivo: string | null;
  review_nota: string | null;
  erro_tipo: string | null;
  erro_descricao: string | null;
  resultados_id: number | null;
  doc_path: string | null;
  doc_nome: string | null;
}

interface FiscalRun {
  id: number;
  tipo: string;
  date_from: string;
  date_to: string;
  hostname: string | null;
  total_notas: number;
  matches: number;
  divergentes: number;
  erros: number;
  pendentes: number;
  created_at: string;
}

const ERRO_OPCOES: { value: string; label: string }[] = [
  { value: 'tes_errado', label: 'TES Errada' },
  { value: 'imposto_errado', label: 'Imposto Errado (ICMS/IPI/ST/ISS/IRR...)' },
  { value: 'valor_errado', label: 'Valor Errado' },
  { value: 'doc_invalido', label: 'Documento Inválido' },
  { value: 'fornecedor_errado', label: 'Fornecedor Errado' },
  { value: 'tipo_errado', label: 'Tipo Errado' },
  { value: 'sem_documento', label: 'Sem Documento (XML/PDF)' },
  { value: 'outro', label: 'Outro' },
];

const STATUS_LABEL: Record<string, string> = {
  auto_ok: 'Conferida (auto)',
  pendente: 'Pendente',
  falha_tecnica: 'Falha técnica',
  confirmado_ok: 'Confirmada OK',
  confirmado_erro: 'Erro confirmado',
  cancelado: 'Cancelada',
};

const STATUS_STYLE: Record<string, string> = {
  auto_ok: 'bg-green-100 text-green-700',
  pendente: 'bg-amber-100 text-amber-700',
  falha_tecnica: 'bg-gray-200 text-gray-600',
  confirmado_ok: 'bg-blue-100 text-blue-700',
  confirmado_erro: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-200 text-slate-600',
};

const ERRO_LABEL: Record<string, string> = Object.fromEntries(
  ERRO_OPCOES.map((o) => [o.value, o.label])
);

function fmtBRL(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function flatChecks(checks: FiscalNota['checks']): Check[] {
  if (!checks) return [];
  if (Array.isArray(checks) && checks.length > 0 && Array.isArray(checks[0])) {
    return (checks as Check[][]).flat();
  }
  return checks as Check[];
}

export default function FiscalPage() {
  const [view, setView] = useState<'fila' | 'historico'>('fila');
  const [tipo, setTipo] = useState<'mercadoria' | 'servico'>('mercadoria');
  const [status, setStatus] = useState<string>('pendente');
  const [histStatus, setHistStatus] = useState<string>('confirmado_erro');
  const [data, setData] = useState<{ runs: FiscalRun[]; resumo: Record<string, Record<string, number>>; notas: FiscalNota[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [acting, setActing] = useState<number | null>(null);
  const [erroForm, setErroForm] = useState<{ notaId: number; erro_tipo: string; descricao: string } | null>(null);
  const [cancelForm, setCancelForm] = useState<{ notaId: number; motivo: string } | null>(null);
  const [docModal, setDocModal] = useState<{ id: number; nome: string } | null>(null);
  const [onlyErr, setOnlyErr] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMotivo, setImportMotivo] = useState('');
  const [importErroTipo, setImportErroTipo] = useState('outro');
  const [importTipo, setImportTipo] = useState<'mercadoria' | 'servico'>('mercadoria');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = view === 'historico'
        ? `/api/fiscal/fila?scope=historico&status=${histStatus}&limit=500`
        : `/api/fiscal/fila?scope=fila&tipo=${tipo}&status=${status}&limit=500`;
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [view, tipo, status, histStatus]);

  useEffect(() => { load(); }, [load]);

  const revisar = async (notaId: number, decisao: string, erroTipo?: string, descricao?: string, motivo?: string) => {
    setActing(notaId);
    try {
      const res = await fetch('/api/fiscal/revisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota_id: notaId, decisao, erro_tipo: erroTipo, erro_descricao: descricao, cancel_motivo: motivo }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setErroForm(null);
      setCancelForm(null);
      await load();
    } catch (e: any) {
      alert(`Erro ao revisar: ${e.message}`);
    } finally {
      setActing(null);
    }
  };

  const importarXml = async () => {
    if (!importFile || !importMotivo.trim()) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('motivo', importMotivo.trim());
      fd.append('erro_tipo', importErroTipo);
      fd.append('tipo', importTipo);
      const res = await fetch('/api/fiscal/importar-xml', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setImportOpen(false);
      setImportFile(null);
      setImportMotivo('');
      setImportErroTipo('outro');
      setView('historico');
      setHistStatus('confirmado_erro');
      await load();
    } catch (e: any) {
      alert(`Erro ao importar: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  const exportUrl = view === 'historico'
    ? `/api/fiscal/exportar-xlsx?scope=historico&status=${histStatus}`
    : `/api/fiscal/exportar-xlsx?scope=fila&tipo=${tipo}&status=${status}`;

  const resumoTipo = data?.resumo?.[tipo] || {};
  const latestRun = data?.runs?.find((r) => r.tipo === tipo);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conferência Fiscal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notas conferidas pela automação — revise divergências e confirme erros.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* Seletor de aba: fila de trabalho × histórico de erros */}
      <div className="flex gap-2">
        <Button
          variant={view === 'fila' && tipo === 'mercadoria' ? 'default' : 'outline'}
          onClick={() => { setView('fila'); setTipo('mercadoria'); }}
        >
          <Package className="h-4 w-4 mr-2" /> Mercadoria
        </Button>
        <Button
          variant={view === 'fila' && tipo === 'servico' ? 'default' : 'outline'}
          onClick={() => { setView('fila'); setTipo('servico'); }}
        >
          <Wrench className="h-4 w-4 mr-2" /> Serviço
        </Button>
        <Button
          variant={view === 'historico' ? 'default' : 'outline'}
          onClick={() => setView('historico')}
        >
          <History className="h-4 w-4 mr-2" /> Histórico
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => { setImportTipo(view === 'fila' ? tipo : 'mercadoria'); setImportOpen(true); }}>
            <Upload className="h-4 w-4 mr-2" /> Importar XML
          </Button>
          <a href={exportUrl} download>
            <Button variant="outline" type="button">
              <Download className="h-4 w-4 mr-2" /> Exportar Excel
            </Button>
          </a>
        </div>
      </div>

      {/* Resumo do tipo selecionado (só na fila de trabalho) */}
      {view === 'fila' && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" />Pendentes</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{resumoTipo.pendente || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />Conferidas (auto)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{resumoTipo.auto_ok || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" />Confirmadas OK</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{resumoTipo.confirmado_ok || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" />Erros confirmados</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{resumoTipo.confirmado_erro || 0}</div></CardContent>
        </Card>
      </div>
      )}

      {view === 'fila' && latestRun && (
        <p className="text-xs text-muted-foreground">
          Última importação ({latestRun.tipo}): {latestRun.date_from} → {latestRun.date_to} ·{' '}
          {latestRun.total_notas} notas · {latestRun.matches} OK / {latestRun.divergentes} divergentes /{' '}
          {latestRun.erros} erros / {latestRun.pendentes} pendentes ·{' '}
          {new Date(latestRun.created_at).toLocaleString('pt-BR')}
        </p>
      )}

      {/* Filtro de status — fila: estados de trabalho; histórico: erros/canceladas */}
      {view === 'fila' ? (
        <div className="flex gap-2 flex-wrap">
          {['pendente', 'auto_ok', 'falha_tecnica', 'all'].map((s) => (
            <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => setStatus(s)}>
              {s === 'all' ? 'Todas' : STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {[
            { v: 'confirmado_erro', l: 'Erros confirmados' },
            { v: 'cancelado', l: 'Canceladas' },
            { v: 'all', l: 'Todas' },
          ].map((o) => (
            <Button key={o.v} size="sm" variant={histStatus === o.v ? 'default' : 'outline'} onClick={() => setHistStatus(o.v)}>
              {o.l}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Lista de notas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {view === 'historico'
              ? (histStatus === 'all' ? 'Histórico — erros e canceladas' : STATUS_LABEL[histStatus] || histStatus)
              : `${status === 'all' ? 'Todas as notas' : STATUS_LABEL[status]} — ${tipo === 'mercadoria' ? 'Mercadoria' : 'Serviço'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : !data || data.notas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {view === 'historico'
                ? 'Nenhuma nota neste estado. Notas com erro confirmado aparecem aqui.'
                : 'Nenhuma nota neste estado. As automações locais importam os resultados após cada execução.'}
            </p>
          ) : (
            <div className="space-y-2">
              {data.notas.map((n) => {
                const isOpen = expanded.has(n.id);
                const checks = flatChecks(n.checks);
                const falhas = checks.filter((c) => !c.match);
                return (
                  <div key={n.id} className="rounded-lg border">
                    <button
                      className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
                      onClick={() => {
                        const next = new Set(expanded);
                        if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
                        setExpanded(next);
                      }}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">NF {n.doc}</span>
                          {n.serie && <span className="text-xs text-muted-foreground">série {n.serie}</span>}
                          {view === 'historico' && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {n.tipo === 'servico' ? 'Serviço' : 'Mercadoria'}
                            </span>
                          )}
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[n.review_status])}>
                            {STATUS_LABEL[n.review_status]}
                          </span>
                          {view === 'historico' && n.erro_tipo && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 border border-red-200">
                              {ERRO_LABEL[n.erro_tipo] || n.erro_tipo}
                            </span>
                          )}
                          {n.auto_status === 'divergente' && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                              {falhas.length || '?'} divergência(s)
                            </span>
                          )}
                          {n.auto_status === 'erro' && (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">falha técnica</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {n.fornecedor || '—'} {n.emissao ? `· ${n.emissao}` : ''} {n.filial ? `· filial ${n.filial}` : ''}
                        </p>
                        {n.reviewed_by && (
                          <p className="text-xs text-blue-600 truncate">
                            {n.review_status === 'confirmado_erro' ? 'Erro confirmado' : '✓'} por {n.reviewed_by} em {n.reviewed_at ? new Date(n.reviewed_at).toLocaleString('pt-BR') : '—'}
                          </p>
                        )}
                        {n.review_status === 'cancelado' && n.cancelled_by && (
                          <p className="text-xs text-slate-600 truncate">
                            Cancelada por {n.cancelled_by} em {n.cancelled_at ? new Date(n.cancelled_at).toLocaleString('pt-BR') : '—'}
                            {n.cancel_motivo ? ` — ${n.cancel_motivo}` : ''}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold shrink-0">{fmtBRL(n.valor)}</span>
                    </button>

                    {isOpen && (
                      <div className={cn('border-t px-4 py-3', n.doc_path && 'grid gap-4 lg:grid-cols-2')}>
                        <div className="space-y-3 min-w-0">
                        {n.auto_resumo && <p className="text-sm">{n.auto_resumo}</p>}

                        {checks.length > 0 && (
                          <div className="overflow-x-auto">
                            <label className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={onlyErr}
                                onChange={(e) => setOnlyErr(e.target.checked)}
                                className="h-3.5 w-3.5 accent-red-600"
                              />
                              Somente itens com erro ({falhas.length})
                            </label>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-left text-muted-foreground">
                                  <th className="py-1 pr-3">Campo</th>
                                  <th className="py-1 pr-3">TOTVS</th>
                                  <th className="py-1 pr-3">Documento (XML/PDF)</th>
                                  <th className="py-1">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(onlyErr ? falhas : checks).map((c, i) => (
                                  <tr key={i} className={cn('border-b last:border-0', !c.match && 'bg-red-50')}>
                                    <td className="py-1 pr-3 font-medium">{c.field}</td>
                                    <td className="py-1 pr-3">{c.expected || '—'}</td>
                                    <td className="py-1 pr-3">
                                      {c.actual === '—' && (c.missing_xml || !c.match) ? (
                                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                                          ausente no XML
                                        </span>
                                      ) : (
                                        c.actual || '—'
                                      )}
                                    </td>
                                    <td className="py-1">
                                      {c.match ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                      ) : (
                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {n.chave_acesso && (
                          <p className="text-xs text-muted-foreground">Chave: {n.chave_acesso}</p>
                        )}
                        {n.doc_path && (
                          <div className="flex items-center gap-3">
                            <button
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              onClick={() => setDocModal({ id: n.id, nome: n.doc_nome || 'documento' })}
                            >
                              <Maximize2 className="h-3 w-3" /> Ampliar documento
                            </button>
                            <a
                              href={`/api/fiscal/doc?id=${n.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              Abrir em nova aba
                            </a>
                          </div>
                        )}
                        {n.reviewed_by && (
                          <p className="text-xs text-muted-foreground">
                            Revisado por {n.reviewed_by} em {n.reviewed_at ? new Date(n.reviewed_at).toLocaleString('pt-BR') : '—'}
                            {n.review_nota ? ` — ${n.review_nota}` : ''}
                            {n.erro_tipo ? ` · erro: ${n.erro_tipo}` : ''}
                          </p>
                        )}

                        {view === 'fila' && n.review_status === 'pendente' && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting === n.id}
                              onClick={() => revisar(n.id, 'confirmado_ok')}
                            >
                              {acting === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />}
                              Confirmar OK
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={acting === n.id}
                              onClick={() => setErroForm({ notaId: n.id, erro_tipo: 'tes_errado', descricao: n.auto_resumo || '' })}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Confirmar erro
                            </Button>
                          </div>
                        )}

                        {view === 'fila' && (n.review_status === 'confirmado_ok' || n.review_status === 'confirmado_erro') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={acting === n.id}
                            onClick={() => revisar(n.id, n.review_status === 'confirmado_ok' ? 'confirmado_erro' : 'confirmado_ok', n.review_status === 'confirmado_ok' ? 'outro' : (n.erro_tipo || 'outro'))}
                          >
                            Reverter para {n.review_status === 'confirmado_ok' ? 'erro' : 'OK'}
                          </Button>
                        )}

                        {/* Histórico: ações do setor que trata os erros */}
                        {view === 'historico' && n.review_status === 'confirmado_erro' && !cancelForm && (
                          <div className="pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting === n.id}
                              onClick={() => setCancelForm({ notaId: n.id, motivo: '' })}
                            >
                              <Ban className="h-4 w-4 mr-1" /> Marcar como cancelada
                            </Button>
                          </div>
                        )}

                        {view === 'historico' && n.review_status === 'cancelado' && (
                          <div className="pt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={acting === n.id}
                              onClick={() => revisar(n.id, 'confirmado_erro', n.erro_tipo || 'outro', n.erro_descricao || undefined)}
                            >
                              Desfazer cancelamento
                            </Button>
                          </div>
                        )}

                        {cancelForm?.notaId === n.id && (
                          <div className="rounded-md border border-slate-300 bg-slate-50 p-3 space-y-2">
                            <p className="text-sm font-medium text-slate-800">
                              Marcar nota como cancelada — registra quem cancelou e quando
                            </p>
                            <input
                              className="w-full rounded border bg-white px-2 py-1 text-sm"
                              placeholder="Motivo do cancelamento (opcional)"
                              value={cancelForm.motivo}
                              onChange={(e) => setCancelForm({ ...cancelForm, motivo: e.target.value })}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={acting === n.id}
                                onClick={() => revisar(n.id, 'cancelado', undefined, undefined, cancelForm.motivo)}
                              >
                                {acting === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar cancelamento'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setCancelForm(null)}>Voltar</Button>
                            </div>
                          </div>
                        )}

                        {erroForm?.notaId === n.id && (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
                            <p className="text-sm font-medium text-red-800">Confirmar erro — vai para a aba de erros</p>
                            <select
                              className="w-full rounded border bg-white px-2 py-1 text-sm"
                              value={erroForm.erro_tipo}
                              onChange={(e) => setErroForm({ ...erroForm, erro_tipo: e.target.value })}
                            >
                              {ERRO_OPCOES.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <textarea
                              className="w-full rounded border bg-white px-2 py-1 text-sm"
                              rows={2}
                              placeholder="Descrição do erro (opcional)"
                              value={erroForm.descricao}
                              onChange={(e) => setErroForm({ ...erroForm, descricao: e.target.value })}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={acting === n.id}
                                onClick={() => revisar(n.id, 'confirmado_erro', erroForm.erro_tipo, erroForm.descricao)}
                              >
                                {acting === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar erro'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setErroForm(null)}>Cancelar</Button>
                            </div>
                          </div>
                        )}
                        </div>

                        {n.doc_path && (
                          <div className="min-w-0 border rounded-md overflow-hidden bg-muted/30 flex flex-col">
                            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/50 text-xs text-muted-foreground">
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{n.doc_nome || 'documento'}</span>
                              <button
                                className="ml-auto text-blue-600 hover:underline inline-flex items-center gap-1"
                                onClick={() => setDocModal({ id: n.id, nome: n.doc_nome || 'documento' })}
                              >
                                <Maximize2 className="h-3 w-3" /> Ampliar
                              </button>
                            </div>
                            <iframe
                              src={`/api/fiscal/doc?id=${n.id}`}
                              title={`Documento NF ${n.doc}`}
                              className="w-full flex-1 min-h-[480px] bg-white"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal — importar XML de nota errada */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setImportOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-background p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Registrar nota errada via XML</h2>
              <Button size="sm" variant="ghost" onClick={() => setImportOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O sistema lê os dados da NF-e do XML e registra a nota como erro confirmado
              no histórico (dispara o e-mail informacional).
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Arquivo XML da NF-e</label>
                <input
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Tipo da nota</label>
                <select
                  className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                  value={importTipo}
                  onChange={(e) => setImportTipo(e.target.value as 'mercadoria' | 'servico')}
                >
                  <option value="mercadoria">Mercadoria</option>
                  <option value="servico">Serviço</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Tipo de erro</label>
                <select
                  className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                  value={importErroTipo}
                  onChange={(e) => setImportErroTipo(e.target.value)}
                >
                  {ERRO_OPCOES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Motivo do erro <span className="text-red-600">*</span></label>
                <textarea
                  className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                  rows={3}
                  placeholder="Ex.: Nota lançada com CFOP errado no TOTVS"
                  value={importMotivo}
                  onChange={(e) => setImportMotivo(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!importFile || !importMotivo.trim() || importing}
                onClick={importarXml}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Registrar erro
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — documento em tela quase cheia */}
      {docModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex flex-col p-4"
          onClick={() => setDocModal(null)}
        >
          <div
            className="flex items-center gap-3 rounded-t-lg bg-background px-4 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium truncate">{docModal.nome}</span>
            <a
              href={`/api/fiscal/doc?id=${docModal.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-blue-600 hover:underline"
            >
              Abrir em nova aba
            </a>
            <Button size="sm" variant="ghost" onClick={() => setDocModal(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <iframe
            src={`/api/fiscal/doc?id=${docModal.id}`}
            title={docModal.nome}
            className="flex-1 rounded-b-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
