const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("DESCOBRINDO FÓRMULA DO SALDO FINAL");
console.log("=".repeat(80));

const DATA_DIR = 'C:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/data';

function normCPF(v) {
    if (!v) return '';
    return String(v).replace(/\D/g, '').padStart(11, '0');
}

// Ler o arquivo de CONTROLE
console.log("\nLendo arquivo CONTROLE - VEXPENSES - ABRIL- 2026.xlsb...");
try {
    const workbook = XLSX.readFile(`${DATA_DIR}/CONTROLE - VEXPENSES - ABRIL- 2026.xlsb`, { type: 'file', cellDates: true });
    
    // Ler aba PAINEL
    console.log("\nLendo aba PAINEL...");
    const painelSheet = workbook.Sheets['PAINEL'];
    const painelRows = XLSX.utils.sheet_to_json(painelSheet, { header: 1, defval: null, raw: true });
    
    // Ler planilha de referência
    console.log("\nLendo planilha de referência...");
    const planilhaData = JSON.parse(fs.readFileSync(`${DATA_DIR}/../investigation-docs/analise_exaustiva_abril_1qz.json`, 'utf8'));
    
    // Criar mapa CPF -> linha PAINEL
    const painelMap = {};
    for (let i = 1; i < painelRows.length; i++) {
        const row = painelRows[i];
        if (!row) continue;
        
        const cpf = normCPF(row[2]);
        if (cpf) {
            painelMap[cpf] = row;
        }
    }
    
    // Pegar RAFAEL como exemplo
    const rafaelPlanilha = planilhaData.find(u => u.portador === 'RAFAEL AMORIM VELLO');
    const rafaelPainel = painelMap[normCPF(rafaelPlanilha.cpf)];
    
    console.log("\nRAFAEL AMORIM VELLO:");
    console.log(`  SALDO FINAL (planilha): ${rafaelPlanilha.camposFinanceiros['SALDO FINAL']}`);
    console.log(`  SALDO CARTÃO (planilha): ${rafaelPlanilha.camposFinanceiros['SALDO CARTAO']}`);
    console.log(`  1QZ (planilha): ${rafaelPlanilha.camposFinanceiros['1QZ DE ABRIL 26']}`);
    
    console.log("\nValores disponíveis no PAINEL:");
    for (let col = 0; col < 30; col++) {
        const val = rafaelPainel[col];
        if (val !== null && val !== undefined && val !== '') {
            console.log(`  Coluna ${col}: ${val}`);
        }
    }
    
    // Testar diferentes fórmulas
    console.log("\n" + "=".repeat(80));
    console.log("TESTANDO FÓRMULAS");
    console.log("=".repeat(80));
    
    const formulas = [
        { nome: 'col18', calc: (r) => r[18] },
        { nome: 'col19', calc: (r) => r[19] },
        { nome: 'col20 - col18', calc: (r) => r[20] - r[18] },
        { nome: 'col20 - col19', calc: (r) => r[20] - r[19] },
        { nome: 'col21 - col18', calc: (r) => r[21] - r[18] },
        { nome: 'col21 - col19', calc: (r) => r[21] - r[19] },
        { nome: 'col18 + col19', calc: (r) => r[18] + r[19] },
        { nome: 'col20 - col18 - col19', calc: (r) => r[20] - r[18] - r[19] },
        { nome: 'col20 - col25', calc: (r) => r[20] - r[25] },
        { nome: 'col21 - col25', calc: (r) => r[21] - r[25] },
        { nome: 'col18 - col25', calc: (r) => r[18] - r[25] },
        { nome: 'col19 - col25', calc: (r) => r[19] - r[25] },
        { nome: 'col17', calc: (r) => r[17] },
        { nome: 'col17 - col18', calc: (r) => r[17] - r[18] },
        { nome: 'col17 - col19', calc: (r) => r[17] - r[19] },
        { nome: 'col16 - col20', calc: (r) => r[16] - r[20] },
        { nome: 'col16 - col21', calc: (r) => r[16] - r[21] },
        { nome: 'col16 - col18', calc: (r) => r[16] - r[18] },
        { nome: 'col16 - col19', calc: (r) => r[16] - r[19] },
        { nome: 'col16 / 100', calc: (r) => r[16] / 100 },
        { nome: 'col16 / 1000', calc: (r) => r[16] / 1000 },
        { nome: '(col20 - col25) / 10', calc: (r) => (r[20] - r[25]) / 10 },
        { nome: '(col21 - col25) / 10', calc: (r) => (r[21] - r[25]) / 10 },
        { nome: 'col18 * 0.1', calc: (r) => r[18] * 0.1 },
        { nome: 'col19 * 0.1', calc: (r) => r[19] * 0.1 },
        { nome: 'col20 * 0.01', calc: (r) => r[20] * 0.01 },
        { nome: 'col21 * 0.01', calc: (r) => r[21] * 0.01 },
        { nome: 'col18 - col19 - col25', calc: (r) => r[18] - r[19] - r[25] },
        { nome: 'col19 - col18 - col25', calc: (r) => r[19] - r[18] - r[25] },
        { nome: 'col20 - col21 - col18', calc: (r) => r[20] - r[21] - r[18] },
        { nome: 'col20 - col21 - col19', calc: (r) => r[20] - r[21] - r[19] },
        { nome: 'col20 - (col18 + col19)', calc: (r) => r[20] - (r[18] + r[19]) },
        { nome: 'col21 - (col18 + col19)', calc: (r) => r[21] - (r[18] + r[19]) },
    ];
    
    const saldoFinalAlvo = rafaelPlanilha.camposFinanceiros['SALDO FINAL'];
    
    console.log("\nTestando fórmulas no RAFAEL:");
    formulas.forEach(f => {
        try {
            const resultado = f.calc(rafaelPainel);
            const diff = Math.abs(resultado - saldoFinalAlvo);
            console.log(`  ${f.nome}: ${resultado.toFixed(2)} (diff: ${diff.toFixed(2)})`);
        } catch (e) {
            console.log(`  ${f.nome}: ERRO - ${e.message}`);
        }
    });
    
    // Agora testar a melhor fórmula em todos os usuários
    console.log("\n" + "=".repeat(80));
    console.log("TESTANDO MELHOR FÓRMULA EM TODOS OS USUÁRIOS");
    console.log("=".repeat(80));
    
    const resultadosCompletos = [];
    
    formulas.forEach(f => {
        let matches = 0;
        let total = 0;
        
        for (const usuarioPlanilha of planilhaData) {
            const cpf = normCPF(usuarioPlanilha.cpf);
            const painel = painelMap[cpf];
            
            if (painel) {
                total++;
                try {
                    const valorPlanilha = usuarioPlanilha.camposFinanceiros['SALDO FINAL'];
                    const valorCalculado = f.calc(painel);
                    
                    const diff = Math.abs(valorCalculado - valorPlanilha);
                    if (diff < 0.01) {
                        matches++;
                    }
                } catch (e) {
                    // Ignorar erros
                }
            }
        }
        
        if (total > 0) {
            const precisao = (matches / total * 100).toFixed(2);
            resultadosCompletos.push({
                formula: f.nome,
                matches,
                total,
                precisao: parseFloat(precisao)
            });
        }
    });
    
    // Ordenar por precisão
    resultadosCompletos.sort((a, b) => b.precisao - a.precisao);
    
    console.log("\nResultados (fórmulas com melhor precisão):");
    resultadosCompletos.slice(0, 10).forEach(r => {
        console.log(`  ${r.formula}: ${r.matches}/${r.total} (${r.precisao}%)`);
    });
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}