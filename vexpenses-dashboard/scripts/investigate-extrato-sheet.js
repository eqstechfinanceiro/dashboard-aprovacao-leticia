const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("INVESTIGANDO ABA EXTRATO");
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
    
    // Investigar aba EXTRATO
    console.log("\n" + "=".repeat(80));
    console.log("ABA EXTRATO");
    console.log("=".repeat(80));
    
    const sheetExtrato = workbook.Sheets['EXTRATO'];
    const rowsExtrato = XLSX.utils.sheet_to_json(sheetExtrato, { header: 1, defval: null, raw: true });
    
    console.log(`${rowsExtrato.length} linhas`);
    
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
        console.log(`Header encontrado na linha ${headerIdx}: ${header.join(', ')}`);
        
        // Encontrar índices
        const anoIdx = header.findIndex(h => String(h || '').toUpperCase() === 'ANO');
        const mesIdx = header.findIndex(h => String(h || '').toUpperCase().includes('M'));
        const cpfIdx = header.findIndex(h => String(h || '').toUpperCase().includes('CPF'));
        const valorIdx = header.findIndex(h => String(h || '').toUpperCase().includes('VALOR'));
        
        console.log(`Índices: ANO=${anoIdx}, M=${mesIdx}, CPF=${cpfIdx}, VALOR=${valorIdx}`);
        
        // Procurar por RAFAEL em qualquer período
        console.log("\nProcurando por RAFAEL em qualquer período...");
        for (let i = headerIdx + 1; i < rowsExtrato.length; i++) {
            const row = rowsExtrato[i];
            if (!row) continue;
            
            const cpf = normCPF(row[cpfIdx]);
            
            if (cpf === cpfAlvo) {
                console.log(`\n!!! RAFAEL ENCONTRADO NA LINHA ${i + 1} !!!`);
                console.log(`Linha completa: ${row.join(' | ')}`);
            }
        }
        
        // Agora procurar especificamente em abril 2026
        console.log("\nProcurando por RAFAEL em abril 2026...");
        for (let i = headerIdx + 1; i < rowsExtrato.length; i++) {
            const row = rowsExtrato[i];
            if (!row) continue;
            
            const cpf = normCPF(row[cpfIdx]);
            const mes = row[mesIdx];
            const ano = row[anoIdx];
            
            if (cpf === cpfAlvo && mes === 4 && ano === 2026) {
                console.log(`\n!!! RAFAEL ENCONTRADO EM ABRIL 2026 NA LINHA ${i + 1} !!!`);
                console.log(`Linha completa: ${row.join(' | ')}`);
                
                // Verificar valores
                for (let j = 0; j < row.length; j++) {
                    const val = row[j];
                    if (val !== null && val !== undefined && typeof val === 'number') {
                        const diff = Math.abs(val - saldoFinalAlvo);
                        if (diff < 100) {
                            console.log(`  Coluna ${j}: ${val} (diff: ${diff.toFixed(2)})`);
                        }
                    }
                }
            }
        }
    } else {
        console.log("Header não encontrado");
    }
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}