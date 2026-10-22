'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Landmark,
  RefreshCw,
  Loader2,
  ExternalLink,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Ban,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BorderoLinha {
  numbor: string;
  databor: string | null;
  banco: string;
  banco_nome?: string;
  agencia: string;
  conta: string;
  situacao: string;
  ocorrencia: string;
  baixa: string | null;
}

interface BorderoNota {
  nota_id: number;
  tipo: string;
  doc: string;
  serie: string | null;
  filial: string | null;
  fornecedor: string | null;
  cnpj: string | null;
  valor: number | null;
  emissao: string | null;
  chave_acesso: string | null;
  review_status: string;
  erro_tipo: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  extra: Record<string, any> | null;
  em_bordero: boolean;
  pago: boolean;
  borderos: BorderoLinha[];
  checked_at: string | null;
  remocao_confirmada_at: string | null;
  remocao_confirmada_by: string | null;
  removida_detectada_at: string | null;
}

const ERRO_LABEL: Record<string, string> = {
  tes_errado: 'TES errada',
  imposto_errado: 'Imposto errado',
  valor_errado: 'Valor errado',
  doc_invalido: 'Documento inválido',
  fornecedor_errado: 'Fornecedor errado',
  tipo_errado: 'Tipo errado',
  sem_documento: 'Sem documento',
  outro: 'Outro',
};

