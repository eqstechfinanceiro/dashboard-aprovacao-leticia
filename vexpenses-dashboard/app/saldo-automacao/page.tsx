'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calculator, 
  TrendingUp, 
  Users, 
  Download, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle,
  Info,
  DollarSign
} from 'lucide-react';

const MONTHS = [
  { v: 1, l: 'Janeiro' }, { v: 2, l: 'Fevereiro' }, { v: 3, l: 'Março' },
  { v: 4, l: 'Abril' },   { v: 5, l: 'Maio' },      { v: 6, l: 'Junho' },
  { v: 7, l: 'Julho' },   { v: 8, l: 'Agosto' },    { v: 9, l: 'Setembro' },
  { v: 10, l: 'Outubro' },{ v: 11, l: 'Novembro' }, { v: 12, l: 'Dezembro' },
];

interface SaldoData {
  period: {
    year: number;
    month: number;
    quinzena: number;
    start_date: string;
    end_date: string;
  };
  user_info: {
    user_id: number;
    name: string;
    cpf: string | null;
    email: string | null;
  };
  financial_data: {
    user_id: number;
    quinzena_qz: number;
    saldo_final: number;
    saldo_cartao: number;
    saldo_reembolsar: number;
    adiantamento: number;
    carga_parcial: number;
    reembolso: number;
    carga_final: number;
    expenses_count: number;
  };
  data_sources: {
    quinzena_qz: string;
    saldos: string;
    formulas: string;
  };
}

interface ApiResponse {
  generation_date: string;
  period: {
    year: number;
    month: number;
    quinzena: number;
    start_date: string;
    end_date: string;
  };
  patterns_used: {
    saldo_final_ratio: number;
    saldo_cartao_ratio: number;
    saldo_reembolsar_ratio: number;
  };
  statistics: {
    total_expenses: number;
    total_team_members: number;
    processed_users: number;
    success_rate: number;
  };
  data: SaldoData[];
}

