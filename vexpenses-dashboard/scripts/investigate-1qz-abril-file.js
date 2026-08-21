const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("INVESTIGANDO ARQUIVO 1QZ ABRIL 2026 - VEXPENSES.xlsx");
console.log("=".repeat(80));

const DATA_DIR = 'C:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/data';

function normCPF(v) {
    if (!v) return '';
    return String(v).replace(/\D/g, '').padStart(11, '0');
}

// Ler o arquivo 1QZ ABRIL 2026
console.log("\nLendo arquivo 1QZ ABRIL 2026 - VEXPENSES.xlsx...");
try {
    const workbook = XLSX.readFile(`${DATA_DIR}/1QZ ABRIL 2026 - VEXPENSES.xlsx`, { type: 'file', cellDates: true });
    
    console.log(`Abas disponíveis: ${workbook.SheetNames.join(', ')}`);
    
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
    
    // Investigar cada aba
    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Aba: ${sheetName} ---`);
        
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
        
        console.log(`${rows.length} linhas`);
        
        if (rows.length > 0) {
            const header = rows[0] || [];
            console.log(`Header: ${header.join(', ')}`);
            
            // Procurar por RAFAEL
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row) continue;
                
                // Verificar se contém o CPF
                for (let j = 0; j < row.length; j++) {
                    const cellValue = row[j];
                    if (cellValue) {
                        const cellStr = String(cellValue).replace(/\D/g, '');
                        if (cellStr === cpfAlvo) {
                            console.log(`\n!!! RAFAEL ENCONTRADO NA LINHA ${i + 1} !!!`);
                            console.log(`Linha completa: ${row.join(' | ')}`);
                            
                            // Verificar se há valores próximos ao alvo
                            for (let k = 0; k < row.length; k++) {
                                const val = row[k];
                                if (val !== null && val !== undefined && typeof val === 'number') {
                                    const diffFinal = Math.abs(val - saldoFinalAlvo);
                                    const diffCartao = Math.abs(val - saldoCartaoAlvo);
                                    if (diffFinal < 10 || diffCartao < 10) {
                                        console.log(`  Coluna ${k}: ${val} (diffFinal: ${diffFinal.toFixed(2)}, diffCartao: ${diffCartao.toFixed(2)})`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}