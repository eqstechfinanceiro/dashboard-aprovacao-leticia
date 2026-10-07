'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Folder, FileText, Play, RefreshCw, Search, Users, History,
  Eye, X, ChevronRight, Loader2, ShieldAlert, CheckCircle2,
  AlertTriangle, XCircle, FolderOpen, Lock, CheckSquare, Square,
  FolderTree, Trash2, FileSpreadsheet,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// ---------- Tipos ----------

interface SpFile { name: string; size: number; url: string; timeLastModified: string | null }
interface TreeResp { path: string; folders: string[]; files: SpFile[]; error?: string; cached?: boolean; cached_at?: string; warning?: string }
interface RunRow {
  id: number; source: string; year: string | null; month_folder: string | null; bank: string | null; date_folder: string | null;
  label: string | null; status: string; progress: any; result: any; error: string | null;
  created_by: string | null; created_at: string; started_at: string | null; finished_at: string | null;
}
interface EnvioRow {
  id: number; run_id: number; source_file: string; page_num: number; chave: string | null;
  cpf: string | null; nome: string | null; regiao: string | null; cc: string | null;
  tipo_pagamento: string | null; pedido: string | null; modelo_documento: string | null;
  competencia: string | null; destino_path: string | null; destino_filename: string | null;
  status: string; error: string | null; generated_pdf_path: string | null;
}
interface Funcionario {
  cpf: string; nome: string; cc: string; regiao: string; filial: string;
  situacao: string; cargo: string; banco: string; agencia: string; conta: string;
}
interface Gates { upload_enabled: boolean; e2doc_enabled: boolean; meta: any; sharepoint: { status: string; statusMessage: string } }

interface SelItem {
  source: 'eqs' | 'bratec'; year: string; month: string; bank: string; date: string;
  url: string; name: string; size: number;
}

interface NodeState {
  folders: string[];
  files: SpFile[];
  loaded: boolean;
  loading: boolean;
  expanded: boolean;
  cached?: boolean;
  cachedAt?: string;
}

const SOURCE_BASE: Record<'eqs' | 'bratec', string> = {
  eqs: '/Financeiro/Documentos Compartilhados/Financeiro/Controle Financeiro/COMPROVANTES - DESMEMBRAR',
  bratec: '/teams/BRATECFINANCEIRO/Documentos Compartilhados/FINANCEIRO/COMPROVANTES - DESMEMBRAR',
};

const SITE_BADGE: Record<string, { label: string; cls: string }> = {
  eqs: { label: 'EQS', cls: 'bg-blue-100 text-blue-700' },
  bratec: { label: 'BRATEC', cls: 'bg-purple-100 text-purple-700' },
};

const LEVEL_LABELS = ['Ano', 'Mês', 'Banco', 'Data'];

const STATUS_ENVIO: Record<string, { label: string; cls: string }> = {
  dryrun: { label: 'Simulado', cls: 'bg-blue-100 text-blue-700' },
  enviado_sp_dryrun: { label: 'SP enviado · E2DOC simulado', cls: 'bg-blue-100 text-blue-700' },
  enviado_sp: { label: 'Enviado SP', cls: 'bg-emerald-100 text-emerald-700' },
  enviado_e2doc: { label: 'Enviado E2DOC', cls: 'bg-emerald-100 text-emerald-700' },
  gerado: { label: 'Gerado', cls: 'bg-indigo-100 text-indigo-700' },
  duplicado: { label: 'Já existe no destino', cls: 'bg-amber-100 text-amber-700' },
  sem_chave: { label: 'Sem chave', cls: 'bg-gray-100 text-gray-600' },
  cpf_nao_encontrado: { label: 'CPF não encontrado', cls: 'bg-orange-100 text-orange-700' },
  nome_nao_encontrado: { label: 'Nome não encontrado', cls: 'bg-orange-100 text-orange-700' },
  divergencia: { label: 'Divergência CPF × recebedor', cls: 'bg-red-100 text-red-700' },
  fornecedor_sispag: { label: 'SISPAG fornecedores', cls: 'bg-gray-100 text-gray-600' },
  transferencia_interna: { label: 'Transferência interna', cls: 'bg-gray-100 text-gray-600' },
  arquivo_fornecedor: { label: 'Arquivo de fornecedor', cls: 'bg-gray-100 text-gray-600' },
  tipo_incorreto: { label: 'Tipo desconhecido', cls: 'bg-red-100 text-red-700' },
  e2doc_erro: { label: 'Erro E2DOC', cls: 'bg-red-100 text-red-700' },
  erro: { label: 'Erro', cls: 'bg-red-100 text-red-700' },
  // Remessa de folha
  pronto: { label: 'Pronto p/ envio', cls: 'bg-emerald-100 text-emerald-700' },
  sem_funcionario: { label: 'Funcionário não encontrado', cls: 'bg-orange-100 text-orange-700' },
  homonimo_ambiguo: { label: 'Homônimo ambíguo', cls: 'bg-orange-100 text-orange-700' },
  txt_sem_pdf: { label: 'No TXT, sem comprovante', cls: 'bg-amber-100 text-amber-700' },
};

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: 'Na fila', cls: 'bg-gray-100 text-gray-600' },
  running: { label: 'Processando', cls: 'bg-blue-100 text-blue-700' },
  done: { label: 'Concluído', cls: 'bg-emerald-100 text-emerald-700' },
  error: { label: 'Erro', cls: 'bg-red-100 text-red-700' },
  aguardando_confirmacao: { label: 'Aguardando confirmação', cls: 'bg-violet-100 text-violet-700' },
  cancelado: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500' },
};

