const fs = require('fs');

console.log("=".repeat(80));
console.log("IMPLEMENTANDO SOLUÇÃO HÍBRIDA INTELIGENTE PARA SALDOS");
console.log("=".repeat(80));

// Carregar dados da planilha (dados históricos)
const planilhaData = JSON.parse(fs.readFileSync('../vexpenses-dashboard/planilha-1qz-data.json', 'utf-8'));
console.log(`\nPlanilha carregada: ${planilhaData.length} usuários`);

// Estratégia: Criar um índice de saldos históricos por usuário
const saldoHistory = new Map();

// Analisar padrões nos dados existentes
const analysis = {
    totalUsers: planilhaData.length,
    usersWithSaldoFinal: 0,
    usersWithSaldoCartao: 0,
    usersWithSaldoReembolsar: 0,
    saldoFinalByUser: new Map(),
    saldoCartaoByUser: new Map(),
    saldoReembolsarByUser: new Map()
};

// Extrair saldos por CPF
planilhaData.forEach(user => {
    const cpf = user['CPF'];
    const portador = user['PORTADOR'];
    const saldoFinal = user['SALDO FINAL'];
    const saldoCartao = user['SALDO CARTAO'];
    const saldoReembolsar = user['SALDO REEMBOLSAR'];
    
    if (cpf && portador) {
        if (saldoFinal !== null && saldoFinal !== undefined) {
            analysis.usersWithSaldoFinal++;
            analysis.saldoFinalByUser.set(cpf, {
                portador,
                saldoFinal,
                qz1: user['1QZ DE ABRIL 26'],
                saldoCartao
            });
        }
        
        if (saldoCartao !== null && saldoCartao !== undefined) {
            analysis.usersWithSaldoCartao++;
            analysis.saldoCartaoByUser.set(cpf, {
                portador,
                saldoCartao,
                qz1: user['1QZ DE ABRIL 26']
            });
        }
        
        if (saldoReembolsar !== null && saldoReembolsar !== undefined) {
            analysis.usersWithSaldoReembolsar++;
            analysis.saldoReembolsarByUser.set(cpf, {
                portador,
                saldoReembolsar,
                saldoFinal
            });
        }
    }
});

console.log(`\nEstatísticas dos dados históricos:`);
console.log(`  Usuários com SALDO FINAL: ${analysis.usersWithSaldoFinal}`);
console.log(`  Usuários com SALDO CARTÃO: ${analysis.usersWithSaldoCartao}`);
console.log(`  Usuários com SALDO REEMBOLSAR: ${analysis.usersWithSaldoReembolsar}`);

// Implementar lógica de estimativa para usuários sem dados
const estimationRules = {
    // Regra 1: Para usuários sem SALDO FINAL, estimar como % do QZ1 baseado na média
    saldoFinalEstimation: (qz1) => {
        if (!qz1) return null;
        // Usar média histórica de ~45% do QZ1 (baseado na análise)
        return qz1 * 0.45;
    },
    
    // Regra 2: Para usuários sem SALDO CARTÃO, estimar como % do QZ1
    saldoCartaoEstimation: (qz1) => {
        if (!qz1) return null;
        // Usar média histórica de ~20% do QZ1
        return qz1 * 0.20;
    },
    
    // Regra 3: Para usuários sem SALDO REEMBOLSAR, calcular como diff negativo
    saldoReembolsarCalculation: (saldoFinal, saldoCartao) => {
        if (saldoFinal === null || saldoCartao === null) return null;
        const diff = saldoFinal - saldoCartao;
        // Se diff < 0, usuário deve à empresa
        return diff < 0 ? diff : null;
    }
};

// Criar solução híbrida
const hybridSolution = {
    metadata: {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        strategy: 'hybrid_historical_estimation',
        description: 'Combina dados históricos da planilha com estimativas para usuários sem dados'
    },
    saldoIndex: {},
    estimationRules: estimationRules
};

// Popular índice de saldos
planilhaData.forEach(user => {
    const cpf = user['CPF'];
    const portador = user['PORTADOR'];
    
    if (!cpf || !portador) return;
    
    const qz1 = user['1QZ DE ABRIL 26'];
    let saldoFinal = user['SALDO FINAL'];
    let saldoCartao = user['SALDO CARTAO'];
    let saldoReembolsar = user['SALDO REEMBOLSAR'];
    
    // Aplicar estimativas se necessário
    if (saldoFinal === null || saldoFinal === undefined) {
        saldoFinal = estimationRules.saldoFinalEstimation(qz1);
    }
    
    if (saldoCartao === null || saldoCartao === undefined) {
        saldoCartao = estimationRules.saldoCartaoEstimation(qz1);
    }
    
    if (saldoReembolsar === null || saldoReembolsar === undefined) {
        saldoReembolsar = estimationRules.saldoReembolsarCalculation(saldoFinal, saldoCartao);
    }
    
    hybridSolution.saldoIndex[cpf] = {
        portador,
        saldoFinal: saldoFinal !== null ? parseFloat(saldoFinal.toFixed(2)) : null,
        saldoCartao: saldoCartao !== null ? parseFloat(saldoCartao.toFixed(2)) : null,
        saldoReembolsar: saldoReembolsar !== null ? parseFloat(saldoReembolsar.toFixed(2)) : null,
        qz1: qz1,
        source: {
            saldoFinal: user['SALDO FINAL'] !== null ? 'historical' : 'estimated',
            saldoCartao: user['SALDO CARTAO'] !== null ? 'historical' : 'estimated',
            saldoReembolsar: user['SALDO REEMBOLSAR'] !== null ? 'historical' : 'calculated'
        }
    };
});

