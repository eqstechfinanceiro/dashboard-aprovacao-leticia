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
  ExternalLink,
  Copy,
  Check,
  CheckCheck,
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
  tipo: 'mercadoria' | 'servico' | 'vexpenses';
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
  review_status: 'auto_ok' | 'auto_ok_aviso' | 'pendente' | 'falha_tecnica' | 'confirmado_ok' | 'confirmado_erro' | 'corrigida' | 'cancelado';
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_motivo: string | null;
  corrigida_by: string | null;
  corrigida_at: string | null;
  corrigida_nota: string | null;
  corrigida_de: string | null;
  review_nota: string | null;
  erro_tipo: string | null;
  erro_descricao: string | null;
  resultados_id: number | null;
  doc_path: string | null;
  doc_nome: string | null;
  docs?: { id: number; nome: string; tipo: string }[];
  em_bordero?: boolean;
  bordero_pago?: boolean;
  bordero_checked_at?: string | null;
  monitor_status?: string | null;
  monitor_checked_at?: string | null;
  created_at: string;
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
  auto_ok_aviso: 'Conferida c/ aviso',
  pendente: 'Pendente',
  falha_tecnica: 'Falha técnica',
  confirmado_ok: 'Confirmada OK',
  confirmado_erro: 'Erro confirmado',
  corrigida: 'Corrigida',
  cancelado: 'Cancelada',
  reconf: 'Reconferindo',
};

const STATUS_STYLE: Record<string, string> = {
  auto_ok: 'bg-green-100 text-green-700',
  auto_ok_aviso: 'bg-yellow-100 text-yellow-800',
  pendente: 'bg-amber-100 text-amber-700',
  falha_tecnica: 'bg-gray-200 text-gray-600',
  confirmado_ok: 'bg-blue-100 text-blue-700',
  confirmado_erro: 'bg-red-100 text-red-700',
  corrigida: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-slate-200 text-slate-600',
  reconf: 'bg-indigo-100 text-indigo-700',
};

const KANBAN_COLS: { status: string; label: string; drop: boolean; cls: string }[] = [
  { status: 'pendente', label: 'Pendentes', drop: true, cls: 'border-amber-300 bg-amber-50/40' },
  { status: 'falha_tecnica', label: 'Falha técnica', drop: false, cls: 'border-gray-300 bg-gray-50/40' },
  { status: 'confirmado_ok', label: 'Confirmadas OK', drop: true, cls: 'border-blue-300 bg-blue-50/40' },
  { status: 'confirmado_erro', label: 'Erros confirmados', drop: true, cls: 'border-red-300 bg-red-50/40' },
  { status: 'corrigida', label: 'Corrigidas', drop: true, cls: 'border-emerald-300 bg-emerald-50/40' },
  { status: 'cancelado', label: 'Canceladas', drop: true, cls: 'border-slate-300 bg-slate-50/40' },
];

const ERRO_LABEL: Record<string, string> = Object.fromEntries(
  ERRO_OPCOES.map((o) => [o.value, o.label])
);

// Monitor de re-lançamento de notas canceladas (worker syncCanceladaMonitor).
const MONITOR_LABEL: Record<string, { label: string; cls: string }> = {
  aguardando_exclusao: { label: 'Aguardando exclusão no ERP', cls: 'bg-amber-100 text-amber-700' },
  excluida: { label: 'Excluída — aguardando re-lançamento', cls: 'bg-sky-100 text-sky-700' },
  relancada_pendente: { label: 'Re-lançada — sem XML p/ re-conferir', cls: 'bg-violet-100 text-violet-700' },
  relancada_ok: { label: 'Re-lançada — confere com o XML', cls: 'bg-emerald-100 text-emerald-700' },
  relancada_divergente: { label: 'Re-lançada — ainda divergente', cls: 'bg-red-100 text-red-700' },
  erro_monitor: { label: 'Erro ao monitorar', cls: 'bg-gray-200 text-gray-600' },
};

