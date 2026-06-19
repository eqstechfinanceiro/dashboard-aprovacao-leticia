const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function analyzeSheetDetailed(filePath, sheetName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ANALISANDO SHEET: ${sheetName}`);
  console.log(`${'='.repeat(80)}`);

  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    console.log(`Sheet ${sheetName} não encontrada!`);
    return;
  }

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  console.log(`Dimensões: ${jsonData.length} linhas x ${jsonData[0] ? jsonData[0].length : 0} colunas`);

  // Mostrar cabeçalho
  if (jsonData[1]) {
    console.log(`\nCABEÇALHO (linha 2):`);
    jsonData[1].forEach((cell, idx) => {
      console.log(`  Coluna ${idx + 1}: ${cell}`);
    });
  }

  // Mostrar primeiras 10 linhas de dados
  console.log(`\nPRIMEIRAS 10 LINHAS DE DADOS:`);
  for (let i = 2; i < Math.min(12, jsonData.length); i++) {
    const row = jsonData[i];
    if (row && row.length > 0) {
      console.log(`\nLinha ${i + 1}:`);
      row.forEach((cell, idx) => {
        if (idx < 15) { // Limitar a 15 colunas
          console.log(`  Coluna ${idx + 1}: ${cell}`);
        }
      });
    }
  }
}

function main() {
  const dataPath = path.join(__dirname, '..', 'data');
  const planilha2Path = path.join(dataPath, 'CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb');

  // Analisar sheet REEMBOLSO
  analyzeSheetDetailed(planilha2Path, 'REEMBOLSO');

  // Analisar sheet SALDO CARTAO
  analyzeSheetDetailed(planilha2Path, 'SALDO CARTAO');

  // Analisar sheet EXTRATO
  analyzeSheetDetailed(planilha2Path, 'EXTRATO');
}

main();
