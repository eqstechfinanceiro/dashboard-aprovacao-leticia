const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("CALCULANDO SALDO FINAL A PARTIR DO EXTRATO");
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
    
    const rafaelPlanilha = planilhaData.find(u => u.portador === 'RAFAEL AMORIM VELLO');
    const saldoFinalAlvo = rafaelPlanilha.camposFinanceiros['SALDO FINAL'];
    const saldoCartaoAlvo = rafaelPlanilha.camposFinanceiros['SALDO CARTAO'];
    const cpfAlvo = normCPF(rafaelPlanilha.cpf);
    
    console.log(`\nRAFAEL AMORIM VELLO:`);
    console.log(`  CPF: ${cpfAlvo}`);
    console.log(`  SALDO FINAL alvo: ${saldoFinalAlvo}`);
    console.log(`  SALDO CARTÃO alvo: ${saldoCartaoAlvo}`);
    
    // Investigar aba EXTRATO
    console.log("\n" + "=".repeat(80));
    console.log("CALCULANDO SALDO ACUMULADO NO EXTRATO");
    console.log("=".repeat(80));
    
    const sheetExtrato = workbook.Sheets['EXTRATO'];
    const rowsExtrato = XLSX.utils.sheet_to_json(sheetExtrato, { header: 1, defval: null, raw: true });
    
    // Encontrar header
    let headerIdx = -1;
    for (let i = 0; i < 15; i++) {
        if (rowsExtrato[i] && String(rowsExtrato[i][0] || '').toUpperCase().includes('ANO')) {
            headerIdx = i;
            break;
        }
    }
    
    if (headerIdx >= 0) {
        const header = rowsExtrato[headerIdx];
        const cpfIdx = header.findIndex(h => String(h || '').toUpperCase().includes('CPF'));
        const valorIdx = header.findIndex(h => String(h || '').toUpperCase().includes('VALOR'));
        const tipoIdx = header.findIndex(h => String(h || '').toUpperCase().includes('TIPO'));
        
        // Somar todas as transações do RAFAEL até abril 2026
        let saldoAcumulado = 0;
        let somaCargas = 0;
        let somaTarifas = 0;
        
        for (let i = headerIdx + 1; i < rowsExtrato.length; i++) {
            const row = rowsExtrato[i];
            if (!row) continue;
            
            const cpf = normCPF(row[cpfIdx]);
            const valor = row[valorIdx];
            const tipo = String(row[tipoIdx] || '').toUpperCase();
            
            if (cpf === cpfAlvo && valor !== null && valor !== undefined) {
                saldoAcumulado += valor;
                if (tipo === 'CARGA') {
                    somaCargas += valor;
                } else if (tipo === 'TARIFA') {
                    somaTarifas += valor;
                }
            }
        }
        
        console.log(`\nSaldos calculados do EXTRATO:`);
        console.log(`  Saldo acumulado total: ${saldoAcumulado.toFixed(2)}`);
        console.log(`  Soma de cargas: ${somaCargas.toFixed(2)}`);
        console.log(`  Soma de tarifas: ${somaTarifas.toFixed(2)}`);
        console.log(`  Cargas + Tarifas: ${(somaCargas + somaTarifas).toFixed(2)}`);
        
        console.log(`\nComparação:`);
        console.log(`  SALDO FINAL (planilha): ${saldoFinalAlvo.toFixed(2)}`);
        console.log(`  Diferença saldo acumulado: ${Math.abs(saldoAcumulado - saldoFinalAlvo).toFixed(2)}`);
        console.log(`  Diferença soma cargas: ${Math.abs(somaCargas - saldoFinalAlvo).toFixed(2)}`);
        console.log(`  Diferença cargas + tarifas: ${Math.abs((somaCargas + somaTarifas) - saldoFinalAlvo).toFixed(2)}`);
    }
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}