// Formatação de valores
function brl(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

// Componente de indicador
function MetricCard({ title, value, icon: Icon, trend, color = "blue" }: {
  title: string;
  value: string | number;
  icon: any;
  trend?: string;
  color?: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200'
  };

  return (
    <Card className={`${colorClasses[color as keyof typeof colorClasses]} border`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {trend && <p className="text-xs opacity-70">{trend}</p>}
          </div>
          <Icon className="h-8 w-8 opacity-50" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SaldoAutomacaoPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);
  const [quinzena, setQuinzena] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/vexpenses/saldo-complete?year=${year}&month=${month}&quinzena=${quinzena}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao carregar dados');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [year, month, quinzena]);

  const exportCSV = () => {
    if (!data?.data.length) return;

    const headers = [
      'USER_ID', 'NOME', 'CPF', 'EMAIL', '1QZ', 'SALDO_FINAL', 'SALDO_CARTAO', 
      'SALDO_REEMBOLSAR', 'ADIANTAMENTO', 'CARGA_PARCIAL', 'REEMBOLSO', 'CARGA_FINAL', 
      'EXPENSES_COUNT'
    ];

    const lines = data.data.map(user => [
      user.user_info.user_id,
      `"${user.user_info.name}"`,
      `"${user.user_info.cpf || ''}"`,
      `"${user.user_info.email || ''}"`,
      user.financial_data.quinzena_qz,
      user.financial_data.saldo_final,
      user.financial_data.saldo_cartao,
      user.financial_data.saldo_reembolsar,
      user.financial_data.adiantamento,
      user.financial_data.carga_parcial,
      user.financial_data.reembolso,
      user.financial_data.carga_final,
      user.financial_data.expenses_count
    ].map(v => String(v)).join(','));

    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saldo-automacao-${year}-${String(month).padStart(2, '0')}-${quinzena}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const monthName = MONTHS.find(m => m.v === month)?.l || month;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calculator className="h-8 w-8" />
            Automação de Saldos
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Cálculo 100% automatizado de saldos e cargas da planilha de quinzena usando API VExpenses
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            onClick={exportCSV}
            disabled={!data?.data.length}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ano</label>
              <input
                type="number" min={2024} max={2030}
                value={year} onChange={e => setYear(parseInt(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm w-24"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mês</label>
              <select
                value={month} onChange={e => setMonth(parseInt(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm"
              >
                {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quinzena</label>
              <div className="flex rounded border overflow-hidden">
                {[1, 2].map(q => (
                  <button
                    key={q}
                    onClick={() => setQuinzena(q)}
                    className={`px-4 py-1.5 text-sm font-medium ${
                      quinzena === q ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {q}ª QZ
                  </button>
                ))}
              </div>
            </div>
            
            {data && (
              <div className="ml-auto text-sm text-gray-500">
                Período: {data.period.start_date} a {data.period.end_date}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alertas */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Expenses"
              value={data.statistics.total_expenses}
              icon={TrendingUp}
              trend="Período selecionado"
              color="blue"
            />
            <MetricCard
              title="Usuários Processados"
              value={data.statistics.processed_users}
              icon={Users}
              trend={`${data.statistics.success_rate.toFixed(1)}% sucesso`}
              color="green"
            />
            <MetricCard
              title="Team Members"
              value={data.statistics.total_team_members}
              icon={Users}
              trend="Total na API"
              color="amber"
            />
            <MetricCard
              title="Taxa de Sucesso"
              value={`${data.statistics.success_rate.toFixed(1)}%`}
              icon={CheckCircle}
              trend="Automação"
              color="purple"
            />
          </div>

          {/* Informações dos Padrões */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Padrões Matemáticos Utilizados</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-1 text-sm">
                <div>• SALDO FINAL = 1QZ × {data.patterns_used.saldo_final_ratio.toFixed(4)}</div>
                <div>• SALDO CARTÃO = 1QZ × {data.patterns_used.saldo_cartao_ratio.toFixed(4)}</div>
                <div>• SALDO REEMBOLSAR = 1QZ × {data.patterns_used.saldo_reembolsar_ratio.toFixed(4)}</div>
                <div>• CARGA PARCIAL = 1QZ - SALDO FINAL - SALDO CARTÃO - ADIANTAMENTO</div>
                <div>• REEMBOLSO = SALDO REEMBOLSAR × 0.5 (taxa multiplicadora)</div>
                <div>• CARGA FINAL = CARGA PARCIAL + REEMBOLSO</div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Tabela de Resultados */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Resultados da Automação - {monthName} {year} ({quinzena}ª Quinzena)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium">Usuário</th>
                      <th className="text-right p-2 font-medium">1QZ</th>
                      <th className="text-right p-2 font-medium">SALDO FINAL</th>
                      <th className="text-right p-2 font-medium">SALDO CARTÃO</th>
                      <th className="text-right p-2 font-medium">SALDO REEMBOLSAR</th>
                      <th className="text-right p-2 font-medium">CARGA PARCIAL</th>
                      <th className="text-right p-2 font-medium">REEMBOLSO</th>
                      <th className="text-right p-2 font-medium">CARGA FINAL</th>
                      <th className="text-center p-2 font-medium">Fontes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((user, index) => (
                      <tr key={user.user_info.user_id} className="border-b hover:bg-gray-50">
                        <td className="p-2">
                          <div>
                            <div className="font-medium">{user.user_info.name}</div>
                            <div className="text-xs text-gray-500">ID: {user.user_info.user_id}</div>
                            {user.user_info.cpf && (
                              <div className="text-xs text-gray-500">CPF: {user.user_info.cpf}</div>
                            )}
                          </div>
                        </td>
                        <td className="text-right p-2 font-mono">{brl(user.financial_data.quinzena_qz)}</td>
                        <td className="text-right p-2 font-mono">{brl(user.financial_data.saldo_final)}</td>
                        <td className="text-right p-2 font-mono">{brl(user.financial_data.saldo_cartao)}</td>
                        <td className="text-right p-2 font-mono">{brl(user.financial_data.saldo_reembolsar)}</td>
                        <td className="text-right p-2 font-mono">{brl(user.financial_data.carga_parcial)}</td>
                        <td className="text-right p-2 font-mono">{brl(user.financial_data.reembolso)}</td>
                        <td className="text-right p-2 font-mono font-bold">{brl(user.financial_data.carga_final)}</td>
                        <td className="text-center p-2">
                          <div className="flex flex-wrap gap-1 justify-center">
                            <Badge variant="secondary" className="text-xs">
                              {user.data_sources.quinzena_qz}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {user.data_sources.saldos}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Resumo da Geração */}
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Automação Concluída</AlertTitle>
            <AlertDescription>
              Dados gerados em {new Date(data.generation_date).toLocaleString('pt-BR')} • 
              {data.statistics.processed_users} usuários processados • 
              {data.statistics.total_expenses} expenses analisadas • 
              Taxa de sucesso: {data.statistics.success_rate.toFixed(1)}%
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}