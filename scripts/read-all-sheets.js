// Script para ler TODAS as tabs de AMBAS as planilhas
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readAllTabs(filePath, fileName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`LENDO: ${fileName}`);
  console.log(`${'='.repeat(80)}`);

  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

  console.log(`\nTabs encontradas: ${workbook.SheetNames.join(', ')}`);

  const result = { fileName, sheets: {} };

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- Tab: "${sheetName}" ---`);
    const worksheet = workbook.Sheets[sheetName];
    const range = worksheet['!ref'];
    if (!range) { console.log('  (vazia)'); continue; }

    // Ler como array de arrays para ver a estrutura real
    const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });

    console.log(`  Linhas: ${raw.length}`);

    // Encontrar a linha de cabeçalho (procurar linha com mais células preenchidas e com texto)
    let headerRow = -1;
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      const row = raw[i];
      const nonNull = row.filter(v => v !== null && v !== undefined && v !== '');
      const hasText = nonNull.some(v => typeof v === 'string' && v.length > 0);
      if (hasText && nonNull.length >= 3) {
        headerRow = i;
        break;
      }
    }

    if (headerRow >= 0) {
      console.log(`  Linha de cabeçalho detectada: linha ${headerRow + 1}`);
      const headers = raw[headerRow];
      console.log(`  Colunas: ${headers.filter(h => h).join(' | ')}`);
    }

    // Mostrar primeiras 5 linhas de dados
    const dataStart = headerRow >= 0 ? headerRow + 1 : 0;
    for (let i = dataStart; i < Math.min(dataStart + 5, raw.length); i++) {
      const row = raw[i];
      if (!row || row.every(v => v === null)) continue;
      console.log(`  Linha ${i + 1}:`, row.slice(0, 18).map(v => v !== null ? String(v).substring(0, 20) : '—').join(' | '));
    }

    // Analisar fórmulas
    const formulas = {};
    const decoded = XLSX.utils.decode_range(range);
    for (let R = decoded.s.r; R <= Math.min(decoded.e.r, decoded.s.r + 20); R++) {
      for (let C = decoded.s.c; C <= decoded.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = worksheet[addr];
        if (cell && cell.f) {
          formulas[addr] = cell.f;
        }
      }
    }
    if (Object.keys(formulas).length > 0) {
      console.log(`  Fórmulas (primeiras 10):`, Object.entries(formulas).slice(0, 10).map(([k, v]) => `${k}=${v}`).join('; '));
    }

    result.sheets[sheetName] = {
      totalRows: raw.length,
      headerRow,
      headers: headerRow >= 0 ? raw[headerRow] : [],
      formulas,
      data: raw
    };
  }

  return result;
}

// Ler planilha 1
const planilha1 = readAllTabs(
  path.join(DATA_DIR, '1QZ ABRIL 2026 - VEXPENSES (1).xlsx'),
  '1QZ ABRIL 2026 - VEXPENSES.xlsx'
);

// Ler planilha 2
const planilha2 = readAllTabs(
  path.join(DATA_DIR, 'CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb'),
  'CONTROLE - VEXPENSES - ABRIL - 2026.xlsb'
);

// Salvar resultado completo
const output = { planilha1, planilha2 };
fs.writeFileSync(
  path.join(__dirname, 'all-sheets-analysis.json'),
  JSON.stringify(output, null, 2),
  'utf-8'
);

console.log('\n\nAnálise salva em all-sheets-analysis.json');