const PHASE_LABEL: Record<string, string> = {
  downloading: 'Baixando',
  analyzing: 'Lendo páginas',
  processing: 'Processando',
};

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Progresso de um run: %, páginas processadas, ETA estimado pela taxa atual
 * (páginas/seg desde o início) projetada sobre o total estimado de páginas.
 */
function runProgress(r: RunRow) {
  const pg = r.progress || {};
  const processed = pg.pagesProcessed ?? pg.pages ?? 0;
  const knownPages = pg.totalPages ?? 0;
  const filesAnalyzed = pg.filesAnalyzed ?? 0;
  const totalFiles = pg.totalFiles ?? 0;
  // páginas dos arquivos ainda não analisados ≈ média por arquivo × restantes
  const avg = filesAnalyzed > 0 ? knownPages / filesAnalyzed : 0;
  const estTotal = Math.max(knownPages + avg * Math.max(0, totalFiles - filesAnalyzed), processed);
  const pct = estTotal > 0 ? Math.min(100, (processed / estTotal) * 100) : 0;
  const start = pg.startedAt || r.started_at;
  const elapsed = start ? (Date.now() - new Date(start).getTime()) / 1000 : 0;
  const rate = elapsed > 8 && processed > 0 ? processed / elapsed : 0;
  const eta = rate > 0 && estTotal > processed ? (estTotal - processed) / rate : null;
  return { pg, processed, estTotal: Math.round(estTotal), pct, elapsed, eta, totalFiles };
}

// ---------- Componentes ----------

function PdfViewerModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(1100px, 94vw)', height: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-medium text-gray-700 truncate">{title}</span>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">abrir em nova aba</a>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <iframe src={url} className="flex-1 w-full bg-gray-100" title={title} />
      </div>
    </div>
  );
}

