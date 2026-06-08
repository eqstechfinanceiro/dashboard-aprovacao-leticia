'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';

interface PlanilhaRow {
  colaborador: string;
  cpf: string;
  situacao: string;
  regional: string;
  centroCusto: string;
  gestor: string;
  diretor: string;
  saldoReembolsar: number;
  saldoReembolsar_source: string;
  saldoFinal: number;
  saldoFinal_source: string;
  primeiraQZ: number;
  primeiraQZ_source: string;
  saldoCartao: number;
  saldoCartao_source: string;
  adiantamento: number;
  adiantamento_source: string;
  cargaParcial: number;
  reembolso: number;
  cargaFinal: number;
  obs: string;
  statusCartao: string;
  userId: number;
}

interface ApiResponse {
  success: boolean;
  stats: {
    total_users: number;
    processed_users: number;
    total_expenses: number;
    total_reports: number;
    period: {
      year: number;
      month: number;
      quinzena: number;
      start_date: string;
      end_date: string;
    };
    sources: Record<string, string>;
  };
  data: PlanilhaRow[];
}

export default function PlanilhaQuinzenalPage() {
  const [data, setData] = useState<PlanilhaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ApiResponse['stats'] | null>(null);
  
  // Filtros
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);
  const [quinzena, setQuinzena] = useState(1);
  const [limit, setLimit] = useState(50);

  // Edição manual
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editedData, setEditedData] = useState<Partial<PlanilhaRow>>({});

  const fetchPlanilha = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        quinzena: String(quinzena),
        limit: String(limit),
      });

      const response = await fetch(`/api/vexpenses/planilha-completa?${params}`);
      const result: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao buscar dados');
      }

      setData(result.data);
      setStats(result.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanilha();
  }, [year, month, quinzena, limit]);

  const handleEdit = (row: PlanilhaRow, index: number) => {
    setEditingRow(index);
    setEditedData({
      adiantamento: row.adiantamento,
      statusCartao: row.statusCartao,
    });
  };

  const handleSave = (index: number) => {
    const newData = [...data];
    newData[index] = { ...newData[index], ...editedData };
    setData(newData);
    setEditingRow(null);
    setEditedData({});
  };

  const handleCancel = () => {
    setEditingRow(null);
    setEditedData({});
  };

  const getSourceBadge = (source: string) => {
    const colors: Record<string, string> = {
      'api_expenses_sum': 'bg-green-100 text-green-800',
      'api_expenses_cartao_sum': 'bg-green-100 text-green-800',
      'extracted_from_reports_pattern': 'bg-blue-100 text-blue-800',
      'pattern_fallback_1QZ': 'bg-yellow-100 text-yellow-800',
      'expenses_reimbursable_sum': 'bg-yellow-100 text-yellow-800',
      'zero_no_data': 'bg-gray-100 text-gray-800',
      'not_available_api_placeholder': 'bg-red-100 text-red-800',
      'formula': 'bg-purple-100 text-purple-800',
      'hardcoded_investigation': 'bg-orange-100 text-orange-800',
      'inferred_costcenter': 'bg-orange-100 text-orange-800',
    };
    const color = colors[source] || 'bg-gray-100 text-gray-800';
    return (
      <span className={`text-xs px-2 py-1 rounded ${color}`}>
        {source}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-4 text-lg">Carregando planilha...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-bold mb-2">Erro</h2>
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchPlanilha}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Planilha Quinzenal - Clone Automatizado</h1>
        
        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Ano</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border rounded px-3 py-2 w-24"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Mês</label>
              <input
                type="number"
                min="1"
                max="12"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="border rounded px-3 py-2 w-24"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quinzena</label>
              <select
                value={quinzena}
                onChange={(e) => setQuinzena(Number(e.target.value))}
                className="border rounded px-3 py-2 w-32"
              >
                <option value={1}>1ª Quinzena</option>
                <option value={2}>2ª Quinzena</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Limite</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="border rounded px-3 py-2 w-24"
              />
            </div>
            <button
              onClick={fetchPlanilha}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Atualizar
            </button>
          </div>
        </div>

        {/* Estatísticas */}
        {stats && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-bold text-blue-900 mb-2">Estatísticas</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Período:</span>
                <span className="ml-2 font-medium">{stats.period.start_date} a {stats.period.end_date}</span>
              </div>
              <div>
                <span className="text-blue-700">Usuários totais:</span>
                <span className="ml-2 font-medium">{stats.total_users}</span>
              </div>
              <div>
                <span className="text-blue-700">Processados:</span>
                <span className="ml-2 font-medium">{stats.processed_users}</span>
              </div>
              <div>
                <span className="text-blue-700">Expenses:</span>
                <span className="ml-2 font-medium">{stats.total_expenses}</span>
              </div>
            </div>
          </div>
        )}

        {/* Legenda de fontes */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="font-bold text-gray-900 mb-2">Fontes de Dados</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded">api_expenses_sum: Dados diretos da API</span>
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">extracted_from_reports_pattern: Extraído de relatórios</span>
            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">pattern_fallback_1QZ: Padrão matemático (aproximado)</span>
            <span className="bg-red-100 text-red-800 px-2 py-1 rounded">not_available_api: Não disponível na API (manual)</span>
            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">formula: Calculado automaticamente</span>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">A</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">B</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">C</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">D</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">E</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">F</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">G</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">H</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">I</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">J</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">K</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">L</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">M</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">N</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">O</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">P</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Q</th>
            </tr>
            <tr className="bg-gray-50">
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">COLABORADOR</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">CPF</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">SITUAÇÃO</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">REGIONAL</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">CENTRO DE CUSTO</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">GESTOR</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">DIRETOR</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">SALDO REEMBOLSAR</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">SALDO FINAL</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">1ª QZ</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">SALDO CARTAO</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">ADIANTAMENTO</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">CARGA PARCIAL</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">REEMBOLSO</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">CARGA FINAL</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">OBS</th>
              <th className="px-4 py-1 text-left text-xs font-medium text-gray-600">STATUS CARTÃO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, index) => (
              <tr key={row.userId} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm">{row.colaborador}</td>
                <td className="px-4 py-2 text-sm">{row.cpf}</td>
                <td className="px-4 py-2 text-sm">
                  <span className={`px-2 py-1 rounded text-xs ${row.situacao === 'ATIVO' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {row.situacao}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm">{row.regional}</td>
                <td className="px-4 py-2 text-sm">{row.centroCusto}</td>
                <td className="px-4 py-2 text-sm">{row.gestor}</td>
                <td className="px-4 py-2 text-sm">{row.diretor}</td>
                <td className="px-4 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{formatCurrency(row.saldoReembolsar)}</span>
                    {getSourceBadge(row.saldoReembolsar_source)}
                  </div>
                </td>
                <td className="px-4 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{formatCurrency(row.saldoFinal)}</span>
                    {getSourceBadge(row.saldoFinal_source)}
                  </div>
                </td>
                <td className="px-4 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{formatCurrency(row.primeiraQZ)}</span>
                    {getSourceBadge(row.primeiraQZ_source)}
                  </div>
                </td>
                <td className="px-4 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{formatCurrency(row.saldoCartao)}</span>
                    {getSourceBadge(row.saldoCartao_source)}
                  </div>
                </td>
                <td className="px-4 py-2 text-sm">
                  {editingRow === index ? (
                    <input
                      type="number"
                      value={editedData.adiantamento ?? row.adiantamento}
                      onChange={(e) => setEditedData({ ...editedData, adiantamento: Number(e.target.value) })}
                      className="border rounded px-2 py-1 w-24"
                    />
                  ) : (
                    <div className="flex flex-col">
                      <span className="font-medium">{formatCurrency(row.adiantamento)}</span>
                      {getSourceBadge(row.adiantamento_source)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-sm font-medium">{formatCurrency(row.cargaParcial)}</td>
                <td className="px-4 py-2 text-sm font-medium">{formatCurrency(row.reembolso)}</td>
                <td className="px-4 py-2 text-sm font-medium">{formatCurrency(row.cargaFinal)}</td>
                <td className="px-4 py-2 text-sm max-w-xs truncate" title={row.obs}>{row.obs}</td>
                <td className="px-4 py-2 text-sm">
                  {editingRow === index ? (
                    <input
                      type="text"
                      value={editedData.statusCartao ?? row.statusCartao}
                      onChange={(e) => setEditedData({ ...editedData, statusCartao: e.target.value })}
                      className="border rounded px-2 py-1 w-32"
                    />
                  ) : (
                    <span className={`px-2 py-1 rounded text-xs ${row.statusCartao === 'Cartão ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {row.statusCartao}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-sm">
                  {editingRow === index ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(index)}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(row, index)}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                    >
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resumo */}
      <div className="mt-8 bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-4">Resumo da Automação</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded">
            <h4 className="font-medium text-green-900">100% Automatizado (9 colunas)</h4>
            <p className="text-sm text-green-700">COLABORADOR, CPF, SITUAÇÃO, REGIONAL, CENTRO DE CUSTO, GESTOR, DIRETOR, 1ª QZ, OBS</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded">
            <h4 className="font-medium text-yellow-900">Proxy/Aproximado (3 colunas)</h4>
            <p className="text-sm text-yellow-700">SALDO REEMBOLSAR, SALDO FINAL, SALDO CARTAO (padrões matemáticos)</p>
          </div>
          <div className="bg-red-50 p-4 rounded">
            <h4 className="font-medium text-red-900">Manual (2 colunas)</h4>
            <p className="text-sm text-red-700">ADIANTAMENTO, STATUS DO CARTÃO (não disponível na API)</p>
          </div>
        </div>
        <div className="mt-4 text-sm text-gray-600">
          <strong>Total:</strong> 88.2% automatizável (15/17 colunas)
        </div>
      </div>
    </div>
  );
}
