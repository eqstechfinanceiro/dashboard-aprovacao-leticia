'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Info, AlertTriangle, Loader2, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

type FieldStatus = 'match' | 'mismatch' | 'calc' | 'no_api_data' | 'unavailable';
type FieldSource = 'api' | 'local' | 'calc' | 'unavailable';

interface CompField {
  name: string;
  sheetVal: any;
  apiVal: any;
  source: FieldSource;
  status: FieldStatus;
  tooltip?: string;
}

interface CompRow {
  cpf: string;
  portador: string;
  foundInAPI: boolean;
  apiUserId: number | null;
  expenseCount: number;
  fields: CompField[];
}

interface Stats {
  totalRows: number;
  foundInAPI: number;
  matchCount: number;
  mismatchCount: number;
  calcCount: number;
  noDataCount: number;
}

interface CompData {
  generatedAt: string;
  expenseError: string | null;
  totalExpenses: number;
  stats: Stats;
  rows: CompRow[];
}

// Paleta de cores por status
const STATUS_COLORS: Record<FieldStatus, string> = {
  match:        'bg-green-100 text-green-800 border-green-200',
  mismatch:     'bg-red-100   text-red-800   border-red-200',
  calc:         'bg-purple-100 text-purple-800 border-purple-200',
  no_api_data:  'bg-gray-50  text-gray-400  border-gray-200',
  unavailable:  'bg-gray-50  text-gray-400  border-gray-200',
};

const SOURCE_LABEL: Record<FieldSource, { label: string; color: string }> = {
  api:         { label: 'API',      color: 'bg-blue-100 text-blue-700' },
  local:       { label: 'Planilha', color: 'bg-amber-100 text-amber-700' },
  calc:        { label: 'Cálculo',  color: 'bg-purple-100 text-purple-700' },
  unavailable: { label: 'N/D',      color: 'bg-gray-100 text-gray-500' },
};

function fmt(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' || (!isNaN(parseFloat(v)) && !isNaN(Number(v)))) {
    const n = parseFloat(v);
    if (!isNaN(n)) return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return String(v);
}

function StatusIcon({ status }: { status: FieldStatus }) {
  if (status === 'match') return <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />;
  if (status === 'mismatch') return <XCircle className="h-3 w-3 text-red-600 shrink-0" />;
  if (status === 'calc') return <span className="text-purple-500 text-xs shrink-0">⊕</span>;
  return <HelpCircle className="h-3 w-3 text-gray-400 shrink-0" />;
}

const FIELD_GROUPS = [
  { label: 'Cadastrais', fields: ['PORTADOR', 'CPF', 'STATUS COLAB', 'CENTRO CUSTO'] },
  { label: 'Financeiros', fields: ['1QZ', 'SALDO CARTAO', 'SALDO FINAL', 'ADIANTAMENTO', 'REEMBOLSO', 'SALDO REEMBOLSAR'] },
  { label: 'Calculados', fields: ['CARGA PARCIAL', 'CARGA FINAL'] },
  { label: 'Cartão', fields: ['STATUS CARTAO'] },
];