function fmtBRL(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCnpj(v: string | null | undefined): string {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v || '—';
}

function fmtData(v: string | null | undefined): string {
  if (!v) return '—';
  const d = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : v;
}

// Nome legível do fornecedor: em notas de mercadoria a coluna `fornecedor`
// guarda o CÓDIGO (WA5439); o nome fica no check 'Nome Fornecedor' (lado
// TOTVS = expected). Serviço guarda o nome direto na coluna.
function fornecedorNome(n: FiscalNota): string | null {
  const chk = flatChecks(n.checks).find((c) => /nome fornecedor/i.test(c.field));
  const nome = chk?.expected || chk?.actual || null;
  if (nome && nome !== '—') return nome;
  return n.tipo === 'servico' ? (n.fornecedor || null) : null;
}

// Código do fornecedor no TOTVS (mercadoria = coluna fornecedor; serviço =
// recno do processo guardado em extra pelo sync de docs do portal).
function fornecedorCodigo(n: FiscalNota): string | null {
  if (n.tipo === 'mercadoria' || n.tipo === 'vexpenses') return n.fornecedor || null;
  return n.extra?.fornecedor_cod || n.extra?.recno || null;
}

// Texto copiável pra localizar a nota no TOTVS/portal.
function resumoCopiavel(n: FiscalNota): string {
  const nome = fornecedorNome(n);
  const cod = fornecedorCodigo(n);
  const lancamento = n.extra?.f1_dtdigit || n.created_at || null;
  const linhas = [
    `NF ${n.doc}${n.serie ? ` · série ${n.serie}` : ''}${n.filial ? ` · filial ${n.filial}` : ''}`,
    `Fornecedor: ${cod ? `${cod} — ` : ''}${nome || n.fornecedor || '—'}`,
    `CNPJ: ${fmtCnpj(n.cnpj)}`,
    `Emissão: ${fmtData(n.emissao)} · Lançamento: ${fmtData(lancamento)}`,
    `Valor: ${fmtBRL(n.valor)}`,
  ];
  if (n.chave_acesso) linhas.push(`Chave: ${n.chave_acesso}`);
  return linhas.join('\n');
}

function flatChecks(checks: FiscalNota['checks']): Check[] {
  if (!checks) return [];
  if (Array.isArray(checks) && checks.length > 0 && Array.isArray(checks[0])) {
    return (checks as Check[][]).flat();
  }
  return checks as Check[];
}

// Normaliza erros "específicos da nota" numa categoria única — sem isso o
// filtro de divergência lista "valor 1118.81 NÃO ENCONTRADO", "valor 72.13
// NÃO ENCONTRADO"... como tipos distintos (um por nota).
function normDivTipo(t: string): string {
  if (/^doc .+ não encontrado$/i.test(t)) return 'Doc não encontrado';
  if (/^valor .+ não encontrado$/i.test(t)) return 'Valor não encontrado';
  const m = t.match(/^(iss|irrf|inss) .+ não encontrado$/i);
  if (m) return `${m[1].toUpperCase()} não encontrado`;
  if (/^erro ao ler pdf/i.test(t)) return 'Erro ao ler PDF';
  return t;
}

// Botão de segmented control — usado na navegação principal e nos filtros
// de status (substitui a fileira de Buttons soltos).
function SegBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function SegCount({ n }: { n: number | undefined }) {
  if (!n) return null;
  return <span className="rounded-full bg-slate-200/80 px-1.5 text-[10px] font-semibold text-slate-600">{n}</span>;
}

// Tipos de divergência de uma nota: sufixo do field sem o prefixo "Item X · ",
// agrupado com contagem — [['TES', 2], ['Valor Total', 1]]
function divTipos(checks: Check[]): [string, number][] {
  const m = new Map<string, number>();
  for (const c of checks) {
    if (c.match) continue;
    const t = normDivTipo((c.field.split('·').pop() || c.field).trim() || c.field);
    m.set(t, (m.get(t) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function FiscalPage() {
  const [view, setView] = useState<'fila' | 'historico'>('fila');
  const [tipo, setTipo] = useState<'mercadoria' | 'servico' | 'vexpenses'>('mercadoria');
  const [status, setStatus] = useState<string>('pendente');
  const [histStatus, setHistStatus] = useState<string>('confirmado_erro');
  const [histMode, setHistMode] = useState<'lista' | 'kanban'>('lista');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [data, setData] = useState<{ runs: FiscalRun[]; resumo: Record<string, Record<string, number>>; notas: FiscalNota[]; div_tipos?: string[] } | null>(null);
  const [divFiltro, setDivFiltro] = useState('');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [emissaoFrom, setEmissaoFrom] = useState('');
  const [emissaoTo, setEmissaoTo] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [acting, setActing] = useState<number | null>(null);
  const [erroForm, setErroForm] = useState<{ notaId: number; erro_tipo: string; descricao: string } | null>(null);
  const [cancelForm, setCancelForm] = useState<{ notaId: number; motivo: string } | null>(null);
  const [corrigirForm, setCorrigirForm] = useState<{ notaId: number; nota: string } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [docModal, setDocModal] = useState<{ id?: number; docId?: number; nome: string } | null>(null);
  // Anexo selecionado por nota (nota_id → fiscal_notas_docs.id) — muda o iframe.
  const [docSel, setDocSel] = useState<Record<number, number>>({});
  // Borderô da nota (SEA/SE2 do TOTVS) — lazy fetch ao expandir.
  const [bordero, setBordero] = useState<Record<number, { em_bordero: boolean; pago: boolean; borderos: any[] } | 'loading'>>({});
  const [onlyErr, setOnlyErr] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMotivo, setImportMotivo] = useState('');
  const [importErroTipo, setImportErroTipo] = useState('outro');
  const [importTipo, setImportTipo] = useState<'mercadoria' | 'servico' | 'vexpenses'>('mercadoria');
  const [importing, setImporting] = useState(false);
  const [importManual, setImportManual] = useState({ doc: '', serie: '', filial: '', fornecedor: '', cnpj: '', valor: '', emissao: '' });
  const importIsPdf = !!importFile && /\.pdf$/i.test(importFile.name);
  const [ciclo, setCiclo] = useState<{ state?: any; runs?: any[]; fila?: any[]; erros?: any[] } | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  const loadCiclo = useCallback(async () => {
    try {
      const r = await fetch('/api/fiscal/ciclo');
      const b = await r.json();
      if (r.ok) setCiclo(b);
    } catch {}
  }, []);

  useEffect(() => {
    loadCiclo();
    const t = setInterval(loadCiclo, 20000);
    return () => clearInterval(t);
  }, [loadCiclo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const divParam = divFiltro ? `&div=${encodeURIComponent(divFiltro)}` : '';
      const qParam = q ? `&q=${encodeURIComponent(q)}` : '';
      const fromParam = emissaoFrom ? `&from=${emissaoFrom}` : '';
      const toParam = emissaoTo ? `&to=${emissaoTo}` : '';
      const empParam = empresa ? `&empresa=${encodeURIComponent(empresa)}` : '';
      const extraParams = `${divParam}${qParam}${fromParam}${toParam}${empParam}`;
      const url = view === 'historico'
        ? histMode === 'kanban'
          ? `/api/fiscal/fila?scope=kanban&status=all&limit=1000${extraParams}`
          : `/api/fiscal/fila?scope=historico&status=${histStatus}&limit=500${extraParams}`
        : `/api/fiscal/fila?scope=fila&tipo=${tipo}&status=${status}&limit=500${extraParams}`;
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [view, tipo, status, histStatus, histMode, divFiltro, q, emissaoFrom, emissaoTo, empresa]);

  // Debounce da busca — digita e filtra sem apertar Enter.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => { load(); }, [load]);

  const revisar = async (notaId: number, decisao: string, erroTipo?: string, descricao?: string, motivo?: string, corrigidaNota?: string) => {
    setActing(notaId);
    try {
      const res = await fetch('/api/fiscal/revisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota_id: notaId, decisao, erro_tipo: erroTipo, erro_descricao: descricao, cancel_motivo: motivo, corrigida_nota: corrigidaNota }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setErroForm(null);
      setCancelForm(null);
      setCorrigirForm(null);
      await load();
    } catch (e: any) {
      alert(`Erro ao revisar: ${e.message}`);
    } finally {
      setActing(null);
    }
  };

  const copiarResumo = async (notaId: number, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(notaId);
      setTimeout(() => setCopied((c) => (c === notaId ? null : c)), 1600);
    } catch {
      alert('Não foi possível copiar — selecione e copie manualmente.');
    }
  };

  // Baixa TODOS os documentos do processo no portal EQS (não só o primeiro
  // 'G' que o runner pega — boletos e a nota real vêm junto).
  const buscarDocs = async (notaId: number) => {
    setActing(notaId);
    try {
      const res = await fetch('/api/fiscal/servico-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota_id: notaId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (body.erros?.length) alert(`Portal: ${body.erros[0].erro}`);
      else if (!body.anexados && body.proc_nao_encontrado) alert('Processo não encontrado no portal EQS.');
      else if (!body.anexados && body.sem_docs) alert('O processo não tem documentos anexados no portal.');
      await load();
    } catch (e: any) {
      alert(`Erro ao buscar documentos: ${e.message}`);
    } finally {
      setActing(null);
    }
  };

  // Arrastar card no kanban → mesma decisão dos botões da lista.
  const kanbanDrop = (notaId: number, from: string, to: string) => {
    if (!to || from === to) return;
    if (to === 'confirmado_ok') revisar(notaId, 'confirmado_ok');
    else if (to === 'pendente') revisar(notaId, 'pendente');
    else if (to === 'confirmado_erro') setErroForm({ notaId, erro_tipo: 'outro', descricao: '' });
    else if (to === 'corrigida') {
      if (from !== 'confirmado_erro') {
        alert('Só é possível corrigir uma nota com erro confirmado — arraste primeiro para "Erros confirmados".');
        return;
      }
      setCorrigirForm({ notaId, nota: '' });
    }
    else if (to === 'cancelado') {
      if (from !== 'confirmado_erro') {
        alert('Só é possível cancelar uma nota com erro confirmado — arraste primeiro para "Erros confirmados".');
        return;
      }
      setCancelForm({ notaId, motivo: '' });
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
      if (importIsPdf) {
        for (const [k, v] of Object.entries(importManual)) {
          if (v.trim()) fd.append(k, v.trim());
        }
      }
      const res = await fetch('/api/fiscal/importar-xml', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setImportOpen(false);
      setImportFile(null);
      setImportMotivo('');
      setImportErroTipo('outro');
      setImportManual({ doc: '', serie: '', filial: '', fornecedor: '', cnpj: '', valor: '', emissao: '' });
      setView('historico');
      setHistStatus('confirmado_erro');
      await load();
    } catch (e: any) {
      alert(`Erro ao importar: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  const exportExtra =
    `${q ? `&q=${encodeURIComponent(q)}` : ''}${emissaoFrom ? `&from=${emissaoFrom}` : ''}` +
    `${emissaoTo ? `&to=${emissaoTo}` : ''}${empresa ? `&empresa=${encodeURIComponent(empresa)}` : ''}` +
    `${divFiltro ? `&div=${encodeURIComponent(divFiltro)}` : ''}`;
  const exportUrl = view === 'historico'
    ? `/api/fiscal/exportar-xlsx?scope=historico&status=${histStatus}${exportExtra}`
    : `/api/fiscal/exportar-xlsx?scope=fila&tipo=${tipo}&status=${status}${exportExtra}`;

  const resumoTipo = data?.resumo?.[tipo] || {};
  const resumoTotal: Record<string, number> = {};
  for (const counts of Object.values(data?.resumo || {})) {
    for (const [s, n] of Object.entries(counts)) resumoTotal[s] = (resumoTotal[s] || 0) + (n as number);
  }
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

      {/* Navegação: segmented control de visões + ações secundárias à direita */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-1">
          <SegBtn
            active={view === 'fila' && tipo === 'mercadoria'}
            onClick={() => { setView('fila'); setTipo('mercadoria'); }}
          >
            <Package className="h-4 w-4" /> Mercadoria
          </SegBtn>
          <SegBtn
            active={view === 'fila' && tipo === 'servico'}
            onClick={() => { setView('fila'); setTipo('servico'); }}
          >
            <Wrench className="h-4 w-4" /> Serviço
          </SegBtn>
          <SegBtn
            active={view === 'fila' && tipo === 'vexpenses'}
            onClick={() => { setView('fila'); setTipo('vexpenses'); }}
          >
            <FileText className="h-4 w-4" /> VExpenses
          </SegBtn>
          <div className="mx-1 w-px self-stretch bg-border" />
          <SegBtn active={view === 'historico'} onClick={() => setView('historico')}>
            <History className="h-4 w-4" /> Histórico
          </SegBtn>
        </div>
        <div className="flex gap-2">
          <a href="/fiscal/tes-regras">
            <Button variant="ghost" size="sm" type="button">
              <ExternalLink className="h-4 w-4 mr-1.5" /> Regras TES
            </Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => { setImportTipo(view === 'fila' ? tipo : 'mercadoria'); setImportOpen(true); }}>
            <Upload className="h-4 w-4 mr-1.5" /> Importar nota
          </Button>
          <a href={exportUrl} download>
            <Button variant="outline" size="sm" type="button">
              <Download className="h-4 w-4 mr-1.5" /> Exportar Excel
            </Button>
          </a>
        </div>
      </div>

      {/* Ciclo de conferência — observabilidade do worker na VPS */}
      {(() => {
        const s = ciclo?.state || {};
        const running = ['totvs', 'sieg_prep', 'conferindo'].includes(s.fase);
        const pct = s.elegiveis > 0 ? Math.round((100 * (s.conferidas || 0)) / s.elegiveis) : (running ? 0 : 100);
        const proxCiclo = s.finished_at ? new Date(new Date(s.finished_at).getTime() + 45 * 60000) : null;
        const filaMap = Object.fromEntries((ciclo?.fila || []).map((f: any) => [f.review_status, f.n]));
        return (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <RefreshCw className={cn('h-4 w-4', running ? 'animate-spin text-blue-500' : 'text-muted-foreground')} />
                  Ciclo de conferência (VPS — a cada ~45min)
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setLogsOpen((v) => !v)}>
                  {logsOpen ? 'Ocultar logs' : 'Ver logs'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  running ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')}>
                  {running
                    ? s.fase === 'totvs' ? 'Consultando TOTVS…' : s.fase === 'sieg_prep' ? 'Registrando chaves no SIEG…' : 'Conferindo…'
                    : 'Ocioso'}
                </span>
                {running && s.elegiveis > 0 && (
                  <span className="text-muted-foreground">{s.conferidas}/{s.elegiveis} notas</span>
                )}
                {s.current_doc && <span className="text-muted-foreground">atual: NF {s.current_doc}</span>}
                {!running && s.finished_at && (
                  <span className="text-muted-foreground">
                    último ciclo {new Date(s.finished_at).toLocaleString('pt-BR')}
                    {proxCiclo && ` · próximo ~${proxCiclo.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                )}
                {s.error && <span className="text-red-600 text-xs">erro: {s.error}</span>}
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', running ? 'bg-blue-500' : 'bg-green-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                <span><b className="text-green-600">{s.match || 0}</b> ok</span>
                <span><b className="text-amber-600">{s.divergentes || 0}</b> divergentes</span>
                <span><b className="text-gray-500">{s.falhas || 0}</b> falhas técnicas</span>
                <span><b>{s.puladas || 0}</b> puladas (dedup)</span>
                <span><b>{s.total || 0}</b> NFs na janela {s.janela_dias ? `(${s.janela_dias}d)` : ''}</span>
                {Object.entries(s.fontes || {}).map(([f, n]: any) => (
                  <span key={f} className="rounded bg-slate-100 px-1.5 py-0.5">fonte {f}: <b>{String(n)}</b></span>
                ))}
                {Object.keys(filaMap).length > 0 && (
                  <span className="ml-auto">
                    fila total: {Object.entries(filaMap).map(([k, v]: any) => `${STATUS_LABEL[k] || k} ${v}`).join(' · ')}
                  </span>
                )}
              </div>
              {logsOpen && (
                <div className="rounded-lg border bg-slate-950 text-slate-100 p-3 max-h-72 overflow-y-auto">
                  <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono">
                    {(s.log || []).map((l: any, i: number) =>
                      `${new Date(l.t).toLocaleTimeString('pt-BR')} ${l.m}`
                    ).join('\n') || 'sem logs ainda'}
                  </pre>
                  {(ciclo?.erros || []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                      {ciclo!.erros!.map((e: any, i: number) => (
                        <p key={i} className="text-[11px] text-red-300 font-mono">
                          {new Date(e.created_at).toLocaleTimeString('pt-BR')} [{e.context}] {e.error}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Resumo do tipo selecionado (só na fila de trabalho) */}
      {view === 'fila' && (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" />Pendentes</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{resumoTipo.pendente || 0}</div>
            {!!resumoTipo.reconf && (
              <div className="mt-1 text-xs text-indigo-600">
                {resumoTipo.reconf} aguardando reconferência automática
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />Conferidas (auto)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{resumoTipo.auto_ok || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-yellow-600" />Com aviso (CST)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{resumoTipo.auto_ok_aviso || 0}</div></CardContent>
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

      {/* Filtro de status — segmented control com contadores */}
      {view === 'fila' ? (
        <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border bg-muted/40 p-1">
          {['pendente', 'reconf', 'auto_ok', 'auto_ok_aviso', 'falha_tecnica', 'confirmado_ok', 'confirmado_erro', 'corrigida', 'cancelado', 'all'].map((s) => (
            <SegBtn key={s} active={status === s} onClick={() => setStatus(s)}>
              {s === 'all' ? 'Todas' : STATUS_LABEL[s]}
              <SegCount n={s === 'all' ? undefined : resumoTipo[s]} />
            </SegBtn>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 flex-wrap items-center">
          <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-1">
            <SegBtn active={histMode === 'lista'} onClick={() => setHistMode('lista')}>Lista</SegBtn>
            <SegBtn active={histMode === 'kanban'} onClick={() => setHistMode('kanban')}>Kanban</SegBtn>
          </div>
          {histMode === 'lista' && (
            <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border bg-muted/40 p-1">
              {[
                { v: 'confirmado_erro', l: 'Erros confirmados' },
                { v: 'corrigida', l: 'Corrigidas' },
                { v: 'confirmado_ok', l: 'Confirmadas OK' },
                { v: 'cancelado', l: 'Canceladas' },
                { v: 'all', l: 'Todas' },
              ].map((o) => (
                <SegBtn key={o.v} active={histStatus === o.v} onClick={() => setHistStatus(o.v)}>
                  {o.l}
                  <SegCount n={o.v === 'all' ? undefined : resumoTotal[o.v]} />
                </SegBtn>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtros — busca, período de emissão, empresa e tipo de divergência */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          className="rounded-md border bg-white px-3 py-1.5 text-sm w-64"
          placeholder="Buscar NF, fornecedor ou chave…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Emissão
          <input
            type="date"
            className="rounded-md border bg-white px-2 py-1.5 text-sm"
            value={emissaoFrom}
            onChange={(e) => setEmissaoFrom(e.target.value)}
          />
          até
          <input
            type="date"
            className="rounded-md border bg-white px-2 py-1.5 text-sm"
            value={emissaoTo}
            onChange={(e) => setEmissaoTo(e.target.value)}
          />
        </label>
        <select
          className="rounded-md border bg-white px-2 py-1.5 text-sm"
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
        >
          <option value="">Todas as empresas</option>
          <option value="EQS">EQS</option>
          <option value="BRATEC">BRATEC</option>
        </select>
        {(q || emissaoFrom || emissaoTo || empresa || divFiltro) && (
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => { setQInput(''); setQ(''); setEmissaoFrom(''); setEmissaoTo(''); setEmpresa(''); setDivFiltro(''); }}
          >
            Limpar filtros
          </button>
        )}
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            {data.notas.length} nota(s)
          </span>
        )}
      </div>

      {/* Filtro por tipo de divergência (impostos, valor total, TES...) */}
      {(data?.div_tipos?.length || divFiltro) ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Tipo de divergência:</span>
          <select
            className="rounded-md border bg-white px-2 py-1.5 text-sm"
            value={divFiltro}
            onChange={(e) => setDivFiltro(e.target.value)}
          >
            <option value="">Todas</option>
            {[
              ...(data?.div_tipos || []),
              ...(divFiltro && !(data?.div_tipos || []).includes(divFiltro) ? [divFiltro] : []),
            ].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {divFiltro && (
            <button className="text-xs text-blue-600 hover:underline" onClick={() => setDivFiltro('')}>
              limpar
            </button>
          )}
        </div>
      ) : null}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Lista de notas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {view === 'historico'
              ? histMode === 'kanban'
                ? 'Quadro — arraste os cards entre as colunas'
                : (histStatus === 'all' ? 'Histórico — erros e canceladas' : STATUS_LABEL[histStatus] || histStatus)
              : `${status === 'all' ? 'Todas as notas' : STATUS_LABEL[status]} — ${tipo === 'mercadoria' ? 'Mercadoria' : tipo === 'servico' ? 'Serviço' : 'VExpenses'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : view === 'historico' && histMode === 'kanban' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
              {KANBAN_COLS.map((col) => {
                const cards = (data?.notas || []).filter((n) => n.review_status === col.status);
                return (
                  <div
                    key={col.status}
                    className={cn(
                      'rounded-lg border-2 border-dashed p-2 min-h-[160px] transition-colors',
                      col.cls,
                      col.drop && dragOver === col.status && 'border-solid ring-2 ring-blue-400'
                    )}
                    onDragOver={col.drop ? (e) => { e.preventDefault(); setDragOver(col.status); } : undefined}
                    onDragLeave={col.drop ? () => setDragOver(null) : undefined}
                    onDrop={col.drop ? (e) => {
                      e.preventDefault();
                      const id = Number(e.dataTransfer.getData('nota-id'));
                      const from = e.dataTransfer.getData('nota-status');
                      setDragOver(null);
                      if (id) kanbanDrop(id, from, col.status);
                    } : undefined}
                  >
                    <div className="flex items-center justify-between px-1 pb-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLE[col.status])}>
                        {col.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{cards.length}</span>
                    </div>
                    <div className="space-y-2">
                      {cards.map((n) => {
                        const dts = divTipos(flatChecks(n.checks));
                        return (
                        <div
                          key={n.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('nota-id', String(n.id));
                            e.dataTransfer.setData('nota-status', n.review_status);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          className="rounded-md border bg-white p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:shadow transition-shadow"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-xs">NF {n.doc}</span>
                            {n.serie && <span className="text-[10px] text-muted-foreground">série {n.serie}</span>}
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {n.tipo === 'servico' ? 'Serviço' : n.tipo === 'vexpenses' ? 'VExpenses' : 'Mercadoria'}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={n.fornecedor || ''}>
                            {n.fornecedor || '—'}
                          </p>
                          {dts.length > 0 && (
                            <p className="text-[10px] text-amber-700 truncate" title={dts.map(([t, c]) => c > 1 ? `${t} ×${c}` : t).join(', ')}>
                              {dts.map(([t, c]) => c > 1 ? `${t} ×${c}` : t).join(', ')}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs font-semibold">{fmtBRL(n.valor)}</span>
                            <div className="flex gap-1.5">
                              <a
                                href={`/api/fiscal/portal-link?id=${n.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                                title="Abrir no portal EQS"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              {n.doc_path && (
                                <button
                                  className="text-blue-600 hover:text-blue-800"
                                  title="Ampliar documento"
                                  onClick={() => setDocModal({ id: n.id, nome: n.doc_nome || 'documento' })}
                                >
                                  <Maximize2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          {n.reviewed_by && (
                            <p className="text-[10px] text-blue-600 truncate mt-0.5">
                              por {n.reviewed_by}
                            </p>
                          )}
                          {n.review_status === 'cancelado' && n.cancelled_by && (
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              cancelada por {n.cancelled_by}
                            </p>
                          )}
                          {n.review_status === 'corrigida' && n.corrigida_by && (
                            <p className="text-[10px] text-emerald-700 truncate mt-0.5">
                              corrigida por {n.corrigida_by}
                            </p>
                          )}
                          {erroForm?.notaId === n.id && (
                            <div className="rounded border border-red-200 bg-red-50 p-2 mt-1.5 space-y-1.5">
                              <p className="text-[11px] font-medium text-red-800">Confirmar erro</p>
                              <select
                                className="w-full rounded border bg-white px-1.5 py-1 text-[11px]"
                                value={erroForm.erro_tipo}
                                onChange={(e) => setErroForm({ ...erroForm, erro_tipo: e.target.value })}
                              >
                                {ERRO_OPCOES.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                              <textarea
                                className="w-full rounded border bg-white px-1.5 py-1 text-[11px]"
                                rows={2}
                                placeholder="Descrição (opcional)"
                                value={erroForm.descricao}
                                onChange={(e) => setErroForm({ ...erroForm, descricao: e.target.value })}
                              />
                              <div className="flex gap-1.5">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-[11px] px-2"
                                  disabled={acting === n.id}
                                  onClick={() => revisar(n.id, 'confirmado_erro', erroForm.erro_tipo, erroForm.descricao)}
                                >
                                  {acting === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Registrar'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => setErroForm(null)}>
                                  Voltar
                                </Button>
                              </div>
                            </div>
                          )}
                          {cancelForm?.notaId === n.id && (
                            <div className="rounded border border-slate-300 bg-slate-50 p-2 mt-1.5 space-y-1.5">
                              <p className="text-[11px] font-medium text-slate-800">Marcar como cancelada</p>
                              <input
                                className="w-full rounded border bg-white px-1.5 py-1 text-[11px]"
                                placeholder="Motivo (opcional)"
                                value={cancelForm.motivo}
                                onChange={(e) => setCancelForm({ ...cancelForm, motivo: e.target.value })}
                              />
                              <div className="flex gap-1.5">
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] px-2"
                                  disabled={acting === n.id}
                                  onClick={() => revisar(n.id, 'cancelado', undefined, undefined, cancelForm.motivo)}
                                >
                                  {acting === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => setCancelForm(null)}>
                                  Voltar
                                </Button>
                              </div>
                            </div>
                          )}
                          {corrigirForm?.notaId === n.id && (
                            <div className="rounded border border-emerald-300 bg-emerald-50 p-2 mt-1.5 space-y-1.5">
                              <p className="text-[11px] font-medium text-emerald-800">Marcar como corrigida</p>
                              <input
                                className="w-full rounded border bg-white px-1.5 py-1 text-[11px]"
                                placeholder="Como foi corrigida (opcional)"
                                value={corrigirForm.nota}
                                onChange={(e) => setCorrigirForm({ ...corrigirForm, nota: e.target.value })}
                              />
                              <div className="flex gap-1.5">
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700"
                                  disabled={acting === n.id}
                                  onClick={() => revisar(n.id, 'corrigida', undefined, undefined, undefined, corrigirForm.nota)}
                                >
                                  {acting === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Registrar'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => setCorrigirForm(null)}>
                                  Voltar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        );
                      })}
                      {cards.length === 0 && (
                        <p className="text-[11px] text-muted-foreground text-center py-4">—</p>
                      )}
                    </div>
                  </div>
                );
              })}
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
                        if (next.has(n.id)) next.delete(n.id); else {
                          next.add(n.id);
                          // Lazy: consulta borderô (SEA/SE2) só ao abrir a nota.
                          if (n.tipo !== 'vexpenses' && bordero[n.id] === undefined) {
                            setBordero((prev) => ({ ...prev, [n.id]: 'loading' }));
                            fetch(`/api/fiscal/bordero?nota_id=${n.id}`)
                              .then((r) => (r.ok ? r.json() : { em_bordero: false, pago: false, borderos: [] }))
                              .then((b) => setBordero((prev) => ({ ...prev, [n.id]: b })))
                              .catch(() => setBordero((prev) => ({ ...prev, [n.id]: { em_bordero: false, pago: false, borderos: [] } })));
                          }
                        }
                        setExpanded(next);
                      }}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">NF {n.doc}</span>
                          {n.serie && <span className="text-xs text-muted-foreground">série {n.serie}</span>}
                          {(view === 'historico' || n.tipo === 'vexpenses') && (
                            <span className={cn('rounded-full px-2 py-0.5 text-xs',
                              n.tipo === 'vexpenses' ? 'bg-violet-100 text-violet-700 font-medium' : 'bg-slate-100 text-slate-600')}>
                              {n.tipo === 'servico' ? 'Serviço' : n.tipo === 'vexpenses' ? 'VExpenses' : 'Mercadoria'}
                            </span>
                          )}
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLE[n.review_status])}>
                            {STATUS_LABEL[n.review_status]}
                          </span>
                          {n.extra?.reconf === 'true' && (
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700"
                              title="Aguardando reconferência automática com as novas regras — o resultado anterior é só referência"
                            >
                              Reconferindo
                            </span>
                          )}
                          {n.em_bordero && (
                            <span
                              className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                              title={n.bordero_pago ? 'Título já baixado (pago) em borderô' : 'Título em borderô de pagamento'}
                            >
                              {n.bordero_pago ? 'Paga em borderô' : 'Em borderô'}
                            </span>
                          )}
                          {!n.em_bordero && n.bordero_pago && (
                            <span
                              className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                              title="Título baixado sem passar por borderô — correção exige estorno"
                            >
                              Paga
                            </span>
                          )}
                          {n.review_status === 'cancelado' && n.monitor_status && MONITOR_LABEL[n.monitor_status] && (
                            <span
                              className={cn('rounded-full px-2 py-0.5 text-xs font-medium', MONITOR_LABEL[n.monitor_status].cls)}
                              title={n.monitor_checked_at ? `Monitorado em ${new Date(n.monitor_checked_at).toLocaleString('pt-BR')}` : ''}
                            >
                              {MONITOR_LABEL[n.monitor_status].label}
                            </span>
                          )}
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
                          {divTipos(checks).map(([t, c]) => (
                            <span
                              key={t}
                              className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                            >
                              {t}{c > 1 ? ` ×${c}` : ''}
                            </span>
                          ))}
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
                        {n.review_status === 'corrigida' && n.corrigida_by && (
                          <p className="text-xs text-emerald-700 truncate">
                            Corrigida por {n.corrigida_by} em {n.corrigida_at ? new Date(n.corrigida_at).toLocaleString('pt-BR') : '—'}
                            {n.corrigida_de === 'cancelado' ? ' (estava cancelada)' : ''}
                            {n.corrigida_nota ? ` — ${n.corrigida_nota}` : ''}
                          </p>
                        )}
                        {n.review_status === 'corrigida' && n.corrigida_de === 'cancelado' && n.cancelled_by && (
                          <p className="text-xs text-slate-500 truncate">
                            Cancelada por {n.cancelled_by} em {n.cancelled_at ? new Date(n.cancelled_at).toLocaleString('pt-BR') : '—'}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold shrink-0">{fmtBRL(n.valor)}</span>
                    </button>

                    {isOpen && (
                      <div className={cn('border-t px-4 py-3', (n.doc_path || (n.docs && n.docs.length > 0)) && 'grid gap-4 lg:grid-cols-2')}>
                        <div className="space-y-3 min-w-0">
                        {/* Identificação copiável — dados pra localizar a nota
                            no TOTVS/portal (fornecedor nome+código, doc, série,
                            emissão, lançamento). */}
                        {(() => {
                          const nome = fornecedorNome(n);
                          const cod = fornecedorCodigo(n);
                          const lancamento = n.extra?.f1_dtdigit || n.created_at || null;
                          const campos: [string, string][] = [
                            ['Número', n.doc],
                            ['Série', n.serie || '—'],
                            ['Fornecedor', nome || n.fornecedor || '—'],
                            ['Cód. fornecedor', cod || '—'],
                            ['CNPJ', fmtCnpj(n.cnpj)],
                            ['Emissão', fmtData(n.emissao)],
                            ['Lançamento', fmtData(lancamento)],
                            ['Filial', n.filial || '—'],
                            ['Valor', fmtBRL(n.valor)],
                          ];
                          return (
                            <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Identificação da nota
                                </span>
                                <button
                                  className="inline-flex items-center gap-1 rounded border bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                  onClick={() => copiarResumo(n.id, resumoCopiavel(n))}
                                  title="Copiar resumo para localizar a nota"
                                >
                                  {copied === n.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                  {copied === n.id ? 'Copiado' : 'Copiar'}
                                </button>
                              </div>
                              <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                                {campos.map(([label, value]) => (
                                  <div key={label} className={cn('min-w-0', label === 'Fornecedor' && 'col-span-2 sm:col-span-3')}>
                                    <dt className="text-[10px] text-muted-foreground">{label}</dt>
                                    <dd className="truncate text-xs font-medium" title={value}>{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          );
                        })()}

                        {/* Borderô de pagamento (SEA/SE2 do TOTVS) — destaca
                            quando a nota já entrou em pagamento, o que muda o
                            fluxo de correção/cancelamento. */}
                        {(() => {
                          const b = bordero[n.id];
                          if (!b || b === 'loading') return null;
                          const recheck = (
                            <button
                              className="text-[10px] text-blue-600 hover:underline"
                              title="Reverificar agora no TOTVS"
                              onClick={() => {
                                setBordero((prev) => ({ ...prev, [n.id]: 'loading' }));
                                fetch(`/api/fiscal/bordero?nota_id=${n.id}&fresh=1`)
                                  .then((r) => (r.ok ? r.json() : { em_bordero: false, pago: false, borderos: [] }))
                                  .then((bb) => setBordero((prev) => ({ ...prev, [n.id]: bb })))
                                  .catch(() => setBordero((prev) => ({ ...prev, [n.id]: { em_bordero: false, pago: false, borderos: [] } })));
                              }}
                            >
                              reverificar
                            </button>
                          );
                          if (!b.em_bordero) {
                            return (
                              <p className="text-[11px] text-muted-foreground">
                                {b.pago
                                  ? 'Pagamento: título baixado sem borderô — correção exige estorno'
                                  : 'Pagamento: fora de borderô'}
                                {(b as any).checked_at ? ` (verificado ${new Date((b as any).checked_at).toLocaleString('pt-BR')})` : ''}
                                {' · '}{recheck}
                              </p>
                            );
                          }
                          const pago = b.pago;
                          return (
                            <div className={cn(
                              'rounded-md border px-3 py-2 text-xs space-y-1',
                              pago ? 'border-slate-300 bg-slate-50 text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-900'
                            )}>
                              <p className="font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                {pago ? 'Nota paga via borderô' : 'Nota já está em borderô de pagamento'}
                                <span className="ml-auto font-normal">{recheck}</span>
                              </p>
                              {b.borderos.map((x: any, i: number) => (
                                <p key={i}>
                                  Borderô <span className="font-semibold">Nº {x.numbor || '—'}</span>
                                  {x.databor ? ` · ${new Date(x.databor + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                                  {x.banco ? ` · ${x.banco_nome || x.banco}` : ''}
                                  {x.agencia ? ` ag ${x.agencia}` : ''}
                                  {x.conta ? ` cc ${x.conta}` : ''}
                                  {x.baixa ? ` — baixada em ${new Date(x.baixa + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                                  {x.ocorrencia ? ` · ocorr. ${x.ocorrencia}` : ''}
                                  {x.via_fatura ? ` · via fatura ${x.via_fatura}` : ''}
                                </p>
                              ))}
                              {!pago && (
                                <p className="text-[11px]">
                                  Correção/cancelamento depois do borderô exige providência no financeiro — não é só ajuste no TOTVS.
                                </p>
                              )}
                            </div>
                          );
                        })()}

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
                          <p className="text-xs text-muted-foreground select-all">Chave: {n.chave_acesso}</p>
                        )}
                        {n.extra?.vexpenses && (
                          <p className="text-xs text-violet-700">
                            VExpenses — relatório <span className="font-medium">{n.extra.vexpenses.report_name || `#${n.extra.vexpenses.report_id}`}</span> (despesa #{n.extra.vexpenses.expense_id})
                          </p>
                        )}

                        {/* Documentos — anexos e links externos agrupados */}
                        {(n.doc_path || (n.docs && n.docs.length > 0) || n.tipo === 'servico' || true) && (
                          <div className="space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documentos</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <a
                                href={`/api/fiscal/portal-link?id=${n.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-blue-600" /> Portal EQS
                              </a>
                              {n.doc_path && (
                                <>
                                  <button
                                    className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    onClick={() => setDocModal({ id: n.id, nome: n.doc_nome || 'documento' })}
                                  >
                                    <Maximize2 className="h-3.5 w-3.5 text-blue-600" /> Ampliar
                                  </button>
                                  <a
                                    href={`/api/fiscal/doc?id=${n.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    <FileText className="h-3.5 w-3.5 text-blue-600" /> Nova aba
                                  </a>
                                </>
                              )}
                              {n.tipo === 'servico' && (
                                <button
                                  className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  disabled={acting === n.id}
                                  onClick={() => buscarDocs(n.id)}
                                >
                                  {acting === n.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5 text-blue-600" />
                                  )}
                                  {n.docs && n.docs.length > 0 ? 'Atualizar docs do portal' : 'Buscar docs no portal'}
                                </button>
                              )}
                            </div>

                            {/* Anexos do portal EQS — todos os documentos do
                                processo (nota real + boletos), por doc_id. */}
                            {n.docs && n.docs.length > 0 && (
                              <div className="flex items-start gap-1.5 flex-wrap">
                                {n.docs.map((d) => {
                                  const selId = docSel[n.id] ?? (n.doc_path ? null : n.docs![0]?.id ?? null);
                                  const active = selId === d.id;
                                  const tipoLabel = d.tipo === 'G' ? 'Nota' : d.tipo === 'B' ? 'Boleto' : d.tipo || 'Doc';
                                  return (
                                    <button
                                      key={d.id}
                                      onClick={() => setDocSel({ ...docSel, [n.id]: d.id })}
                                      className={cn(
                                        'rounded-full border px-2 py-0.5 text-[10px] font-medium max-w-[240px] truncate',
                                        active
                                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                                          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                                      )}
                                      title={d.nome}
                                    >
                                      <span className={cn('font-semibold', d.tipo === 'G' ? 'text-green-700' : d.tipo === 'B' ? 'text-amber-700' : '')}>
                                        {tipoLabel}
                                      </span>
                                      {' · '}{d.nome}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Trilha de quem mexeu: erro confirmado / correção /
                            cancelamento — o "quem corrigiu o quê". */}
                        {n.reviewed_by && (
                          <p className="text-xs text-muted-foreground">
                            {n.review_status === 'confirmado_erro' || n.erro_tipo ? 'Erro confirmado' : 'Revisado'} por {n.reviewed_by} em {n.reviewed_at ? new Date(n.reviewed_at).toLocaleString('pt-BR') : '—'}
                            {n.erro_tipo ? ` · ${ERRO_LABEL[n.erro_tipo] || n.erro_tipo}` : ''}
                            {n.erro_descricao ? ` — ${n.erro_descricao}` : (n.review_nota ? ` — ${n.review_nota}` : '')}
                          </p>
                        )}
                        {n.corrigida_by && (
                          <p className="text-xs text-emerald-700">
                            Corrigida por {n.corrigida_by} em {n.corrigida_at ? new Date(n.corrigida_at).toLocaleString('pt-BR') : '—'}
                            {n.corrigida_de === 'cancelado' ? ' (estava cancelada)' : ''}
                            {n.corrigida_nota ? ` — ${n.corrigida_nota}` : ''}
                          </p>
                        )}
                        {n.cancelled_by && (
                          <p className="text-xs text-slate-600">
                            Cancelada por {n.cancelled_by} em {n.cancelled_at ? new Date(n.cancelled_at).toLocaleString('pt-BR') : '—'}
                            {n.cancel_motivo ? ` — ${n.cancel_motivo}` : ''}
                          </p>
                        )}
                        {n.review_status === 'cancelado' && n.monitor_status && MONITOR_LABEL[n.monitor_status] && (
                          <div className={cn('rounded-md border px-3 py-2 text-xs',
                            n.monitor_status === 'relancada_ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' :
                            n.monitor_status === 'relancada_divergente' ? 'border-red-300 bg-red-50 text-red-800' :
                            n.monitor_status === 'excluida' ? 'border-sky-300 bg-sky-50 text-sky-800' :
                            'border-amber-300 bg-amber-50 text-amber-900')}>
                            <p className="font-semibold flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              Monitor de re-lançamento: {MONITOR_LABEL[n.monitor_status].label}
                            </p>
                            {n.monitor_checked_at && (
                              <p className="mt-0.5 text-[11px] opacity-80">
                                Última verificação {new Date(n.monitor_checked_at).toLocaleString('pt-BR')}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Barra de ações — decisões da nota por STATUS (a
                            mesma máquina de estados em qualquer view: fila,
                            kanban e histórico têm paridade total). */}
                        {(() => {
                          const actions: React.ReactNode[] = [];
                          if (n.review_status === 'pendente' || n.review_status === 'falha_tecnica') {
                            actions.push(
                              <Button
                                key="ok" size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={acting === n.id}
                                onClick={() => revisar(n.id, 'confirmado_ok')}
                              >
                                {acting === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                                Confirmar OK
                              </Button>,
                              <Button
                                key="erro" size="sm" variant="destructive"
                                disabled={acting === n.id}
                                onClick={() => setErroForm({ notaId: n.id, erro_tipo: 'tes_errado', descricao: n.auto_resumo || '' })}
                              >
                                <XCircle className="h-4 w-4 mr-1.5" /> Confirmar erro
                              </Button>
                            );
                          }
                          if (n.review_status === 'auto_ok_aviso') {
                            actions.push(
                              <span key="aviso" className="text-xs text-yellow-700 self-center">
                                Aprovada automaticamente — divergência apenas de Origem CST
                              </span>,
                              <Button
                                key="erro" size="sm" variant="outline"
                                className="border-red-300 text-red-600 hover:bg-red-50"
                                disabled={acting === n.id}
                                onClick={() => setErroForm({ notaId: n.id, erro_tipo: 'outro', descricao: n.auto_resumo || '' })}
                              >
                                <XCircle className="h-4 w-4 mr-1.5" /> Confirmar erro
                              </Button>
                            );
                          }
                          // Erro confirmado: quem trata os erros (entrada de
                          // notas) marca a correção — fica registrado
                          // quem/quando/como. E pode cancelar a nota no ERP.
                          if (n.review_status === 'confirmado_erro' && !cancelForm && !corrigirForm) {
                            actions.push(
                              <Button
                                key="corr" size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={acting === n.id}
                                onClick={() => setCorrigirForm({ notaId: n.id, nota: '' })}
                              >
                                <CheckCheck className="h-4 w-4 mr-1.5" /> Marcar como corrigida
                              </Button>,
                              <Button
                                key="canc" size="sm" variant="outline"
                                className="border-slate-300 text-slate-600 hover:bg-slate-50"
                                disabled={acting === n.id}
                                onClick={() => setCancelForm({ notaId: n.id, motivo: '' })}
                              >
                                <Ban className="h-4 w-4 mr-1.5" /> Cancelar nota
                              </Button>,
                              <Button
                                key="rev" size="sm" variant="ghost"
                                disabled={acting === n.id}
                                onClick={() => revisar(n.id, 'confirmado_ok', undefined, undefined)}
                              >
                                Reverter para OK
                              </Button>
                            );
                          }
                          if (n.review_status === 'confirmado_ok') {
                            actions.push(
                              <Button
                                key="rev" size="sm" variant="ghost"
                                disabled={acting === n.id}
                                onClick={() => setErroForm({ notaId: n.id, erro_tipo: 'outro', descricao: '' })}
                              >
                                Reverter para erro
                              </Button>
                            );
                          }
                          if (n.review_status === 'corrigida') {
                            actions.push(
                              <Button
                                key="desc" size="sm" variant="ghost"
                                disabled={acting === n.id}
                                onClick={() => revisar(n.id, 'desfazer_correcao')}
                              >
                                Desfazer correção
                              </Button>
                            );
                          }
                          if (n.review_status === 'cancelado' && !corrigirForm) {
                            actions.push(
                              // Nota cancelada pode voltar corrigida — fecha o
                              // ciclo "cancelada → corrigida" sem perder o
                              // rastreio (corrigida_de='cancelado').
                              <Button
                                key="corr" size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={acting === n.id}
                                onClick={() => setCorrigirForm({ notaId: n.id, nota: '' })}
                              >
                                <CheckCheck className="h-4 w-4 mr-1.5" /> Marcar como corrigida
                              </Button>,
                              <Button
                                key="desc" size="sm" variant="ghost"
                                disabled={acting === n.id}
                                onClick={() => revisar(n.id, 'confirmado_erro', n.erro_tipo || 'outro', n.erro_descricao || undefined)}
                              >
                                Desfazer cancelamento
                              </Button>
                            );
                          }
                          if (actions.length === 0) return null;
                          return (
                            <div className="flex flex-wrap items-center justify-center gap-2.5 rounded-lg border bg-muted/40 px-4 py-3">
                              {actions}
                            </div>
                          );
                        })()}

                        {corrigirForm?.notaId === n.id && (
                          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 space-y-2">
                            <p className="text-sm font-medium text-emerald-800">
                              Marcar como corrigida — a nota sai da fila de erros e registra quem corrigiu
                            </p>
                            <input
                              className="w-full rounded border bg-white px-2 py-1 text-sm"
                              placeholder="Como foi corrigida? (opcional — ex.: TES ajustada pra 401 no TOTVS)"
                              value={corrigirForm.nota}
                              onChange={(e) => setCorrigirForm({ ...corrigirForm, nota: e.target.value })}
                            />
                            <div className="flex justify-center gap-2">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={acting === n.id}
                                onClick={() => revisar(n.id, 'corrigida', undefined, undefined, undefined, corrigirForm.nota)}
                              >
                                {acting === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar correção'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setCorrigirForm(null)}>Voltar</Button>
                            </div>
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
                            <div className="flex justify-center gap-2">
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
                            <div className="flex justify-center gap-2">
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

                        {(n.doc_path || /^\d{44}$/.test(n.chave_acesso || '') || (n.docs && n.docs.length > 0)) && (() => {
                          const sel = docSel[n.id]
                            ? n.docs?.find((d) => d.id === docSel[n.id])
                            : (n.doc_path ? undefined : n.docs?.[0]);
                          const nomeSel = sel?.nome || n.doc_nome || 'documento';
                          return (
                          <div className="min-w-0 border rounded-md overflow-hidden bg-muted/30 flex flex-col">
                            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/50 text-xs text-muted-foreground">
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{nomeSel}</span>
                              <button
                                className="ml-auto text-blue-600 hover:underline inline-flex items-center gap-1"
                                onClick={() => setDocModal({ id: n.id, docId: sel?.id, nome: nomeSel })}
                              >
                                <Maximize2 className="h-3 w-3" /> Ampliar
                              </button>
                            </div>
                            <iframe
                              src={sel ? `/api/fiscal/doc?doc_id=${sel.id}` : `/api/fiscal/doc?id=${n.id}`}
                              title={`Documento NF ${n.doc}`}
                              className="w-full flex-1 min-h-[480px] bg-white"
                            />
                          </div>
                          );
                        })()}
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
              <h2 className="text-lg font-semibold">Registrar nota errada</h2>
              <Button size="sm" variant="ghost" onClick={() => setImportOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie o XML da NF-e (os dados são lidos automaticamente) ou o PDF de uma
              nota de serviço (informe os dados manualmente). A nota é registrada como
              erro confirmado no histórico e dispara a notificação no Teams.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Arquivo da nota (XML ou PDF)</label>
                <input
                  type="file"
                  accept=".xml,.pdf,text/xml,application/xml,application/pdf"
                  className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </div>
              {importIsPdf && (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-3">
                  <p className="text-xs text-amber-800">
                    PDF não permite leitura automática — preencha os dados da nota:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs font-medium">Número da nota <span className="text-red-600">*</span></label>
                      <input
                        className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                        value={importManual.doc}
                        onChange={(e) => setImportManual({ ...importManual, doc: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Série</label>
                      <input
                        className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                        value={importManual.serie}
                        onChange={(e) => setImportManual({ ...importManual, serie: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Filial</label>
                      <input
                        className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                        value={importManual.filial}
                        onChange={(e) => setImportManual({ ...importManual, filial: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium">Fornecedor</label>
                      <input
                        className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                        value={importManual.fornecedor}
                        onChange={(e) => setImportManual({ ...importManual, fornecedor: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">CNPJ</label>
                      <input
                        className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                        placeholder="00.000.000/0000-00"
                        value={importManual.cnpj}
                        onChange={(e) => setImportManual({ ...importManual, cnpj: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Valor (R$)</label>
                      <input
                        className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                        placeholder="0,00"
                        value={importManual.valor}
                        onChange={(e) => setImportManual({ ...importManual, valor: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Emissão</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                        value={importManual.emissao}
                        onChange={(e) => setImportManual({ ...importManual, emissao: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium">Tipo da nota</label>
                <select
                  className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm"
                  value={importTipo}
                  onChange={(e) => setImportTipo(e.target.value as 'mercadoria' | 'servico' | 'vexpenses')}
                >
                  <option value="mercadoria">Mercadoria</option>
                  <option value="servico">Serviço</option>
                  <option value="vexpenses">VExpenses</option>
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
                disabled={!importFile || !importMotivo.trim() || (importIsPdf && !importManual.doc.trim()) || importing}
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
              href={docModal.docId ? `/api/fiscal/doc?doc_id=${docModal.docId}` : `/api/fiscal/doc?id=${docModal.id}`}
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
            src={docModal.docId ? `/api/fiscal/doc?doc_id=${docModal.docId}` : `/api/fiscal/doc?id=${docModal.id}`}
            title={docModal.nome}
            className="flex-1 rounded-b-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
