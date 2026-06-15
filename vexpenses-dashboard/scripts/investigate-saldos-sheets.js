const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("INVESTIGANDO ABAS DE SALDOS");
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
    const cpfAlvo = normCPF(rafaelPlanilha.cpf);
    
    console.log(`\nRAFAEL AMORIM VELLO:`);
    console.log(`  CPF: ${cpfAlvo}`);
    console.log(`  SALDO FINAL alvo: ${saldoFinalAlvo}`);
    
    // Investigar aba PAINEL PRESTAÇÕES
    console.log("\n" + "=".repeat(80));
    console.log("ABA PAINEL PRESTAÇÕES");
    console.log("=".repeat(80));
    
    const sheetPrestacoes = workbook.Sheets['PAINEL PRESTAÇÕES'];
    const rowsPrestacoes = XLSX.utils.sheet_to_json(sheetPrestacoes, { header: 1, defval: null, raw: true });
    
    console.log(`${rowsPrestacoes.length} linhas`);
    
    if (rowsPrestacoes.length > 0) {
        const header = rowsPrestacoes[0] || [];
        console.log(`Header: ${header.join(', ')}`);
        
        // Procurar por RAFAEL
        for (let i = 1; i < rowsPrestacoes.length; i++) {
            const row = rowsPrestacoes[i];
            if (!row) continue;
            
            // Verificar se contém o CPF
            for (let j = 0; j < row.length; j++) {
                const cellValue = row[j];
                if (cellValue) {
                    const cellStr = String(cellValue).replace(/\D/g, '');
                    if (cellStr === cpfAlvo) {
                        console.log(`\n!!! RAFAEL ENCONTRADO NA LINHA ${i + 1} !!!`);
                        console.log(`Linha completa: ${row.join(' | ')}`);
                        
                        // Verificar valores próximos ao alvo
                        for (let k = 0; k < row.length; k++) {
                            const val = row[k];
                            if (val !== null && val !== undefined && typeof val === 'number') {
                                const diff = Math.abs(val - saldoFinalAlvo);
                                if (diff < 100) {
                                    console.log(`  Coluna ${k}: ${val} (diff: ${diff.toFixed(2)})`);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Investigar aba SALDOS ADM EQS
    console.log("\n" + "=".repeat(80));
    console.log("ABA SALDOS ADM EQS");
    console.log("=".repeat(80));
    
    const sheetSaldos = workbook.Sheets['SALDOS ADM EQS'];
    const rowsSaldos = XLSX.utils.sheet_to_json(sheetSaldos, { header: 1, defval: null, raw: true });
    
    console.log(`${rowsSaldos.length} linhas`);
    
    if (rowsSaldos.length > 0) {
        const header = rowsSaldos[0] || [];
        console.log(`Header: ${header.join(', ')}`);
        
        // Mostrar todas as linhas (são poucas)
        rowsSaldos.forEach((row, idx) => {
            console.log(`Linha ${idx}: ${row.join(' | ')}`);
        });
    }
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}