export default function TestPlanilha1APIPage() {
  const [data, setData] = useState<CompData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showOnlyMismatch, setShowOnlyMismatch] = useState(false);

  useEffect(() => {
    fetch('/api/compare-planilha-api')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      <span className="text-gray-600">Carregando dados e comparando com API...</span>
    </div>
  );

  if (error) return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Erro</AlertTitle>
      <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
    </Alert>
  );

  if (!data) return null;

  const { stats, rows } = data;

  const filteredRows = rows.filter(r => {
    if (search && !r.portador.toLowerCase().includes(search.toLowerCase()) && !r.cpf.includes(search)) return false;
    if (showOnlyMismatch && !r.fields.some(f => f.status === 'mismatch')) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Verificação: Planilha 1QZ Abril 2026 vs API</h1>
        <p className="text-gray-500 text-sm mt-1">
          Compara os campos da planilha original com os dados obtidos via API VExpenses e fontes locais.
          Período: 01/04/2026 – 15/04/2026.
        </p>
      </div>

      {/* Legenda */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-200" />
              <span><b>Verde</b> – Dados iguais à planilha</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-100 border border-red-200" />
              <span><b>Vermelho</b> – Dados diferentes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-100 border border-purple-200" />
              <span><b>Roxo</b> – Campo calculado (fórmula)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-amber-100 border border-amber-200" />
              <span><b>Amarelo</b> – Da planilha local</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-50 border border-gray-200" />
              <span><b>Cinza</b> – Não disponível</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge className="bg-blue-100 text-blue-700">API = campo da API VExpenses</Badge>
            <Badge className="bg-amber-100 text-amber-700">Planilha = campo de arquivo Excel local</Badge>
            <Badge className="bg-purple-100 text-purple-700">Cálculo = fórmula derivada de outros campos</Badge>
            <Badge className="bg-gray-100 text-gray-500">N/D = não calculável via API</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Linhas', val: stats.totalRows, color: 'text-gray-900' },
          { label: 'Na API', val: stats.foundInAPI, color: 'text-blue-700' },
          { label: 'Corretos', val: stats.matchCount, color: 'text-green-700' },
          { label: 'Diferentes', val: stats.mismatchCount, color: 'text-red-700' },
          { label: 'Calculados', val: stats.calcCount, color: 'text-purple-700' },
          { label: 'Sem dados', val: stats.noDataCount, color: 'text-gray-500' },
        ].map(({ label, val, color }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-xs text-gray-500">{label}</div>
              <div className={`text-2xl font-bold ${color}`}>{val}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Warnings */}
      {data.expenseError && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Aviso: despesas da API</AlertTitle>
          <AlertDescription className="text-xs font-mono">{data.expenseError}. Comparação de REEMBOLSO pode estar zerada.</AlertDescription>
        </Alert>
      )}
      {stats.foundInAPI < stats.totalRows && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>{stats.totalRows - stats.foundInAPI} usuários não encontrados na API</AlertTitle>
          <AlertDescription className="text-xs">
            Esses usuários estão na planilha mas não possuem match pelo CPF na API VExpenses.
          </AlertDescription>
        </Alert>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por nome ou CPF..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-60"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyMismatch}
            onChange={e => setShowOnlyMismatch(e.target.checked)}
          />
          Mostrar apenas linhas com diferenças
        </label>
        <span className="text-xs text-gray-400">{filteredRows.length} de {rows.length} usuários</span>
      </div>

      {/* Tabela por grupos de campos */}
      {FIELD_GROUPS.map(group => {
        const groupFieldNames = group.fields;
        return (
          <Card key={group.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{group.label}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-gray-50 border-r min-w-[180px]">Portador</th>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap min-w-[110px]">CPF</th>
                    {groupFieldNames.map(fn => (
                      <th key={fn} className="text-center px-2 py-2 font-medium whitespace-nowrap min-w-[120px]">{fn}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const rowHasMismatch = row.fields.some(f => f.status === 'mismatch');
                    return (
                      <tr key={row.cpf} className={`border-b hover:bg-gray-50 ${rowHasMismatch ? 'bg-red-50/30' : ''}`}>
                        <td className="px-3 py-1.5 sticky left-0 bg-white border-r whitespace-nowrap font-medium">
                          {row.portador}
                          {!row.foundInAPI && (
                            <Badge className="ml-1 bg-red-100 text-red-700 text-xs">Sem API</Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">{row.cpf}</td>
                        {groupFieldNames.map(fn => {
                          const f = row.fields.find(x => x.name === fn);
                          if (!f) return <td key={fn} className="px-2 py-1.5 text-center text-gray-300">—</td>;
                          const cls = STATUS_COLORS[f.status];
                          const srcBadge = SOURCE_LABEL[f.source];
                          return (
                            <td
                              key={fn}
                              className={`px-2 py-1.5 border ${cls}`}
                              title={f.tooltip || ''}
                            >
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1 justify-between">
                                  <StatusIcon status={f.status} />
                                  <span className={`text-[10px] px-1 rounded ${srcBadge.color}`}>{srcBadge.label}</span>
                                </div>
                                <div className="font-semibold">{fmt(f.sheetVal)}</div>
                                {f.source !== 'unavailable' && f.apiVal !== null && f.apiVal !== undefined && (
                                  <div className="text-gray-500 text-[10px]">API: {fmt(f.apiVal)}</div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={2 + groupFieldNames.length} className="text-center py-6 text-gray-400">Nenhum resultado</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}

      {/* Campos não disponíveis */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Campos não obtidos via API VExpenses</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 space-y-1 text-sm">
            <li><b>COD CENTRO CUSTO, GESTOR, DIREÇÃO</b> – dados organizacionais não expostos na API</li>
            <li><b>SALDO FINAL</b> – calculado no PAINEL do CONTROLE a partir do extrato do cartão</li>
            <li><b>SALDO REEMBOLSAR</b> – depende de SALDO FINAL que não temos via API</li>
            <li><b>OBS</b> – campo manual</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
