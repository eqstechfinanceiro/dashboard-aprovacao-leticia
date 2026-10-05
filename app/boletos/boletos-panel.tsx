'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RefreshCw, Loader2, AlertTriangle, ScanBarcode, ChevronDown,
  ChevronRight, Search, CheckCircle2, Building2,
} from 'lucide-react';

/* ============================ tipos ============================ */

interface Flag {
  tipo: string;
  detalhe: string;
}

interface Titulo {
  id: number;
  empresa: string;
  filial: string;
  prefixo: string;
  num: string;
  parcela: string;
  tipo: string;
  natureza: string | null;
  natureza_desc: string | null;
  fornecedor: string;
  fornecedor_nome: string | null;
  emissao: string | null;
  vencto: string | null;
  vencto_real: string | null;
  baixa: string | null;
  dt_digit: string | null;
  valor: number;
  acresc: number;
  multa: number;
  juros: number;
  saldo: number;
  codbar: string | null;
  lindig: string | null;
  portado: string | null;
  bco_pgto: string | null;
  historico: string | null;
  origem: string | null;
  flags: Flag[];
  flag_count: number;
  synced_at: string;
}

interface BoletosData {
  titulos: Titulo[];
  resumoFlags: { tipo: string; qtd: number }[];
  fornecedores: string[];
  sync: { empresa: string; at: string; count: number; flagged: number }[];
  totais: { qtd: number; abertos: number; valorAberto: number };
}

/* ============================ constantes ============================ */

const FLAG_LABEL: Record<string, { label: string; cor: string }> = {
  valor_divergente: { label: 'Valor divergente', cor: 'bg-red-100 text-red-800 border-red-300' },
  vencimento_divergente: { label: 'Vencimento divergente', cor: 'bg-red-100 text-red-800 border-red-300' },
  dv_geral_invalido: { label: 'DV geral inválido', cor: 'bg-orange-100 text-orange-800 border-orange-300' },
  dv_campo_invalido: { label: 'DV de campo inválido', cor: 'bg-orange-100 text-orange-800 border-orange-300' },
  lindig_diverge_codbar: { label: 'Linha × código divergem', cor: 'bg-orange-100 text-orange-800 border-orange-300' },
  formato_invalido: { label: 'Formato inválido', cor: 'bg-orange-100 text-orange-800 border-orange-300' },
  codbar_duplicado: { label: 'Código duplicado', cor: 'bg-amber-100 text-amber-800 border-amber-300' },
  lado_ausente: { label: 'Lado ausente', cor: 'bg-amber-100 text-amber-800 border-amber-300' },
};

const FLAG_ORDER = Object.keys(FLAG_LABEL);

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (d: string | null) =>
  d ? d.split('-').reverse().join('/') : '—';
const EMPRESA_COR: Record<string, string> = { EQS: '#7c3aed', BRATEC: '#dc2626' };

function flagBadge(tipo: string) {
  const f = FLAG_LABEL[tipo] || { label: tipo, cor: 'bg-gray-100 text-gray-700 border-gray-300' };
  return f;
}

/* ============================ componente ============================ */

