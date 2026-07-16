#!/usr/bin/env node
/**
 * Importa dados de uma planilha CONTROLE - VEXPENSES para somase_snapshots e prestacao_expense_snapshots.
 * Uso: node import-snapshot-planilha.js <arquivo.xlsx> <quinzena_id>
 */
const XLSX = require('xlsx');
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!connectionString) {
  console.error('Erro: DATABASE_URL ou NEON_DATABASE_URL não definida');
  process.exit(1);
}

const sql = neon(connectionString);

async function main() {
  const [, , filePath, quinzenaId] = process.argv;
  if (!filePath || !quinzenaId) {
    console.error('Uso: node import-snapshot-planilha.js <arquivo.xlsx> <quinzena_id>');
    process.exit(1);
  }

  console.log(`Importando ${filePath} para quinzena ${quinzenaId}...`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['BASE PREST '];
  if (!ws) {
    console.error('Aba "BASE PREST " não encontrada. Abas:', wb.SheetNames);
    process.exit(1);
  }

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

  const totalGeral = cpfEntries.reduce((s, e) => s + e.total, 0);
  console.log(`Planilha: ${cpfEntries.length} CPFs, ${expenses.length} despesas, total: ${totalGeral.toFixed(2)}`);

  // Limpar snapshots existentes
  console.log(`Limpando snapshots existentes para ${quinzenaId}...`);
  await sql`DELETE FROM somase_snapshots WHERE quinzena = ${quinzenaId}`;
  await sql`DELETE FROM prestacao_expense_snapshots WHERE quinzena = ${quinzenaId}`;

  // Inserir somase_snapshots (1 por 1, ~500)
  console.log(`Inserindo ${cpfEntries.length} CPFs em somase_snapshots...`);
  let inserted = 0;
  for (const e of cpfEntries) {
    await sql`INSERT INTO somase_snapshots (quinzena, user_cpf, total) VALUES (${quinzenaId}, ${e.cpf}, ${e.total})
              ON CONFLICT (quinzena, user_cpf) DO UPDATE SET total = EXCLUDED.total`;
    inserted++;
    if (inserted % 100 === 0 || inserted === cpfEntries.length) {
      console.log(`  ${inserted}/${cpfEntries.length} CPFs...`);
    }
  }

  // Inserir prestacao_expense_snapshots (1 por 1 para confiabilidade com neon serverless)
  console.log(`Inserindo ${expenses.length} despesas em prestacao_expense_snapshots...`);
  let expInserted = 0;
  for (const e of expenses) {
    await sql`INSERT INTO prestacao_expense_snapshots (id, quinzena, value, user_cpf)
              VALUES (${e.id}, ${quinzenaId}, ${e.value}, ${e.cpf})
              ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value, user_cpf = EXCLUDED.user_cpf`;
    expInserted++;
    if (expInserted % 5000 === 0 || expInserted === expenses.length) {
      console.log(`  ${expInserted}/${expenses.length} despesas...`);
    }
  }

  // Verificar resultado
  const check = await sql`
    SELECT
      (SELECT COUNT(*) FROM somase_snapshots WHERE quinzena = ${quinzenaId}) as cpfs,
      (SELECT SUM(total) FROM somase_snapshots WHERE quinzena = ${quinzenaId}) as somase_total,
      (SELECT COUNT(*) FROM prestacao_expense_snapshots WHERE quinzena = ${quinzenaId}) as expenses,
      (SELECT SUM(value) FROM prestacao_expense_snapshots WHERE quinzena = ${quinzenaId}) as expenses_total
  `;
  console.log('\nResultado:');
  console.log(`  CPFs: ${check[0].cpfs}`);
  console.log(`  Somase total: ${check[0].somase_total}`);
  console.log(`  Expense snapshots: ${check[0].expenses}`);
  console.log(`  Expense total: ${check[0].expenses_total}`);
  console.log(`  Diferenca: ${(Number(check[0].somase_total) - Number(check[0].expenses_total)).toFixed(2)}`);
  console.log('\n✅ Importacao concluida!');
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