function fmtBRL(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCnpj(v: string | null | undefined): string {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return v || '—';
}

function fmtData(v: string | null | undefined): string {
  if (!v) return '—';
  const d = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : v;
}

// Nome legível do fornecedor — em mercadoria a coluna guarda o código SA2;
// o nome vem do check 'Nome Fornecedor' não disponível aqui, então usamos o
// extra.portal_nome se existir e caímos no código.
function fornecedorLabel(n: BorderoNota): string {
  return n.extra?.fornecedor_nome || n.extra?.nome_fornecedor || n.fornecedor || '—';
}

export default function BorderosPage() {
  const [data, setData] = useState<{ notas: BorderoNota[]; resumo: { na_fila: number; pagas_na_fila: number; ultima_verificacao: string | null } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [acting, setActing] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<BorderoNota | null>(null);
  const [confirmNota, setConfirmNota] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/borderos/notas?${todas ? 'todas=1' : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [todas, q]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const refreshAgora = async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/borderos/refresh', { method: 'POST' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e: any) {
      alert(`Erro ao reverificar: ${e.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const confirmarRemocao = async () => {
    if (!confirmModal) return;
    const id = confirmModal.nota_id;
    setActing(id);
    try {
      const r = await fetch('/api/borderos/confirmar-remocao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota_id: id, nota: confirmNota.trim() || undefined }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setConfirmModal(null);
      setConfirmNota('');
      await load();
    } catch (e: any) {
      alert(`Erro ao confirmar remoção: ${e.message}`);
    } finally {
      setActing(null);
    }
  };

  const ultimaVerif = data?.resumo?.ultima_verificacao
    ? new Date(data.resumo.ultima_verificacao).toLocaleString('pt-BR')
    : null;

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="h-6 w-6 text-amber-600" />
            Borderôs — Contas a Pagar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notas com erro confirmado ou canceladas cujo título está em borderô — remover no Protheus pra liberar a correção.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ultimaVerif && (
            <span className="text-xs text-muted-foreground">Verificado em {ultimaVerif}</span>
          )}
          <Button variant="outline" size="sm" onClick={refreshAgora} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Reverificar agora
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          className="rounded-md border bg-white px-3 py-1.5 text-sm w-64"
          placeholder="Buscar NF ou fornecedor…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={todas}
            onChange={(e) => setTodas(e.target.checked)}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          Mostrar resolvidas
        </label>
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            {data.resumo.na_fila} na fila{data.resumo.pagas_na_fila ? ` · ${data.resumo.pagas_na_fila} já paga(s)` : ''}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {todas ? 'Todas as notas verificadas' : 'Aguardando remoção do borderô'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : !data || data.notas.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-700">Fila vazia</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nenhuma nota com erro/cancelada está em borderô agora.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.notas.map((n) => {
                const isOpen = expanded.has(n.nota_id);
                const resolvida = !n.em_bordero || !!n.remocao_confirmada_at || !!n.removida_detectada_at;
                return (
                  <div key={n.nota_id} className={cn('rounded-lg border', resolvida && 'opacity-70')}>
                    <button
                      className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
                      onClick={() => {
                        const next = new Set(expanded);
                        if (next.has(n.nota_id)) next.delete(n.nota_id); else next.add(n.nota_id);
                        setExpanded(next);
                      }}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">NF {n.doc}</span>
                          {n.serie && <span className="text-xs text-muted-foreground">série {n.serie}</span>}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            {n.tipo === 'servico' ? 'Serviço' : n.tipo === 'vexpenses' ? 'VExpenses' : 'Mercadoria'}
                          </span>
                          {n.review_status === 'cancelado' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                              <Ban className="h-3 w-3" /> Cancelada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              <XCircle className="h-3 w-3" /> {ERRO_LABEL[n.erro_tipo || ''] || 'Erro confirmado'}
                            </span>
                          )}
                          {n.pago && (
                            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-white">
                              Já paga
                            </span>
                          )}
                          {n.remocao_confirmada_at && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Remoção confirmada{n.remocao_confirmada_by ? ` por ${n.remocao_confirmada_by}` : ''}
                            </span>
                          )}
                          {n.removida_detectada_at && !n.em_bordero && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Removida do borderô
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {fornecedorLabel(n)} {n.cnpj ? `· ${fmtCnpj(n.cnpj)}` : ''} {n.emissao ? `· ${fmtData(n.emissao)}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-semibold shrink-0">{fmtBRL(n.valor)}</span>
                    </button>

                    {isOpen && (
                      <div className="border-t px-4 py-3 space-y-3">
                        {n.pago && (
                          <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 flex items-center gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Título já baixado — correção exige estorno. Ao confirmar, a nota volta pro entrada de notas.
                          </div>
                        )}
                        {n.borderos.map((b, i) => (
                          <div key={i} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Borderô <span className="font-semibold">Nº {b.numbor || '—'}</span>
                            {b.databor ? ` · ${fmtData(b.databor)}` : ''}
                            {b.banco ? ` · ${b.banco_nome || b.banco}` : ''}
                            {b.agencia ? ` ag ${b.agencia}` : ''}
                            {b.conta ? ` cc ${b.conta}` : ''}
                            {b.baixa ? ` — baixada em ${fmtData(b.baixa)}` : ''}
                            {b.ocorrencia ? ` · ocorr. ${b.ocorrencia}` : ''}
                          </div>
                        ))}
                        {!n.borderos.length && (
                          <p className="text-[11px] text-muted-foreground">Sem linha SEA ativa na última verificação.</p>
                        )}

                        {n.chave_acesso && (
                          <p className="text-xs text-muted-foreground select-all">Chave: {n.chave_acesso}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`/api/borderos/portal-link?id=${n.nota_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-blue-600" /> Abrir no portal EQS
                          </a>
                          <a
                            href={`/api/borderos/doc?id=${n.nota_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <FileText className="h-3.5 w-3.5 text-blue-600" /> Ver documento
                          </a>
                          {!resolvida && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              disabled={acting === n.nota_id}
                              title={n.pago ? 'Título já pago — confirmar que a baixa foi tratada (estorno) e devolver a nota pro entrada' : 'Confirmar que o título foi removido do borderô e devolver a nota pro entrada'}
                              onClick={() => { setConfirmModal(n); setConfirmNota(''); }}
                            >
                              {acting === n.nota_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                              {n.pago ? 'Devolver p/ entrada' : 'Confirmar remoção'}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal — confirmar remoção do título */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-background p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {confirmModal.pago ? 'Devolver nota pro entrada' : 'Confirmar remoção do borderô'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {confirmModal.pago
                ? `O título da NF ${confirmModal.doc} (${fmtBRL(confirmModal.valor)}) já foi pago — confirma que a baixa foi tratada/estornada no Protheus?`
                : `Confirma que o título da NF ${confirmModal.doc} (${fmtBRL(confirmModal.valor)}) foi removido do borderô de pagamento no Protheus?`}
            </p>
            <p className="text-xs text-muted-foreground">
              A nota sai desta fila e volta pra coluna <strong>Pendente</strong> do setor de entrada de notas.
            </p>
            <input
              className="w-full rounded border bg-white px-2 py-1.5 text-sm"
              placeholder="Observação (opcional)"
              value={confirmNota}
              onChange={(e) => setConfirmNota(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmModal(null)}>Voltar</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={acting === confirmModal.nota_id}
                onClick={confirmarRemocao}
              >
                {acting === confirmModal.nota_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
