'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
  FileText, Upload, Loader2, Plus, Pencil, Trash2, FileDown, FileUp,
  AlertTriangle, CheckCircle2, X, Search, Scale, ArrowUp, ArrowDown, ArrowUpDown, BarChart3, Copy,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const STATUS_LIST = ['PENDENTE', 'PAGO', 'PAGO PELO FORNECEDOR', 'SERASA', 'SUSTADO'];
const EMPRESAS = ['EQS', 'BRATEC'];

const STATUS_STYLE: Record<string, string> = {
  PAGO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'PAGO PELO FORNECEDOR': 'bg-teal-100 text-teal-800 border-teal-200',
  SERASA: 'bg-red-100 text-red-800 border-red-200',
  SUSTADO: 'bg-gray-200 text-gray-700 border-gray-300',
  PENDENTE: 'bg-amber-100 text-amber-800 border-amber-200',
};

interface Aviso {
  id: number; empresa: string; protocolo: string | null; recebimento: string | null;
  codigo: string | null; cnpj: string | null; fornecedor: string | null; titulo: string | null;
  venc_titulo: string | null; venc_cartorio: string | null;
  valor_orig: number | null; juros: number; emolumentos: number; tarifa: number;
  valor_total: number | null; status: string; responsavel: string | null; setor: string | null;
  ano: number | null; mes: string | null; pdf_filename: string | null; has_pdf: boolean;
}

interface Draft {
  empresa: string; protocolo: string | null; recebimento: string | null;
  codigo: string | null; cnpj: string | null; fornecedor: string | null; titulo: string | null;
  venc_titulo: string | null; venc_cartorio: string | null;
  valor_orig: number | null; juros: number; emolumentos: number; tarifa: number;
  valor_total: number | null; status: string; responsavel: string | null; setor: string | null;
}

const EMPTY_DRAFT: Draft = {
  empresa: 'EQS', protocolo: null, recebimento: null, codigo: null, cnpj: null,
  fornecedor: null, titulo: null, venc_titulo: null, venc_cartorio: null,
  valor_orig: null, juros: 0, emolumentos: 0, tarifa: 2.5,
  valor_total: null, status: 'PENDENTE', responsavel: null, setor: null,
};

interface BatchItem {
  file: File;
  status: 'ok' | 'incomplete' | 'duplicate' | 'error';
  draft: Draft | null;
  meta: any;
  warnings: string[];
  selected: boolean;
  saved?: boolean;
  error?: string;
}

const EMPRESA_STYLE: Record<string, string> = {
  EQS: 'bg-blue-100 text-blue-800 border-blue-200',
  BRATEC: 'bg-violet-100 text-violet-800 border-violet-200',
};

const rowToDraft = (a: Aviso): Draft => ({
  empresa: a.empresa, protocolo: a.protocolo, recebimento: a.recebimento?.slice(0, 10) ?? null,
  codigo: a.codigo, cnpj: a.cnpj, fornecedor: a.fornecedor, titulo: a.titulo,
  venc_titulo: a.venc_titulo?.slice(0, 10) ?? null, venc_cartorio: a.venc_cartorio?.slice(0, 10) ?? null,
  valor_orig: a.valor_orig, juros: a.juros, emolumentos: a.emolumentos, tarifa: a.tarifa,
  valor_total: a.valor_total, status: a.status, responsavel: a.responsavel, setor: a.setor,
});

const fmtBRL = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

