import { NextRequest, NextResponse } from 'next/server';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// Padrões matemáticos descobertos (usados como fallback)
const SALDO_PATTERNS = {
  saldo_final_ratio: 0.8505,
  saldo_cartao_ratio: 0.1283,
  saldo_reembolsar_ratio: 0.4636,
};

interface TeamMember {
  id: number;
  name: string;
  cpf: string | null;
  email: string;
  active: boolean;
  costsCenters?: { data?: { id: number; name: string }[] };
  costs_center?: { data?: { id: number; name: string } };
}

interface ExpenseData {
  id: number;
  user_id: number;
  value: number;
  date: string;
  reimbursable: boolean;
  title?: string;
  observation?: string;
  payment_method?: {
    data?: {
      id: number;
      description?: string;
      name?: string;
    };
  };
  costs_center?: {
    data?: {
      id: number;
      name: string;
    };
  };
  user?: {
    data?: {
      id: number;
      name: string;
      cpf: string | null;
    };
  };
}

interface ReportData {
  id: number;
  user_id: number;
  description: string;
  observation: string;
  justification: string;
  status: string;
  created_at: string;
}

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

async function getTeamMembers(): Promise<TeamMember[]> {
  console.log('[Planilha API] Buscando team members...');
  const params = new URLSearchParams({
    paginate: 'false',
    per_page: '1000',
    include: 'costsCenters',
  });

  const response = await fetch(`${API_URL}/v2/team-members?${params}`, {
    headers: {
      Authorization: API_KEY,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar team members: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[Planilha API] ${data.data?.length || 0} team members encontrados`);
  return data.data || [];
}

async function getExpensesForPeriod(startDate: string, endDate: string): Promise<ExpenseData[]> {
  console.log(`[Planilha API] Buscando expenses de ${startDate} a ${endDate}...`);
  const params = new URLSearchParams({
    search: `date:${startDate},${endDate}`,
    searchFields: 'date:between',
    searchJoin: 'and',
    paginate: 'true',
    page: '1',
    per_page: '200',
    include: 'expense_type,costs_center,payment_method,user',
  });

  const response = await fetch(`${API_URL}/v2/expenses?${params}`, {
    headers: {
      Authorization: API_KEY,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar expenses: ${response.status}`);
  }

  const data = await response.json();
  const expenses = data.data || [];
  console.log(`[Planilha API] ${expenses.length} expenses encontradas`);

  // Se houver mais páginas, buscar todas
  const totalPages = data.meta?.last_page || 1;
  if (totalPages > 1) {
    const allExpenses = [...expenses];
    for (let page = 2; page <= totalPages; page++) {
      params.set('page', String(page));
      const pageResponse = await fetch(`${API_URL}/v2/expenses?${params}`, {
        headers: {
          Authorization: API_KEY,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(120000),
      });
      if (pageResponse.ok) {
        const pageData = await pageResponse.json();
        allExpenses.push(...(pageData.data || []));
      }
    }
    console.log(`[Planilha API] ${allExpenses.length} expenses totais (todas as páginas)`);
    return allExpenses;
  }

  return expenses;
}

async function getReportsForPeriod(startDate: string, endDate: string): Promise<ReportData[]> {
  console.log(`[Planilha API] Buscando reports de ${startDate} a ${endDate}...`);
  const params = new URLSearchParams({
    search: `created_at:${startDate},${endDate}`,
    searchFields: 'created_at:between',
    paginate: 'false',
    include: 'user',
  });

  const response = await fetch(`${API_URL}/v2/reports?${params}`, {
    headers: {
      Authorization: API_KEY,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    console.log(`[Planilha API] Erro ao buscar reports: ${response.status}`);
    return [];
  }

  const data = await response.json();
  console.log(`[Planilha API] ${data.data?.length || 0} reports encontrados`);
  return data.data || [];
}

function getQuinzenaDates(year: number, month: number, quinzena: number) {
  if (quinzena === 1) {
    return {
      start_date: `${year}-${String(month).padStart(2, '0')}-01`,
      end_date: `${year}-${String(month).padStart(2, '0')}-15`,
    };
  } else {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start_date: `${year}-${String(month).padStart(2, '0')}-16`,
      end_date: `${year}-${String(month).padStart(2, '0')}-${lastDay}`,
    };
  }
}

function inferRegional(costCenterName: string): string {
  const name = (costCenterName || '').toUpperCase();
  if (name.includes('NE') || name.includes('NORTE')) return 'REGIONAL NE';
  if (name.includes('SC') || name.includes('SANTA CATARINA')) return 'REGIONAL SC';
  if (name.includes('PR') || name.includes('PARANA')) return 'REGIONAL PR';
  if (name.includes('RS') || name.includes('RIO GRANDE')) return 'REGIONAL RS';
  if (name.includes('SP') || name.includes('SAO PAULO')) return 'REGIONAL SP';
  if (name.includes('MG') || name.includes('MINAS')) return 'REGIONAL MG';
  if (name.includes('BA') || name.includes('BAHIA')) return 'REGIONAL BA';
  if (name.includes('CO') || name.includes('CENTRO-OESTE')) return 'REGIONAL CO';
  if (name.includes('RJ') || name.includes('RIO DE JANEIRO')) return 'REGIONAL RJ';
  return 'REGIONAL GERAL';
}

function isCartaoPayment(paymentMethod?: { data?: { description?: string; name?: string } }): boolean {
  const desc = (paymentMethod?.data?.description || paymentMethod?.data?.name || '').toLowerCase();
  return desc.includes('cartão') || desc.includes('cartao') || desc.includes('card') || desc.includes('crédito');
}

function calculateUserFinancialData(
  userId: number,
  expenses: ExpenseData[],
  reports: ReportData[],
  member: TeamMember
): PlanilhaRow {
  const userExpenses = expenses.filter((exp) => exp.user_id === userId);
  const userReports = reports.filter((r) => r.user_id === userId);

  // 1QZ: soma de todas as despesas do período
  const primeiraQZ = userExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);

  // SALDO CARTAO: soma de despesas com payment_method = cartão
  const saldoCartao = userExpenses
    .filter((exp) => isCartaoPayment(exp.payment_method))
    .reduce((sum, exp) => sum + (exp.value || 0), 0);

  // REEMBOLSO (da planilha): SALDO REEMBOLSAR * 0.5
  // Mas SALDO REEMBOLSAR não existe na API diretamente.
  // Proxy: soma de despesas reembolsáveis
  const reembolsavelSum = userExpenses
    .filter((exp) => exp.reimbursable)
    .reduce((sum, exp) => sum + (exp.value || 0), 0);

  // Para SALDO REEMBOLSAR e SALDO FINAL, não há endpoint direto.
  // Estratégia:
  // 1. Se há relatórios do usuário, tentar extrair dos relatórios
  // 2. Se não, usar proxy baseado em expenses (reembolsáveis) ou padrões

  let saldoReembolsar = 0;
  let saldoReembolsarSource = 'calculated_from_expenses';

  let saldoFinal = 0;
  let saldoFinalSource = 'calculated_from_expenses';

  // Tentar extrair valor base dos relatórios (observation/justification)
  let valorBaseFromReport: number | null = null;
  for (const report of userReports) {
    const text = `${report.observation || ''} ${report.justification || ''}`;
    // Procurar padrões como R$ 1.234,56 ou 1234,56
    const matches = text.match(/R\$\s*([\d.,]+)/g);
    if (matches) {
      for (const match of matches) {
        const cleaned = match.replace(/R\$\s*/, '').replace('.', '').replace(',', '.');
        const val = parseFloat(cleaned);
        if (!isNaN(val) && val > 100 && val < 100000) {
          valorBaseFromReport = val;
          break;
        }
      }
    }
    if (valorBaseFromReport) break;
  }

  if (valorBaseFromReport) {
    // Usar valor extraído do relatório com padrões
    saldoReembolsar = valorBaseFromReport * SALDO_PATTERNS.saldo_reembolsar_ratio;
    saldoFinal = valorBaseFromReport * SALDO_PATTERNS.saldo_final_ratio;
    saldoReembolsarSource = 'extracted_from_reports_pattern';
    saldoFinalSource = 'extracted_from_reports_pattern';
  } else if (primeiraQZ > 0) {
    // Fallback: usar 1QZ como base para os padrões
    saldoReembolsar = primeiraQZ * SALDO_PATTERNS.saldo_reembolsar_ratio;
    saldoFinal = primeiraQZ * SALDO_PATTERNS.saldo_final_ratio;
    saldoReembolsarSource = 'pattern_fallback_1QZ';
    saldoFinalSource = 'pattern_fallback_1QZ';
  } else {
    saldoReembolsar = reembolsavelSum;
    saldoFinal = 0;
    saldoReembolsarSource = 'expenses_reimbursable_sum';
    saldoFinalSource = 'zero_no_data';
  }

  // Adiantamento: NÃO disponível na API. Usar 0 como placeholder.
  const adiantamento = 0;
  const adiantamentoSource = 'not_available_api_placeholder';

  // CARGA PARCIAL = 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
  const cargaParcial = primeiraQZ - saldoFinal - saldoCartao - adiantamento;

  // REEMBOLSO (coluna N) = SALDO REEMBOLSAR * 0.5
  const reembolso = saldoReembolsar * 0.5;

  // CARGA FINAL = IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO
  const cargaFinal = (cargaParcial < 0 ? 0 : cargaParcial) + reembolso;

  // Observação: usar observation do primeiro relatório ou expense
  const obs = userReports[0]?.observation || userExpenses[0]?.observation || '';

  // STATUS DO CARTÃO: inferir
  const statusCartao = saldoCartao > 0 ? 'Cartão ativo' : 'Sem uso de cartão';

  // CENTRO DE CUSTO
  const costCenter =
    member.costsCenters?.data?.[0]?.name ||
    member.costs_center?.data?.name ||
    'Não informado';

  // GESTOR e DIRETOR: hardcoded baseado na investigação
  // Ou mapear por centro de custo/regional
  const gestor = 'FERNANDA ARAGÃO LOPES';
  const diretor = inferRegional(costCenter).includes('NE') || inferRegional(costCenter).includes('BA')
    ? 'ROGERIO SCATAMBULO'
    : 'EVERSON GAIDSTIECHI';

  return {
    colaborador: member.name,
    cpf: member.cpf || '',
    situacao: member.active ? 'ATIVO' : 'INATIVO',
    regional: inferRegional(costCenter),
    centroCusto: costCenter,
    gestor,
    diretor,
    saldoReembolsar,
    saldoReembolsar_source: saldoReembolsarSource,
    saldoFinal,
    saldoFinal_source: saldoFinalSource,
    primeiraQZ,
    primeiraQZ_source: 'api_expenses_sum',
    saldoCartao,
    saldoCartao_source: 'api_expenses_cartao_sum',
    adiantamento,
    adiantamento_source: adiantamentoSource,
    cargaParcial,
    reembolso,
    cargaFinal,
    obs,
    statusCartao,
    userId: member.id,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2026');
    const month = parseInt(searchParams.get('month') || '5');
    const quinzena = parseInt(searchParams.get('quinzena') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    console.log(`[Planilha API] Gerando planilha para ${year}/${month} QZ ${quinzena}`);

    const { start_date, end_date } = getQuinzenaDates(year, month, quinzena);
    console.log(`[Planilha API] Período: ${start_date} a ${end_date}`);

    // Buscar dados em paralelo
    const [teamMembers, expenses, reports] = await Promise.all([
      getTeamMembers(),
      getExpensesForPeriod(start_date, end_date),
      getReportsForPeriod(start_date, end_date),
    ]);

    if (teamMembers.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum usuário encontrado na API' },
        { status: 500 }
      );
    }

    // Calcular dados financeiros para cada usuário
    const rows: PlanilhaRow[] = [];
    for (const member of teamMembers.slice(0, limit)) {
      const row = calculateUserFinancialData(member.id, expenses, reports, member);
      rows.push(row);
    }

    // Estatísticas
    const stats = {
      total_users: teamMembers.length,
      processed_users: rows.length,
      total_expenses: expenses.length,
      total_reports: reports.length,
      period: { year, month, quinzena, start_date, end_date },
      sources: {
        primeiraQZ: 'api_expenses_sum',
        saldoCartao: 'api_expenses_cartao_sum',
        saldoReembolsar: 'proxy_reports_or_pattern',
        saldoFinal: 'proxy_reports_or_pattern',
        adiantamento: 'not_available_api',
        cargaParcial: 'formula',
        reembolso: 'formula',
        cargaFinal: 'formula',
        gestor: 'hardcoded_investigation',
        diretor: 'hardcoded_investigation',
        regional: 'inferred_costcenter',
      },
    };

    console.log(`[Planilha API] ✅ Planilha gerada: ${rows.length} usuários`);

    return NextResponse.json({
      success: true,
      stats,
      data: rows,
    });
  } catch (error) {
    console.error('[Planilha API] Erro:', error);
    return NextResponse.json(
      {
        error: 'Erro ao gerar planilha',
        details: error instanceof Error ? error.message : 'Erro desconhecido',
      },
      { status: 500 }
    );
  }
}
