const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("BUSCANDO SALDO FINAL EM TODAS AS ABAS");
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
    
    console.log(`Abas disponíveis: ${workbook.SheetNames.join(', ')}`);
    
    // Ler planilha de referência
    console.log("\nLendo planilha de referência...");
    const planilhaData = JSON.parse(fs.readFileSync(`${DATA_DIR}/../investigation-docs/analise_exaustiva_abril_1qz.json`, 'utf8'));
    
    const rafaelPlanilha = planilhaData.find(u => u.portador === 'RAFAEL AMORIM VELLO');
    const saldoFinalAlvo = rafaelPlanilha.camposFinanceiros['SALDO FINAL'];
    const cpfAlvo = normCPF(rafaelPlanilha.cpf);
    
    console.log(`\nRAFAEL AMORIM VELLO:`);
    console.log(`  CPF: ${cpfAlvo}`);
    console.log(`  SALDO FINAL alvo: ${saldoFinalAlvo}`);
    
    // Buscar em cada aba
    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Aba: ${sheetName} ---`);
        
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
        
        console.log(`${rows.length} linhas`);
        
        // Procurar pelo CPF em todas as linhas
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            
            // Verificar se alguma coluna contém o CPF
            for (let j = 0; j < row.length; j++) {
                const cellValue = row[j];
                if (cellValue !== null && cellValue !== undefined) {
                    const cellStr = String(cellValue).replace(/\D/g, '');
                    if (cellStr === cpfAlvo) {
                        // Verificar se alguma coluna desta linha tem o valor de SALDO FINAL
                        for (let k = 0; k < row.length; k++) {
                            const val = row[k];
                            if (val !== null && val !== undefined && typeof val === 'number') {
                                const diff = Math.abs(val - saldoFinalAlvo);
                                if (diff < 0.01) {
                                    console.log(`\n!!! ENCONTRADO SALDO FINAL NA LINHA ${i + 1}, COLUNA ${k} !!!`);
                                    console.log(`Valor: ${val}`);
                                    console.log(`Linha completa: ${row.join(' | ')}`);
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