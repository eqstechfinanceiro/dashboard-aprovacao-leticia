/**
 * Funções para calcular campos financeiros da planilha usando a API VExpenses
 */

export interface ExpenseData {
  id: number;
  user_id: number;
  value: number;
  date: string;
  reimbursable: boolean;
  payment_method?: {
    data?: {
      description: string;
    };
  };
  costs_center?: {
    data?: {
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

export interface UserFinancialData {
  userId: number;
  userName: string;
  userCpf: string | null;
  quinzena1Value: number;      // 1QZ - soma de despesas da 1ª quinzena
  quinzena2Value: number;      // 2QZ - soma de despesas da 2ª quinzena
  saldoCartao: number;         // SALDO CARTAO - soma de despesas com cartão
  reembolso: number;           // REEMBOLSO - soma de despesas reembolsáveis
  totalDespesas: number;       // Total de despesas no período
}

/**
 * Calcula os dados financeiros por usuário para um período específico
 * @param expenses - Lista de despesas da API VExpenses
 * @param year - Ano (ex: 2026)
 * @param month - Mês (ex: 4 para abril)
 * @returns Map de userId -> UserFinancialData
 */
export function calculateUserFinancialData(
  expenses: ExpenseData[],
  year: number,
  month: number,
  dayStart: number = 1,
  dayEnd: number = 15
): Map<number, UserFinancialData> {
  const userData = new Map<number, UserFinancialData>();

  // Filtrar despesas do período
  const periodStart = new Date(year, month - 1, dayStart);
  const periodEnd = new Date(year, month - 1, dayEnd);

  const periodExpenses = expenses.filter(exp => {
    const expDate = new Date(exp.date);
    return expDate >= periodStart && expDate <= periodEnd;
  });

  // Calcular datas das quinzenas
  const quinzena1Start = new Date(year, month - 1, dayStart);
  const quinzena1End = new Date(year, month - 1, dayEnd);
  const quinzena2Start = new Date(year, month - 1, dayEnd + 1);
  const quinzena2End = new Date(year, month, 0); // Último dia do mês

  // Processar cada despesa
  for (const exp of periodExpenses) {
    const userId = exp.user_id;
    const userName = exp.user?.data?.name || 'Unknown';
    const userCpf = exp.user?.data?.cpf || null;
    const expDate = new Date(exp.date);
    const isCartao = exp.payment_method?.data?.description?.toLowerCase().includes('cartão') ||
                     exp.payment_method?.data?.description?.toLowerCase().includes('card');

    // Inicializar dados do usuário se não existirem
    if (!userData.has(userId)) {
      userData.set(userId, {
        userId,
        userName,
        userCpf,
        quinzena1Value: 0,
        quinzena2Value: 0,
        saldoCartao: 0,
        reembolso: 0,
        totalDespesas: 0,
      });
    }

    const userFinData = userData.get(userId)!;

    // Adicionar ao total
    userFinData.totalDespesas += exp.value;

    // Verificar quinzena
    if (expDate >= quinzena1Start && expDate <= quinzena1End) {
      userFinData.quinzena1Value += exp.value;
    } else if (expDate >= quinzena2Start && expDate <= quinzena2End) {
      userFinData.quinzena2Value += exp.value;
    }

    // Verificar se é cartão
    if (isCartao) {
      userFinData.saldoCartao += exp.value;
    }

    // Verificar se é reembolsável
    if (exp.reimbursable) {
      userFinData.reembolso += exp.value;
    }
  }

  return userData;
}

/**
 * Calcula a 1QZ (primeira quinzena) para um usuário específico
 * @param expenses - Lista de despesas da API VExpenses
 * @param userId - ID do usuário
 * @param year - Ano
 * @param month - Mês
 * @param dayStart - Dia inicial (padrão: 1)
 * @param dayEnd - Dia final (padrão: 15)
 * @returns Valor total da 1ª quinzena
 */
export function calculateQuinzena1(
  expenses: ExpenseData[],
  userId: number,
  year: number,
  month: number,
  dayStart: number = 1,
  dayEnd: number = 15
): number {
  const quinzena1Start = new Date(year, month - 1, dayStart);
  const quinzena1End = new Date(year, month - 1, dayEnd);

  return expenses
    .filter(exp => {
      const expDate = new Date(exp.date);
      return (
        exp.user_id === userId &&
        expDate.getFullYear() === year &&
        expDate.getMonth() + 1 === month &&
        expDate >= quinzena1Start &&
        expDate <= quinzena1End
      );
    })
    .reduce((sum, exp) => sum + exp.value, 0);
}

/**
 * Calcula o saldo do cartão para um usuário específico
 * @param expenses - Lista de despesas da API VExpenses
 * @param userId - ID do usuário
 * @param year - Ano
 * @param month - Mês
 * @param dayStart - Dia inicial (padrão: 1)
 * @param dayEnd - Dia final (padrão: 15)
 * @returns Valor total de despesas com cartão
 */
export function calculateSaldoCartao(
  expenses: ExpenseData[],
  userId: number,
  year: number,
  month: number,
  dayStart: number = 1,
  dayEnd: number = 15
): number {
  const periodStart = new Date(year, month - 1, dayStart);
  const periodEnd = new Date(year, month - 1, dayEnd);

  return expenses
    .filter(exp => {
      const expDate = new Date(exp.date);
      const isCartao = exp.payment_method?.data?.description?.toLowerCase().includes('cartão') ||
                       exp.payment_method?.data?.description?.toLowerCase().includes('card');
      return (
        exp.user_id === userId &&
        expDate >= periodStart &&
        expDate <= periodEnd &&
        isCartao
      );
    })
    .reduce((sum, exp) => sum + exp.value, 0);
}

/**
 * Calcula o reembolso para um usuário específico
 * @param expenses - Lista de despesas da API VExpenses
 * @param userId - ID do usuário
 * @param year - Ano
 * @param month - Mês
 * @param dayStart - Dia inicial (padrão: 1)
 * @param dayEnd - Dia final (padrão: 15)
 * @returns Valor total de despesas reembolsáveis
 */
export function calculateReembolso(
  expenses: ExpenseData[],
  userId: number,
  year: number,
  month: number,
  dayStart: number = 1,
  dayEnd: number = 15
): number {
  const periodStart = new Date(year, month - 1, dayStart);
  const periodEnd = new Date(year, month - 1, dayEnd);

  return expenses
    .filter(exp => {
      const expDate = new Date(exp.date);
      return (
        exp.user_id === userId &&
        expDate >= periodStart &&
        expDate <= periodEnd &&
        exp.reimbursable
      );
    })
    .reduce((sum, exp) => sum + exp.value, 0);
}

/**
 * Calcula CARGA, DESCARGA e TARIFA para um usuário em um período
 * Baseado na análise da planilha EXTRATO
 * @param expenses - Lista de despesas da API VExpenses
 * @param userId - ID do usuário
 * @param year - Ano
 * @param month - Mês
 * @returns Objeto com carga, descarga e tarifa
 */
export function calculateCargaDescargaTarifa(
  expenses: ExpenseData[],
  userId: number,
  year: number,
  month: number
) {
  let carga = 0;
  let descarga = 0;
  let tarifa = 0;

  const periodExpenses = expenses.filter(exp => {
    const expDate = new Date(exp.date);
    return (
      exp.user_id === userId &&
      expDate.getFullYear() === year &&
      expDate.getMonth() + 1 === month
    );
  });

  for (const exp of periodExpenses) {
    // Inferir tipo de transação baseado na descrição e valor
    const description = (exp.title || '').toLowerCase();
    const value = exp.value;

    // CARGA: transferências positivas para o usuário
    if (description.includes('transf.') || description.includes('carga') || description.includes('quinzena')) {
      if (value > 0) {
        carga += value;
      }
    }
    // DESCARGA: despesas negativas ou saques
    else if (description.includes('saque') || description.includes('estorno') || description.includes('descarga')) {
      if (value > 0) {
        descarga += value;
      }
    }
    // TARIFA: taxas e tarifas
    else if (description.includes('tarifa') || description.includes('taxa')) {
      if (value > 0) {
        tarifa += value;
      }
    }
    // Despesas normais são consideradas descarga
    else if (value > 0 && !exp.reimbursable) {
      descarga += value;
    }
  }

  return { carga, descarga, tarifa };
}

/**
 * Calcula SALDO FINAL para um usuário
 * Baseado na análise da planilha: SALDO FINAL = CARGA - DESCARGA - TARIFA
 * @param expenses - Lista de despesas da API VExpenses
 * @param userId - ID do usuário
 * @param year - Ano
 * @param month - Mês
 * @returns Saldo final calculado
 */
export function calculateSaldoFinal(
  expenses: ExpenseData[],
  userId: number,
  year: number,
  month: number
): number {
  const { carga, descarga, tarifa } = calculateCargaDescargaTarifa(expenses, userId, year, month);
  return carga - descarga - tarifa;
}

/**
 * Calcula SALDO REEMBOLSAR para um usuário
 * Baseado na análise da planilha: Similar ao SALDO FINAL mas focado em reembolsáveis
 * @param expenses - Lista de despesas da API VExpenses
 * @param userId - ID do usuário
 * @param year - Ano
 * @param month - Mês
 * @returns Saldo a reembolsar calculado
 */
export function calculateSaldoReembolsar(
  expenses: ExpenseData[],
  userId: number,
  year: number,
  month: number
): number {
  const { carga, descarga, tarifa } = calculateCargaDescargaTarifa(expenses, userId, year, month);

  // Considerar apenas despesas reembolsáveis para o cálculo
  const descargaReembolsavel = expenses
    .filter(exp => {
      const expDate = new Date(exp.date);
      return (
        exp.user_id === userId &&
        expDate.getFullYear() === year &&
        expDate.getMonth() + 1 === month &&
        exp.reimbursable &&
        exp.value > 0
      );
    })
    .reduce((sum, exp) => sum + exp.value, 0);

  return carga - descargaReembolsavel - tarifa;
}

/**
 * Calcula todos os campos financeiros da planilha 1 para um usuário
 * @param expenses - Lista de despesas da API VExpenses
 * @param userId - ID do usuário
 * @param year - Ano
 * @param month - Mês
 * @param dayStart - Dia inicial (padrão: 1)
 * @param dayEnd - Dia final (padrão: 15)
 * @param adiantamentoManual - Adiantamento (manual, não disponível na API ainda)
 * @returns Objeto com todos os campos calculados
 */
export function calculatePlanilha1Fields(
  expenses: ExpenseData[],
  userId: number,
  year: number,
  month: number,
  dayStart: number = 1,
  dayEnd: number = 15,
  adiantamentoManual: number = 0
) {
  const quinzena1 = calculateQuinzena1(expenses, userId, year, month, dayStart, dayEnd);
  const saldoCartao = calculateSaldoCartao(expenses, userId, year, month, dayStart, dayEnd);
  const reembolso = calculateReembolso(expenses, userId, year, month, dayStart, dayEnd);
  const saldoFinal = calculateSaldoFinal(expenses, userId, year, month, dayStart, dayEnd);
  const saldoReembolsar = calculateSaldoReembolsar(expenses, userId, year, month, dayStart, dayEnd);

  // CARGA PARCIAL = 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
  const cargaParcial = quinzena1 - saldoFinal - saldoCartao - adiantamentoManual;

  // CARGA FINAL = IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO
  const cargaFinal = (cargaParcial < 0 ? 0 : cargaParcial) + reembolso;

  return {
    quinzena1,           // 1QZ DE ABRIL 26
    saldoCartao,         // SALDO CARTAO
    reembolso,           // REEMBOLSO
    cargaParcial,        // CARGA PARCIAL
    cargaFinal,          // CARGA FINAL
    saldoReembolsar,     // SALDO REEMBOLSAR (calculado via API)
    saldoFinal,          // SALDO FINAL (calculado via API)
    adiantamento: adiantamentoManual,  // ADIANTAMENTO (manual por enquanto)
  };
}
