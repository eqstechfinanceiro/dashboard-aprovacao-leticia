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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Check {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
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
  review_status: 'auto_ok' | 'pendente' | 'falha_tecnica' | 'confirmado_ok' | 'confirmado_erro';
  reviewed_by: string | null;
  reviewed_at: string | null;
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
};

const STATUS_STYLE: Record<string, string> = {
  auto_ok: 'bg-green-100 text-green-700',
  pendente: 'bg-amber-100 text-amber-700',
  falha_tecnica: 'bg-gray-200 text-gray-600',
  confirmado_ok: 'bg-blue-100 text-blue-700',
  confirmado_erro: 'bg-red-100 text-red-700',
};

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
  const [tipo, setTipo] = useState<'mercadoria' | 'servico'>('mercadoria');
  const [status, setStatus] = useState<string>('pendente');
  const [data, setData] = useState<{ runs: FiscalRun[]; resumo: Record<string, Record<string, number>>; notas: FiscalNota[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [acting, setActing] = useState<number | null>(null);
  const [erroForm, setErroForm] = useState<{ notaId: number; erro_tipo: string; descricao: string } | null>(null);
  const [docModal, setDocModal] = useState<{ id: number; nome: string } | null>(null);
  const [onlyErr, setOnlyErr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fiscal/fila?tipo=${tipo}&status=${status}&limit=500`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tipo, status]);

  useEffect(() => { load(); }, [load]);

  const revisar = async (notaId: number, decisao: string, erroTipo?: string, descricao?: string) => {
    setActing(notaId);
    try {
      const res = await fetch('/api/fiscal/revisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota_id: notaId, decisao, erro_tipo: erroTipo, erro_descricao: descricao }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setErroForm(null);
      await load();
    } catch (e: any) {
      alert(`Erro ao revisar: ${e.message}`);
    } finally {
      setActing(null);
    }
  };

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

      {/* Seletor de fila: mercadoria × serviço */}
      <div className="flex gap-2">
        <Button
          variant={tipo === 'mercadoria' ? 'default' : 'outline'}
          onClick={() => setTipo('mercadoria')}
        >
          <Package className="h-4 w-4 mr-2" /> Mercadoria
        </Button>
        <Button
          variant={tipo === 'servico' ? 'default' : 'outline'}
          onClick={() => setTipo('servico')}
        >
          <Wrench className="h-4 w-4 mr-2" /> Serviço
        </Button>
      </div>

      {/* Resumo do tipo selecionado */}
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

      {latestRun && (
        <p className="text-xs text-muted-foreground">
          Última importação ({latestRun.tipo}): {latestRun.date_from} → {latestRun.date_to} ·{' '}
          {latestRun.total_notas} notas · {latestRun.matches} OK / {latestRun.divergentes} divergentes /{' '}
          {latestRun.erros} erros / {latestRun.pendentes} pendentes ·{' '}
          {new Date(latestRun.created_at).toLocaleString('pt-BR')}
        </p>
      )}

      {/* Filtro de status */}
      <div className="flex gap-2 flex-wrap">
        {['pendente', 'auto_ok', 'confirmado_ok', 'confirmado_erro', 'falha_tecnica', 'all'].map((s) => (
          <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => setStatus(s)}>
            {s === 'all' ? 'Todas' : STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Lista de notas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {status === 'all' ? 'Todas as notas' : STATUS_LABEL[status]} — {tipo === 'mercadoria' ? 'Mercadoria' : 'Serviço'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : !data || data.notas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma nota neste estado. As automações locais importam os resultados após cada execução.
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
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[n.review_status])}>
                            {STATUS_LABEL[n.review_status]}
                          </span>
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
                                    <td className="py-1 pr-3">{c.actual || '—'}</td>
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

                        {n.review_status === 'pendente' && (
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

                        {(n.review_status === 'confirmado_ok' || n.review_status === 'confirmado_erro') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={acting === n.id}
                            onClick={() => revisar(n.id, n.review_status === 'confirmado_ok' ? 'confirmado_erro' : 'confirmado_ok', n.review_status === 'confirmado_ok' ? 'outro' : undefined)}
                          >
                            Reverter para {n.review_status === 'confirmado_ok' ? 'erro' : 'OK'}
                          </Button>
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
