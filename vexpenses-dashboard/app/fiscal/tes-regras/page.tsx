'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Plus, Upload, RefreshCw, Trash2, Check, X,
  Loader2, Search, Building2, Package, ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Regra {
  id: number;
  empresa: string;
  fornecedor_cnpj: string;
  fornecedor_nome: string | null;
  produto: string;
  produto_desc: string | null;
  tes: string;
  ativo: boolean;
  updated_at: string;
}

const fmtCnpj = (c: string) =>
  c.length === 14 ? c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : c;

export default function TesRegrasPage() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [soAtivos, setSoAtivos] = useState(true);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const [editTes, setEditTes] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ cnpj: '', nome: '', produto: '', desc: '', tes: '', empresa: '*' });
  const [addMsg, setAddMsg] = useState('');

  const [impOpen, setImpOpen] = useState(false);
  const [impFile, setImpFile] = useState<File | null>(null);
  const [impEmpresa, setImpEmpresa] = useState('*');
  const [importing, setImporting] = useState(false);
  const [impResult, setImpResult] = useState<any>(null);

  const debounce = useRef<NodeJS.Timeout>();
  const load = useCallback(async (p = page) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (q) params.set('q', q);
    if (empresa) params.set('empresa', empresa);
    if (soAtivos) params.set('ativo', '1');
    const r = await fetch(`/api/fiscal/tes-regras?${params}`);
    const j = await r.json();
    setRegras(j.regras || []); setTotal(j.total || 0); setStats(j.stats || {});
    setLoading(false);
  }, [q, empresa, soAtivos, page]);

  useEffect(() => { load(page); }, [page]); // eslint-disable-line
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); load(1); }, 350);
    return () => clearTimeout(debounce.current);
  }, [q, empresa, soAtivos]); // eslint-disable-line

  const salvarTes = async (regra: Regra) => {
    const tes = (editTes[regra.id] ?? regra.tes).trim().toUpperCase();
    if (!tes) return;
    setSaving(regra.id);
    await fetch('/api/fiscal/tes-regras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...regra, fornecedor_cnpj: regra.fornecedor_cnpj, produto: regra.produto, tes }),
    });
    setSaving(null);
    setEditTes((m) => { const n = { ...m }; delete n[regra.id]; return n; });
    load(page);
  };

  const toggleAtivo = async (regra: Regra) => {
    setSaving(regra.id);
    await fetch('/api/fiscal/tes-regras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...regra, ativo: !regra.ativo }),
    });
    setSaving(null); load(page);
  };

  const excluir = async (id: number) => {
    if (!confirm('Excluir esta regra?')) return;
    await fetch(`/api/fiscal/tes-regras?id=${id}`, { method: 'DELETE' });
    load(page);
  };

  const adicionar = async () => {
    setAddMsg('');
    const r = await fetch('/api/fiscal/tes-regras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fornecedor_cnpj: addForm.cnpj, fornecedor_nome: addForm.nome,
        produto: addForm.produto, produto_desc: addForm.desc,
        tes: addForm.tes, empresa: addForm.empresa,
      }),
    });
    const j = await r.json();
    if (!r.ok) { setAddMsg(j.error || 'Erro'); return; }
    setAddOpen(false);
    setAddForm({ cnpj: '', nome: '', produto: '', desc: '', tes: '', empresa: '*' });
    load(1); setPage(1);
  };

  const importar = async () => {
    if (!impFile) return;
    setImporting(true); setImpResult(null);
    const fd = new FormData();
    fd.set('file', impFile); fd.set('empresa', impEmpresa);
    const r = await fetch('/api/fiscal/tes-regras/import', { method: 'POST', body: fd });
    setImpResult(await r.json());
    setImporting(false);
    load(1); setPage(1);
  };

  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const inp = 'w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-500';

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/fiscal">
          <Button variant="outline" size="sm"><ArrowLeft size={14} className="mr-1" /> Fiscal</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Regras de TES por Fornecedor × Produto</h1>
          <p className="text-xs text-slate-500">O Lince lê estas regras ao vivo antes de lançar cada NF — o override vence a regra fiscal padrão.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(page)}><RefreshCw size={14} /></Button>
        <Button size="sm" variant="outline" onClick={() => { setImpOpen(true); setImpResult(null); }}>
          <Upload size={14} className="mr-1" /> Importar planilha
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} className="mr-1" /> Nova regra</Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <ListChecks size={16} />, label: 'Regras ativas', v: stats.ativos ?? '—' },
          { icon: <Building2 size={16} />, label: 'Fornecedores', v: stats.fornecedores ?? '—' },
          { icon: <Package size={16} />, label: 'Produtos', v: stats.produtos ?? '—' },
          { icon: <ListChecks size={16} />, label: 'Total (com inativas)', v: stats.total ?? '—' },
        ].map((s, i) => (
          <Card key={i}><CardContent className="p-3 flex items-center gap-3">
            <div className="text-slate-400">{s.icon}</div>
            <div><div className="text-lg font-semibold">{s.v}</div><div className="text-[10px] text-slate-500">{s.label}</div></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-2 top-2 text-slate-400" />
              <input className={cn(inp, 'pl-7')} placeholder="Buscar fornecedor, CNPJ, produto..."
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={cn(inp, 'w-auto')} value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
              <option value="">Todas as empresas</option><option>EQS</option><option>BRATEC</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={soAtivos} onChange={(e) => setSoAtivos(e.target.checked)} /> só ativas
            </label>
            <span className="text-xs text-slate-400 ml-auto">{total} regra(s)</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400"><Loader2 className="animate-spin inline" size={18} /></div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-y text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Fornecedor</th>
                  <th className="text-left px-3 py-2">CNPJ</th>
                  <th className="text-left px-3 py-2">Produto</th>
                  <th className="text-left px-3 py-2">Descrição</th>
                  <th className="text-center px-2 py-2">Emp.</th>
                  <th className="text-center px-2 py-2 w-24">TES</th>
                  <th className="text-center px-2 py-2">Ativa</th>
                  <th className="px-2 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {regras.map((r) => {
                  const dirty = editTes[r.id] !== undefined && editTes[r.id] !== r.tes;
                  return (
                    <tr key={r.id} className={cn('border-b last:border-0', !r.ativo && 'opacity-50')}>
                      <td className="px-3 py-1.5 font-medium">{r.fornecedor_nome || '—'}</td>
                      <td className="px-3 py-1.5 font-mono">{fmtCnpj(r.fornecedor_cnpj)}</td>
                      <td className="px-3 py-1.5 font-mono">{r.produto}</td>
                      <td className="px-3 py-1.5 text-slate-500 max-w-[220px] truncate">{r.produto_desc || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{r.empresa === '*' ? 'todas' : r.empresa}</td>
                      <td className="px-2 py-1 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <input className={cn(inp, 'w-16 text-center font-mono', dirty && 'border-amber-500 bg-amber-50')}
                            value={editTes[r.id] ?? r.tes}
                            onChange={(e) => setEditTes((m) => ({ ...m, [r.id]: e.target.value }))} />
                          {dirty && (
                            <>
                              <button onClick={() => salvarTes(r)} className="text-green-600 hover:text-green-800">
                                {saving === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                              </button>
                              <button onClick={() => setEditTes((m) => { const n = { ...m }; delete n[r.id]; return n; })}
                                className="text-slate-400"><X size={13} /></button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => toggleAtivo(r)}
                          className={cn('w-8 h-4 rounded-full relative transition-colors',
                            r.ativo ? 'bg-green-500' : 'bg-slate-300')}>
                          <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
                            r.ativo ? 'left-4.5 left-[18px]' : 'left-0.5')} />
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => excluir(r.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
                {!regras.length && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    Nenhuma regra. Importe a planilha ou adicione manualmente.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 p-2 border-t text-xs">
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
          <div className="bg-white rounded-lg p-5 w-[420px] space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">Nova regra</h2>
            {[
              { k: 'cnpj', label: 'CNPJ do fornecedor', ph: '12.345.678/0001-90' },
              { k: 'nome', label: 'Nome do fornecedor (opcional)', ph: 'FORNECEDOR LTDA' },
              { k: 'produto', label: 'Código do produto', ph: 'SB1 ou código do fornecedor (cProd)' },
              { k: 'desc', label: 'Descrição (opcional)', ph: '' },
              { k: 'tes', label: 'TES destino', ph: '408' },
            ].map((f) => (
              <div key={f.k}>
                <label className="text-xs text-slate-600">{f.label}</label>
                <input className={inp} placeholder={f.ph} value={(addForm as any)[f.k]}
                  onChange={(e) => setAddForm({ ...addForm, [f.k]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-600">Empresa</label>
              <select className={inp} value={addForm.empresa} onChange={(e) => setAddForm({ ...addForm, empresa: e.target.value })}>
                <option value="*">Todas</option><option>EQS</option><option>BRATEC</option>
              </select>
            </div>
            {addMsg && <p className="text-xs text-red-600">{addMsg}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={adicionar} disabled={!addForm.cnpj || !addForm.produto || !addForm.tes}>Salvar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Importar */}
      {impOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setImpOpen(false)}>
          <div className="bg-white rounded-lg p-5 w-[460px] space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">Importar planilha de regras</h2>
            <p className="text-xs text-slate-500">
              XLSX ou CSV com colunas <b>cnpj</b>, <b>produto</b> e <b>tes</b>
              (aceita variações: fornecedor/item/código/tes_nova; opcionais: nome, descrição, empresa).
            </p>
            <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => setImpFile(e.target.files?.[0] || null)} className="text-xs" />
            <div>
              <label className="text-xs text-slate-600">Empresa padrão (se a planilha não tiver coluna)</label>
              <select className={inp} value={impEmpresa} onChange={(e) => setImpEmpresa(e.target.value)}>
                <option value="*">Todas</option><option>EQS</option><option>BRATEC</option>
              </select>
            </div>
            {impResult && (
              <div className={cn('text-xs p-3 rounded border',
                impResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
                {impResult.ok
                  ? <>✓ {impResult.inseridos} inseridas · {impResult.atualizados} atualizadas · {impResult.totalErros} erros
                      {impResult.erros?.length > 0 && (
                        <ul className="mt-2 max-h-32 overflow-auto space-y-0.5">
                          {impResult.erros.map((e: any, i: number) =>
                            <li key={i} className="text-red-700">L{e.linha}: {e.motivo} — {e.raw}</li>)}
                        </ul>)}
                    </>
                  : <>✗ {impResult.error} {impResult.header && `(header: ${impResult.header.join(', ')})`}</>}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setImpOpen(false)}>Fechar</Button>
              <Button size="sm" onClick={importar} disabled={!impFile || importing}>
                {importing ? <Loader2 size={13} className="animate-spin mr-1" /> : null} Importar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