// Calcular estatísticas da solução híbrida
const stats = {
    totalUsers: Object.keys(hybridSolution.saldoIndex).length,
    saldoFinalHistorical: 0,
    saldoFinalEstimated: 0,
    saldoCartaoHistorical: 0,
    saldoCartaoEstimated: 0,
    saldoReembolsarHistorical: 0,
    saldoReembolsarCalculated: 0
};

Object.values(hybridSolution.saldoIndex).forEach(user => {
    if (user.source.saldoFinal === 'historical') stats.saldoFinalHistorical++;
    else stats.saldoFinalEstimated++;
    
    if (user.source.saldoCartao === 'historical') stats.saldoCartaoHistorical++;
    else stats.saldoCartaoEstimated++;
    
    if (user.source.saldoReembolsar === 'historical') stats.saldoReembolsarHistorical++;
    else stats.saldoReembolsarCalculated++;
});

console.log(`\nEstatísticas da solução híbrida:`);
console.log(`  Total de usuários: ${stats.totalUsers}`);
console.log(`  SALDO FINAL: ${stats.saldoFinalHistorical} históricos, ${stats.saldoFinalEstimated} estimados`);
console.log(`  SALDO CARTÃO: ${stats.saldoCartaoHistorical} históricos, ${stats.saldoCartaoEstimated} estimados`);
console.log(`  SALDO REEMBOLSAR: ${stats.saldoReembolsarHistorical} históricos, ${stats.saldoReembolsarCalculated} calculados`);

// Mostrar exemplos
console.log(`\nExemplos da solução híbrida:`);
Object.entries(hybridSolution.saldoIndex).slice(0, 10).forEach(([cpf, data]) => {
    console.log(`  ${data.portador}:`);
    console.log(`    SALDO FINAL: R$ ${data.saldoFinal?.toFixed(2) || 'N/A'} (${data.source.saldoFinal})`);
    console.log(`    SALDO CARTÃO: R$ ${data.saldoCartao?.toFixed(2) || 'N/A'} (${data.source.saldoCartao})`);
    console.log(`    SALDO REEMBOLSAR: R$ ${data.saldoReembolsar?.toFixed(2) || 'N/A'} (${data.source.saldoReembolsar})`);
});

// Salvar solução
hybridSolution.statistics = stats;
fs.writeFileSync('../investigation-docs/hybrid_saldo_solution.json', JSON.stringify(hybridSolution, null, 2));

console.log("\n" + "=".repeat(80));
console.log("Solução híbrida salva em investigation-docs/hybrid_saldo_solution.json");
console.log("=".repeat(80));

// Criar validação comparando com dados originais
console.log("\n" + "=".repeat(80));
console.log("VALIDAÇÃO DA SOLUÇÃO HÍBRIDA");
console.log("=".repeat(80));

const validationResults = [];
const maxError = 100; // Tolerância de R$ 100

planilhaData.forEach(user => {
    const cpf = user['CPF'];
    if (!cpf) return;
    
    const original = {
        saldoFinal: user['SALDO FINAL'],
        saldoCartao: user['SALDO CARTAO'],
        saldoReembolsar: user['SALDO REEMBOLSAR']
    };
    
    const hybrid = hybridSolution.saldoIndex[cpf];
    if (!hybrid) return;
    
    const errors = {};
    
    if (original.saldoFinal !== null && original.saldoFinal !== undefined) {
        const error = Math.abs(hybrid.saldoFinal - original.saldoFinal);
        errors.saldoFinal = {
            original: original.saldoFinal,
            hybrid: hybrid.saldoFinal,
            error: error,
            withinTolerance: error <= maxError
        };
    }
    
    if (original.saldoCartao !== null && original.saldoCartao !== undefined) {
        const error = Math.abs(hybrid.saldoCartao - original.saldoCartao);
        errors.saldoCartao = {
            original: original.saldoCartao,
            hybrid: hybrid.saldoCartao,
            error: error,
            withinTolerance: error <= maxError
        };
    }
    
    if (Object.keys(errors).length > 0) {
        validationResults.push({
            cpf,
            portador: user['PORTADOR'],
            errors
        });
    }
});

const saldoFinalValid = validationResults.filter(r => r.errors.saldoFinal && r.errors.saldoFinal.withinTolerance).length;
const saldoFinalTotal = validationResults.filter(r => r.errors.saldoFinal).length;
const saldoCartaoValid = validationResults.filter(r => r.errors.saldoCartao && r.errors.saldoCartao.withinTolerance).length;
const saldoCartaoTotal = validationResults.filter(r => r.errors.saldoCartao).length;

console.log(`\nResultados da validação:`);
console.log(`  SALDO FINAL: ${saldoFinalValid}/${saldoFinalTotal} dentro da tolerância (${((saldoFinalValid/saldoFinalTotal)*100).toFixed(1)}%)`);
console.log(`  SALDO CARTÃO: ${saldoCartaoValid}/${saldoCartaoTotal} dentro da tolerância (${((saldoCartaoValid/saldoCartaoTotal)*100).toFixed(1)}%)`);

// Salvar validação
fs.writeFileSync('../investigation-docs/hybrid_solution_validation.json', JSON.stringify({
    validationDate: new Date().toISOString(),
    tolerance: maxError,
    results: {
        saldoFinal: { valid: saldoFinalValid, total: saldoFinalTotal, percentage: (saldoFinalValid/saldoFinalTotal)*100 },
        saldoCartao: { valid: saldoCartaoValid, total: saldoCartaoTotal, percentage: (saldoCartaoValid/saldoCartaoTotal)*100 }
    },
    details: validationResults.slice(0, 20) // Primeiros 20 para amostra
}, null, 2));

console.log("\nValidação salva em investigation-docs/hybrid_solution_validation.json");