const XLSX = require('xlsx');
const fs = require('fs');

console.log("Analisando report de caixa...");

// Carregar arquivo Excel
const workbook = XLSX.readFile('../vexpenses-dashboard/report_caixa_04_2026.xlsx');
console.log(`\nAbas encontradas: ${workbook.SheetNames.join(', ')}`);

// Analisar cada aba
const analysis = {};

workbook.SheetNames.forEach(sheetName => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ABA: ${sheetName}`);
    console.log('='.repeat(80));
    
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log(`\nTotal de linhas: ${data.length}`);
    
    if (data.length > 0) {
        console.log(`Primeiras 5 linhas:`);
        data.slice(0, 5).forEach((row, index) => {
            console.log(`  Linha ${index}:`, row);
        });
        
        // Procurar por palavras-chave de saldo
        const saldoKeywords = ['SALDO', 'SALDO FINAL', 'SALDO CARTÃO', 'SALDO REEMBOLSAR', 'BALANCE', 'TOTAL'];
        const saldoRows = [];
        
        data.forEach((row, index) => {
            const rowString = JSON.stringify(row).toUpperCase();
            if (saldoKeywords.some(keyword => rowString.includes(keyword))) {
                saldoRows.push({ index, row });
            }
        });
        
        if (saldoRows.length > 0) {
            console.log(`\nLinhas com palavras-chave de saldo (${saldoRows.length}):`);
            saldoRows.slice(0, 10).forEach(({ index, row }) => {
                console.log(`  Linha ${index}:`, row);
            });
        }
        
        analysis[sheetName] = {
            totalRows: data.length,
            sampleRows: data.slice(0, 3),
            saldoRows: saldoRows.slice(0, 10)
        };
    }
});

// Salvar análise
fs.writeFileSync('../investigation-docs/caixa_report_analysis.json', JSON.stringify(analysis, null, 2));

console.log("\n" + "=".repeat(80));
console.log("Análise salva em investigation-docs/caixa_report_analysis.json");
console.log("=".repeat(80));