export default function BoletosPanel() {
  const [data, setData] = useState<BoletosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [empresa, setEmpresa] = useState<string>('');
  const [status, setStatus] = useState<string>('aberto');
  const [flagsSel, setFlagsSel] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [buscaDeb, setBuscaDeb] = useState('');
  const [soFlags, setSoFlags] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [flagsOpen, setFlagsOpen] = useState(false);
  const flagsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (flagsRef.current && !flagsRef.current.contains(e.target as Node)) setFlagsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const p = new URLSearchParams();
      if (empresa) p.set('empresas', empresa);
      if (status) p.set('status', status);
      if (flagsSel.length) p.set('flags', flagsSel.join(','));
      if (buscaDeb) p.set('q', buscaDeb);
      p.set('so_flags', soFlags ? '1' : '0');
      const r = await fetch(`/api/boletos?${p}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [empresa, status, flagsSel, buscaDeb, soFlags]);

  useEffect(() => { carregar(); }, [carregar]);

  const sincronizar = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/boletos/sync', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro no sync');
    } finally {
      setSyncing(false);
    }
  };

  const toggleRow = (id: number) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const lastSync = useMemo(
    () => data?.sync?.map((s) => `${s.empresa} ${new Date(s.at).toLocaleString('pt-BR')}`).join(' · '),
    [data]
  );

  return (
    <div className="p-6 space-y-4">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ScanBarcode className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold">Boletos — Inconsistências</h1>
            {lastSync && <p className="text-xs text-muted-foreground">Último sync: {lastSync}</p>}
          </div>
        </div>
        <Button onClick={sincronizar} disabled={syncing} variant="outline" size="sm">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sincronizar Protheus
        </Button>
      </div>

      {/* cards resumo por flag */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        <Card
          className={`cursor-pointer border-2 ${flagsSel.length === 0 && soFlags ? 'border-blue-400' : 'border-transparent'}`}
          onClick={() => { setFlagsSel([]); setSoFlags(true); }}
        >
          <CardContent className="flex h-full min-h-[92px] flex-col justify-center gap-1 p-4 !pt-4">
            <div className="text-2xl font-bold">{data?.totais.qtd ?? '—'}</div>
            <div className="text-xs text-muted-foreground">títulos com inconsistência</div>
          </CardContent>
        </Card>
        {(data?.resumoFlags || []).map((f) => {
          const fb = flagBadge(f.tipo);
          const ativo = flagsSel.includes(f.tipo);
          return (
            <Card
              key={f.tipo}
              className={`cursor-pointer border-2 ${ativo ? 'border-blue-400' : 'border-transparent'}`}
              onClick={() =>
                setFlagsSel((prev) => (ativo ? prev.filter((x) => x !== f.tipo) : [...prev, f.tipo]))
              }
            >
              <CardContent className="flex h-full min-h-[92px] flex-col justify-center gap-1 p-4 !pt-4">
                <div className="text-2xl font-bold">{f.qtd}</div>
                <div className="text-xs text-muted-foreground leading-tight">{fb.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nº, fornecedor ou linha digitável…"
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background w-72"
          />
        </div>
        <select
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          <option value="">Todas empresas</option>
          <option value="EQS">EQS</option>
          <option value="BRATEC">BRATEC</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          <option value="aberto">Em aberto</option>
          <option value="baixado">Baixados (60d)</option>
          <option value="">Todos</option>
        </select>
        <div ref={flagsRef} className="relative">
          <button
            type="button"
            onClick={() => setFlagsOpen((o) => !o)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background hover:bg-muted"
          >
            {flagsSel.length ? `${flagsSel.length} inconsistência(s)` : 'Tipo de inconsistência'}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
          {flagsOpen && (
            <div className="absolute z-30 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
              <button
                type="button"
                onClick={() => setFlagsSel([])}
                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground"
              >
                limpar seleção
              </button>
              {FLAG_ORDER.map((t) => (
                <label key={t} className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flagsSel.includes(t)}
                    onChange={() =>
                      setFlagsSel((prev) =>
                        prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                      )
                    }
                  />
                  {FLAG_LABEL[t].label}
                </label>
              ))}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={soFlags} onChange={(e) => setSoFlags(e.target.checked)} />
          Somente com inconsistência
        </label>
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            {data.totais.qtd} título(s) · {data.totais.abertos} abertos · {fmtBRL(data.totais.valorAberto)} em aberto
          </span>
        )}
      </div>

      {/* tabela */}
      <Card>
        <CardContent className="p-0">
          {erro && <div className="p-4 text-sm text-red-600">{erro}</div>}
          {loading ? (
            <div className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : !data || data.titulos.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              Nenhum título com inconsistência encontrado.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 p-2"></th>
                  <th className="p-2 text-left">Empresa</th>
                  <th className="p-2 text-left">Nº Título</th>
                  <th className="p-2 text-left">Fornecedor</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-left">Vencto Real</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Inconsistências</th>
                </tr>
              </thead>
              <tbody>
                {data.titulos.map((t) => {
                  const aberto = !t.baixa;
                  const isOpen = expanded.has(t.id);
                  return (
                    <React.Fragment key={t.id}>
                      <tr
                        className="border-t border-border/60 hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggleRow(t.id)}
                      >
                        <td className="p-2 text-center text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4 inline" /> : <ChevronRight className="h-4 w-4 inline" />}
                        </td>
                        <td className="p-2">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: EMPRESA_COR[t.empresa] || '#6b7280' }}
                            />
                            {t.empresa}
                          </span>
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {t.prefixo}/{t.num}{t.parcela ? `-${t.parcela}` : ''}
                        </td>
                        <td className="p-2">
                          <div className="max-w-[220px] truncate" title={t.fornecedor_nome || t.fornecedor}>
                            {t.fornecedor_nome || t.fornecedor}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">{t.fornecedor}</div>
                        </td>
                        <td className="p-2">{t.tipo}</td>
                        <td className="p-2 text-right font-medium">{fmtBRL(t.valor)}</td>
                        <td className="p-2">{fmtData(t.vencto_real)}</td>
                        <td className="p-2">
                          <Badge variant="outline" className={aberto ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}>
                            {aberto ? 'Aberto' : `Baixado ${fmtData(t.baixa)}`}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {t.flags.map((f, i) => {
                              const fb = flagBadge(f.tipo);
                              return (
                                <span key={i} className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${fb.cor}`}>
                                  {fb.label}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-border/40 bg-muted/20">
                          <td colSpan={9} className="p-4">
                            <div className="grid md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="font-semibold mb-2 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                  Inconsistências detectadas
                                </div>
                                <ul className="space-y-1">
                                  {t.flags.map((f, i) => (
                                    <li key={i} className="flex gap-2">
                                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap h-fit ${flagBadge(f.tipo).cor}`}>
                                        {flagBadge(f.tipo).label}
                                      </span>
                                      <span className="text-muted-foreground">{f.detalhe}</span>
                                    </li>
                                  ))}
                                </ul>
                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                                  <span>Emissão: <b className="text-foreground">{fmtData(t.emissao)}</b></span>
                                  <span>Digitação: <b className="text-foreground">{fmtData(t.dt_digit)}</b></span>
                                  <span>Natureza: <b className="text-foreground">{t.natureza_desc || t.natureza || '—'}</b></span>
                                  <span>Origem: <b className="text-foreground">{t.origem || '—'}</b></span>
                                  <span>Portado: <b className="text-foreground">{t.portado || '—'}</b></span>
                                  <span>Bco pgto: <b className="text-foreground">{t.bco_pgto || '—'}</b></span>
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold mb-2">Códigos registrados</div>
                                <div className="space-y-2">
                                  <div>
                                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Linha digitável</div>
                                    <code className="block font-mono text-[11px] break-all bg-background border border-border rounded p-2">
                                      {t.lindig || '—'}
                                    </code>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Código de barras</div>
                                    <code className="block font-mono text-[11px] break-all bg-background border border-border rounded p-2">
                                      {t.codbar || '—'}
                                    </code>
                                  </div>
                                  {t.historico && (
                                    <div className="text-muted-foreground">
                                      <span className="text-[10px] uppercase">Histórico:</span> {t.historico}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
