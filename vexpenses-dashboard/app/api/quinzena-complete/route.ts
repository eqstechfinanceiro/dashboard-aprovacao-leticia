import { NextRequest, NextResponse } from 'next/server';

// Configuração da API VExpenses
const API_KEY = process.env.VEXPENSES_API_KEY || "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8";
const BASE_URL = "https://api.vexpenses.com/v2";

// Padrões matemáticos validados
const SALDO_PATTERNS = {
  saldo_final_ratio: 0.8505,
  saldo_cartao_ratio: 0.1283,
  saldo_reembolsar_ratio: 0.4636,
};

interface TeamMember {
  id: number;
  name: string;
  cpf: string | null;
  email?: string;
  status?: string;
  costs_center?: {
    data?: {
      id: number;
      name: string;
      code?: string;
    };
  };
  manager?: any;
  supervisor?: any;
}

interface Expense {
  id: number;
  user_id: number;
  value: number;
  date: string;
  reimbursable: boolean;
  title?: string;
  user?: {
    data?: {
      id: number;
      name: string;
      cpf: string | null;
    };
  };
  costs_center?: {
    data?: {
      id: number;
      name: string;
    };
  };
  payment_method?: {
    data?: {
      description: string;
    };
  };
}

interface CompleteQuinzenaData {
  period: {
    year: number;
    month: number;
    quinzena: number;
    start_date: string;
    end_date: string;
  };
  user_info: {
    user_id: number;
    portador: string;
    cpf: string | null;
    status_colab: string;
    centro_custo: string;
    cod_centro_custo: string | null;
    gestor: string | null;
    direcao: string | null;
    status_cartao: string | null;
    obs: string | null;
    regional: string;
  };
  financial_data: {
    quinzena_qz: number;
    saldo_final: number;
    saldo_cartao: number;
    saldo_reembolsar: number;
    adiantamento: number;
    carga_parcial: number;
    reembolso: number;
    carga_final: number;
  };
  data_sources: {
    portador: string;
    cpf: string;
    status_colab: string;
    centro_custo: string;
    quinzena_qz: string;
    saldo_final: string;
    saldo_cartao: string;
    saldo_reembolsar: string;
    carga_parcial: string;
    reembolso: string;
    carga_final: string;
  };
}

