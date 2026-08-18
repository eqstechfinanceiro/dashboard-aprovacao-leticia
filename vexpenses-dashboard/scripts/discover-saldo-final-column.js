const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("DESCOBRINDO COLUNA DO SALDO FINAL");
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
    
    // Testar cada coluna para ver qual tem o SALDO FINAL correto
    console.log("\nTestando colunas para encontrar SALDO FINAL...");
    
    const resultados = [];
    
    for (let col = 0; col < 50; col++) {
        let matches = 0;
        let total = 0;
        
        for (const usuarioPlanilha of planilhaData) {
            const cpf = normCPF(usuarioPlanilha.cpf);
            const painel = painelMap[cpf];
            
            if (painel) {
                total++;
                const valorPlanilha = usuarioPlanilha.camposFinanceiros['SALDO FINAL'];
                const valorPainel = painel[col];
                
                if (valorPainel !== null && valorPainel !== undefined) {
                    const diff = Math.abs(valorPainel - valorPlanilha);
                    if (diff < 0.01) {
                        matches++;
                    }
                }
            }
        }
        
        if (total > 0) {
            const precisao = (matches / total * 100).toFixed(2);
            if (precisao > 0) {
                resultados.push({
                    coluna: col,
                    matches,
                    total,
                    precisao: parseFloat(precisao)
                });
            }
        }
    }
    
    // Ordenar por precisão
    resultados.sort((a, b) => b.precisao - a.precisao);
    
    console.log("\nResultados (colunas com melhor precisão):");
    resultados.slice(0, 10).forEach(r => {
        console.log(`  Coluna ${r.coluna}: ${r.matches}/${r.total} (${r.precisao}%)`);
    });
    
    // Testar a melhor coluna em detalhes
    if (resultados.length > 0) {
        const melhor = resultados[0];
        console.log(`\nMelhor coluna: ${melhor.coluna} (${melhor.precisao}%)`);
        
        console.log("\nDetalhes dos erros:");
        for (const usuarioPlanilha of planilhaData) {
            const cpf = normCPF(usuarioPlanilha.cpf);
            const painel = painelMap[cpf];
            
            if (painel) {
                const valorPlanilha = usuarioPlanilha.camposFinanceiros['SALDO FINAL'];
                const valorPainel = painel[melhor.coluna];
                
                if (valorPainel !== null && valorPainel !== undefined) {
                    const diff = Math.abs(valorPainel - valorPlanilha);
                    if (diff >= 0.01) {
                        console.log(`  ${usuarioPlanilha.portador}: planilha=${valorPlanilha}, col${melhor.coluna}=${valorPainel}, diff=${diff}`);
                    }
                }
            }
        }
    }
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}