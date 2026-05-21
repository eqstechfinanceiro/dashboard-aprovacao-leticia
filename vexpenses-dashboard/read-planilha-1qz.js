const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function readPlanilha1QZ() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`LENDO PLANILHA 1 - 1 QZ VEXPENSES 04_2026`);
  console.log(`${'='.repeat(80)}`);

  const dataPath = path.join(__dirname, '..', 'data');
  const planilha1Path = path.join(dataPath, '1QZ ABRIL 2026 - VEXPENSES (1).xlsx');

  const fileBuffer = fs.readFileSync(planilha1Path);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  const sheetName = '1 QZ VEXPENSES 04_2026';
  if (!workbook.Sheets[sheetName]) {
    console.log(`Sheet ${sheetName} não encontrada!`);
    return;
  }

  const worksheet = workbook.Sheets[sheetName];
  // Usar header: 1 para ler como array de arrays (primeira linha é índice 0)
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  console.log(`\nDimensões: ${jsonData.length} linhas`);

  // A linha 4 (índice 4) contém os cabeçalhos corretos
  const headers = jsonData[4];
  console.log(`\nCabeçalhos encontrados na linha 4: ${headers.join(', ')}`);

  // Converter para array de objetos usando os cabeçalhos
  const dataAsObjects = [];
  for (let i = 5; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;

    const rowObj = {};
    headers.forEach((header, index) => {
      if (header) {
        rowObj[header] = row[index];
      }
    });
    dataAsObjects.push(rowObj);
  }

  console.log(`\nDados convertidos: ${dataAsObjects.length} linhas`);

  // Mostrar primeiras 10 linhas
  console.log(`\nPrimeiras 10 linhas de dados:`);
  for (let i = 0; i < Math.min(10, dataAsObjects.length); i++) {
    const row = dataAsObjects[i];
    console.log(`\nLinha ${i + 7}:`);
    Object.entries(row).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }

  // Salvar dados em JSON para uso posterior
  const outputPath = path.join(__dirname, 'planilha-1qz-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(dataAsObjects, null, 2), 'utf-8');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Dados salvos em: ${outputPath}`);
  console.log(`${'='.repeat(80)}`);

  return { data: dataAsObjects, headers: headers };
}

// Função para ler o cabeçalho e identificar fórmulas
function analyzeFormulas() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ANALISANDO FÓRMULAS DA PLANILHA`);
  console.log(`${'='.repeat(80)}`);

  const dataPath = path.join(__dirname, '..', 'data');
  const planilha1Path = path.join(dataPath, '1QZ ABRIL 2026 - VEXPENSES (1).xlsx');

  const fileBuffer = fs.readFileSync(planilha1Path);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

  const sheetName = '1 QZ VEXPENSES 04_2026';
  const worksheet = workbook.Sheets[sheetName];

  // Ler dados brutos para identificar fórmulas
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, cellDates: true });

  console.log(`\nAnalisando células para identificar fórmulas...`);

  const formulas = {};

  // Percorrer todas as células
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
      const cell = worksheet[cellAddress];

      if (cell && cell.f) {
        formulas[cellAddress] = cell.f;
        console.log(`Célula ${cellAddress}: ${cell.f}`);
      }
    }
  }

  console.log(`\nTotal de fórmulas encontradas: ${Object.keys(formulas).length}`);

  return formulas;
}

function main() {
  const { data: rawData, headers } = readPlanilha1QZ();
  const formulas = analyzeFormulas();

  // Salvar análise completa
  const analysis = {
    data: rawData,
    headers: headers,
    formulas: formulas,
    totalRows: rawData.length,
    columns: headers || []
  };

  const outputPath = path.join(__dirname, 'planilha-1qz-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf-8');

  console.log(`\nAnálise completa salva em: ${outputPath}`);
}

main();
