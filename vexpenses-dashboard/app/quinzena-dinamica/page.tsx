'use client';
import { ImportQzModal } from '@/components/ImportQzModal';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FileSpreadsheet,
  Upload,
  RefreshCw,
  FileDown,
  AlertTriangle,
  Database,
  Pencil,
  Check,
  X,
  Snowflake,
  Unlock,
} from 'lucide-react';

// ---- Types ------------------------------------------------------------------

interface Snapshot {
  year: number;
  month: number;
  quinzena: number;
  total_rows: number;
  imported_at: string;
}

interface Period {
  year: number;
  month: number;
  quinzena: number;
  has_snapshot: boolean;
  snapshot_rows: number;
  extrato_rows: number;
}

interface QuinzenaRow {
  cpf: string;
  colaborador: string;
  situacao: string;
  status_cartao: string;
  regional: string;
  centro_custo: string;
  gestor: string;
  diretor: string;
  carga: number;
  transferencia: number;
  tarifa: number;
  prestacao: number;
  saldo_final: number;
  saldo_cartao: number;
  saldo_prestacao: number;
  col_qz: number | null;
  saldo_reembolsar: number;
  saldo_final_carga: number;
  saldo_cartao_carga: number;
  col_qz_manual: number | null;
  adiantamento: number;
  obs: string | null;
  carga_parcial: number;
  reembolso: number;
  carga_final: number;
  _data_source: 'frozen' | 'calculado';
  _is_frozen: boolean;
  data_sources: {
    col_qz: 'manual' | 'null';
    adiantamento: 'manual' | 'default';
  };
}

interface QuinzenaResponse {
  data_mode: 'frozen' | 'calculado';
  reembolso_multiplier: number;
  is_frozen: boolean;
  frozen_at: string | null;
  period: {
    year: number;
    month: number;
    quinzena: number;
    start_date: string;
    end_date: string;
    month_name: string;
  };
  statistics: {
    total_rows: number;
    ativos: number;
    com_carga: number;
    total_carga_final: number;
    total_saldo_final: number;
    total_col_qz: number;
  };
  data: QuinzenaRow[];
}

// ---- Constants --------------------------------------------------------------

const MONTH_NAMES_SHORT = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const MONTH_NAMES_FULL = [
  '', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ---- Formatters -------------------------------------------------------------

function brl(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  return v < 0 ? `-${abs}` : abs;
}

// ---- Reusable components ----------------------------------------------------

function StatCard({ label, value, sub, color = 'gray' }: {
  label: string; value: string; sub?: string; color?: 'blue' | 'green' | 'amber' | 'purple' | 'gray';
}) {
  const cls = {
    blue:   'bg-blue-50 border-blue-200 text-blue-800',
    green:  'bg-green-50 border-green-200 text-green-800',
    amber:  'bg-amber-50 border-amber-200 text-amber-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    gray:   'bg-gray-50 border-gray-200 text-gray-800',
  }[color];

  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xs font-medium opacity-70 mb-1">{label}</div>
      <div className="text-lg font-bold leading-none">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  );
}

