const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("VERIFICANDO CAMPO SALDO PRESTAÇÃO");
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
    
    // Ler planilha de referência
    console.log("\nLendo planilha de referência...");
    const planilhaData = JSON.parse(fs.readFileSync(`${DATA_DIR}/../investigation-docs/analise_exaustiva_abril_1qz.json`, 'utf8'));
    
    // Ler aba PAINEL
    console.log("\nLendo aba PAINEL...");
    const painelSheet = workbook.Sheets['PAINEL'];
    const painelRows = XLSX.utils.sheet_to_json(painelSheet, { header: 1, defval: null, raw: true });
    
    // Encontrar header
    let hIdx = -1;
    for (let i = 0; i < 15; i++) {
        const row = painelRows[i];
        if (row && row.some(x => String(x||'').toUpperCase().includes('CPF'))) {
            hIdx = i;
            break;
        }
    }
    
    if (hIdx >= 0) {
        const h = painelRows[hIdx].map(x => String(x||'').trim());
        console.log(`Header encontrado na linha ${hIdx}: ${h.join(', ')}`);
        
        // Encontrar índice de SALDO PRESTAÇÃO e SALDO FINAL
        const saldoPrestacaoIdx = h.findIndex(k => k.toUpperCase().includes('SALDO PRESTA'));
        const saldoFinalIdx = h.findIndex(k => k.toUpperCase() === 'SALDO FINAL');
        console.log(`Índice de SALDO PRESTAÇÃO: ${saldoPrestacaoIdx}`);
        console.log(`Índice de SALDO FINAL: ${saldoFinalIdx}`);
        
        // Criar mapa CPF -> linha
        const cpfIdx = h.findIndex(k => k.toUpperCase().includes('CPF'));
        const painelMap = {};
        for (let i = hIdx + 1; i < painelRows.length; i++) {
            const row = painelRows[i];
            if (!row) continue;
            const cpf = normCPF(row[cpfIdx]);
            if (cpf) painelMap[cpf] = row;
        }
        
        // Comparar com planilha
        console.log("\nComparando campos com SALDO FINAL da planilha:");
        let matchesSaldoPrestacao = 0;
        let matchesSaldoFinal = 0;
        let total = 0;
        let erros = [];
        
        for (const usuarioPlanilha of planilhaData) {
            const cpf = normCPF(usuarioPlanilha.cpf);
            const painel = painelMap[cpf];
            
            if (painel) {
                total++;
                const saldoFinalPlanilha = usuarioPlanilha.camposFinanceiros['SALDO FINAL'];
                const saldoPrestacao = painel[saldoPrestacaoIdx] || 0;
                const saldoFinalExcel = painel[saldoFinalIdx] || 0;
                
                const diffPrestacao = Math.abs(saldoPrestacao - saldoFinalPlanilha);
                const diffFinal = Math.abs(saldoFinalExcel - saldoFinalPlanilha);
                
                if (diffPrestacao < 0.01) matchesSaldoPrestacao++;
                if (diffFinal < 0.01) matchesSaldoFinal++;
                
                erros.push({
                    nome: usuarioPlanilha.portador,
                    planilha: saldoFinalPlanilha,
                    saldoPrestacao,
                    saldoFinalExcel,
                    diffPrestacao,
                    diffFinal
                });
            }
        }
        
        console.log(`\nSALDO PRESTAÇÃO: ${matchesSaldoPrestacao}/${total} (${(matchesSaldoPrestacao/total*100).toFixed(2)}%)`);
        console.log(`SALDO FINAL (Excel): ${matchesSaldoFinal}/${total} (${(matchesSaldoFinal/total*100).toFixed(2)}%)`);
        
        if (matchesSaldoFinal > 0) {
            console.log("\n🎉 SALDO FINAL DO EXCEL CORRESPONDE AO SALDO FINAL DA PLANILHA!");
        }
        
        if (matchesSaldoFinal < total) {
            console.log("\nErros (primeiros 10):");
            erros.slice(0, 10).forEach(err => {
                console.log(`  ${err.nome}: planilha=${err.planilha.toFixed(2)}, saldoPrestacao=${err.saldoPrestacao.toFixed(2)}, saldoFinalExcel=${err.saldoFinalExcel.toFixed(2)}`);
            });
        }
    }
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}