// Célula editável: clique vira input; Enter/blur salva; Esc cancela.
function EditableCell({ value, display, type = 'text', options, onSave, className = '' }: {
  value: string | number | null; display?: React.ReactNode;
  type?: 'text' | 'date' | 'number' | 'select'; options?: string[];
  onSave: (v: string | number | null) => void; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value === null || value === undefined ? '' : String(value));
  const committed = useRef(false);

  useEffect(() => { if (!editing) { setVal(value === null || value === undefined ? '' : String(value)); committed.current = false; } }, [value, editing]);

  const commit = (v?: string) => {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    const final = v ?? val;
    const parsed = type === 'number' ? (final === '' ? null : Number(final)) : (final || null);
    if (String(parsed ?? '') !== String(value ?? '')) onSave(parsed);
  };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="Clique para editar"
        className={`min-h-[1.5rem] cursor-text rounded px-1 -mx-1 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 ${className}`}
      >
        {display ?? (value === null || value === undefined || value === '' ? '—' : String(value))}
      </div>
    );
  }

  if (type === 'select') {
    return (
      <select
        autoFocus value={val}
        onChange={(e) => { setVal(e.target.value); commit(e.target.value); }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        className="w-full min-w-[8rem] rounded border border-blue-400 px-1 py-0.5 text-sm focus:outline-none"
      >
        {options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <input
      autoFocus type={type} step={type === 'number' ? '0.01' : undefined}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-full min-w-[6rem] rounded border border-blue-400 px-1 py-0.5 text-sm focus:outline-none"
    />
  );
}

export default function CartoriosPage() {
  const [rows, setRows] = useState<Aviso[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [options, setOptions] = useState<{ setores: string[]; responsaveis: string[]; anos: number[]; meses: string[] }>({ setores: [], responsaveis: [], anos: [], meses: [] });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ ano: '', mes: '', status: '', setor: '', responsavel: '', empresa: '', q: '' });
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'recebimento', dir: 'desc' });

  // draft modal (novo / edição / pdf)
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftMeta, setDraftMeta] = useState<any>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [batchIdx, setBatchIdx] = useState<number | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);

  const pdfInput = useRef<HTMLInputElement>(null);
  const xlsxInput = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  };

  const closeDraft = () => {
    setDraft(null); setEditingId(null); setDraftFile(null);
    setDraftMeta(null); setDraftWarnings([]); setBatchIdx(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
      const r = await fetch(`/api/cartorios?${p}`);
      const j = await r.json();
      if (j.rows) { setRows(j.rows); setKpis(j.kpis); setOptions(j.options); }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // ---------- PDF upload → draft ----------
  async function handlePdf(file: File) {
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/cartorios/parse', { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.draft) {
        showToast(j.error || 'Não foi possível ler o PDF', false);
        return;
      }
      const warnings: string[] = [];
      if (j.duplicate) warnings.push(`Já existe aviso com o protocolo ${j.draft.protocolo} — confira antes de salvar`);
      if (j.missing?.length) warnings.push(`Campos não encontrados no PDF: ${j.missing.join(', ')}`);
      if (j.meta?.layout === 'desconhecido') warnings.push('Layout do cartório não reconhecido — confira todos os campos');
      setDraft({ ...EMPTY_DRAFT, ...j.draft });
      setDraftFile(file);
      setDraftMeta(j.meta);
      setDraftWarnings(warnings);
      setEditingId(null);
    } catch {
      showToast('Erro ao processar PDF', false);
    } finally {
      setParsing(false);
    }
  }

  // ---------- lote: vários PDFs → revisão em lote ----------
  async function handlePdfs(files: File[]) {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) { showToast('Nenhum PDF encontrado na seleção', false); return; }
    if (pdfs.length === 1) return handlePdf(pdfs[0]);
    setParsing(true);
    try {
      const items = await Promise.all(pdfs.map(async (file): Promise<BatchItem> => {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await fetch('/api/cartorios/parse', { method: 'POST', body: fd });
          const j = await r.json();
          if (!j.draft) {
            return { file, status: 'error', draft: null, meta: null, warnings: [j.error || 'Falha na leitura do PDF'], selected: false };
          }
          const warnings: string[] = [];
          if (j.duplicate) warnings.push(`Protocolo ${j.draft.protocolo || '?'} já cadastrado`);
          if (j.missing?.length) warnings.push(`Faltam no PDF: ${j.missing.join(', ')}`);
          if (j.meta?.layout === 'desconhecido') warnings.push('Layout não reconhecido');
          const status: BatchItem['status'] = j.duplicate ? 'duplicate'
            : (j.missing?.length || j.meta?.layout === 'desconhecido') ? 'incomplete' : 'ok';
          return { file, status, draft: { ...EMPTY_DRAFT, ...j.draft }, meta: j.meta, warnings, selected: status === 'ok' };
        } catch {
          return { file, status: 'error', draft: null, meta: null, warnings: ['Erro de rede ao ler o PDF'], selected: false };
        }
      }));
      setBatch(items);
    } finally {
      setParsing(false);
    }
  }

  const openBatchItem = (i: number) => {
    const it = batch?.[i];
    if (!it?.draft || it.saved) return;
    setDraft(it.draft); setDraftFile(it.file); setDraftMeta(it.meta); setDraftWarnings(it.warnings);
    setEditingId(null); setBatchIdx(i);
  };

  async function saveBatch() {
    if (!batch) return;
    setBatchSaving(true);
    try {
      const items = batch.filter((it) => it.selected && it.draft && !it.saved);
      let ok = 0, fail = 0;
      for (const it of items) {
        try {
          const body: any = { ...it.draft };
          body.pdf_base64 = await new Promise<string>((res) => {
            const rd = new FileReader();
            rd.onload = () => res(String(rd.result).split(',')[1]);
            rd.readAsDataURL(it.file);
          });
          body.pdf_filename = it.file.name;
          const r = await fetch('/api/cartorios', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          const j = await r.json();
          if (j.ok) {
            ok++;
            setBatch((b) => b && b.map((x) => (x === it ? { ...x, saved: true, selected: false } : x)));
          } else {
            fail++;
            setBatch((b) => b && b.map((x) => (x === it ? { ...x, error: j.error || 'Erro ao salvar' } : x)));
          }
        } catch {
          fail++;
          setBatch((b) => b && b.map((x) => (x === it ? { ...x, error: 'Erro de rede' } : x)));
        }
      }
      showToast(`Lote: ${ok} aviso(s) cadastrado(s)${fail ? `, ${fail} com erro` : ''}`, fail === 0);
      load();
    } finally {
      setBatchSaving(false);
    }
  }

  // ---------- save ----------
  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      const body: any = { ...draft };
      if (draftFile && !editingId) {
        body.pdf_base64 = await new Promise<string>((res) => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result).split(',')[1]);
          rd.readAsDataURL(draftFile);
        });
        body.pdf_filename = draftFile.name;
      }
      const r = await fetch(editingId ? `/api/cartorios/${editingId}` : '/api/cartorios', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.ok) {
        showToast(editingId ? 'Aviso atualizado' : 'Aviso cadastrado');
        if (batchIdx !== null) {
          setBatch((b) => b && b.map((it, i) => (i === batchIdx ? { ...it, saved: true, selected: false } : it)));
        }
        closeDraft();
        load();
      } else {
        showToast(j.error || 'Erro ao salvar', false);
      }
    } finally {
      setSaving(false);
    }
  }

  // Copia a linha em TSV (rótulo<TAB>valor) — cola no Excel já em duas colunas.
  const fmtNum = (v: number | null | undefined) =>
    v === null || v === undefined ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDateC = (s: string | null) => {
    const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };
  async function copyRow(a: Aviso) {
    const acesc = (a.juros || 0) + (a.emolumentos || 0) + (a.tarifa || 0);
    const total = a.valor_total ?? ((a.valor_orig ?? 0) + acesc);
    const lines: [string, string][] = [
      ['PROTOCOLO', a.protocolo ?? ''],
      ['CODIGO', a.codigo ?? ''],
      ['CNPJ', a.cnpj ?? ''],
      ['FORNECEDOR', a.fornecedor ?? ''],
      ['TITULO', a.titulo ?? ''],
      ['VENC TITULO', fmtDateC(a.venc_titulo)],
      ['VENC CARTORIO', fmtDateC(a.venc_cartorio)],
      ['VLR ORIG', fmtNum(a.valor_orig)],
      ['JUROS', fmtNum(a.juros)],
      ['EMOLUMENTOS', fmtNum(a.emolumentos)],
      ['TARIFA', fmtNum(a.tarifa)],
      ['TOT ACESCIM.', fmtNum(acesc)],
      ['VALOR TOTAL', fmtNum(total)],
    ];
    const text = lines.map(([k, v]) => `${k}\t${v}`).join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // HTTP (contexto não seguro): navigator.clipboard não existe — fallback legado
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (!ok) throw new Error('execCommand falhou');
      }
      showToast('Linha copiada — cole na planilha (Ctrl+V)');
    } catch {
      showToast('Não foi possível copiar', false);
    }
  }

  async function remove(id: number, fornecedor: string | null) {
    if (!window.confirm(`Excluir o aviso de "${fornecedor || 'sem fornecedor'}"? Essa ação não pode ser desfeita.`)) return;
    const r = await fetch(`/api/cartorios/${id}`, { method: 'DELETE' });
    const j = await r.json();
    if (j.ok) { showToast('Aviso excluído'); load(); }
    else showToast(j.error || 'Erro ao excluir', false);
  }

  async function importXlsx(file: File) {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/cartorios/import', { method: 'POST', body: fd });
      const j = await r.json();
      if (j.ok) {
        showToast(`Importação concluída: ${j.inserted} registros${j.skipped ? ` (${j.skipped} ignorados)` : ''}`);
        load();
      } else {
        showToast(j.error || 'Erro ao importar', false);
      }
    } finally {
      setImporting(false);
    }
  }

  const openEdit = (a: Aviso) => {
    setDraft(rowToDraft(a));
    setEditingId(a.id);
    setDraftFile(null); setDraftMeta(null); setDraftWarnings([]);
  };

  // ---------- edição inline ----------
  async function saveCell(a: Aviso, key: keyof Aviso, raw: string | number | null) {
    const body: any = { ...rowToDraft(a), [key]: raw === '' ? null : raw };
    const r = await fetch(`/api/cartorios/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.ok) {
      setRows((rs) => rs.map((x) => x.id === a.id ? { ...x, [key]: body[key] } : x));
      if (key === 'recebimento') load(); // mês/ano derivados
    } else {
      showToast(j.error || 'Erro ao salvar', false);
      load();
    }
  }

  // ---------- ordenação ----------
  const sortedRows = [...rows].sort((x, y) => {
    const get = (a: Aviso): any => {
      if (sort.col === 'acesc') return (a.juros || 0) + (a.emolumentos || 0) + (a.tarifa || 0);
      return (a as any)[sort.col];
    };
    const av = get(x), bv = get(y);
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'pt-BR', { numeric: true });
    return sort.dir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (col: string) =>
    setSort((s) => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });

  const totAcesc = (d: Draft) => (d.juros || 0) + (d.emolumentos || 0) + (d.tarifa || 0);
  const calcTotal = (d: Draft) => (d.valor_orig ?? 0) + totAcesc(d);
  const totalMismatch = draft && draft.valor_total !== null &&
    Math.abs((draft.valor_total ?? 0) - calcTotal(draft)) > 0.011;

  const field = (label: string, key: keyof Draft, type: 'text' | 'date' | 'number' | 'select' = 'text', opts?: string[]) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {type === 'select' ? (
        <select
          value={String(draft?.[key] ?? '')}
          onChange={(e) => setDraft((d) => d && { ...d, [key]: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {opts!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          step={type === 'number' ? '0.01' : undefined}
          value={draft?.[key] === null || draft?.[key] === undefined ? '' : String(draft[key])}
          onChange={(e) => setDraft((d) => d && {
            ...d,
            [key]: type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : (e.target.value || null),
          })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-6 pb-6 pt-10">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Scale className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cartórios — Avisos de Protesto</h1>
            <p className="text-sm text-gray-500">Controle diário dos avisos recebidos, análise e cobrança dos setores.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/cartorios/dashboard"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <BarChart3 className="h-4 w-4" /> Dashboard
          </Link>
          <button
            onClick={() => { setDraft({ ...EMPTY_DRAFT }); setEditingId(null); setDraftFile(null); setDraftMeta(null); setDraftWarnings([]); }}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" /> Novo aviso
          </button>
          <button
            onClick={() => xlsxInput.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Importar planilha
          </button>
          <input ref={xlsxInput} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importXlsx(f); e.target.value = ''; }} />
        </div>
      </div>

      {/* drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) handlePdfs(fs); }}
        onClick={() => pdfInput.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <input ref={pdfInput} type="file" accept=".pdf" multiple className="hidden"
          onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) handlePdfs(fs); e.target.value = ''; }} />
        {parsing ? (
          <div className="flex items-center justify-center gap-2 text-blue-700">
            <Loader2 className="h-5 w-5 animate-spin" /> Lendo o(s) aviso(s) e preenchendo os campos…
          </div>
        ) : (
          <>
            <Upload className="mx-auto h-6 w-6 text-gray-400" />
            <p className="mt-1 text-sm font-medium text-gray-700">
              Arraste os avisos de cartório (PDF) aqui ou clique para selecionar — pode ser vários de uma vez
            </p>
            <p className="text-xs text-gray-500">Os campos são preenchidos automaticamente — você confere antes de salvar.</p>
          </>
        )}
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Avisos', value: String(kpis.total), sub: fmtBRL(kpis.valor_total) },
            { label: 'Pendentes', value: String(kpis.pendentes), sub: fmtBRL(kpis.valor_pendente), warn: kpis.pendentes > 0 },
            { label: 'Vencidos em aberto', value: String(kpis.vencidos_abertos), sub: 'prazo do cartório passou', warn: kpis.vencidos_abertos > 0 },
            { label: 'Juros pagos', value: fmtBRL(kpis.juros_total), sub: 'no filtro atual' },
            { label: 'Custo cartório', value: fmtBRL(kpis.custo_cartorio), sub: 'emolumentos + tarifas' },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="flex h-full flex-col items-center justify-center px-5 pb-5 pt-5 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{k.label}</p>
                <p className={`mt-1.5 text-lg font-bold ${k.warn ? 'text-amber-600' : 'text-gray-900'}`}>{k.value}</p>
                <p className="mt-0.5 text-xs text-gray-500">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* separação por empresa */}
      <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-white p-1 w-fit">
        {(['', ...EMPRESAS] as const).map((e) => (
          <button
            key={e || 'todas'}
            onClick={() => setFilters((f) => ({ ...f, empresa: e }))}
            className={`rounded-lg px-5 py-1.5 text-sm font-medium transition-colors ${
              filters.empresa === e ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {e || 'Todas'}
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            placeholder="Fornecedor, título, protocolo, CNPJ…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="w-64 rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        {[
          { key: 'ano', label: 'Ano', opts: options.anos.map(String) },
          { key: 'mes', label: 'Mês', opts: options.meses },
          { key: 'status', label: 'Status', opts: STATUS_LIST },
          { key: 'setor', label: 'Setor', opts: options.setores },
          { key: 'responsavel', label: 'Responsável', opts: options.responsaveis },
        ].map((f) => (
          <select
            key={f.key}
            value={(filters as any)[f.key]}
            onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">{f.label}: todos</option>
            {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => setFilters({ ano: '', mes: '', status: '', setor: '', responsavel: '', empresa: '', q: '' })}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-800"
          >
            Limpar
          </button>
        )}
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1400px] text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              <th className="w-10 px-2 py-3" />
              {([
                ['mes', 'Mês'], ['recebimento', 'Recebim.'], ['protocolo', 'Protocolo'], ['codigo', 'Código'],
                ['cnpj', 'CNPJ'], ['fornecedor', 'Fornecedor'], ['titulo', 'Título'], ['venc_titulo', 'Venc. Título'],
                ['venc_cartorio', 'Venc. Cartório'], ['valor_orig', 'Vlr. Orig.'], ['juros', 'Juros'],
                ['emolumentos', 'Emolum.'], ['tarifa', 'Tarifa'], ['acesc', 'Tot. Acésc.'], ['valor_total', 'Valor Total'],
                ['status', 'Status'], ['responsavel', 'Responsável'], ['setor', 'Setor'], ['empresa', 'Empresa'],
              ] as [string, string][]).map(([col, label]) => (
                <th key={col} className="whitespace-nowrap px-3 py-3">
                  <button
                    onClick={() => toggleSort(col)}
                    className="group inline-flex items-center gap-1 uppercase hover:text-blue-600"
                  >
                    {label}
                    {sort.col === col
                      ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                      : <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={21} className="px-3 py-8 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : sortedRows.length === 0 ? (
              <tr><td colSpan={21} className="px-3 py-8 text-center text-gray-400">Nenhum aviso encontrado.</td></tr>
            ) : sortedRows.map((a) => {
              const acesc = (a.juros || 0) + (a.emolumentos || 0) + (a.tarifa || 0);
              const vencido = a.venc_cartorio && a.venc_cartorio.slice(0, 10) < new Date().toISOString().slice(0, 10)
                && !['PAGO', 'SUSTADO', 'PAGO PELO FORNECEDOR'].includes(a.status);
              const cell = (key: keyof Aviso, opts?: { type?: 'text' | 'date' | 'number' | 'select'; options?: string[]; display?: React.ReactNode; className?: string }) => (
                <EditableCell
                  value={opts?.type === 'date' ? (a[key] as string | null)?.slice(0, 10) ?? null : (a[key] as any)}
                  type={opts?.type} options={opts?.options} display={opts?.display} className={opts?.className}
                  onSave={(v) => saveCell(a, key, v)}
                />
              );
              return (
                <tr key={a.id} className={`border-b last:border-0 hover:bg-gray-50 ${vencido ? 'bg-red-50/50' : ''}`}>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => copyRow(a)}
                      title="Copiar linha no formato da planilha (cola em duas colunas no Excel)"
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2.5">{a.mes || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{cell('recebimento', { type: 'date', display: fmtDate(a.recebimento) })}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{cell('protocolo')}</td>
                  <td className="px-3 py-2.5">{cell('codigo')}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{cell('cnpj')}</td>
                  <td className="max-w-[220px] px-3 py-2.5 font-medium">
                    {cell('fornecedor', { display: <span className="block truncate" title={a.fornecedor || ''}>{a.fornecedor || '—'}</span> })}
                  </td>
                  <td className="px-3 py-2.5">{cell('titulo')}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{cell('venc_titulo', { type: 'date', display: fmtDate(a.venc_titulo) })}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 ${vencido ? 'font-semibold text-red-600' : ''}`}>
                    {cell('venc_cartorio', { type: 'date', display: <>{fmtDate(a.venc_cartorio)}{vencido && ' ⚠'}</> })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{cell('valor_orig', { type: 'number', display: fmtBRL(a.valor_orig) })}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{cell('juros', { type: 'number', display: fmtBRL(a.juros) })}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{cell('emolumentos', { type: 'number', display: fmtBRL(a.emolumentos) })}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{cell('tarifa', { type: 'number', display: fmtBRL(a.tarifa) })}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">{fmtBRL(acesc)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{cell('valor_total', { type: 'number', display: fmtBRL(a.valor_total) })}</td>
                  <td className="px-3 py-2.5">
                    {cell('status', {
                      type: 'select', options: STATUS_LIST,
                      display: (
                        <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {a.status}
                        </span>
                      ),
                    })}
                  </td>
                  <td className="px-3 py-2.5">{cell('responsavel')}</td>
                  <td className="px-3 py-2.5">{cell('setor')}</td>
                  <td className="px-3 py-2.5">
                    {cell('empresa', {
                      type: 'select', options: EMPRESAS,
                      display: (
                        <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${EMPRESA_STYLE[a.empresa] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {a.empresa}
                        </span>
                      ),
                    })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      {a.has_pdf && (
                        <a href={`/api/cartorios/${a.id}/pdf`} target="_blank" title="Ver PDF"
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600">
                          <FileDown className="h-4 w-4" />
                        </a>
                      )}
                      <button onClick={() => openEdit(a)} title="Editar tudo"
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => remove(a.id, a.fornecedor)} title="Excluir"
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* modal de revisão em lote */}
      {batch && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Revisar importação — {batch.length} arquivo(s)</h2>
                <p className="text-xs text-gray-500">
                  {batch.filter((i) => i.saved).length} cadastrados · {batch.filter((i) => i.selected).length} selecionados para importar ·{' '}
                  {batch.filter((i) => i.status === 'incomplete').length} incompletos · {batch.filter((i) => i.status === 'duplicate').length} duplicados ·{' '}
                  {batch.filter((i) => i.status === 'error').length} com erro
                </p>
              </div>
              <button onClick={() => setBatch(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                {batch.map((it, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                      it.saved ? 'border-emerald-200 bg-emerald-50/50'
                      : it.status === 'error' ? 'border-red-200 bg-red-50/50'
                      : it.status === 'duplicate' ? 'border-gray-200 bg-gray-50'
                      : it.status === 'incomplete' ? 'border-amber-200 bg-amber-50/40'
                      : 'border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={it.selected}
                      disabled={it.saved || it.status === 'error' || it.status === 'duplicate' || !it.draft}
                      onChange={(e) => setBatch((b) => b && b.map((x, xi) => (xi === i ? { ...x, selected: e.target.checked } : x)))}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        <span className="truncate text-sm font-medium text-gray-800">{it.file.name}</span>
                        {it.saved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" /> Cadastrado
                          </span>
                        ) : it.status === 'ok' ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Completo</span>
                        ) : it.status === 'incomplete' ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Incompleto — revisar</span>
                        ) : it.status === 'duplicate' ? (
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Duplicado</span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Erro de leitura</span>
                        )}
                        {it.meta?.layout && it.status !== 'error' && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">layout {it.meta.layout}</span>
                        )}
                      </div>
                      {it.draft && (
                        <p className="mt-1 truncate text-xs text-gray-600">
                          <b>{it.draft.empresa}</b>
                          {it.draft.protocolo && <> · prot. {it.draft.protocolo}</>}
                          {it.draft.fornecedor && <> · {it.draft.fornecedor}</>}
                          {it.draft.valor_total != null && <> · {fmtBRL(it.draft.valor_total)}</>}
                          {it.draft.venc_cartorio && <> · venc. {fmtDate(it.draft.venc_cartorio)}</>}
                        </p>
                      )}
                      {(it.warnings.length > 0 || it.error) && !it.saved && (
                        <p className="mt-0.5 text-xs text-amber-700">
                          {[...it.warnings, it.error].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {it.draft && !it.saved && (
                      <button
                        onClick={() => openBatchItem(i)}
                        className="flex-shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                      >
                        Revisar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t px-6 py-4">
              <p className="text-xs text-gray-500">Duplicados e arquivos com erro não são importados. Itens incompletos podem ser revisados antes de importar.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setBatch(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Concluir
                </button>
                <button
                  onClick={saveBatch}
                  disabled={batchSaving || !batch.some((i) => i.selected && i.draft && !i.saved)}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {batchSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Importar {batch.filter((i) => i.selected && i.draft && !i.saved).length} selecionado(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* modal */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingId ? 'Editar aviso' : draftFile ? 'Revisar dados extraídos' : 'Novo aviso'}
                </h2>
                {draftFile && (
                  <p className="text-xs text-gray-500">
                    <FileText className="mr-1 inline h-3.5 w-3.5" />
                    {draftFile.name} — layout {draftMeta?.layout || '?'}
                    {draftMeta?.apresentante ? ` · apresentante: ${draftMeta.apresentante}` : ''}
                  </p>
                )}
              </div>
              <button onClick={closeDraft}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {draftWarnings.map((w) => (
                <div key={w} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {w}
                </div>
              ))}
              {draftMeta?.devedor_nome && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Devedor no documento: <b>{draftMeta.devedor_nome}</b> — CNPJ {draftMeta.devedor_cnpj || '?'}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {field('Empresa', 'empresa', 'select', EMPRESAS)}
                {field('Mês recebimento', 'recebimento', 'date')}
                {field('Protocolo', 'protocolo')}
                {field('Código', 'codigo')}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {field('CNPJ do fornecedor', 'cnpj')}
                {field('Fornecedor', 'fornecedor')}
                {field('Título', 'titulo')}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {field('Venc. título', 'venc_titulo', 'date')}
                {field('Venc. cartório', 'venc_cartorio', 'date')}
                {field('Responsável', 'responsavel')}
                {field('Setor', 'setor')}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {field('Vlr. original', 'valor_orig', 'number')}
                {field('Juros', 'juros', 'number')}
                {field('Emolumentos', 'emolumentos', 'number')}
                {field('Tarifa', 'tarifa', 'number')}
                {field('Valor total', 'valor_total', 'number')}
              </div>

              <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${totalMismatch ? 'border border-amber-300 bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'}`}>
                <span>
                  Tot. acéscimos: <b>{fmtBRL(totAcesc(draft))}</b> · calculado: <b>{fmtBRL(draft.valor_orig !== null ? calcTotal(draft) : null)}</b>
                </span>
                {totalMismatch && (
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> valor total difere do calculado — confira
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Status', 'status', 'select', STATUS_LIST)}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <button
                onClick={closeDraft}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveDraft} disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? 'Salvar alterações' : 'Cadastrar aviso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
