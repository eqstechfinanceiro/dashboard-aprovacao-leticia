const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function analyzePlanilha1Sheets(filePath) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ANALISANDO STATUS DO CARTÃO NA PLANILHA 1`);
  console.log(`${'='.repeat(80)}`);

  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  // Analisar Planilha1, Planilha2, Planilha3 (todas têm a mesma estrutura)
  for (const sheetName of ['Planilha1', 'Planilha2', 'Planilha3']) {
    if (workbook.Sheets[sheetName]) {
      console.log(`\n--- SHEET: ${sheetName} ---`);
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      console.log(`Dimensões: ${jsonData.length} linhas x ${jsonData[0] ? jsonData[0].length : 0} colunas`);

      // Cabeçalho
      if (jsonData[0]) {
        console.log(`Cabeçalho: ${jsonData[0].join(' | ')}`);
      }

      // Analisar valores únicos de Status do Cartão (coluna 5, index 4)
      const statusCartaoSet = new Set();
      const statusPorNome = {};

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (row && row[1]) { // Coluna Nome (index 1)
          const nome = row[1];
          const statusCartao = row[4] || ''; // Coluna Status do Cartão (index 4)

          statusCartaoSet.add(statusCartao);

          if (!statusPorNome[nome]) {
            statusPorNome[nome] = statusCartao;
          }
        }
      }

      console.log(`\nValores únicos de Status do Cartão:`);
      Array.from(statusCartaoSet).forEach(status => {
        console.log(`  - "${status}"`);
      });

      console.log(`\nTotal de usuários com status: ${Object.keys(statusPorNome).length}`);
    }
  }

  // Analisar VALIDAÇÃO AGILLITAS
  if (workbook.Sheets['VALIDAÇÃO AGILLITAS']) {
    console.log(`\n--- SHEET: VALIDAÇÃO AGILLITAS ---`);
    const worksheet = workbook.Sheets['VALIDAÇÃO AGILLITAS'];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    console.log(`Dimensões: ${jsonData.length} linhas x ${jsonData[0] ? jsonData[0].length : 0} colunas`);

    // Cabeçalho
    if (jsonData[0]) {
      console.log(`Cabeçalho: ${jsonData[0].join(' | ')}`);
    }

    // Analisar valores únicos de CARTAO VALIDACAO (coluna 7, index 6)
    const validacaoSet = new Set();

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row && row[6]) { // Coluna CARTAO VALIDACAO (index 6)
        validacaoSet.add(row[6]);
      }
    }

    console.log(`\nValores únicos de CARTAO VALIDACAO:`);
    Array.from(validacaoSet).forEach(status => {
      console.log(`  - "${status}"`);
    });
  }
}

function main() {
  const dataPath = path.join(__dirname, '..', 'data');
  const planilha1Path = path.join(dataPath, '1QZ ABRIL 2026 - VEXPENSES (1).xlsx');

  analyzePlanilha1Sheets(planilha1Path);
}

main();