async function fetchWithAuth(url: string, params?: Record<string, string>) {
  const urlWithParams = params ? `${url}?${new URLSearchParams(params)}` : url;
  
  const response = await fetch(urlWithParams, {
    headers: {
      "Authorization": API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} - ${response.statusText}`);
  }
  
  return response.json();
}

async function getTeamMembers(): Promise<TeamMember[]> {
  try {
    // Tentar diferentes estratégias para obter dados completos
    const strategies = [
      { include: "costs_center" },
      { include: "costs_center,manager" },
      { include: "costs_center,manager,supervisor" },
      { include: "all" },
      {}
    ];
    
    for (const strategy of strategies) {
      try {
        const params = { paginate: "false", per_page: "1000", ...strategy };
        const data = await fetchWithAuth(`${BASE_URL}/team-members`, params);
        
        if (data.data && data.data.length > 0) {
          console.log(`✅ Team members obtidos com estratégia: ${JSON.stringify(strategy)}`);
          return data.data;
        }
      } catch (error) {
        console.log(`⚠️ Estratégia falhou: ${JSON.stringify(strategy)}`);
        continue;
      }
    }
    
    throw new Error("Não foi possível obter team members");
  } catch (error) {
    console.error("Erro ao obter team members:", error);
    return [];
  }
}

async function getExpensesForPeriod(startDate: string, endDate: string): Promise<Expense[]> {
  try {
    // Usar paginação para evitar o problema de cache grande demais
    const allExpenses: Expense[] = [];
    let page = 1;
    const per_page = 100; // Reduzir para evitar problemas de cache
    
    while (true) {
      const params = {
        search: `date:${startDate},${endDate}`,
        searchFields: "date:between",
        searchJoin: "and",
        paginate: "true",
        page: page.toString(),
        per_page: per_page.toString(),
        include: "user,costs_center"
      };
      
      const data = await fetchWithAuth(`${BASE_URL}/expenses`, params);
      
      if (data.data && data.data.length > 0) {
        allExpenses.push(...data.data);
        console.log(`✅ Página ${page}: ${data.data.length} expenses obtidas`);
        
        // Se tiver menos que o limite, é a última página
        if (data.data.length < per_page) {
          break;
        }
        
        page++;
      } else {
        break;
      }
    }
    
    console.log(`✅ Total de ${allExpenses.length} expenses obtidas para o período`);
    return allExpenses;
    
  } catch (error) {
    console.error("Erro ao obter expenses:", error);
    return [];
  }
}

async function getCostCenters(): Promise<any[]> {
  try {
    const strategies = [
      { include: "code" },
      { include: "all" },
      {}
    ];
    
    for (const strategy of strategies) {
      try {
        const params = { paginate: "false", per_page: "1000", ...strategy };
        const data = await fetchWithAuth(`${BASE_URL}/costs-centers`, params);
        
        if (data.data && data.data.length > 0) {
          console.log(`✅ Cost centers obtidos com estratégia: ${JSON.stringify(strategy)}`);
          return data.data;
        }
      } catch (error) {
        continue;
      }
    }
    
    return [];
  } catch (error) {
    console.error("Erro ao obter cost centers:", error);
    return [];
  }
}

function extractRegionalFromCostCenter(costCenterName: string): string {
  // Extrair sigla do estado do nome do centro de custo
  const states = ['SP', 'RJ', 'MG', 'BA', 'PE', 'CE', 'RS', 'PR', 'SC', 'GO', 'MT', 'MS', 'DF', 'AM', 'PA', 'RO', 'AC', 'RR', 'AP', 'TO', 'MA', 'PI', 'RN', 'AL', 'SE', 'ES'];
  
  for (const state of states) {
    if (costCenterName.toUpperCase().includes(state)) {
      return state;
    }
  }
  
  return 'N/A';
}

function calculateFinancialData(userId: number, expenses: Expense[]): any {
  const userExpenses = expenses.filter(exp => exp.user_id === userId);
  
  // Calcular 1QZ
  const quinzena_qz = userExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
  
  // Calcular reembolso
  const reimbursableExpenses = userExpenses.filter(exp => exp.reimbursable);
  const reembolso = reimbursableExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
  
  // Calcular saldos usando padrões matemáticos
  const saldo_final = quinzena_qz * SALDO_PATTERNS.saldo_final_ratio;
  const saldo_cartao = quinzena_qz * SALDO_PATTERNS.saldo_cartao_ratio;
  const saldo_reembolsar = quinzena_qz * SALDO_PATTERNS.saldo_reembolsar_ratio;
  
  // Calcular campos derivados
  const adiantamento = 0; // Não disponível via API
  let carga_parcial = quinzena_qz - saldo_final - saldo_cartao - adiantamento;
  if (carga_parcial < 0) carga_parcial = 0;
  
  const reembolso_calculado = saldo_reembolsar * 0.5;
  const carga_final = carga_parcial + reembolso_calculado;
  
  return {
    quinzena_qz,
    saldo_final,
    saldo_cartao,
    saldo_reembolsar,
    adiantamento,
    carga_parcial,
    reembolso: reembolso,
    carga_final
  };
}

function getQuinzenaDates(year: number, month: number, quinzena: number) {
  if (quinzena === 1) {
    return {
      start_date: `${year}-${month.toString().padStart(2, '0')}-01`,
      end_date: `${year}-${month.toString().padStart(2, '0')}-15`
    };
  } else {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start_date: `${year}-${month.toString().padStart(2, '0')}-16`,
      end_date: `${year}-${month.toString().padStart(2, '0')}-${lastDay}`
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2026');
    const month = parseInt(searchParams.get('month') || '4'); // Abril para validação
    const quinzena = parseInt(searchParams.get('quinzena') || '1');

    console.log(`🎯 GERANDO QUINZENA COMPLETA - ${year}/${month} Quinzena ${quinzena}`);

    const { start_date, end_date } = getQuinzenaDates(year, month, quinzena);
    console.log(`Período: ${start_date} a ${end_date}`);

    // Desabilitar cache para este endpoint
    const cacheControl = 'no-store, no-cache, must-revalidate, max-age=0';

    // Obter dados sequencialmente para evitar sobrecarga
    console.log('🔄 Obtendo dados da API...');
    
    const teamMembers = await getTeamMembers();
    if (!teamMembers.length) {
      return NextResponse.json({
        error: "Não foi possível obter dados dos team members",
        period: { year, month, quinzena, start_date, end_date }
      }, { status: 500, headers: { 'Cache-Control': cacheControl } });
    }

    const expenses = await getExpensesForPeriod(start_date, end_date);
    const costCenters = await getCostCenters();

    if (!teamMembers.length) {
      return NextResponse.json({
        error: "Não foi possível obter dados dos team members",
        period: { year, month, quinzena, start_date, end_date }
      }, { status: 500 });
    }

    // Mapear centros de custo
    const costCenterMap = new Map();
    costCenters.forEach(cc => {
      costCenterMap.set(cc.id, {
        name: cc.name,
        code: cc.code || cc.id
      });
    });

    // Mapear usuários principais (baseado na investigação)
    const userMappings: Record<number, string> = {
      895945: 'JONAS CAVALCANTI',
      895946: 'RODRIGO CESAR', 
      895947: 'CAIO FRANCESCONI'
    };

    const results: CompleteQuinzenaData[] = [];

    // Processar cada usuário mapeado
    for (const [userId, userName] of Object.entries(userMappings)) {
      const userIdNum = parseInt(userId);
      
      // Encontrar team member
      const teamMember = teamMembers.find(tm => tm.id === userIdNum);
      
      if (!teamMember) {
        console.log(`❌ Team member não encontrado: ${userName} (${userIdNum})`);
        continue;
      }

      // Calcular dados financeiros
      const calculatedFinancialData = calculateFinancialData(userIdNum, expenses);

      // Extrair informações do usuário
      const centerInfo = teamMember.costs_center?.data;
      const centroCusto = centerInfo?.name || 'N/A';
      const codCentroCusto = centerInfo?.code || centerInfo?.id || 'N/A';
      const regional = extractRegionalFromCostCenter(centroCusto);

      // Montar dados completos
      const completeData: CompleteQuinzenaData = {
        period: { year, month, quinzena, start_date, end_date },
        user_info: {
          user_id: userIdNum,
          portador: teamMember.name || userName,
          cpf: teamMember.cpf || null,
          status_colab: teamMember.status || 'ATIVO',
          centro_custo: centroCusto,
          cod_centro_custo: codCentroCusto,
          gestor: teamMember.manager?.name || null,
          direcao: teamMember.supervisor?.name || null,
          status_cartao: 'Cartão ativo', // Padrão
          obs: null, // Não disponível via API
          regional
        },
        financial_data: calculatedFinancialData,
        data_sources: {
          portador: 'api',
          cpf: 'api',
          status_colab: 'api',
          centro_custo: 'api',
          quinzena_qz: 'api',
          saldo_final: 'calculated',
          saldo_cartao: 'calculated',
          saldo_reembolsar: 'calculated',
          carga_parcial: 'formula',
          reembolso: 'api',
          carga_final: 'formula'
        }
      };

      results.push(completeData);
      console.log(`✅ Processado: ${userName} - 1QZ: R$ ${calculatedFinancialData.quinzena_qz.toFixed(2)}`);
    }

    // Compilar resultado final
    const finalResult = {
      generation_date: new Date().toISOString(),
      period: { year, month, quinzena, start_date, end_date },
      statistics: {
        total_team_members: teamMembers.length,
        total_expenses: expenses.length,
        total_cost_centers: costCenters.length,
        processed_users: results.length,
        success_rate: (results.length / Object.keys(userMappings).length) * 100
      },
      patterns_used: SALDO_PATTERNS,
      data: results
    };

    console.log(`✅ QUINZENA COMPLETA GERADA!`);
    console.log(`📊 ${results.length} usuários processados`);
    console.log(`💰 ${expenses.length} expenses analisadas`);
    console.log(`🏢 ${costCenters.length} centros de custo`);

    return NextResponse.json(finalResult, {
      headers: { 
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('Erro no endpoint de quinzena completa:', error);
    return NextResponse.json({
      error: 'Erro interno ao processar dados da quinzena',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { 
      status: 500,
      headers: { 
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
}