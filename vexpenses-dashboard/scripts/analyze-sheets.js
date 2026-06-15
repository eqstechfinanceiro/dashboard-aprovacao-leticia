const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function analyzeWorkbook(filePath, fileName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ANALISANDO: ${fileName}`);
  console.log(`${'='.repeat(80)}`);

  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  const result = {
    file: filePath,
    fileName: fileName,
    sheets: {}
  };

  console.log(`Sheets encontradas: ${workbook.SheetNames.join(', ')}`);

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- SHEET: ${sheetName} ---`);
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const sheetData = {
      name: sheetName,
      maxRow: jsonData.length,
      maxColumn: jsonData[0] ? jsonData[0].length : 0,
      columns: [],
      sampleRows: []
    };

    console.log(`Dimensões: ${jsonData.length} linhas x ${sheetData.maxColumn} colunas`);

    // Ler todas as colunas da primeira linha
    if (jsonData[0]) {
      for (let colIdx = 0; colIdx < Math.min(50, jsonData[0].length); colIdx++) {
        const cellValue = jsonData[0][colIdx];
        sheetData.columns.push({
          index: colIdx + 1,
          name: String(cellValue || '')
        });
        console.log(`  Coluna ${colIdx + 1}: ${cellValue}`);
      }

      if (jsonData[0].length > 50) {
        console.log(`  ... mais ${jsonData[0].length - 50} colunas (total: ${jsonData[0].length})`);
      }
    }

    // Ler primeiras 3 linhas como amostra
    console.log(`\nPrimeiras 3 linhas de dados:`);
    for (let rowIdx = 0; rowIdx < Math.min(3, jsonData.length); rowIdx++) {
      const rowData = jsonData[rowIdx].map(cell => String(cell || ''));
      sheetData.sampleRows.push(rowData);
      console.log(`  Linha ${rowIdx + 1}: ${rowData.slice(0, 15).join(' | ')}...`);
    }

    result.sheets[sheetName] = sheetData;
  }

  return result;
}

function main() {
  const dataPath = path.join(__dirname, '..', 'data');

  const planilha1Path = path.join(dataPath, '1QZ ABRIL 2026 - VEXPENSES (1).xlsx');
  const planilha2Path = path.join(dataPath, 'CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb');

  const allResults = {
    planilha1: analyzeWorkbook(planilha1Path, '1QZ ABRIL 2026 - VEXPENSES (1).xlsx'),
    planilha2: analyzeWorkbook(planilha2Path, 'CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb')
  };

  // Salvar resultado em JSON
  const outputPath = path.join(__dirname, 'spreadsheets_complete_analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), 'utf-8');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Análise completa salva em: ${outputPath}`);
  console.log(`${'='.repeat(80)}`);
}

main();