// Inline editable cell
function EditCell({
  value,
  numeric = true,
  onSave,
  empty = '-',
}: {
  value: number | string | null;
  numeric?: boolean;
  onSave: (v: string | null) => Promise<void>;
  empty?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const start = () => {
    setDraft(value !== null && value !== undefined ? String(value) : '');
    setEditing(true);
    setTimeout(() => ref.current?.select(), 0);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft.trim() === '' ? null : draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <input
          ref={ref}
          type={numeric ? 'number' : 'text'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          className="w-24 border border-blue-400 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={save} disabled={saving} className="ml-0.5 text-green-600 hover:text-green-700 p-0.5">
          <Check className="h-3 w-3" />
        </button>
        <button onClick={cancel} className="text-red-500 hover:text-red-600 p-0.5">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const display = numeric && value !== null && value !== undefined
    ? num(value as number)
    : (value ?? null);

  return (
    <button
      onClick={start}
      className="group flex items-center gap-1 justify-end w-full text-right hover:bg-blue-50 rounded px-1 py-0.5 transition-colors"
    >
      <span className={display === null ? 'text-gray-300 italic text-xs' : ''}>
        {display ?? empty}
      </span>
      <Pencil className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-40 text-blue-500" />
    </button>
  );
}

// ---- Main page --------------------------------------------------------------

export default function QuinzenaDinamicaPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);

  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [quinzena, setQuinzena] = useState<number | null>(null);

  const [data, setData] = useState<QuinzenaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [onlyWithCarga, setOnlyWithCarga] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [freezing, setFreezing] = useState(false);

  // Filtros dropdown
  const [selectedRegionals, setSelectedRegionals] = useState<Set<string>>(new Set());
  const [selectedCentros, setSelectedCentros] = useState<Set<string>>(new Set());
  const [regionalOpen, setRegionalOpen] = useState(false);
  const [centroOpen, setCentroOpen] = useState(false);

  // 1. Load available periods on mount (snapshots + extrato)
  useEffect(() => {
    (async () => {
      setSnapshotsLoading(true);
      try {
        const res = await fetch('/api/quinzena/available-periods');
        const json = await res.json();
        const list: Period[] = json.periods ?? [];
        setPeriods(list);
        // Keep snapshots for legacy ImportQzModal
        setSnapshots(list.filter(p => p.has_snapshot).map(p => ({
          year: p.year, month: p.month, quinzena: p.quinzena,
          total_rows: p.snapshot_rows, imported_at: '',
        })));
        if (list.length > 0) {
          const first = list[0];
          setYear(first.year);
          setMonth(first.month);
          setQuinzena(first.quinzena);
        }
      } catch (e) {
        console.error('Available periods error:', e);
      } finally {
        setSnapshotsLoading(false);
      }
    })();
  }, []);

  // 2. Load data whenever period changes
  const loadData = useCallback(async (y: number, m: number, q: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quinzena-complete?year=${y}&month=${m}&quinzena=${q}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro desconhecido');
      setData(json);
      setLastLoaded(new Date().toLocaleTimeString('pt-BR'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (year !== null && month !== null && quinzena !== null) {
      // Limpa filtros ao trocar de periodo
      setSelectedRegionals(new Set());
      setSelectedCentros(new Set());
      setSearch('');
      loadData(year, month, quinzena);
    }
  }, [year, month, quinzena, loadData]);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-filter="regional"]')) setRegionalOpen(false);
      if (!target.closest('[data-filter="centro"]')) setCentroOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // 3. Save manual field — optimistic local update, no refetch
  const saveField = async (cpf: string, field: string, rawValue: string | null) => {
    if (year === null || month === null || quinzena === null) return;
    const value = (field === 'col_1qz' || field === 'adiantamento') && rawValue !== null
      ? parseFloat(rawValue)
      : rawValue;

    const res = await fetch('/api/quinzena-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, year, month, quinzena, field, value }),
    });
    if (!res.ok) {
      const j = await res.json();
      throw new Error(j.error ?? 'Erro ao salvar');
    }

    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        data: prev.data.map(row => {
          if (row.cpf !== cpf) return row;
          const updated = { ...row };
          if (field === 'col_1qz') {
            updated.col_qz_manual = rawValue === null ? null : parseFloat(rawValue);
            updated.data_sources = {
              ...updated.data_sources,
              col_qz: updated.col_qz_manual !== null ? 'manual' as const : 'null' as const,
            };
          }
          if (field === 'adiantamento') {
            updated.adiantamento = rawValue === null ? 0 : parseFloat(rawValue);
            updated.data_sources = {
              ...updated.data_sources,
              adiantamento: updated.adiantamento > 0 ? 'manual' : 'default',
            };
          }
          if (field === 'obs') updated.obs = rawValue;

          // Recalculate (regras confirmadas: reembolso 0 na 2QZ, cadastro pendente = 0)
          const qz = prev.period.quinzena;
          const col_qz_efetivo = updated.col_qz_manual !== null
            ? updated.col_qz_manual
            : (updated.col_qz ?? 0);
          const isPendente = (updated.status_cartao ?? '').toLowerCase().includes('pendente');

          if (isPendente) {
            updated.carga_parcial = 0;
            updated.reembolso = 0;
            updated.carga_final = 0;
          } else {
            updated.carga_parcial = Math.round(
              (col_qz_efetivo - updated.saldo_final_carga - updated.saldo_cartao_carga - updated.adiantamento) * 100,
            ) / 100;
            updated.reembolso = qz === 1
              ? Math.round(Math.max(0, updated.saldo_reembolsar) * (prev.reembolso_multiplier ?? 0.5) * 100) / 100
              : 0;
            updated.carga_final = Math.round((Math.max(0, updated.carga_parcial) + updated.reembolso) * 100) / 100;
          }
          return updated;
        }),
      };
    });
  };

  // 4. Export XLSX
  const exportXLSX = () => {
    if (!filteredRows.length || !data) return;

    // Dynamic import to avoid SSR issues
    import('xlsx').then((XLSX) => {
      const period = data.period;
      const monthName = MONTH_NAMES_FULL[period.month] ?? String(period.month);
      const title = `${monthName} ${period.year} - ${period.quinzena}a Quinzena (${period.start_date} a ${period.end_date})`;

      // Column definitions: [header, key, group, width]
      // groups: id | painel | carga | manual | calc
      const COLS: { h: string; key: string; group: 'id'|'painel'|'carga'|'manual'|'calc'; w: number }[] = [
        { h: 'CPF',               key: 'cpf',               group: 'id',     w: 15 },
        { h: 'COLABORADOR',       key: 'colaborador',        group: 'id',     w: 34 },
        { h: 'SITUACAO',          key: 'situacao',           group: 'id',     w: 10 },
        { h: 'REGIONAL',          key: 'regional',           group: 'id',     w: 16 },
        { h: 'CENTRO DE CUSTO',   key: 'centro_custo',       group: 'id',     w: 30 },
        { h: 'GESTOR',            key: 'gestor',             group: 'id',     w: 28 },
        { h: 'DIRETOR',           key: 'diretor',            group: 'id',     w: 28 },
        { h: 'STATUS CARTAO',     key: 'status_cartao',      group: 'id',     w: 16 },
        // PAINEL breakdown (audit columns)
        { h: 'CARGA',             key: 'carga',              group: 'painel', w: 14 },
        { h: 'TRANSFERENCIA',     key: 'transferencia',      group: 'painel', w: 14 },
        { h: 'TARIFA',            key: 'tarifa',             group: 'painel', w: 12 },
        { h: 'PRESTACAO',         key: 'prestacao',          group: 'painel', w: 14 },
        { h: 'SALDO PRESTACAO',   key: 'saldo_prestacao',    group: 'painel', w: 16 },
        // CARGA columns (using carga variants: max(0,sf) and carga-date saldo_cartao)
        { h: 'SALDO FINAL',       key: 'saldo_final_carga',  group: 'carga',  w: 14 },
        { h: 'SALDO REEMBOLSAR',  key: 'saldo_reembolsar',   group: 'carga',  w: 16 },
        { h: 'SALDO CARTAO',      key: 'saldo_cartao_carga', group: 'carga',  w: 14 },
        { h: `${period.quinzena}a QZ (planilha)`, key: 'col_qz',    group: 'carga',  w: 16 },
        { h: `${period.quinzena}a QZ (manual)`,   key: 'col_qz_manual', group: 'manual', w: 16 },
        { h: 'ADIANTAMENTO',      key: 'adiantamento',       group: 'manual', w: 14 },
        { h: 'OBS',               key: 'obs',                group: 'manual', w: 24 },
        { h: 'CARGA PARCIAL',     key: 'carga_parcial',      group: 'calc',   w: 14 },
        { h: 'REEMBOLSO',         key: 'reembolso',          group: 'calc',   w: 14 },
        { h: 'CARGA FINAL',       key: 'carga_final',        group: 'calc',   w: 14 },
      ];

      const numericKeys = new Set([
        'carga','transferencia','tarifa','prestacao','saldo_prestacao',
        'saldo_final_carga','saldo_cartao_carga','saldo_reembolsar',
        'col_qz','col_qz_manual','adiantamento','carga_parcial','reembolso','carga_final',
      ]);

      // Row 1: merged title
      // Row 2: group headers
      // Row 3: column headers
      // Row 4+: data
      // Last row: totals

      const wb = XLSX.utils.book_new();
      const wsData: unknown[][] = [];

      // Row 1 — title (will be merged across all columns)
      wsData.push([title, ...Array(COLS.length - 1).fill(null)]);

      // Row 2 — group sub-headers
      const GROUP_LABELS: Record<string, string> = {
        id: 'IDENTIFICACAO', painel: 'PAINEL (extrato)', carga: 'CARGA',
        manual: 'CAMPOS MANUAIS', calc: 'CALCULADO',
      };
      wsData.push(COLS.map(c => GROUP_LABELS[c.group]));

      // Row 3 — column headers
      wsData.push(COLS.map(c => c.h));

      // Rows 4+ — data
      for (const r of filteredRows) {
        wsData.push(COLS.map(c => {
          const v = (r as unknown as Record<string, unknown>)[c.key];
          if (v === null || v === undefined) return '';
          return v;
        }));
      }

      // Totals row
      const totalsRow = COLS.map(c => {
        if (!numericKeys.has(c.key)) return c.key === 'colaborador' ? `TOTAL (${filteredRows.length})` : '';
        return filteredRows.reduce((s, r) => s + ((r as unknown as Record<string, number | null>)[c.key] ?? 0), 0);
      });
      wsData.push(totalsRow);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Column widths
      ws['!cols'] = COLS.map(c => ({ wch: c.w }));

      // Freeze rows 1-3 (header area)
      ws['!freeze'] = { xSplit: 0, ySplit: 3 };

      // Merge title row across all columns
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLS.length - 1 } }];

      // Cell styles
      const groupFill: Record<string, string> = {
        id:     'DBEAFE', // blue-100
        painel: 'DCFCE7', // green-100
        carga:  'FEF9C3', // yellow-100
        manual: 'FEF3C7', // amber-100
        calc:   'EDE9FE', // purple-100
      };
      const groupFont: Record<string, string> = {
        id: '1E3A5F', painel: '14532D', carga: '713F12', manual: '92400E', calc: '3B0764',
      };

      const numFmt = '#,##0.00';

      const totalRows = wsData.length;
      const dataStartRow = 3; // 0-based, rows 0-2 are headers
      const totalsRowIdx = totalRows - 1;

      for (let R = 0; R < totalRows; R++) {
        for (let C = 0; C < COLS.length; C++) {
          const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddr]) ws[cellAddr] = { v: '', t: 's' };

          const cell = ws[cellAddr];
          const col = COLS[C];
          const isNumeric = numericKeys.has(col.key);

          // Apply number format to data and totals numeric cells
          if (isNumeric && R >= dataStartRow) {
            cell.t = 'n';
            cell.z = numFmt;
          }

          // Build style
          let fill = 'FFFFFF';
          let bold = false;
          let fgColor = '000000';
          let border = true;
          let hAlign: string | undefined = isNumeric ? 'right' : 'left';
          let fontSize = 10;

          if (R === 0) {
            // Title row
            fill = '1E40AF'; fgColor = 'FFFFFF'; bold = true; fontSize = 12;
            hAlign = 'center'; border = false;
          } else if (R === 1) {
            // Group header row
            fill = groupFill[col.group] ?? 'F3F4F6';
            fgColor = groupFont[col.group] ?? '374151';
            bold = true; hAlign = 'center'; fontSize = 9;
          } else if (R === 2) {
            // Column header row
            fill = groupFill[col.group] ?? 'F3F4F6';
            fgColor = groupFont[col.group] ?? '374151';
            bold = true; hAlign = 'center'; fontSize = 10;
          } else if (R === totalsRowIdx) {
            // Totals row
            fill = '1E40AF'; fgColor = 'FFFFFF'; bold = true;
          } else if (R % 2 === 1) {
            // Alternating row (odd data rows get a faint group tint)
            fill = groupFill[col.group] ?? 'F9FAFB';
            fill = fill + '80'; // lighter — xlsx ignores alpha, but gives visual intent
            fill = groupFill[col.group] ? 'F8FAFF' : 'F9FAFB';
          }

          cell.s = {
            fill:      fill !== 'FFFFFF' ? { fgColor: { rgb: fill }, patternType: 'solid' } : undefined,
            font:      { bold, color: { rgb: fgColor }, sz: fontSize, name: 'Calibri' },
            alignment: { horizontal: hAlign, vertical: 'center', wrapText: false },
            border: border ? {
              top:    { style: 'thin', color: { rgb: 'D1D5DB' } },
              bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
              left:   { style: 'thin', color: { rgb: 'D1D5DB' } },
              right:  { style: 'thin', color: { rgb: 'D1D5DB' } },
            } : undefined,
          };
        }
      }

      // Title row height
      ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 20 }];

      XLSX.utils.book_append_sheet(wb, ws, `QZ${period.quinzena} ${monthName.slice(0,3)} ${period.year}`);

      const filename = `quinzena-${period.year}-${String(period.month).padStart(2,'0')}-q${period.quinzena}.xlsx`;
      XLSX.writeFile(wb, filename);
    });
  };

  // ---- Derived selector data -----------------------------------------------

  const availableYears = [...new Set(periods.map(p => p.year))].sort((a, b) => b - a);

  const availableMonths = year !== null
    ? [...new Set(periods.filter(p => p.year === year).map(p => p.month))].sort((a, b) => b - a)
    : [];

  const availableQzs = year !== null && month !== null
    ? periods.filter(p => p.year === year && p.month === month).map(p => p.quinzena).sort()
    : [];

  const currentPeriod = year !== null && month !== null && quinzena !== null
    ? periods.find(p => p.year === year && p.month === month && p.quinzena === quinzena) ?? null
    : null;

  const handleYearChange = (y: number) => {
    const months = [...new Set(periods.filter(p => p.year === y).map(p => p.month))].sort((a, b) => b - a);
    const newMonth = months.includes(month ?? -1) ? month! : (months[0] ?? null);
    setYear(y);
    setMonth(newMonth);
    if (newMonth !== null) {
      const qzs = periods.filter(p => p.year === y && p.month === newMonth).map(p => p.quinzena).sort();
      setQuinzena(qzs.includes(quinzena ?? -1) ? quinzena! : (qzs[0] ?? null));
    }
  };

  const handleMonthChange = (m: number) => {
    const qzs = periods.filter(p => p.year === year && p.month === m).map(p => p.quinzena).sort();
    setMonth(m);
    setQuinzena(qzs.includes(quinzena ?? -1) ? quinzena! : (qzs[0] ?? null));
  };

  const isCalcMode = data?.data_mode === 'calculado';
  const isFrozen = data?.is_frozen ?? false;

  // Freeze/unfreeze handlers
  const handleFreeze = async () => {
    if (year === null || month === null || quinzena === null) return;
    setFreezing(true);
    try {
      const res = await fetch('/api/quinzena-freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, quinzena }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao congelar');
      }
      loadData(year, month, quinzena);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao congelar');
    } finally {
      setFreezing(false);
    }
  };

  const handleUnfreeze = async () => {
    if (year === null || month === null || quinzena === null) return;
    setFreezing(true);
    try {
      const res = await fetch(`/api/quinzena-freeze?year=${year}&month=${month}&quinzena=${quinzena}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao descongelar');
      }
      loadData(year, month, quinzena);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao descongelar');
    } finally {
      setFreezing(false);
    }
  };

  // Valores unicos para dropdowns
  const allRegionals = [...new Set((data?.data ?? []).map(r => r.regional).filter(Boolean))].sort();
  const allCentros   = [...new Set((data?.data ?? []).map(r => r.centro_custo).filter(Boolean))].sort();

  const filteredRows = (data?.data ?? []).filter(r => {
    if (onlyWithCarga) {
      const col_qz_efetivo = r.col_qz_manual !== null ? r.col_qz_manual : (r.col_qz ?? 0);
      if (col_qz_efetivo <= 0) return false;
    }
    if (selectedRegionals.size > 0 && !selectedRegionals.has(r.regional)) return false;
    if (selectedCentros.size > 0 && !selectedCentros.has(r.centro_custo)) return false;
    if (!search) return true;
    return (
      r.colaborador.toLowerCase().includes(search.toLowerCase()) ||
      r.cpf.includes(search) ||
      r.centro_custo.toLowerCase().includes(search.toLowerCase())
    );
  });

  const stats = data?.statistics;

  // ---- Render --------------------------------------------------------------
  return (
    <div className="space-y-4 pb-16">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
            Planilha Quinzenal Dinamica
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Dados do Neon &middot; Colunas manuais editaveis inline &middot; Exportacao Excel
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline"
            onClick={() => year && month && quinzena && loadData(year, month, quinzena)}
            disabled={loading || year === null}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {isFrozen ? (
            <Button size="sm" variant="outline" onClick={handleUnfreeze} disabled={freezing || loading}>
              <Unlock className="h-4 w-4 mr-1" />
              Descongelar
            </Button>
          ) : (
            <Button size="sm" variant="default" onClick={handleFreeze} disabled={freezing || loading || !data}>
              <Snowflake className="h-4 w-4 mr-1" />
              Congelar
            </Button>
          )}
          <Button size="sm" variant="outline"
            onClick={() => setImportModalOpen(true)}
            disabled={year === null || month === null || quinzena === null}
          >
            <Upload className="h-4 w-4 mr-1" />
            Importar QZ
          </Button>
          <Button size="sm" variant="outline" onClick={exportXLSX} disabled={!filteredRows.length}>
            <FileDown className="h-4 w-4 mr-1" />
            Excel
          </Button>
        </div>
      </div>

      {/* Period selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          {snapshotsLoading ? (
            <div className="text-sm text-gray-400 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Carregando periodos...
            </div>
          ) : periods.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Sem dados no Neon. Execute <code className="bg-gray-100 px-1 rounded text-xs">import_to_neon.py</code> ou <code className="bg-gray-100 px-1 rounded text-xs">download_extrato_neon.py</code>.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-5 items-end">

              {/* Year */}
              <div>
                <div className="text-xs text-gray-500 font-medium mb-1.5">Ano</div>
                <div className="flex gap-1">
                  {availableYears.map(y => (
                    <button key={y} onClick={() => handleYearChange(y)}
                      className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                        year === y ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >{y}</button>
                  ))}
                </div>
              </div>

              {/* Month */}
              <div>
                <div className="text-xs text-gray-500 font-medium mb-1.5">Mes</div>
                <div className="flex gap-1 flex-wrap">
                  {availableMonths.map(m => {
                    const hasSnap = periods.some(p => p.year === year && p.month === m && p.has_snapshot);
                    return (
                      <button key={m} onClick={() => handleMonthChange(m)}
                        className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                          month === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                        title={hasSnap ? 'Snapshot importado' : 'Calculado via extrato'}
                      >
                        {MONTH_NAMES_SHORT[m]}
                        {!hasSnap && <span className="ml-1 text-xs opacity-60">~</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quinzena — toggle claro */}
              <div>
                <div className="text-xs text-gray-500 font-medium mb-1.5">Quinzena</div>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden shadow-sm">
                  {availableQzs.map(q => (
                    <button key={q} onClick={() => setQuinzena(q)}
                      className={`px-5 py-2 text-sm font-semibold transition-colors ${
                        quinzena === q
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-blue-50'
                      }`}
                    >
                      {q}a QZ
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="ml-auto flex flex-col items-end gap-1">
                {loading && (
                  <div className="flex items-center gap-1.5 text-sm text-blue-600">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Carregando...
                  </div>
                )}
                {!loading && data && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Database className="h-3.5 w-3.5 text-green-500" />
                    {data.period.start_date} &rarr; {data.period.end_date}
                    {data.data_mode === 'frozen'
                      ? <Badge className="bg-blue-100 text-blue-700 text-xs py-0">Congelado</Badge>
                      : <Badge className="bg-amber-100 text-amber-700 text-xs py-0">Calculado</Badge>
                    }
                  </div>
                )}
                {lastLoaded && !loading && (
                  <div className="text-xs text-gray-400">
                    Atualizado as {lastLoaded} &mdash; {year}/{String(month).padStart(2,'0')} QZ{quinzena}
                  </div>
                )}
              </div>

            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Carregando dados...
        </div>
      )}

      {/* Content */}
      {!loading && data && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Colaboradores" value={String(stats?.total_rows ?? 0)} sub={`${stats?.ativos ?? 0} ativos`} color="blue" />
            <StatCard label="Com Carga" value={String(stats?.com_carga ?? 0)} sub="carga final > 0" color="green" />
            <StatCard label="Total QZ" value={brl(stats?.total_col_qz)} color="amber" />
            <StatCard label="Total Carga Final" value={brl(stats?.total_carga_final)} color="purple" />
            <StatCard label="Total Saldo Final" value={brl(stats?.total_saldo_final)} color="gray" />
          </div>

          {data.data_mode === 'calculado' && (
            <Alert className="border-amber-200 bg-amber-50">
              <Database className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>Modo calculado:</strong> Sem snapshot importado para este período.
                Saldo final/cartão calculados via extrato + âncora da quinzena anterior.
                Coluna <strong>QZ</strong> requer entrada manual. Os demais campos são automáticos.
              </AlertDescription>
            </Alert>
          )}
          {data.data_mode !== 'calculado' && data.data.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Sem dados para este periodo. Importe a planilha de controle com
                {' '}<code className="bg-gray-100 px-1 rounded text-xs">import_to_neon.py</code>.
              </AlertDescription>
            </Alert>
          )}

          {/* Search */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou centro de custo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-xs text-gray-400 hover:text-gray-600">
                Limpar
              </button>
            )}

            {/* Filtro Regional */}
            <div className="relative" data-filter="regional">
              <button
                onClick={() => setRegionalOpen(o => !o)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedRegionals.size > 0
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${selectedRegionals.size > 0 ? 'bg-white' : 'bg-gray-400'}`} />
                Regional {selectedRegionals.size > 0 && `(${selectedRegionals.size})`}
              </button>
              {regionalOpen && (
                <div className="absolute z-20 mt-1 w-64 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b">
                    <span className="text-xs font-semibold text-gray-500">Selecionar regional</span>
                    <button onClick={() => setRegionalOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">Fechar</button>
                  </div>
                  {allRegionals.length === 0 ? (
                    <div className="text-xs text-gray-400 py-2">Sem dados</div>
                  ) : (
                    allRegionals.map(reg => (
                      <label key={reg} className="flex items-center gap-2 px-1 py-1 text-sm hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedRegionals.has(reg)}
                          onChange={() => {
                            const next = new Set(selectedRegionals);
                            next.has(reg) ? next.delete(reg) : next.add(reg);
                            setSelectedRegionals(next);
                          }}
                        />
                        <span className="truncate">{reg}</span>
                      </label>
                    ))
                  )}
                  {selectedRegionals.size > 0 && (
                    <button
                      onClick={() => setSelectedRegionals(new Set())}
                      className="mt-1 w-full text-center text-xs text-red-500 hover:text-red-700 py-1"
                    >
                      Limpar selecao
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Filtro Centro de Custo */}
            <div className="relative" data-filter="centro">
              <button
                onClick={() => setCentroOpen(o => !o)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedCentros.size > 0
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${selectedCentros.size > 0 ? 'bg-white' : 'bg-gray-400'}`} />
                Centro de Custo {selectedCentros.size > 0 && `(${selectedCentros.size})`}
              </button>
              {centroOpen && (
                <div className="absolute z-20 mt-1 w-72 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b">
                    <span className="text-xs font-semibold text-gray-500">Selecionar centro de custo</span>
                    <button onClick={() => setCentroOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">Fechar</button>
                  </div>
                  {allCentros.length === 0 ? (
                    <div className="text-xs text-gray-400 py-2">Sem dados</div>
                  ) : (
                    allCentros.map(cc => (
                      <label key={cc} className="flex items-center gap-2 px-1 py-1 text-sm hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCentros.has(cc)}
                          onChange={() => {
                            const next = new Set(selectedCentros);
                            next.has(cc) ? next.delete(cc) : next.add(cc);
                            setSelectedCentros(next);
                          }}
                        />
                        <span className="truncate">{cc}</span>
                      </label>
                    ))
                  )}
                  {selectedCentros.size > 0 && (
                    <button
                      onClick={() => setSelectedCentros(new Set())}
                      className="mt-1 w-full text-center text-xs text-red-500 hover:text-red-700 py-1"
                    >
                      Limpar selecao
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Toggle: somente com carga */}
            <button
              onClick={() => setOnlyWithCarga(v => !v)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                onlyWithCarga
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${onlyWithCarga ? 'bg-white' : 'bg-gray-400'}`} />
              Somente usuarios com carga no mes
            </button>
            {/* Limpar todos filtros */}
            {(selectedRegionals.size > 0 || selectedCentros.size > 0) && (
              <button
                onClick={() => { setSelectedRegionals(new Set()); setSelectedCentros(new Set()); }}
                className="text-xs text-red-500 hover:text-red-700 underline"
              >
                Limpar filtros
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {filteredRows.length} / {data.data.length} registros
            </span>
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                {MONTH_NAMES_FULL[data.period.month]} {data.period.year} &mdash; {data.period.quinzena}a Quinzena
                <span className="font-normal text-gray-400 text-xs">
                  ({data.period.start_date} a {data.period.end_date})
                </span>
                {/* Color legend */}
                <div className="ml-auto flex gap-2 text-xs font-normal">
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">Neon</span>
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Manual</span>
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Calculado</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="border-b border-gray-200 text-gray-600">
                      {/* Identity */}
                      <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Colaborador</th>
                      <th className="text-left px-2 py-2 font-semibold">CPF</th>
                      <th className="text-left px-2 py-2 font-semibold">Situacao</th>
                      <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Regional</th>
                      <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Centro de Custo</th>
                      <th className="text-left px-2 py-2 font-semibold">Gestor</th>
                      {/* Neon */}
                      <th className="text-right px-2 py-2 font-semibold bg-green-50 whitespace-nowrap">Saldo Final</th>
                      <th className="text-right px-2 py-2 font-semibold bg-green-50 whitespace-nowrap">Saldo Cartao</th>
                      <th className="text-right px-2 py-2 font-semibold bg-green-50 whitespace-nowrap">Saldo Prest.</th>
                      <th className="text-right px-2 py-2 font-semibold bg-green-50 whitespace-nowrap">Saldo Reemb.</th>
                      {/* From carga spreadsheet */}
                      <th className="text-right px-2 py-2 font-semibold bg-green-50 whitespace-nowrap">
                        {data.period.quinzena}a QZ (plan.)
                      </th>
                      {/* Manual override */}
                      <th className="text-right px-2 py-2 font-semibold bg-amber-50 whitespace-nowrap">
                        {data.period.quinzena}a QZ (man.) *
                      </th>
                      <th className="text-right px-2 py-2 font-semibold bg-amber-50 whitespace-nowrap">Adiant. *</th>
                      {/* Calculated */}
                      <th className="text-right px-2 py-2 font-semibold bg-blue-50 whitespace-nowrap">Carga Parcial</th>
                      <th className="text-right px-2 py-2 font-semibold bg-blue-50 whitespace-nowrap">Reembolso</th>
                      <th className="text-right px-2 py-2 font-semibold bg-blue-50 whitespace-nowrap font-bold">Carga Final</th>
                      {/* Status / obs */}
                      <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Status Cartao</th>
                      <th className="text-left px-2 py-2 font-semibold bg-amber-50 whitespace-nowrap">Obs *</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={18} className="text-center py-10 text-gray-400">
                          {search ? 'Nenhum resultado para a busca.' : 'Sem dados.'}
                        </td>
                      </tr>
                    ) : filteredRows.map((row, i) => {
                      const isAtivo = row.situacao?.toUpperCase() === 'ATIVO';
                      const overrideActive = row.col_qz_manual !== null;
                      return (
                        <tr key={row.cpf}
                          className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/20`}
                        >
                          {/* Identity */}
                          <td className="px-2 py-1.5 font-medium whitespace-nowrap max-w-[160px] truncate" title={row.colaborador}>
                            {row.colaborador || '-'}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-gray-500">{row.cpf}</td>
                          <td className="px-2 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-xs ${isAtivo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                              {row.situacao || '-'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{row.regional || '-'}</td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap max-w-[130px] truncate" title={row.centro_custo}>
                            {row.centro_custo || '-'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap max-w-[120px] truncate" title={row.gestor}>
                            {row.gestor || '-'}
                          </td>

                          {/* Neon values */}
                          <td className={`px-2 py-1.5 text-right font-mono bg-green-50/40 whitespace-nowrap ${row.saldo_final < 0 ? 'text-red-600' : ''}`}>
                            {num(row.saldo_final)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono bg-green-50/40 whitespace-nowrap">
                            {num(row.saldo_cartao)}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono bg-green-50/40 whitespace-nowrap ${row.saldo_prestacao < 0 ? 'text-orange-500' : ''}`}>
                            {num(row.saldo_prestacao)}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono bg-green-50/40 whitespace-nowrap ${row.saldo_reembolsar < 0 ? 'text-red-400' : 'text-green-700'}`}>
                            {num(row.saldo_reembolsar)}
                          </td>

                          {/* QZ from planilha (readonly) */}
                          <td className={`px-2 py-1.5 text-right font-mono bg-green-50/40 whitespace-nowrap ${overrideActive ? 'line-through text-gray-300' : 'font-semibold'}`}>
                            {row.col_qz !== null ? num(row.col_qz) : '-'}
                          </td>

                          {/* QZ manual override */}
                          <td className="px-2 py-1.5 bg-amber-50/40">
                            <EditCell
                              value={row.col_qz_manual}
                              numeric
                              onSave={v => saveField(row.cpf, 'col_1qz', v)}
                              empty="override..."
                            />
                          </td>

                          {/* Adiantamento */}
                          <td className="px-2 py-1.5 bg-amber-50/40">
                            <EditCell
                              value={row.adiantamento > 0 ? row.adiantamento : null}
                              numeric
                              onSave={v => saveField(row.cpf, 'adiantamento', v)}
                              empty="0,00"
                            />
                          </td>

                          {/* Calculated */}
                          <td className="px-2 py-1.5 text-right font-mono bg-blue-50/40 whitespace-nowrap">
                            {num(row.carga_parcial)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono bg-blue-50/40 whitespace-nowrap">
                            {num(row.reembolso)}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono bg-blue-50/40 whitespace-nowrap font-bold ${row.carga_final > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                            {num(row.carga_final)}
                          </td>

                          {/* Status + obs */}
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              row.status_cartao?.toLowerCase().includes('ativo') ? 'bg-green-100 text-green-700'
                              : row.status_cartao?.toLowerCase().includes('bloqueado') ? 'bg-red-100 text-red-600'
                              : 'bg-gray-100 text-gray-600'
                            }`}>
                              {row.status_cartao || '-'}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 bg-amber-50/40 min-w-[110px]">
                            <EditCell
                              value={row.obs}
                              numeric={false}
                              onSave={v => saveField(row.cpf, 'obs', v)}
                              empty="obs..."
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Totals footer */}
                  {filteredRows.length > 0 && (
                    <tfoot className="border-t-2 border-gray-300 bg-gray-100 font-semibold text-xs">
                      <tr>
                        <td colSpan={6} className="px-2 py-2 text-gray-500">
                          TOTAL ({filteredRows.length})
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-green-100/50">
                          {num(filteredRows.reduce((s,r) => s + r.saldo_final, 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-green-100/50">
                          {num(filteredRows.reduce((s,r) => s + r.saldo_cartao, 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-green-100/50">
                          {num(filteredRows.reduce((s,r) => s + r.saldo_prestacao, 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-green-100/50">
                          {num(filteredRows.reduce((s,r) => s + r.saldo_reembolsar, 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-green-100/50">
                          {num(filteredRows.reduce((s,r) => s + (r.col_qz_manual ?? r.col_qz ?? 0), 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-amber-100/50">
                          {num(filteredRows.reduce((s,r) => s + (r.col_qz_manual ?? 0), 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-amber-100/50">
                          {num(filteredRows.reduce((s,r) => s + r.adiantamento, 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-blue-100/50">
                          {num(filteredRows.reduce((s,r) => s + r.carga_parcial, 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-blue-100/50">
                          {num(filteredRows.reduce((s,r) => s + r.reembolso, 0))}
                        </td>
                        <td className="px-2 py-2 text-right font-mono bg-blue-100/50 text-blue-700">
                          {num(filteredRows.reduce((s,r) => s + r.carga_final, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Import QZ Modal */}
      {year !== null && month !== null && quinzena !== null && (
        <ImportQzModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          year={year}
          month={month}
          quinzena={quinzena}
          onImported={() => {
            setImportModalOpen(false);
            loadData(year, month, quinzena);
          }}
        />
      )}
    </div>
  );
}
