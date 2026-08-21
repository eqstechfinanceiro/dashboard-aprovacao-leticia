const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("INVESTIGANDO ARQUIVO EXCEL DE CONTROLE");
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
    
    // Buscar RAFAEL AMORIM VELLO em cada aba
    const cpfAlvo = '01677920599';
    
    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Aba: ${sheetName} ---`);
        
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
        
        console.log(`${rows.length} linhas`);
        
        if (rows.length > 0) {
            const header = rows[0] || [];
            console.log(`Header: ${header.join(', ')}`);
            
            // Procurar por CPF em todas as colunas
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row) continue;
                
                // Verificar se alguma coluna contém o CPF
                for (let j = 0; j < row.length; j++) {
                    const cellValue = row[j];
                    if (cellValue) {
                        const cellStr = String(cellValue).replace(/\D/g, '');
                        if (cellStr === cpfAlvo || cellStr === '01677920599') {
                            console.log(`\n!!! ENCONTRADO NA LINHA ${i + 1} !!!`);
                            console.log(`Linha completa: ${row.join(' | ')}`);
                            
                            // Mostrar também a linha anterior e posterior para contexto
                            if (i > 0) {
                                console.log(`Linha anterior (${i}): ${rows[i-1].join(' | ')}`);
                            }
                            if (i < rows.length - 1) {
                                console.log(`Linha posterior (${i+2}): ${rows[i+1].join(' | ')}`);
                            }
                        }
                    }
                }
            }
        }
    });
    
    // Investigar especificamente a aba QUINZENAS
    console.log("\n" + "=".repeat(80));
    console.log("INVESTIGANDO ABA QUINZENAS");
    console.log("=".repeat(80));
    
    if (workbook.SheetNames.includes('QUINZENAS')) {
        const sheet = workbook.Sheets['QUINZENAS'];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
        
        console.log(`${rows.length} linhas na aba QUINZENAS`);
        
        if (rows.length > 0) {
            const header = rows[0] || [];
            console.log(`Header: ${header.join(', ')}`);
            
            // Encontrar índices das colunas
            const cpfIdx = header.findIndex(h => String(h || '').toUpperCase().includes('CPF'));
            const valorIdx = header.findIndex(h => String(h || '').toUpperCase().includes('VALOR') || String(h || '').toUpperCase().includes('Valor'));
            const qzIdx = header.findIndex(h => String(h || '').toUpperCase().includes('QUINZENA'));
            const mesIdx = header.findIndex(h => String(h || '').toUpperCase().includes('M'));
            const anoIdx = header.findIndex(h => String(h || '').toUpperCase() === 'ANO');
            
            console.log(`Índices: CPF=${cpfIdx}, VALOR=${valorIdx}, QUINZENA=${qzIdx}, M=${mesIdx}, ANO=${anoIdx}`);
            
            // Procurar por RAFAEL
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row) continue;
                
                const cpf = normCPF(row[cpfIdx]);
                
                if (cpf === cpfAlvo) {
                    console.log(`\n!!! RAFAEL ENCONTRADO NA LINHA ${i + 1} !!!`);
                    console.log(`CPF: ${row[cpfIdx]}`);
                    console.log(`VALOR: ${row[valorIdx]}`);
                    console.log(`QUINZENA: ${row[qzIdx]}`);
                    console.log(`M: ${row[mesIdx]}`);
                    console.log(`ANO: ${row[anoIdx]}`);
                    console.log(`Linha completa: ${row.join(' | ')}`);
                }
            }
            
            // Mostrar todas as entradas de abril 1QZ
            console.log("\nTodas as entradas de Abril 1QZ:");
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row) continue;
                
                const qzStr = String(row[qzIdx] || '').trim();
                const is1QZ = qzStr.startsWith('1');
                const mes = row[mesIdx];
                const ano = row[anoIdx];
                
                if (is1QZ && mes === 4 && ano === 2026) {
                    const cpf = normCPF(row[cpfIdx]);
                    const valor = row[valorIdx];
                    console.log(`  CPF: ${cpf}, VALOR: R$ ${valor}, QUINZENA: ${qzStr}`);
                }
            }
        }
    }
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}