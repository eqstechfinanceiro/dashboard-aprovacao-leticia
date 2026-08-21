'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ClipboardList,
  RefreshCw,
  AlertTriangle,
  Snowflake,
  Unlock,
  Table,
  CreditCard,
  FileText,
  Wallet,
  TrendingUp,
  FileDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ---- Types ------------------------------------------------------------------

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
  saldo_prestacao: number;
  saldo_cartao: number;
  saldo_final: number;
  saldo_reembolsar: number;
  col_qz: number | null;
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

interface Period {
  year: number;
  month: number;
  quinzena: number;
  has_snapshot: boolean;
  snapshot_rows: number;
  extrato_rows: number;
}

// ---- Constants --------------------------------------------------------------

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MONTH_NAMES_SHORT = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function num(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type TabId = 'painel' | 'saldo_cartao' | 'carga' | 'base_prest' | 'reembolso';

const TABS: { id: TabId; label: string; icon: typeof Table }[] = [
  { id: 'painel', label: 'PAINEL', icon: Table },
  { id: 'saldo_cartao', label: 'SALDO CARTÃO', icon: CreditCard },
  { id: 'carga', label: 'CARGA', icon: Wallet },
  { id: 'base_prest', label: 'BASE PREST', icon: FileText },
  { id: 'reembolso', label: 'REEMBOLSO', icon: TrendingUp },
];

// ---- Component ---------------------------------------------------------------

export default function ControlePage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(7);
  const [selectedQuinzena, setSelectedQuinzena] = useState(2);
  const [data, setData] = useState<QuinzenaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('painel');
  const [freezing, setFreezing] = useState(false);
  const [search, setSearch] = useState('');

  // Load available periods
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/quinzena/available-periods');
        if (res.ok) {
          const d = await res.json();
          setPeriods(d.periods || []);
          // Auto-select latest period
          if (d.periods?.length > 0) {
            const latest = d.periods[0];
            setSelectedYear(latest.year);
            setSelectedMonth(latest.month);
            setSelectedQuinzena(latest.quinzena);
          }
        }
      } catch (e) {
        console.error('Failed to load periods:', e);
      }
    })();
  }, []);

  // Load data when period changes
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/quinzena-complete?year=${selectedYear}&month=${selectedMonth}&quinzena=${selectedQuinzena}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao carregar dados');
      }
      const d: QuinzenaResponse = await res.json();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedQuinzena]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Freeze/unfreeze handlers
  const handleFreeze = async () => {
    setFreezing(true);
    try {
      const res = await fetch('/api/quinzena-freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear, month: selectedMonth, quinzena: selectedQuinzena }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao congelar');
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao congelar');
    } finally {
      setFreezing(false);
    }
  };

  const handleUnfreeze = async () => {
    setFreezing(true);
    try {
      const res = await fetch(
        `/api/quinzena-freeze?year=${selectedYear}&month=${selectedMonth}&quinzena=${selectedQuinzena}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao descongelar');
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao descongelar');
    } finally {
      setFreezing(false);
    }
  };

  // Export all tabs to XLSX
  const exportXLSX = () => {
    if (!data || !data.data.length) return;
    const periodLabel = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-QZ${selectedQuinzena}`;

    const wb = XLSX.utils.book_new();

    // Export each tab as a separate sheet
    for (const tab of TABS) {
      const cols = getColumnsForTab(tab.id);
      const tabLabel = tab.label;

      const wsData: unknown[][] = [];
      // Title row
      wsData.push([`CONTROLE - ${tabLabel} - ${periodLabel}`, ...Array(cols.length - 1).fill(null)]);
      // Header row
      wsData.push(cols.map(c => c.label));
      // Data rows
      for (const row of data.data) {
        wsData.push(cols.map(c => {
          const v = (row as unknown as Record<string, unknown>)[c.key];
          if (v === null || v === undefined) return '';
          if (typeof v === 'number') return v;
          return String(v);
        }));
      }
      // Totals row
      wsData.push(cols.map(c => {
        if (c.totalFn) return data.data.reduce((s, r) => s + (Number((r as unknown as Record<string, unknown>)[c.key]) || 0), 0);
        return c.key === 'colaborador' ? `TOTAL (${data.data.length})` : '';
      }));

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = cols.map(c => ({ wch: Math.max(c.label.length + 2, 14) }));
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }];

      XLSX.utils.book_append_sheet(wb, ws, tabLabel.substring(0, 31));
    }

    XLSX.writeFile(wb, `controle_completo_${periodLabel}.xlsx`);
  };

  // Filter data by search
  const filteredData = (data?.data || []).filter((row) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      row.colaborador.toLowerCase().includes(s) ||
      row.cpf.includes(s) ||
      row.regional.toLowerCase().includes(s) ||
      row.centro_custo.toLowerCase().includes(s)
    );
  });

  // Available years and months from periods
  const availableYears = [...new Set(periods.map((p) => p.year))].sort((a, b) => b - a);
  const availableMonths = periods
    .filter((p) => p.year === selectedYear)
    .map((p) => p.month);
  const uniqueMonths = [...new Set(availableMonths)].sort((a, b) => b - a);
  const availableQuinzenas = periods
    .filter((p) => p.year === selectedYear && p.month === selectedMonth)
    .map((p) => p.quinzena)
    .sort((a, b) => b - a);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-[1600px]">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <ClipboardList className="h-7 w-7 text-blue-600" />
              Controle
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Dados calculados automaticamente da API — todas as abas do CONTROLE
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data?.is_frozen ? (
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                <Snowflake className="mr-1 h-3 w-3" />
                Congelado {data.frozen_at && new Date(data.frozen_at).toLocaleDateString('pt-BR')}
              </Badge>
            ) : (
              <Badge variant="secondary">
                <RefreshCw className="mr-1 h-3 w-3" />
                Calculado em tempo real
              </Badge>
            )}
          </div>
        </div>

        {/* Period selectors + actions */}
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">Ano:</label>
              <select
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">Mês:</label>
              <select
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {uniqueMonths.map((m) => (
                  <option key={m} value={m}>{MONTH_NAMES[m]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600">Quinzena:</label>
              <select
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                value={selectedQuinzena}
                onChange={(e) => setSelectedQuinzena(Number(e.target.value))}
              >
                {availableQuinzenas.map((q) => (
                  <option key={q} value={q}>{q}ª</option>
                ))}
              </select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="text"
                placeholder="Buscar colaborador, CPF, regional..."
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={exportXLSX} disabled={!data || !filteredData.length}>
                <FileDown className="mr-1 h-4 w-4" />
                Excel
              </Button>
              {data?.is_frozen ? (
                <Button variant="outline" size="sm" onClick={handleUnfreeze} disabled={freezing}>
                  <Unlock className="mr-1 h-4 w-4" />
                  Descongelar
                </Button>
              ) : (
                <Button variant="default" size="sm" onClick={handleFreeze} disabled={freezing || !data}>
                  <Snowflake className="mr-1 h-4 w-4" />
                  Congelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        {data && (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <StatCard label="Total Colaboradores" value={String(data.statistics.total_rows)} />
            <StatCard label="Ativos" value={String(data.statistics.ativos)} />
            <StatCard label="Com Carga" value={String(data.statistics.com_carga)} />
            <StatCard label="Total Carga Final" value={brl(data.statistics.total_carga_final)} />
            <StatCard label="Total Saldo Final" value={brl(data.statistics.total_saldo_final)} />
            <StatCard label="Multiplicador" value={`${data.reembolso_multiplier}x`} />
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : data ? (
          <ControleTable data={filteredData} tab={activeTab} />
        ) : (
          <div className="flex h-64 items-center justify-center text-gray-400">
            Selecione um período para visualizar os dados
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Stat Card ---------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}

// ---- Table Component ---------------------------------------------------------

function ControleTable({ data, tab }: { data: QuinzenaRow[]; tab: TabId }) {
  if (data.length === 0) {
    return <div className="py-8 text-center text-gray-400">Nenhum dado disponível</div>;
  }

  const columns = getColumnsForTab(tab);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-left font-medium text-gray-600 ${col.numeric ? 'text-right' : ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row, i) => (
            <tr key={row.cpf + i} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 ${col.numeric ? 'text-right font-mono' : ''} ${
                    col.colorFn ? col.colorFn(row) : ''
                  }`}
                >
                  {col.format ? col.format(row) : String((row as any)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {/* Totals row */}
        <tfoot className="bg-gray-100 font-bold">
          <tr>
            {columns.map((col) => (
              <td
                key={col.key}
                className={`px-3 py-2 ${col.numeric ? 'text-right font-mono' : ''}`}
              >
                {col.totalFn ? col.totalFn(data) : col.key === 'colaborador' ? 'TOTAL' : ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---- Column Definitions ------------------------------------------------------

interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  format?: (row: QuinzenaRow) => string;
  totalFn?: (data: QuinzenaRow[]) => string;
  colorFn?: (row: QuinzenaRow) => string;
}

function getColumnsForTab(tab: TabId): Column[] {
  switch (tab) {
    case 'painel':
      return [
        { key: 'colaborador', label: 'Colaborador' },
        { key: 'cpf', label: 'CPF' },
        { key: 'situacao', label: 'Situação' },
        { key: 'regional', label: 'Regional' },
        { key: 'centro_custo', label: 'Centro de Custo' },
        {
          key: 'carga', label: 'CARGA', numeric: true,
          format: (r) => num(r.carga),
          totalFn: (d) => num(d.reduce((s, r) => s + r.carga, 0)),
        },
        {
          key: 'transferencia', label: 'TRANSFERÊNCIA', numeric: true,
          format: (r) => num(r.transferencia),
          totalFn: (d) => num(d.reduce((s, r) => s + r.transferencia, 0)),
        },
        {
          key: 'tarifa', label: 'TARIFA', numeric: true,
          format: (r) => num(r.tarifa),
          totalFn: (d) => num(d.reduce((s, r) => s + r.tarifa, 0)),
        },
        {
          key: 'prestacao', label: 'PRESTAÇÃO', numeric: true,
          format: (r) => num(r.prestacao),
          totalFn: (d) => num(d.reduce((s, r) => s + r.prestacao, 0)),
        },
        {
          key: 'saldo_prestacao', label: 'SALDO PRESTAÇÃO', numeric: true,
          format: (r) => num(r.saldo_prestacao),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_prestacao, 0)),
        },
        {
          key: 'saldo_cartao', label: 'SALDO CARTÃO', numeric: true,
          format: (r) => num(r.saldo_cartao),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_cartao, 0)),
        },
        {
          key: 'saldo_final', label: 'SALDO FINAL', numeric: true,
          format: (r) => num(r.saldo_final),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_final, 0)),
          colorFn: (r) => r.saldo_final < 0 ? 'text-red-600' : '',
        },
      ];

    case 'saldo_cartao':
      return [
        { key: 'colaborador', label: 'Colaborador' },
        { key: 'cpf', label: 'CPF' },
        { key: 'status_cartao', label: 'Status Cartão' },
        {
          key: 'saldo_cartao', label: 'SALDO CARTÃO', numeric: true,
          format: (r) => num(r.saldo_cartao),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_cartao, 0)),
        },
        {
          key: 'saldo_final', label: 'SALDO FINAL', numeric: true,
          format: (r) => num(r.saldo_final),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_final, 0)),
        },
      ];

    case 'carga':
      return [
        { key: 'colaborador', label: 'Colaborador' },
        { key: 'cpf', label: 'CPF' },
        { key: 'situacao', label: 'Situação' },
        {
          key: 'col_qz_manual', label: 'COL QZ', numeric: true,
          format: (r) => r.col_qz_manual !== null ? num(r.col_qz_manual) : '-',
          totalFn: (d) => num(d.reduce((s, r) => s + (r.col_qz_manual ?? 0), 0)),
        },
        {
          key: 'saldo_final_carga', label: 'SALDO FINAL', numeric: true,
          format: (r) => num(r.saldo_final_carga),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_final_carga, 0)),
        },
        {
          key: 'saldo_cartao_carga', label: 'SALDO CARTÃO', numeric: true,
          format: (r) => num(r.saldo_cartao_carga),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_cartao_carga, 0)),
        },
        {
          key: 'adiantamento', label: 'ADIANTAMENTO', numeric: true,
          format: (r) => num(r.adiantamento),
          totalFn: (d) => num(d.reduce((s, r) => s + r.adiantamento, 0)),
        },
        {
          key: 'carga_parcial', label: 'CARGA PARCIAL', numeric: true,
          format: (r) => num(r.carga_parcial),
          totalFn: (d) => num(d.reduce((s, r) => s + r.carga_parcial, 0)),
          colorFn: (r) => r.carga_parcial < 0 ? 'text-red-600' : '',
        },
        {
          key: 'reembolso', label: 'REEMBOLSO', numeric: true,
          format: (r) => num(r.reembolso),
          totalFn: (d) => num(d.reduce((s, r) => s + r.reembolso, 0)),
        },
        {
          key: 'carga_final', label: 'CARGA FINAL', numeric: true,
          format: (r) => num(r.carga_final),
          totalFn: (d) => num(d.reduce((s, r) => s + r.carga_final, 0)),
          colorFn: (r) => r.carga_final > 0 ? 'text-green-600' : '',
        },
        { key: 'obs', label: 'OBS', format: (r) => r.obs ?? '' },
      ];

    case 'base_prest':
      return [
        { key: 'colaborador', label: 'Colaborador' },
        { key: 'cpf', label: 'CPF' },
        { key: 'centro_custo', label: 'Centro de Custo' },
        {
          key: 'carga', label: 'CARGA', numeric: true,
          format: (r) => num(r.carga),
          totalFn: (d) => num(d.reduce((s, r) => s + r.carga, 0)),
        },
        {
          key: 'transferencia', label: 'TRANSFERÊNCIA', numeric: true,
          format: (r) => num(r.transferencia),
          totalFn: (d) => num(d.reduce((s, r) => s + r.transferencia, 0)),
        },
        {
          key: 'tarifa', label: 'TARIFA', numeric: true,
          format: (r) => num(r.tarifa),
          totalFn: (d) => num(d.reduce((s, r) => s + r.tarifa, 0)),
        },
        {
          key: 'prestacao', label: 'PRESTAÇÃO DE CONTAS', numeric: true,
          format: (r) => num(r.prestacao),
          totalFn: (d) => num(d.reduce((s, r) => s + r.prestacao, 0)),
        },
        {
          key: 'saldo_prestacao', label: 'SALDO PRESTAÇÃO', numeric: true,
          format: (r) => num(r.saldo_prestacao),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_prestacao, 0)),
          colorFn: (r) => r.saldo_prestacao < 0 ? 'text-red-600' : '',
        },
      ];

    case 'reembolso':
      return [
        { key: 'colaborador', label: 'Colaborador' },
        { key: 'cpf', label: 'CPF' },
        { key: 'situacao', label: 'Situação' },
        {
          key: 'saldo_final', label: 'SALDO FINAL', numeric: true,
          format: (r) => num(r.saldo_final),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_final, 0)),
          colorFn: (r) => r.saldo_final < 0 ? 'text-red-600' : '',
        },
        {
          key: 'saldo_reembolsar', label: 'SALDO A REEMBOLSAR', numeric: true,
          format: (r) => num(r.saldo_reembolsar),
          totalFn: (d) => num(d.reduce((s, r) => s + r.saldo_reembolsar, 0)),
        },
        {
          key: 'reembolso', label: 'REEMBOLSO (50%)', numeric: true,
          format: (r) => num(r.reembolso),
          totalFn: (d) => num(d.reduce((s, r) => s + r.reembolso, 0)),
        },
      ];

    default:
      return [];
  }
}
