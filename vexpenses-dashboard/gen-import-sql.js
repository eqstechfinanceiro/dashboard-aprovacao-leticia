#!/usr/bin/env node
/**
 * Gera SQL para importar somase_snapshots e prestacao_expense_snapshots de uma planilha.
 * Uso: node gen-import-sql.js <arquivo.xlsx> <quinzena_id>
 * Output: escreve SQL para stdout
 */
const XLSX = require('xlsx');
const fs = require('fs');

const filePath = process.argv[2];
const quinzenaId = process.argv[3];

if (!filePath || !quinzenaId) {
  console.error('Uso: node gen-import-sql.js <arquivo.xlsx> <quinzena_id>');
  process.exit(1);
}

const wb = XLSX.readFile(filePath);
const ws = wb.Sheets['BASE PREST '];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const data = rows.slice(3);

const byCpf = {};
const expenses = [];
for (const r of data) {
  const expenseId = r[0];
  const cpf = r[9];
  const val = r[26] || 0;
  if (!cpf) continue;
  const cpfStr = String(cpf).replace(/\D/g, '');
  byCpf[cpfStr] = (byCpf[cpfStr] || 0) + val;
  expenses.push({ id: String(expenseId), cpf: cpfStr, value: val });
}

const cpfEntries = Object.entries(byCpf).map(([cpf, total]) => ({
  cpf,
  total: Math.round(total * 100) / 100,
}));

// Generate somase SQL (batches of 50)
const somaseSql = [];
somaseSql.push(`DELETE FROM somase_snapshots WHERE quinzena = '${quinzenaId}';`);
for (let i = 0; i < cpfEntries.length; i += 50) {
  const batch = cpfEntries.slice(i, i + 50);
  const vals = batch.map(e => `('${quinzenaId}','${e.cpf}',${e.total})`).join(',');
  somaseSql.push(`INSERT INTO somase_snapshots (quinzena,user_cpf,total) VALUES ${vals} ON CONFLICT (quinzena,user_cpf) DO UPDATE SET total=EXCLUDED.total;`);
}

// Generate expense_snapshots SQL (batches of 50)
const expSql = [];
expSql.push(`DELETE FROM prestacao_expense_snapshots WHERE quinzena = '${quinzenaId}';`);
for (let i = 0; i < expenses.length; i += 50) {
  const batch = expenses.slice(i, i + 50);
  const vals = batch.map(e => `('${e.id}','${quinzenaId}',${e.value},'${e.cpf}')`).join(',');
  expSql.push(`INSERT INTO prestacao_expense_snapshots (id,quinzena,value,user_cpf) VALUES ${vals} ON CONFLICT (id,quinzena) DO UPDATE SET value=EXCLUDED.value,user_cpf=EXCLUDED.user_cpf;`);
}

// Write to files
const outFile = `/tmp/import_${quinzenaId.replace(/-/g,'_')}.sql`;
fs.writeFileSync(outFile, [...somaseSql, ...expSql].join('\n'));
console.error(`Generated ${somaseSql.length} somase + ${expSql.length} expense statements -> ${outFile}`);
console.error(`CPFs: ${cpfEntries.length}, Expenses: ${expenses.length}, Total: ${cpfEntries.reduce((s,e)=>s+e.total,0)}`);
