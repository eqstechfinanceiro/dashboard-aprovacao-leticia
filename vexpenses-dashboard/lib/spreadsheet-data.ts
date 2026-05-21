// Sistema de comparação de dados com planilhas Excel

export interface SpreadsheetData {
  nome: string;
  email?: string;
  cpf?: string;
  tipoUsuario?: string;
  statusCartao?: string;
  statusColab?: string;
  centroCusto?: string;
  situacao?: string;
  codCentroCusto?: string;
  gestor?: string;
  diretor?: string;
  direcao?: string;
  // Campos da planilha 1 (1QZ)
  saldoReembolsar?: string;
  saldoFinal?: string;
  qzAbril26?: string;
  saldoCartao?: string;
  adiantamento?: string;
  cargaParcial?: string;
  reembolso?: string;
  cargaFinal?: string;
  obs?: string;
  // Campos do PAINEL (planilha 2)
  regional?: string;
  cargaPainel?: string;
  descarga?: string;
  tarifa?: string;
  prestacao?: string;
  saldoPrestacao?: string;
  saldoCartaoPainel?: string;
  saldoFinalPainel?: string;
  primeiraQz?: string;
  segundaQz?: string;
  adicionaisPainel?: string;
  reembolsoPainel?: string;
}

// Tipos de correspondência de dados
export enum DataMatchType {
  MATCH = "match",           // Verde: API = Planilha
  DIFFERENT = "different",   // Amarelo: API ≠ Planilha
  NOT_AVAILABLE = "not_available", // Vermelho: Não disponível na API
  CALCULATED = "calculated"  // Roxo: Dado calculado (fórmula)
}

// Função para buscar dados da planilha da API
export async function fetchSpreadsheetData(sheet: 'planilha1' | 'planilha2'): Promise<SpreadsheetData[]> {
  try {
    const response = await fetch(`/api/spreadsheet-data?sheet=${sheet}`);
    if (!response.ok) {
      throw new Error('Failed to fetch spreadsheet data');
    }
    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('Error fetching spreadsheet data:', error);
    return [];
  }
}

// Função para comparar dados da API com planilha
export function compareWithSpreadsheet<T extends Record<string, any>>(
  apiData: T,
  spreadsheetData: T,
  field: keyof T
): DataMatchType {
  const apiValue = apiData[field];
  const spreadsheetValue = spreadsheetData[field];

  // Se não tem valor na API, é vermelho (não disponível)
  if (apiValue === undefined || apiValue === null || apiValue === "") {
    return DataMatchType.NOT_AVAILABLE;
  }

  // Se tem valor na API, compara com planilha
  if (apiValue === spreadsheetValue) {
    return DataMatchType.MATCH;
  }

  return DataMatchType.DIFFERENT;
}

// Função para obter classe CSS baseada no tipo de correspondência
export function getDataMatchColorClass(matchType: DataMatchType): string {
  switch (matchType) {
    case DataMatchType.MATCH:
      return "bg-green-100 text-green-800 border-green-300";
    case DataMatchType.DIFFERENT:
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case DataMatchType.NOT_AVAILABLE:
      return "bg-red-100 text-red-800 border-red-300";
    case DataMatchType.CALCULATED:
      return "bg-purple-100 text-purple-800 border-purple-300";
    default:
      return "";
  }
}
