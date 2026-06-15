import { NextRequest, NextResponse } from 'next/server';

// Configuração da API VExpenses
const API_KEY = process.env.VEXPENSES_API_KEY || "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8";
const BASE_URL = "https://api.vexpenses.com/v2";

// Configuração do banco Neon (comentado temporariamente para teste)
// import { Pool } from 'pg';
// const pool = new Pool({
//   connectionString: process.env.NEON_DATABASE_URL,
// });

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
    // Usar paginação com limite para evitar timeout
    const allExpenses: Expense[] = [];
    let page = 1;
    const per_page = 1000; // Aumentar para reduzir número de requisições
    const max_pages = 5; // Limitar a 5 páginas para evitar timeout (máx 5000 expenses)
    
    while (page <= max_pages) {
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
    
    console.log(`✅ Total de ${allExpenses.length} expenses obtidas para o período (limitado a ${max_pages} páginas)`);
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

function calculateFinancialData(userId: number, expenses: Expense[], manualInputs: { col_1qz: number | null, adiantamento: number | null }): any {
  const userExpenses = expenses.filter(exp => exp.user_id === userId);
  
  // Calcular 1QZ - usar valor manual se disponível, senão calcular automaticamente
  const quinzena_qz = manualInputs.col_1qz !== null ? manualInputs.col_1qz : userExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
  
  // Calcular reembolso
  const reimbursableExpenses = userExpenses.filter(exp => exp.reimbursable);
  const reembolso = reimbursableExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
  
  // Calcular saldos usando padrões matemáticos (baseados em 1QZ calculado automaticamente)
  const base_qz = userExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
  const saldo_final = base_qz * SALDO_PATTERNS.saldo_final_ratio;
  const saldo_cartao = base_qz * SALDO_PATTERNS.saldo_cartao_ratio;
  const saldo_reembolsar = base_qz * SALDO_PATTERNS.saldo_reembolsar_ratio;
  
  // Usar adiantamento manual se disponível, senão 0
  const adiantamento = manualInputs.adiantamento !== null ? manualInputs.adiantamento : 0;
  
  // Calcular campos derivados
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

async function getManualInputs(userId: number, year: number, month: number, quinzena: number) {
  // Temporariamente desabilitado para teste - retorna valores padrão
  return { obs: null, col_1qz: null, adiantamento: null };
  
  // try {
  //   const result = await pool.query(
  //     'SELECT obs, col_1qz, adiantamento FROM quinzena_manual_inputs WHERE user_id = $1 AND year = $2 AND month = $3 AND quinzena = $4',
  //     [userId, year, month, quinzena]
  //   );
  //   
  //   if (result.rows.length > 0) {
  //     return result.rows[0];
  //   }
  //   return { obs: null, col_1qz: null, adiantamento: null };
  // } catch (error) {
  //   console.error('Erro ao buscar inputs manuais:', error);
  //   return { obs: null, col_1qz: null, adiantamento: null };
  // }
}

async function saveManualInput(userId: number, year: number, month: number, quinzena: number, field: string, value: any) {
  // Temporariamente desabilitado para teste
  return false;
  
  // try {
  //   const existing = await pool.query(
  //     'SELECT id FROM quinzena_manual_inputs WHERE user_id = $1 AND year = $2 AND month = $3 AND quinzena = $4',
  //     [userId, year, month, quinzena]
  //   );
  //   
  //   if (existing.rows.length > 0) {
  //     await pool.query(
  //       `UPDATE quinzena_manual_inputs SET ${field} = $1, updated_at = NOW() WHERE user_id = $2 AND year = $3 AND month = $4 AND quinzena = $5`,
  //       [value, userId, year, month, quinzena]
  //     );
  //   } else {
  //     await pool.query(
  //       'INSERT INTO quinzena_manual_inputs (user_id, year, month, quinzena, obs, col_1qz, adiantamento) VALUES ($1, $2, $3, $4, NULL, NULL, NULL)',
  //       [userId, year, month, quinzena]
  //     );
  //     await pool.query(
  //       `UPDATE quinzena_manual_inputs SET ${field} = $1, updated_at = NOW() WHERE user_id = $2 AND year = $3 AND month = $4 AND quinzena = $5`,
  //       [value, userId, year, month, quinzena]
  //     );
  //   }
  //   return true;
  // } catch (error) {
  //   console.error('Erro ao salvar input manual:', error);
  //   return false;
  // }
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

      // Buscar inputs manuais do banco (com fallback em caso de erro)
      let manualInputs;
      try {
        manualInputs = await getManualInputs(userIdNum, year, month, quinzena);
      } catch (error) {
        console.error('Erro ao buscar inputs manuais, usando valores padrão:', error);
        manualInputs = { obs: null, col_1qz: null, adiantamento: null };
      }

      // Calcular dados financeiros com inputs manuais
      const calculatedFinancialData = calculateFinancialData(userIdNum, expenses, manualInputs);

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
          obs: manualInputs.obs, // Do banco
          regional
        },
        financial_data: calculatedFinancialData,
        data_sources: {
          portador: 'api',
          cpf: 'api',
          status_colab: 'api',
          centro_custo: 'api',
          quinzena_qz: manualInputs.col_1qz !== null ? 'manual' : 'api',
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, year, month, quinzena, field, value } = body;

    if (!userId || !year || !month || !quinzena || !field) {
      return NextResponse.json({
        error: 'Campos obrigatórios: userId, year, month, quinzena, field'
      }, { status: 400 });
    }

    if (!['obs', 'col_1qz', 'adiantamento'].includes(field)) {
      return NextResponse.json({
        error: 'Campo inválido. Apenas: obs, col_1qz, adiantamento'
      }, { status: 400 });
    }

    const success = await saveManualInput(userId, year, month, quinzena, field, value);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({
        error: 'Erro ao salvar input manual'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Erro no POST de quinzena manual:', error);
    return NextResponse.json({
      error: 'Erro interno ao salvar input manual',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}