function EnvioStatusBadge({ status }: { status: string }) {
  const s = STATUS_ENVIO[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <Badge className={`${s.cls} border-0 text-[11px] whitespace-nowrap`}>{s.label}</Badge>;
}

function GateSwitch({ label, desc, enabled, onToggle, danger }: {
  label: string; desc: string; enabled: boolean; onToggle: (v: boolean) => void; danger?: boolean;
}) {
  return (
    <button onClick={() => onToggle(!enabled)} className="flex items-start gap-2.5 text-left group" title={desc}>
      <span className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
        enabled ? (danger ? 'bg-red-500' : 'bg-emerald-500') : 'bg-gray-300'
      }`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
      <span className={`text-sm font-medium ${enabled && danger ? 'text-red-600' : 'text-gray-700'}`}>{label}</span>
    </button>
  );
}

// ---------- Página ----------

export default function AutomacaoComprovantesPage() {
  const [tab, setTab] = useState<'processar' | 'remessa' | 'runs' | 'funcionarios'>('processar');

  // Árvore SharePoint: key `${site}|${path}` → NodeState
  const [tree, setTree] = useState<Record<string, NodeState>>({});
  const [filters, setFilters] = useState<string[]>(['', '', '', '']);
  const [spError, setSpError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, SelItem>>({});

  // PDF viewer
  const [pdfView, setPdfView] = useState<{ url: string; title: string } | null>(null);

  // Gates
  const [gates, setGates] = useState<Gates | null>(null);

  // Runs
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [activeRun, setActiveRun] = useState<{ run: RunRow; envios: EnvioRow[] } | null>(null);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  // Remessa de folha (upload de PDFs + TXTs CNAB)
  const [remFiles, setRemFiles] = useState<File[]>([]);
  const [remUploading, setRemUploading] = useState(false);
  const [remUpload, setRemUpload] = useState<{ uploadId: string; files: { name: string; size: number; kind: string; banco?: string | null }[] } | null>(null);
  const [remError, setRemError] = useState<string | null>(null);
  const [remComp, setRemComp] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);

  // Funcionários
  const [funcQ, setFuncQ] = useState('');
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [funcTotal, setFuncTotal] = useState(0);
  const [funcPage, setFuncPage] = useState(1);
  const [funcLoading, setFuncLoading] = useState(false);
  const [funcExporting, setFuncExporting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;

  const nodeKey = (site: string, path: string) => `${site}|${path}`;

  const loadNode = useCallback(async (site: 'eqs' | 'bratec', path: string, expand = false): Promise<TreeResp | null> => {
    const key = nodeKey(site, path);
    setTree((t) => ({ ...t, [key]: { ...(t[key] || { folders: [], files: [], loaded: false, expanded: false }), loading: true } }));
    try {
      const resp = await fetch(`/api/comprovantes/sp/tree?site=${site}&path=${encodeURIComponent(path)}`);
      const data: TreeResp = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || `HTTP ${resp.status}`);
      setTree((t) => ({
        ...t,
        [key]: { folders: data.folders, files: data.files, loaded: true, loading: false, expanded: expand || t[key]?.expanded || false, cached: !!data.cached, cachedAt: data.cached_at },
      }));
      // resposta live (não-cache) ⇒ sessão SharePoint viva no processo web
      if (!data.cached) {
        setGates((g) => (g && g.sharepoint?.status !== 'connected' ? { ...g, sharepoint: { ...g.sharepoint, status: 'connected' } } : g));
      }
      return data;
    } catch (err) {
      setTree((t) => ({ ...t, [key]: { ...(t[key] || { folders: [], files: [], expanded: false }), loaded: true, loading: false } }));
      setSpError(String(err));
      return null;
    }
  }, []);

  const toggleNode = useCallback((site: 'eqs' | 'bratec', path: string) => {
    const key = nodeKey(site, path);
    const node = treeRef.current[key];
    if (!node?.loaded) {
      loadNode(site, path, true);
    } else {
      setTree((t) => ({ ...t, [key]: { ...t[key], expanded: !t[key].expanded } }));
    }
  }, [loadNode]);

  // ---------- Filtros + auto-expansão ----------

  const activeFilterDepth = filters.findLastIndex((f) => f.trim() !== '');

  const folderVisible = useCallback((name: string, depth: number) => {
    const f = filters[depth - 1]?.trim().toUpperCase();
    return !f || name.toUpperCase().includes(f);
  }, [filters]);

  // Opções do select do nível `level` (1=Ano … 4=Data): união das pastas dos nós
  // carregados no nível acima cujos ancestrais batem com os filtros selecionados
  const levelOptions = useCallback((level: number): string[] => {
    const out = new Set<string>();
    for (const site of ['eqs', 'bratec'] as const) {
      const base = SOURCE_BASE[site];
      for (const [key, node] of Object.entries(tree)) {
        if (!key.startsWith(`${site}|`) || !node.loaded) continue;
        const rel = key.slice(site.length + 1).slice(base.length).replace(/^\//, '');
        const segs = rel ? rel.split('/') : [];
        if (segs.length !== level - 1) continue;
        let ok = true;
        for (let d = 0; d < segs.length; d++) {
          const f = filters[d]?.trim().toUpperCase();
          if (f && !segs[d].toUpperCase().includes(f)) { ok = false; break; }
        }
        if (ok) node.folders.forEach((f) => out.add(f));
      }
    }
    return [...out].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [tree, filters]);

  // Carrega as raízes já no mount — pastas visíveis desde o início + Ano preenchido
  useEffect(() => {
    loadNode('eqs', SOURCE_BASE.eqs, true);
    loadNode('bratec', SOURCE_BASE.bratec, true);
  }, [loadNode]);

  // Quando um filtro de nível N é ativado, expande automaticamente os ancestrais até o nível do filtro
  useEffect(() => {
    if (activeFilterDepth < 0) return;
    let cancelled = false;
    (async () => {
      for (const site of ['eqs', 'bratec'] as const) {
        let frontier = [SOURCE_BASE[site]];
        // filtro no índice i cobre pastas de depth i+1; expandimos ancestrais até lá
        // e mais um nível — assim um filtro de Data já revela os arquivos dentro da pasta
        for (let depth = 1; depth <= activeFilterDepth + 2 && depth <= 5; depth++) {
          const next: string[] = [];
          for (const path of frontier) {
            const key = nodeKey(site, path);
            let folders: string[] = treeRef.current[key]?.folders || [];
            if (!treeRef.current[key]?.loaded) {
              const data = await loadNode(site, path, true);
              folders = data?.folders || [];
            } else if (!treeRef.current[key].expanded) {
              setTree((t) => ({ ...t, [key]: { ...t[key], expanded: true } }));
            }
            if (cancelled) return;
            for (const f of folders || []) {
              if (folderVisible(f, depth) && depth < 5) next.push(`${path}/${f}`);
            }
          }
          frontier = next;
          if (frontier.length > 40 || frontier.length === 0) break; // proteção / sem matches
        }
      }
    })();
    return () => { cancelled = true; };
  }, [filters, activeFilterDepth, folderVisible, loadNode]);

  // ---------- Seleção ----------

  const selectFile = useCallback((site: 'eqs' | 'bratec', parentPath: string, f: SpFile, checked: boolean) => {
    const rel = parentPath.replace(SOURCE_BASE[site] + '/', '').split('/');
    const [year = '', month = '', bank = '', date = ''] = rel;
    setSelected((s) => {
      const n = { ...s };
      if (checked) n[f.url] = { source: site, year, month, bank, date, url: f.url, name: f.name, size: f.size };
      else delete n[f.url];
      return n;
    });
  }, []);

  const selectFolder = useCallback(async (site: 'eqs' | 'bratec', path: string) => {
    const key = nodeKey(site, path);
    if (!treeRef.current[key]?.loaded) await loadNode(site, path);
    const files = (treeRef.current[key]?.files || []).filter((f) => f.name.toUpperCase().endsWith('.PDF'));
    const rel = path.replace(SOURCE_BASE[site] + '/', '').split('/');
    const [year = '', month = '', bank = '', date = ''] = rel;
    const allSelected = files.length > 0 && files.every((f) => selected[f.url]);
    setSelected((s) => {
      const n = { ...s };
      if (allSelected) files.forEach((f) => delete n[f.url]);
      else files.forEach((f) => { n[f.url] = { source: site, year, month, bank, date, url: f.url, name: f.name, size: f.size }; });
      return n;
    });
  }, [loadNode, selected]);

  const selectedList = Object.values(selected);

  const startRun = async () => {
    if (selectedList.length === 0) return;
    setStarting(true);
    try {
      const resp = await fetch('/api/comprovantes/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: selectedList.map(({ size, ...rest }) => rest) }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setExpandedRun(data.runId);
        loadRunDetail(data.runId);
        loadRuns();
        setTab('runs');
      } else {
        setSpError(data.error || 'Falha ao enfileirar');
      }
    } finally {
      setStarting(false);
    }
  };

  // ---------- Remessa de folha ----------

  const uploadRemessa = async () => {
    if (!remFiles.length) return;
    setRemUploading(true);
    setRemError(null);
    try {
      const fd = new FormData();
      remFiles.forEach((f) => fd.append('files', f));
      const resp = await fetch('/api/comprovantes/remessa/upload', { method: 'POST', body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      setRemUpload(data);
    } catch (err) {
      setRemError(String(err));
      setRemUpload(null);
    } finally {
      setRemUploading(false);
    }
  };

  const startRemessa = async () => {
    if (!remUpload) return;
    setStarting(true);
    try {
      const resp = await fetch('/api/comprovantes/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'remessa', uploadId: remUpload.uploadId, competencia: remComp || undefined }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setExpandedRun(data.runId);
        loadRunDetail(data.runId);
        loadRuns();
        setTab('runs');
      } else {
        setRemError(data.error || 'Falha ao enfileirar');
      }
    } finally {
      setStarting(false);
    }
  };

  const confirmRemessa = async (id: number, action: 'confirmar' | 'cancelar', forcarCompetencia = false) => {
    setConfirming(id);
    try {
      const resp = await fetch(`/api/comprovantes/runs/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(forcarCompetencia ? { forcarCompetencia: true } : {}) }),
      });
      if (resp.ok) {
        loadRuns();
        loadRunDetail(id);
      } else {
        const d = await resp.json().catch(() => ({}));
        if (resp.status === 409 && d.code === 'competencia_divergente') {
          const ok = window.confirm(
            `ATENÇÃO — competência provavelmente errada.\n\n` +
            `Informada: ${d.informada}\nEsperada pelas datas de pagamento: ${(d.esperada || []).join(' ou ')}\n\n` +
            `Para folha, a competência no e2doc é o MÊS ANTERIOR ao pagamento. ` +
            `Enviar com a competência errada indexa os documentos no mês errado.\n\n` +
            `Confirma mesmo assim enviar com ${d.informada}?`
          );
          if (ok) return confirmRemessa(id, action, true);
          return;
        }
        alert(d.error || 'Falha na confirmação');
      }
    } finally {
      setConfirming(null);
    }
  };

  // ---------- Dados ----------

  const loadGates = useCallback(async () => {
    try {
      const resp = await fetch('/api/comprovantes/gates');
      if (resp.ok) setGates(await resp.json());
    } catch { /* ignore */ }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const resp = await fetch('/api/comprovantes/runs');
      if (resp.ok) setRuns((await resp.json()).runs || []);
    } catch { /* ignore */ }
  }, []);

  const loadRunDetail = useCallback(async (id: number) => {
    try {
      const resp = await fetch(`/api/comprovantes/runs/${id}`);
      if (resp.ok) setActiveRun(await resp.json());
    } catch { /* ignore */ }
  }, []);

  const loadFuncs = useCallback(async (q: string, page: number) => {
    setFuncLoading(true);
    try {
      const resp = await fetch(`/api/comprovantes/funcionarios?q=${encodeURIComponent(q)}&page=${page}`);
      if (resp.ok) {
        const data = await resp.json();
        setFuncs(data.funcionarios || []);
        setFuncTotal(data.total || 0);
      }
    } catch { /* ignore */ } finally {
      setFuncLoading(false);
    }
  }, []);

  const exportFuncs = async () => {
    if (funcExporting) return;
    setFuncExporting(true);
    try {
      const resp = await fetch(`/api/comprovantes/funcionarios?format=xlsx&q=${encodeURIComponent(funcQ)}`);
      if (!resp.ok) throw new Error(String(resp.status));
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resp.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'funcionarios.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Falha ao exportar funcionários');
    } finally {
      setFuncExporting(false);
    }
  };

  useEffect(() => { loadGates(); loadRuns(); }, [loadGates, loadRuns]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      loadRuns();
      setExpandedRun((cur) => { if (cur) loadRunDetail(cur); return cur; });
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadRuns, loadRunDetail]);

  useEffect(() => { loadFuncs(funcQ, funcPage); }, [funcQ, funcPage, loadFuncs]);

  const toggleGate = async (gate: string, enabled: boolean) => {
    const resp = await fetch('/api/comprovantes/gates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gate, enabled }),
    });
    if (resp.ok) loadGates();
  };

  const runningRun = runs.find((r) => r.status === 'running' || r.status === 'queued');
  const funcPages = Math.max(1, Math.ceil(funcTotal / 50));

  // ---------- Render da árvore ----------

  const renderFolder = (site: 'eqs' | 'bratec', parentPath: string, name: string, depth: number) => {
    const path = `${parentPath}/${name}`;
    const key = nodeKey(site, path);
    const node = tree[key];
    const isOpen = !!node?.expanded;
    const pdfCount = node?.files?.filter((f) => f.name.toUpperCase().endsWith('.PDF')).length ?? 0;

    return (
      <div key={key}>
        <div className="flex items-center gap-1.5 py-1 px-1.5 rounded-lg hover:bg-gray-50 group" style={{ marginLeft: depth * 14 }}>
          <button onClick={() => toggleNode(site, path)} className="p-0.5 rounded hover:bg-gray-200">
            {node?.loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
              : <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
          </button>
          <button onClick={() => toggleNode(site, path)} className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
            {isOpen ? <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" /> : <Folder className="w-4 h-4 text-amber-500 shrink-0" />}
            <span className="text-sm text-gray-700 truncate">{name}</span>
          </button>
          {node?.cached && <span className="text-[10px] text-amber-600" title={`Dados em cache de ${node.cachedAt ? new Date(node.cachedAt).toLocaleString('pt-BR') : '—'}`}>cache</span>}
          {node?.loaded && pdfCount > 0 && <span className="text-[10px] text-gray-400">{pdfCount} pdf</span>}
          <button
            onClick={() => selectFolder(site, path)}
            title="Selecionar todos os PDFs desta pasta"
            className="text-[10px] text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100"
          >
            sel.
          </button>
        </div>
        {isOpen && node && (
          <div>
            {node.folders.filter((f) => folderVisible(f, depth + 1)).map((f) => renderFolder(site, path, f, depth + 1))}
            {node.files.filter((f) => f.name.toUpperCase().endsWith('.PDF')).map((f) => (
              <div key={f.url} className="flex items-center gap-1.5 py-1 px-1.5 rounded-lg hover:bg-gray-50 group" style={{ marginLeft: (depth + 1) * 14 + 16 }}>
                <button onClick={() => selectFile(site, path, f, !selected[f.url])} className="shrink-0">
                  {selected[f.url]
                    ? <CheckSquare className="w-4 h-4 text-blue-600" />
                    : <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />}
                </button>
                <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="text-sm text-gray-600 truncate flex-1" title={f.name}>{f.name}</span>
                <span className="text-[10px] text-gray-300">{(f.size / 1024).toFixed(0)}KB</span>
                <button
                  onClick={() => setPdfView({ url: `/api/comprovantes/sp/view?url=${encodeURIComponent(f.url)}`, title: f.name })}
                  className="p-1 rounded hover:bg-blue-50 text-blue-500 opacity-0 group-hover:opacity-100"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {node.loaded && node.folders.filter((f) => folderVisible(f, depth + 1)).length === 0 && node.files.length === 0 && (
              <div className="text-xs text-gray-300 py-1" style={{ marginLeft: (depth + 1) * 14 + 22 }}>vazio</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSiteRoot = (site: 'eqs' | 'bratec') => {
    const key = nodeKey(site, SOURCE_BASE[site]);
    const node = tree[key];
    const isOpen = !!node?.expanded;
    const badge = SITE_BADGE[site];
    const siteSelected = selectedList.filter((s) => s.source === site).length;
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50/80 min-w-0">
          <button onClick={() => toggleNode(site, SOURCE_BASE[site])} className="p-0.5 rounded hover:bg-gray-200 shrink-0">
            {node?.loading
              ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              : <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
          </button>
          <FolderTree className="w-4 h-4 text-gray-500 shrink-0" />
          <span className={`text-sm font-semibold whitespace-nowrap px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
          <span className="text-xs text-gray-400 truncate">COMPROVANTES - DESMEMBRAR</span>
          {siteSelected > 0 && <Badge className="bg-blue-600 text-white border-0 shrink-0 ml-auto">{siteSelected} sel.</Badge>}
        </div>
        {isOpen && node && (
          <div className="px-1.5 py-1 max-h-[420px] overflow-y-auto">
            {node.folders.filter((f) => folderVisible(f, 1)).map((f) => renderFolder(site, SOURCE_BASE[site], f, 1))}
            {node.loaded && node.folders.filter((f) => folderVisible(f, 1)).length === 0 && (
              <div className="text-xs text-gray-400 px-3 py-2">Nenhuma pasta corresponde ao filtro</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---------- Render ----------

  return (
    <div className="space-y-5 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Automação de Comprovantes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Desmembramento de comprovantes SharePoint → pastas do funcionário → E2DOC
          </p>
        </div>
        <div className="flex items-center gap-2">
          {gates && (
            <Badge className={`border-0 ${gates.sharepoint.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
              SharePoint: {gates.sharepoint.status}
            </Badge>
          )}
          <button onClick={() => { loadGates(); loadRuns(); }} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Gates */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="px-4 py-3.5 pt-3.5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Gates de segurança
          </div>
          <GateSwitch
            label="Upload SharePoint destino"
            desc="Envia os PDFs gerados para as pastas dos funcionários no site /comprovantes (equivale ao salvamento do app antigo)"
            enabled={gates?.upload_enabled ?? false}
            onToggle={(v) => toggleGate('comprovantes_upload_enabled', v)}
          />
          <GateSwitch
            label="Envio E2DOC"
            desc="Transmite documentos ao E2DOC — manter desligado até validação completa"
            enabled={gates?.e2doc_enabled ?? false}
            onToggle={(v) => toggleGate('e2doc_send_enabled', v)}
            danger
          />
          {!gates?.e2doc_enabled && (
            <Badge className="border-0 bg-amber-100 text-amber-700 text-[11px]">
              <Lock className="w-3 h-3 mr-1" />E2DOC: simulação
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['processar', 'Processar', Play], ['remessa', 'Remessa Folha', FileSpreadsheet], ['runs', 'Execuções', History], ['funcionarios', 'Funcionários', Users]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
            {key === 'runs' && runningRun && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
          </button>
        ))}
      </div>

      {/* TAB: Processar */}
      {tab === 'processar' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Explorador */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-blue-500" /> Explorador SharePoint
              </CardTitle>
              {/* Filtros por nível — selects em cascata alimentados pela árvore */}
              <div className="grid grid-cols-4 gap-2 pt-2">
                {LEVEL_LABELS.map((label, i) => {
                  const opts = levelOptions(i + 1);
                  return (
                    <div key={label}>
                      <label className="text-[10px] font-medium text-gray-400 mb-0.5 block">{label}</label>
                      <select
                        value={filters[i]}
                        onChange={(e) => setFilters((f) => {
                          const n = [...f];
                          n[i] = e.target.value;
                          for (let j = i + 1; j < 4; j++) n[j] = '';
                          return n;
                        })}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">Todos</option>
                        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {spError && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {spError}
                </div>
              )}
              {(() => {
                const cachedNodes = Object.values(tree).filter((n) => n.loaded && n.cached);
                if (cachedNodes.length === 0) return null;
                const oldest = cachedNodes.map((n) => n.cachedAt).filter(Boolean).sort()[0];
                return (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      SharePoint indisponível — exibindo <b>{cachedNodes.length} pasta(s) em cache</b>
                      {oldest ? ` (dados de ${new Date(oldest).toLocaleString('pt-BR')})` : ''}.
                      As pastas atualizam sozinhas quando a conexão voltar.
                    </span>
                  </div>
                );
              })()}
              {renderSiteRoot('eqs')}
              {renderSiteRoot('bratec')}
              <p className="text-[11px] text-gray-400">
                Expanda as pastas ou use os filtros — apenas os ramos correspondentes aparecem. Clique no checkbox dos arquivos ou em "sel." para selecionar a pasta inteira.
              </p>
            </CardContent>
          </Card>

          {/* Seleção */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-blue-500" /> Seleção
                  <span className="text-xs font-normal text-gray-400">{selectedList.length} arquivo{selectedList.length !== 1 ? 's' : ''}</span>
                </CardTitle>
                {selectedList.length > 0 && (
                  <button onClick={() => setSelected({})} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> limpar
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {selectedList.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-10">
                  Nenhum arquivo selecionado — navegue pela árvore ao lado
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-100 max-h-[430px] overflow-y-auto">
                    {selectedList.map((f) => (
                      <div key={f.url} className="flex items-center gap-2 py-2 group">
                        <Badge className={`${SITE_BADGE[f.source].cls} border-0 text-[10px] shrink-0`}>{SITE_BADGE[f.source].label}</Badge>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-800 truncate">{f.name}</div>
                          <div className="text-[10px] text-gray-400 truncate">{f.year} / {f.month} / {f.bank} / {f.date}</div>
                        </div>
                        <button
                          onClick={() => setPdfView({ url: `/api/comprovantes/sp/view?url=${encodeURIComponent(f.url)}`, title: f.name })}
                          className="p-1 rounded hover:bg-blue-50 text-blue-500 opacity-0 group-hover:opacity-100"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => selectFile(f.source, `${SOURCE_BASE[f.source]}/${f.year}/${f.month}/${f.bank}/${f.date}`, f as any, false)}
                          className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={startRun}
                    disabled={starting}
                    className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                  >
                    {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Processar {selectedList.length} arquivo{selectedList.length !== 1 ? 's' : ''}
                  </button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: Remessa de folha — upload de PDFs + TXTs CNAB, análise antes do envio */}
      {tab === 'remessa' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-500" /> Remessa de folha → e2doc
            </CardTitle>
            <p className="text-xs text-gray-400">
              Suba os PDFs de remessa (Itaú 2/pág., Bradesco 1/pág.) e, opcionalmente, os TXTs CNAB de conferência.
              Funcionários são resolvidos pelo cadastro (conta → CPF → nome); o TXT serve de conferência cruzada.
              Nada é enviado sem a sua confirmação após a análise.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-5">
              <input
                type="file" multiple accept=".pdf,.txt"
                onChange={(e) => { setRemFiles([...(e.target.files || [])]); setRemUpload(null); }}
                className="text-sm text-gray-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-600 file:text-sm file:font-medium hover:file:bg-blue-100"
              />
              {remFiles.length > 0 && !remUpload && (
                <div className="mt-3 text-xs text-gray-500">
                  {remFiles.length} arquivo{remFiles.length > 1 ? 's' : ''} selecionado{remFiles.length > 1 ? 's' : ''}
                  <span className="text-gray-400"> — {remFiles.filter((f) => /\.pdf$/i.test(f.name)).length} PDF, {remFiles.filter((f) => /\.txt$/i.test(f.name)).length} TXT</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs font-medium text-gray-600">Competência e2doc (mês da folha, não do pagamento)</label>
              <input
                value={remComp}
                onChange={(e) => setRemComp(e.target.value)}
                placeholder="MM/AAAA — vazio usa o mês anterior ao pagamento (recomendado)"
                className="w-64 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {remComp && !/^\d{2}\/\d{4}$/.test(remComp) && (
                <span className="text-[11px] text-red-500">formato MM/AAAA</span>
              )}
            </div>

            {remError && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {remError}
              </div>
            )}

            {remUpload && (
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="px-4 py-2.5 text-xs font-medium text-gray-500 bg-gray-50/60 rounded-t-xl flex justify-between">
                  <span>Arquivos recebidos</span>
                  <button onClick={() => { setRemUpload(null); setRemFiles([]); }} className="text-gray-400 hover:text-red-500">descartar</button>
                </div>
                {remUpload.files.map((f) => (
                  <div key={f.name} className="flex items-center gap-3 px-4 py-2">
                    {f.kind === 'pdf' ? <FileText className="w-4 h-4 text-red-400" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-500" />}
                    <span className="text-sm text-gray-700 flex-1 truncate">{f.name}</span>
                    {f.banco && <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">{f.banco}</Badge>}
                    <Badge className={`border-0 text-[10px] ${f.kind === 'pdf' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {f.kind.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] text-gray-300">{(f.size / 1024).toFixed(0)}KB</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              {!remUpload ? (
                <button
                  onClick={uploadRemessa}
                  disabled={!remFiles.length || remUploading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300"
                >
                  {remUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                  Enviar arquivos
                </button>
              ) : (
                <button
                  onClick={startRemessa}
                  disabled={starting}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300"
                >
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Analisar remessa
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB: Execuções */}
      {tab === 'runs' && (
        <Card>
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-14">Nenhuma execução ainda</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {runs.map((r) => {
                  const st = RUN_STATUS[r.status] || RUN_STATUS.queued;
                  const res = r.result || {};
                  const expanded = expandedRun === r.id;
                  const title = r.label || `${r.source?.toUpperCase()} · ${r.year} / ${r.month_folder} / ${r.bank} / ${r.date_folder}`;
                  return (
                    <div key={r.id}>
                      <button
                        onClick={() => { setExpandedRun(expanded ? null : r.id); if (!expanded) loadRunDetail(r.id); }}
                        className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 text-left"
                      >
                        <span className="text-xs text-gray-400 w-10">#{r.id}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-800 font-medium truncate">{title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {new Date(r.created_at).toLocaleString('pt-BR')}
                            {r.created_by ? ` · ${r.created_by}` : ''}
                          </div>
                          {r.status === 'running' && (() => {
                            const p = runProgress(r);
                            const phase = PHASE_LABEL[p.pg.phase] || 'Processando';
                            return (
                              <div className="mt-2 space-y-1.5">
                                <div className="h-2 w-full max-w-md rounded-full bg-gray-200 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                                    style={{ width: `${p.pct}%` }}
                                  />
                                </div>
                                <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                  <span className="font-medium text-blue-600">
                                    {phase}{p.pg.currentFileName ? `: ${p.pg.currentFileName}` : ''}
                                    {p.pg.filePages && p.pg.pageNum ? ` · pág. ${p.pg.pageNum}/${p.pg.filePages}` : ''}
                                    {p.pg.phase === 'analyzing' && p.pg.filePagesDone ? ` · ${p.pg.filePagesDone}/${p.pg.filePages}` : ''}
                                  </span>
                                  <span>
                                    {p.processed}/{p.estTotal > 0 ? `~${p.estTotal}` : '?'} pág. ({p.pct.toFixed(0)}%)
                                    {p.totalFiles > 0 ? ` · arq. ${p.pg.currentFile ?? '-'}/${p.totalFiles}` : ''}
                                  </span>
                                  <span>{fmtDur(p.elapsed)} decorridos</span>
                                  <span>{p.eta != null ? `restam ~${fmtDur(p.eta)}` : 'calculando ETA…'}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        {r.status === 'done' && (
                          <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{res.enviados ?? 0}</span>
                            {(res.duplicados ?? 0) > 0 && <span className="text-amber-600">{res.duplicados} dup.</span>}
                            {(res.erros ?? 0) + (res.tipoIncorreto ?? 0) + (res.cpfNaoEncontrado ?? 0) > 0 && (
                              <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3.5 h-3.5" />
                                {(res.erros ?? 0) + (res.tipoIncorreto ?? 0) + (res.cpfNaoEncontrado ?? 0)}</span>
                            )}
                          </div>
                        )}
                        {r.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        <Badge className={`${st.cls} border-0`}>{st.label}</Badge>
                      </button>

                      {expanded && (
                        <div className="px-4 pb-4 pt-1 bg-gray-50/60">
                          {r.error && <div className="text-xs text-red-600 bg-red-50 rounded p-2 mb-2">{r.error}</div>}

                          {/* Análise de remessa aguardando confirmação do usuário */}
                          {r.status === 'aguardando_confirmacao' && (() => {
                            const a = (r.result?.analise || {}) as any;
                            const problemas = (a.semFuncionario ?? 0) + (a.homonimos ?? 0) + (a.divergentes ?? 0) + (a.txtSemPdf ?? 0);
                            return (
                              <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                                <div className="text-sm font-semibold text-violet-800 flex items-center gap-2 mb-2">
                                  <AlertTriangle className="w-4 h-4" /> Análise concluída — revise antes de enviar
                                </div>
                                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600 mb-3">
                                  <span><b className="text-emerald-600">{a.prontos ?? 0}</b> prontos p/ envio</span>
                                  {(a.divergentes ?? 0) > 0 && <span><b className="text-red-600">{a.divergentes}</b> divergentes (valor)</span>}
                                  {(a.semFuncionario ?? 0) > 0 && <span><b className="text-orange-600">{a.semFuncionario}</b> funcionário não encontrado</span>}
                                  {(a.homonimos ?? 0) > 0 && <span><b className="text-orange-600">{a.homonimos}</b> homônimos ambíguos</span>}
                                  {(a.semParTxt ?? 0) > 0 && <span><b className="text-amber-600">{a.semParTxt}</b> no PDF sem par no TXT</span>}
                                  {(a.txtSemPdf ?? 0) > 0 && <span><b className="text-amber-600">{a.txtSemPdf}</b> no TXT sem comprovante</span>}
                                  <span className="text-gray-400">{a.comprovantes ?? 0} comprovantes · {a.txtEntries ?? 0} linhas TXT</span>
                                </div>
                                {(a.warnings || []).length > 0 && (
                                  <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 mb-3 max-h-24 overflow-y-auto font-mono">
                                    {a.warnings.map((w: string, i: number) => <div key={i}>{w}</div>)}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => confirmRemessa(r.id, 'confirmar')}
                                    disabled={confirming === r.id}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:bg-gray-300"
                                  >
                                    {confirming === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    Enviar {a.prontos ?? 0} comprovantes ao e2doc
                                  </button>
                                  <button
                                    onClick={() => confirmRemessa(r.id, 'cancelar')}
                                    disabled={confirming === r.id}
                                    className="px-3 py-2 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-100"
                                  >
                                    Cancelar
                                  </button>
                                  {problemas > 0 && (
                                    <span className="text-[11px] text-gray-500 ml-2">somente os prontos são enviados; problemas ficam registrados</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {activeRun?.run?.id === r.id ? (
                            activeRun.envios.length === 0 ? (
                              <div className="text-xs text-gray-400 py-3">
                                {r.status === 'running' ? 'Processando…' : 'Nenhum documento registrado'}
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-gray-400 border-b border-gray-200">
                                      <th className="py-2 pr-3 font-medium">Arquivo / pág.</th>
                                      <th className="py-2 pr-3 font-medium">Funcionário</th>
                                      <th className="py-2 pr-3 font-medium">CPF</th>
                                      <th className="py-2 pr-3 font-medium">Tipo</th>
                                      <th className="py-2 pr-3 font-medium">Destino</th>
                                      <th className="py-2 pr-3 font-medium">Status</th>
                                      <th className="py-2 font-medium"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {activeRun.envios.map((e) => (
                                      <tr key={e.id} className="text-gray-600">
                                        <td className="py-2 pr-3 max-w-[180px] truncate" title={e.source_file}>
                                          {e.source_file}{e.page_num ? ` · p${e.page_num}` : ''}
                                        </td>
                                        <td className="py-2 pr-3 max-w-[200px] truncate" title={e.nome || ''}>{e.nome || '—'}</td>
                                        <td className="py-2 pr-3 font-mono">{e.cpf || '—'}</td>
                                        <td className="py-2 pr-3">{e.tipo_pagamento || '—'}</td>
                                        <td className="py-2 pr-3 max-w-[220px] truncate text-gray-400" title={e.destino_path || ''}>
                                          {e.destino_path || '—'}
                                        </td>
                                        <td className="py-2 pr-3">
                                          <EnvioStatusBadge status={e.status} />
                                          {e.error && <div className="text-red-500 mt-0.5 max-w-[200px] truncate" title={e.error}>{e.error}</div>}
                                        </td>
                                        <td className="py-2">
                                          {e.generated_pdf_path && (
                                            <button
                                              onClick={() => setPdfView({ url: `/api/comprovantes/generated/${e.id}`, title: e.destino_filename || e.source_file })}
                                              className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg"
                                              title="Ver PDF gerado"
                                            >
                                              <Eye className="w-4 h-4" />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )
                          ) : (
                            <div className="text-xs text-gray-400 py-3 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…</div>
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
      )}

      {/* TAB: Funcionários */}
      {tab === 'funcionarios' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" /> Base de funcionários
                <span className="text-xs font-normal text-gray-400">{funcTotal.toLocaleString('pt-BR')} registros</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-72">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    value={funcQ}
                    onChange={(e) => { setFuncQ(e.target.value); setFuncPage(1); }}
                    placeholder="Nome, CPF, CC ou região…"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <button
                  onClick={exportFuncs}
                  disabled={funcExporting}
                  title={funcQ ? `Exportar ${funcTotal.toLocaleString('pt-BR')} registros filtrados` : 'Exportar todos os funcionários'}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 hover:border-emerald-400 hover:text-emerald-700 text-gray-600 disabled:opacity-50 transition-colors"
                >
                  {funcExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  Exportar Excel
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-200 bg-gray-50/50">
                    <th className="py-2.5 px-4 font-medium">Nome</th>
                    <th className="py-2.5 px-3 font-medium">CPF</th>
                    <th className="py-2.5 px-3 font-medium">CC</th>
                    <th className="py-2.5 px-3 font-medium">Região</th>
                    <th className="py-2.5 px-3 font-medium">Filial</th>
                    <th className="py-2.5 px-3 font-medium">Cargo</th>
                    <th className="py-2.5 px-3 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {funcs.map((f) => (
                    <tr key={f.cpf} className="hover:bg-gray-50">
                      <td className="py-2.5 px-4 text-gray-800 font-medium">{f.nome}</td>
                      <td className="py-2.5 px-3 font-mono text-xs text-gray-500">{f.cpf}</td>
                      <td className="py-2.5 px-3 text-gray-600">{f.cc}</td>
                      <td className="py-2.5 px-3 text-gray-600">{f.regiao}</td>
                      <td className="py-2.5 px-3 text-gray-600">{f.filial}</td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs">{f.cargo}</td>
                      <td className="py-2.5 px-3">
                        <Badge className={`border-0 text-[11px] ${f.situacao?.toUpperCase().includes('ATIV') ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.situacao || '—'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {funcs.length === 0 && !funcLoading && (
                    <tr><td colSpan={7} className="py-10 text-center text-gray-400 text-sm">Nenhum funcionário encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">Página {funcPage} de {funcPages}</span>
              <div className="flex gap-2">
                <button disabled={funcPage <= 1} onClick={() => setFuncPage(funcPage - 1)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                <button disabled={funcPage >= funcPages} onClick={() => setFuncPage(funcPage + 1)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Próxima</button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {pdfView && <PdfViewerModal url={pdfView.url} title={pdfView.title} onClose={() => setPdfView(null)} />}
    </div>
  );
}
