'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Plus, Upload, RefreshCw, Trash2, Loader2,
  Search, Building2, Package, ArrowRightLeft, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Lista = 'fornecedores' | 'produtos' | 'mapa';

const fmtCnpj = (c: string) =>
  c?.length === 14 ? c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : c || '—';

const inp = 'w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-500 bg-white';

export default function TesRegrasPage() {
  const [lista, setLista] = useState<Lista>('fornecedores');
  const [itens, setItens] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [soAtivos, setSoAtivos] = useState(true);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [addMsg, setAddMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [impOpen, setImpOpen] = useState(false);
  const [impFile, setImpFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [impResult, setImpResult] = useState<any>(null);

  const debounce = useRef<NodeJS.Timeout>();
  const load = useCallback(async (p = page, l = lista) => {
    setLoading(true);
    const params = new URLSearchParams({ lista: l, page: String(p), limit: String(LIMIT) });
    if (q) params.set('q', q);
    if (soAtivos) params.set('ativo', '1');
    const r = await fetch(`/api/fiscal/tes-regras?${params}`);
    const j = await r.json();
    setItens(j.itens || []); setTotal(j.total || 0); setStats(j.stats || {});
    setLoading(false);
  }, [q, soAtivos, page, lista]);

  useEffect(() => { load(page); }, [page]); // eslint-disable-line
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); load(1); }, 300);
    return () => clearTimeout(debounce.current);
  }, [q, soAtivos, lista]); // eslint-disable-line

  const toggleAtivo = async (item: any) => {
    setSaving(true);
    await fetch('/api/fiscal/tes-regras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, lista }),
    });
    setSaving(false); load(page);
  };

  const excluir = async (id: number) => {
    if (!confirm('Remover da lista?')) return;
    await fetch(`/api/fiscal/tes-regras?lista=${lista}&id=${id}`, { method: 'DELETE' });
    load(page);
  };

  const adicionar = async () => {
    setAddMsg(''); setSaving(true);
    const r = await fetch('/api/fiscal/tes-regras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, lista }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) { setAddMsg(j.error || 'Erro'); return; }
    setAddOpen(false); setForm({}); setPage(1); load(1);
  };

  const importar = async () => {
    if (!impFile) return;
    setImporting(true); setImpResult(null);
    const fd = new FormData();
    fd.set('file', impFile);
    const isXlsx = /\.xlsx?$/i.test(impFile.name);
    const url = `/api/fiscal/tes-regras/import` + (!isXlsx ? `?lista=${lista === 'mapa' ? 'produtos' : lista}` : '');
    const r = await fetch(url, { method: 'POST', body: fd });
    setImpResult(await r.json());
    setImporting(false); setPage(1); load(1);
  };

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="p-6 pt-5 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/fiscal">
          <Button variant="outline" size="sm"><ArrowLeft size={14} className="mr-1" /> Fiscal</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Parametrização TES — Crédito de ICMS</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Regra: fornecedor ∈ lista <b>E</b> produto ∈ lista <b>E</b> TES calculada ∈ mapa → substitui pela TES de crédito.
            O Lince lê ao vivo antes de lançar cada NF.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(page)}><RefreshCw size={14} /></Button>
        <Button size="sm" variant="outline" onClick={() => { setImpOpen(true); setImpResult(null); }}>
          <Upload size={14} className="mr-1" /> Importar
        </Button>
        {lista !== 'mapa' && (
          <Button size="sm" onClick={() => { setForm({}); setAddMsg(''); setAddOpen(true); }}>
            <Plus size={14} className="mr-1" /> Adicionar
          </Button>
        )}
      </div>

      {/* stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <Building2 size={16} />, label: 'Fornecedores', v: stats.fornecedores ?? '—', warn: stats.forn_sem_cnpj },
          { icon: <Package size={16} />, label: 'Produtos', v: stats.produtos ?? '—' },
          { icon: <ArrowRightLeft size={16} />, label: 'Mapeamentos TES', v: stats.mapa ?? '—' },
          { icon: <AlertTriangle size={16} />, label: 'Forn. sem CNPJ resolvido', v: stats.forn_sem_cnpj ?? '—', danger: true },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="px-5 pb-4 pt-4 flex items-center gap-3">
              <div className={cn('text-slate-400 shrink-0', s.danger && Number(s.v) > 0 && 'text-amber-500')}>{s.icon}</div>
              <div className="min-w-0">
                <div className="text-xl font-semibold leading-6">{s.v}</div>
                <div className="text-[11px] text-slate-500 leading-4 mt-0.5">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b">
        {([['fornecedores', 'Fornecedores (SA2)'], ['produtos', 'Produtos (SB1)'], ['mapa', 'Mapa TES']] as [Lista, string][]).map(([l, label]) => (
          <button key={l} onClick={() => { setLista(l); setPage(1); setQ(''); }}
            className={cn('px-4 py-2 text-sm border-b-2 -mb-px transition-colors',
              lista === l ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-3 p-3 border-b bg-slate-50/60">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input className={cn(inp, 'pl-8')}
                placeholder={lista === 'fornecedores' ? 'Buscar código, nome, CNPJ...' : lista === 'produtos' ? 'Buscar código ou descrição...' : 'Buscar TES...'}
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={soAtivos} onChange={(e) => setSoAtivos(e.target.checked)} /> só ativas
            </label>
            <span className="text-xs text-slate-400 ml-auto">{total} registro(s)</span>
          </div>
          {loading ? (
            <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin inline" size={18} /></div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b text-slate-600">
                {lista === 'fornecedores' ? (
                  <tr>
                    <th className="text-left px-4 py-2.5">Código (SA2)</th>
                    <th className="text-left px-3 py-2.5">Loja</th>
                    <th className="text-left px-3 py-2.5">Nome</th>
                    <th className="text-left px-3 py-2.5">CNPJ</th>
                    <th className="text-center px-3 py-2.5">Emp.</th>
                    <th className="text-center px-3 py-2.5">Ativa</th>
                    <th className="px-3 py-2.5 w-12"></th>
                  </tr>
                ) : lista === 'produtos' ? (
                  <tr>
                    <th className="text-left px-4 py-2.5">Código (SB1)</th>
                    <th className="text-left px-3 py-2.5">Descrição</th>
                    <th className="text-center px-3 py-2.5">Ativa</th>
                    <th className="px-3 py-2.5 w-12"></th>
                  </tr>
                ) : (
                  <tr>
                    <th className="text-center px-4 py-2.5">Empresa</th>
                    <th className="text-center px-3 py-2.5">TES padrão</th>
                    <th className="text-center px-3 py-2.5"></th>
                    <th className="text-center px-3 py-2.5">TES crédito ICMS</th>
                    <th className="text-center px-3 py-2.5">Ativa</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id} className={cn('border-b last:border-0 hover:bg-slate-50/50', !it.ativo && 'opacity-50')}>
                    {lista === 'fornecedores' ? (<>
                      <td className="px-4 py-2 font-mono font-medium">{it.a2_cod}</td>
                      <td className="px-3 py-2 font-mono">{it.a2_loja}</td>
                      <td className="px-3 py-2 max-w-[260px] truncate">{it.nome || '—'}</td>
                      <td className="px-3 py-2 font-mono">
                        {it.cnpj ? fmtCnpj(it.cnpj) : <span className="text-amber-600">não resolvido</span>}
                      </td>
                      <td className="px-3 py-2 text-center">{it.empresa === '*' ? 'todas' : it.empresa}</td>
                    </>) : lista === 'produtos' ? (<>
                      <td className="px-4 py-2 font-mono font-medium">{it.produto}</td>
                      <td className="px-3 py-2 max-w-[420px] truncate">{it.descricao || '—'}</td>
                    </>) : (<>
                      <td className="px-4 py-2 text-center font-medium">{it.empresa}</td>
                      <td className="px-3 py-2 text-center font-mono font-semibold">{it.tes_origem}</td>
                      <td className="px-3 py-2 text-center text-slate-400">→</td>
                      <td className="px-3 py-2 text-center font-mono font-semibold text-green-700">{it.tes_destino}</td>
                    </>)}
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => toggleAtivo(it)} disabled={saving}
                        className={cn('w-9 h-[18px] rounded-full relative transition-colors inline-block',
                          it.ativo ? 'bg-green-500' : 'bg-slate-300')}>
                        <span className={cn('absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all',
                          it.ativo ? 'left-[21px]' : 'left-[3px]')} />
                      </button>
                    </td>
                    {lista !== 'mapa' && (
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => excluir(it.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </td>
                    )}
                  </tr>
                ))}
                {!itens.length && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    Lista vazia. Use "Importar" com a planilha oficial (abas fornecedores/produtos).
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 p-2.5 border-t text-xs">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</Button>
              <span className="text-slate-500">pág {page} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adicionar */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setAddOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-[420px] space-y-3.5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">
              {lista === 'fornecedores' ? 'Adicionar fornecedor' : 'Adicionar produto'}
            </h2>
            {lista === 'fornecedores' ? (<>
              {[
                { k: 'a2_cod', label: 'Código do fornecedor (SA2)', ph: 'WACCPO' },
                { k: 'a2_loja', label: 'Loja', ph: '01' },
                { k: 'cnpj', label: 'CNPJ (opcional — se vazio, resolve via TOTVS na próxima importação)', ph: '' },
                { k: 'nome', label: 'Nome (opcional)', ph: '' },
              ].map((f) => (
                <div key={f.k}>
                  <label className="text-xs text-slate-600">{f.label}</label>
                  <input className={cn(inp, 'mt-1')} placeholder={f.ph} value={form[f.k] || ''}
                    onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="text-xs text-slate-600">Empresa</label>
                <select className={cn(inp, 'mt-1')} value={form.empresa || '*'} onChange={(e) => setForm({ ...form, empresa: e.target.value })}>
                  <option value="*">Todas</option><option>EQS</option><option>BRATEC</option>
                </select>
              </div>
            </>) : (<>
              {[
                { k: 'produto', label: 'Código do produto (SB1 ou cProd do fornecedor)', ph: '1007001828' },
                { k: 'descricao', label: 'Descrição (opcional)', ph: '' },
              ].map((f) => (
                <div key={f.k}>
                  <label className="text-xs text-slate-600">{f.label}</label>
                  <input className={cn(inp, 'mt-1')} placeholder={f.ph} value={form[f.k] || ''}
                    onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                </div>
              ))}
            </>)}
            {addMsg && <p className="text-xs text-red-600">{addMsg}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={adicionar} disabled={saving}>
                {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null} Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Importar */}
      {impOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setImpOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-[480px] space-y-3.5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">Importar parametrização</h2>
            <p className="text-xs text-slate-500 leading-5">
              <b>XLSX oficial</b> com abas <b>fornecedores</b> (Forn/Cliente + Loja) e <b>produtos</b> (Produto + Descrição) — importa as duas de uma vez e resolve os CNPJs via TOTVS SA2 automaticamente.
              <br />Ou CSV com a aba atual selecionada.
            </p>
            <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => setImpFile(e.target.files?.[0] || null)} className="text-xs" />
            {impResult && (
              <div className={cn('text-xs p-3.5 rounded border leading-5',
                impResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
                {impResult.ok ? (<>
                  {impResult.fornecedores && (
                    <div>Fornecedores: <b>{impResult.fornecedores.inseridos}</b> novos · {impResult.fornecedores.atualizados} atualizados
                      {impResult.fornecedores.naoResolvidos?.length > 0 && (
                        <div className="text-amber-700 mt-1">
                          {impResult.fornecedores.naoResolvidos.length} sem CNPJ no SA2: {impResult.fornecedores.naoResolvidos.slice(0, 8).join(', ')}{impResult.fornecedores.naoResolvidos.length > 8 ? '…' : ''}
                        </div>)}
                    </div>)}
                  {impResult.produtos && (
                    <div>Produtos: <b>{impResult.produtos.inseridos}</b> novos · {impResult.produtos.atualizados} atualizados</div>)}
                </>) : <>✗ {impResult.error}</>}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setImpOpen(false)}>Fechar</Button>
              <Button size="sm" onClick={importar} disabled={!impFile || importing}>
                {importing ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
                {importing ? 'Importando (resolve CNPJs no TOTVS)…' : 'Importar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
