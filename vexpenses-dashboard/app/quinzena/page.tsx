'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Info, AlertTriangle, Loader2, Download } from 'lucide-react';

const MONTHS = [
  { v: 1, l: 'Janeiro' }, { v: 2, l: 'Fevereiro' }, { v: 3, l: 'Março' },
  { v: 4, l: 'Abril' },   { v: 5, l: 'Maio' },      { v: 6, l: 'Junho' },
  { v: 7, l: 'Julho' },   { v: 8, l: 'Agosto' },    { v: 9, l: 'Setembro' },
  { v: 10, l: 'Outubro' },{ v: 11, l: 'Novembro' }, { v: 12, l: 'Dezembro' },
];

type Source = 'api' | 'planilha' | 'calc' | null;

interface Row {
  cpf: string; portador: string; statusColab: string; centroCusto: string;
  gestor: string; direcao: string; statusCartao: string;
  qz1: number | null; saldoCartao: number | null; saldoFinal: number | null;
  adiantamento: number; reembolso: number;
  cargaParcial: number | null; cargaFinal: number | null;
  saldoReembolsar: number | null;
  sources: Record<string, Source>;
  regional: string; foundInAPI: boolean;
}

interface ApiResponse {
  period: { year: number; month: number; quinzena: number; startDate: string; endDate: string };
  stats: { totalRows: number; foundInAPI: number; withQZ1: number; withSaldoCartao: number; withReembolso: number; totalExpenses: number };
  errors: { membersError: string | null; expenseError: string | null };
  availablePeriods: string[];
  rows: Row[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function brl(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

const SOURCE_CHIP: Record<string, { label: string; cls: string }> = {
  api:      { label: 'API',  cls: 'bg-blue-100 text-blue-700' },
  planilha: { label: 'Plan', cls: 'bg-amber-100 text-amber-700' },
  calc:     { label: 'Calc', cls: 'bg-purple-100 text-purple-700' },
};

function SourceChip({ src }: { src: Source }) {
  if (!src) return null;
  const s = SOURCE_CHIP[src];
  if (!s) return null;
  return <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${s.cls}`}>{s.label}</span>;
}

function Cell({ val, src, cls = '' }: { val: string; src?: Source; cls?: string }) {
  return (
    <td className={`px-2 py-2 text-xs border-b border-gray-100 whitespace-nowrap ${cls}`}>
      <div className="flex flex-col gap-0.5">
        <span>{val}</span>
        {src && <SourceChip src={src} />}
      </div>
    </td>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function QuinzenaPage() {
  const [year, setYear]         = useState(2026);
  const [month, setMonth]       = useState(4);
  const [quinzena, setQuinzena] = useState(1);
  const [search, setSearch]     = useState('');
  const [data, setData]         = useState<ApiResponse | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/planilha-quinzena?year=${year}&month=${month}&quinzena=${quinzena}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [year, month, quinzena]);

  useEffect(() => { load(); }, [load]);

  const rows = (data?.rows || []).filter(r =>
    !search || r.portador.toLowerCase().includes(search.toLowerCase()) || r.cpf.includes(search)
  );

  // Exportar CSV
  function exportCSV() {
    if (!rows.length) return;
    const headers = ['CPF','PORTADOR','STATUS COLAB','CENTRO CUSTO','GESTOR','DIREÇÃO',
      '1QZ','SALDO CARTAO','SALDO FINAL','ADIANTAMENTO','REEMBOLSO',
      'CARGA PARCIAL','CARGA FINAL','SALDO REEMBOLSAR','STATUS CARTAO','REGIONAL'];
    const lines = rows.map(r => [
      r.cpf, r.portador, r.statusColab, r.centroCusto, r.gestor, r.direcao,
      r.qz1 ?? '', r.saldoCartao ?? '', r.saldoFinal ?? '', r.adiantamento, r.reembolso,
      r.cargaParcial ?? '', r.cargaFinal ?? '', r.saldoReembolsar ?? '',
      r.statusCartao, r.regional,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quinzena-${year}-${String(month).padStart(2,'0')}-${quinzena}.csv`;
    a.click();
  }

  const monthName = MONTHS.find(m => m.v === month)?.l || month;

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Planilha de Quinzena</h1>
          <p className="text-gray-500 text-sm mt-1">
            Dados combinados da API VExpenses e arquivos locais. Selecione o período desejado.
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={!rows.length}
          className="flex items-center gap-2 px-4 py-2 rounded bg-green-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-green-700"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
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
                    className={`px-4 py-1.5 text-sm font-medium ${quinzena === q ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    {q}ª QZ
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={load}
              className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Carregar
            </button>
            <div className="ml-auto">
              <label className="block text-xs text-gray-500 mb-1">Buscar</label>
              <input
                type="text" placeholder="Nome ou CPF..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm w-52"
              />
            </div>
          </div>

          {data && (
            <p className="mt-2 text-xs text-gray-400">
              Período: {data.period.startDate} a {data.period.endDate}
              {data.availablePeriods.length > 0 && (
                <> · Períodos disponíveis nos dados: {data.availablePeriods.slice(0, 5).join(', ')}{data.availablePeriods.length > 5 ? ' ...' : ''}</>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Legenda de fontes */}
      <div className="flex flex-wrap gap-2 text-xs items-center">
        <span className="text-gray-500 font-medium">Fonte:</span>
        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">API = API VExpenses</span>
        <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Plan = Planilha local</span>
        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Calc = Campo calculado</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-gray-500">Carregando {monthName} {year} – {quinzena}ª Quinzena...</span>
        </div>
      )}

      {/* Erro */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Estatísticas */}
      {data && !loading && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { l: 'Usuários',    v: data.stats.totalRows,      c: 'text-gray-900' },
            { l: 'Na API',      v: data.stats.foundInAPI,     c: 'text-blue-700' },
            { l: 'Com 1QZ',     v: data.stats.withQZ1,        c: 'text-amber-700' },
            { l: 'Saldo Cart.', v: data.stats.withSaldoCartao,c: 'text-amber-700' },
            { l: 'Reembolso',   v: data.stats.withReembolso,  c: 'text-green-700' },
            { l: 'Despesas API',v: data.stats.totalExpenses,  c: 'text-gray-600' },
          ].map(({ l, v, c }) => (
            <Card key={l}>
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-xs text-gray-400">{l}</div>
                <div className={`text-xl font-bold ${c}`}>{v}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Avisos de erro de API */}
      {data?.errors.expenseError && !loading && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>API de despesas indisponível para o período</AlertTitle>
          <AlertDescription className="text-xs">{data.errors.expenseError} — o campo REEMBOLSO estará zerado.</AlertDescription>
        </Alert>
      )}

      {/* Tabela principal */}
      {data && !loading && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {quinzena}ª Quinzena de {monthName} {year}
              <span className="ml-2 text-sm text-gray-400 font-normal">({rows.length} usuários)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 uppercase text-[11px]">
                  <th className="sticky left-0 bg-gray-50 z-10 px-3 py-2 text-left font-semibold whitespace-nowrap min-w-[180px] border-b border-r">Portador</th>
                  <th className="px-2 py-2 text-left font-semibold whitespace-nowrap min-w-[110px] border-b">CPF</th>
                  <th className="px-2 py-2 text-left font-semibold whitespace-nowrap border-b">Status</th>
                  <th className="px-2 py-2 text-left font-semibold whitespace-nowrap min-w-[140px] border-b">Centro Custo</th>
                  <th className="px-2 py-2 text-left font-semibold whitespace-nowrap min-w-[120px] border-b">Gestor</th>
                  <th className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[100px] border-b bg-amber-50">1QZ</th>
                  <th className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[110px] border-b bg-amber-50">Saldo Cartão</th>
                  <th className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[100px] border-b">Saldo Final</th>
                  <th className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[110px] border-b">Adiantamento</th>
                  <th className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[100px] border-b bg-blue-50">Reembolso</th>
                  <th className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[110px] border-b bg-purple-50">Carga Parcial</th>
                  <th className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[100px] border-b bg-purple-50">Carga Final</th>
                  <th className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[120px] border-b">Saldo Reimb.</th>
                  <th className="px-2 py-2 text-left font-semibold whitespace-nowrap min-w-[110px] border-b">Status Cartão</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const s = row.sources;
                  const cargaParcialNeg = row.cargaParcial !== null && row.cargaParcial < 0;
                  return (
                    <tr key={row.cpf} className="hover:bg-blue-50/30 transition-colors">
                      {/* Nome sticky */}
                      <td className="sticky left-0 bg-white z-10 px-3 py-2 font-medium text-gray-900 border-b border-r whitespace-nowrap">
                        {row.portador}
                        {!row.foundInAPI && <Badge className="ml-1 bg-red-100 text-red-700 text-[10px]">Sem API</Badge>}
                      </td>
                      <td className="px-2 py-2 font-mono text-gray-500 border-b whitespace-nowrap">{row.cpf}</td>
                      <Cell val={row.statusColab} src={s.statusColab}
                        cls={row.statusColab === 'ATIVO' ? 'text-green-700' : 'text-red-500'} />
                      <Cell val={row.centroCusto || '—'} src={s.centroCusto} />
                      <Cell val={row.gestor || '—'} src={s.centroCusto ? 'planilha' : null} />
                      {/* 1QZ */}
                      <td className="px-2 py-2 text-right border-b whitespace-nowrap bg-amber-50/50">
                        <div className="flex flex-col gap-0.5 items-end">
                          <span className="font-semibold">{brl(row.qz1)}</span>
                          <SourceChip src={s.qz1 as Source} />
                        </div>
                      </td>
                      {/* Saldo Cartão */}
                      <td className="px-2 py-2 text-right border-b whitespace-nowrap bg-amber-50/50">
                        <div className="flex flex-col gap-0.5 items-end">
                          <span className="font-semibold">{brl(row.saldoCartao)}</span>
                          <SourceChip src={s.saldoCartao as Source} />
                        </div>
                      </td>
                      {/* Saldo Final */}
                      <td className="px-2 py-2 text-right border-b whitespace-nowrap text-gray-400 italic">
                        {brl(row.saldoFinal)}
                      </td>
                      {/* Adiantamento */}
                      <td className="px-2 py-2 text-right border-b whitespace-nowrap">
                        <div className="flex flex-col gap-0.5 items-end">
                          <span>{brl(row.adiantamento || null)}</span>
                          <SourceChip src={s.adiantamento as Source || (row.adiantamento !== null ? 'planilha' : null)} />
                        </div>
                      </td>
                      {/* Reembolso */}
                      <td className="px-2 py-2 text-right border-b whitespace-nowrap bg-blue-50/40">
                        <div className="flex flex-col gap-0.5 items-end">
                          <span className="text-blue-700">{brl(row.reembolso || null)}</span>
                          <SourceChip src={s.reembolso as Source} />
                        </div>
                      </td>
                      {/* Carga Parcial */}
                      <td className={`px-2 py-2 text-right border-b whitespace-nowrap bg-purple-50/40 ${cargaParcialNeg ? 'text-red-600' : 'text-purple-700'}`}>
                        <div className="flex flex-col gap-0.5 items-end">
                          <span className="font-semibold">{brl(row.cargaParcial)}</span>
                          {row.cargaParcial !== null && <SourceChip src="calc" />}
                        </div>
                      </td>
                      {/* Carga Final */}
                      <td className="px-2 py-2 text-right border-b whitespace-nowrap bg-purple-50/40 text-purple-700">
                        <div className="flex flex-col gap-0.5 items-end">
                          <span className="font-semibold">{brl(row.cargaFinal)}</span>
                          {row.cargaFinal !== null && <SourceChip src="calc" />}
                        </div>
                      </td>
                      {/* Saldo Reembolsar */}
                      <td className={`px-2 py-2 text-right border-b whitespace-nowrap ${(row.saldoReembolsar ?? 0) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                        {brl(row.saldoReembolsar)}
                      </td>
                      {/* Status Cartão */}
                      <Cell val={row.statusCartao || '—'} src={s.statusCartao as Source}
                        cls={row.statusCartao?.includes('ativo') ? 'text-green-700' : row.statusCartao ? 'text-amber-700' : ''} />
                    </tr>
                  );
                })}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={14} className="text-center py-8 text-gray-400">
                      Nenhum dado encontrado para o período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Nota sobre campos */}
      {data && !loading && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Campos e fontes</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1 text-xs">
              <li><b>1QZ / Saldo Cartão</b> (amarelo) — lidos do arquivo <em>CONTROLE VEXPENSES</em> (tabs QUINZENAS e SALDO CARTAO)</li>
              <li><b>Reembolso</b> (azul) — soma de despesas reembolsáveis da API VExpenses para o período</li>
              <li><b>Carga Parcial / Final</b> (roxo) — calculados: Carga = 1QZ – Saldo Final – Saldo Cartão – Adiantamento; Carga Final = max(0, Carga) + Reembolso</li>
              <li><b>Saldo Reembolsar</b> — saldo histórico acumulado do PAINEL (não por período)</li>
              <li><b>Saldo Final</b> — não calculável via API isolada (exige extrato bancário completo)</li>
              <li><b>Centro Custo / Gestor / Direção / Status Cartão</b> — do PAINEL do CONTROLE (mais preciso que a API)</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
