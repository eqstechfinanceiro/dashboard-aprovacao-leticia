const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();
  
  const r1 = await c.query("SELECT COUNT(*) as total, COUNT(user_cpf) as with_cpf FROM prestacao_reports");
  console.log('Reports with user_cpf:', r1.rows[0]);
  
  const r2 = await c.query("SELECT status, COUNT(*) as cnt FROM prestacao_reports GROUP BY status ORDER BY cnt DESC LIMIT 10");
  console.log('Status distribution:');
  for (const r of r2.rows) console.log('  "' + r.status + '": ' + r.cnt);
  
  const r3 = await c.query("SELECT COUNT(*) as cnt FROM prestacao_expenses e JOIN prestacao_reports r ON e.report_id = r.id");
  console.log('Expenses joined with reports:', r3.rows[0].cnt);
  
  const r4 = await c.query("SELECT COUNT(*) as cnt FROM prestacao_expenses");
  console.log('Total expenses:', r4.rows[0].cnt);
  
  const r5 = await c.query("SELECT COUNT(*) as cnt, COALESCE(SUM(e.value),0) as total FROM prestacao_reports r JOIN prestacao_expenses e ON e.report_id = r.id WHERE r.status IN ('APROVADO','ENVIADO') AND r.name NOT ILIKE 'FATURA%' AND r.name NOT ILIKE 'Cartao%' AND r.name NOT ILIKE 'CARTAO%'");
  console.log('Without user_cpf filter:', r5.rows[0]);
  
  const r6 = await c.query("SELECT COUNT(*) as cnt, COALESCE(SUM(e.value),0) as total FROM prestacao_reports r JOIN prestacao_expenses e ON e.report_id = r.id WHERE r.status ILIKE 'Aprovado' AND r.name NOT ILIKE 'FATURA%' AND r.name NOT ILIKE 'Cartao%' AND r.name NOT ILIKE 'CARTAO%'");
  console.log('With ILIKE Aprovado only:', r6.rows[0]);
  
  const r7 = await c.query("SELECT e.id, e.report_id, e.value, e.status, r.name, r.status as r_status, r.user_cpf FROM prestacao_expenses e JOIN prestacao_reports r ON e.report_id = r.id LIMIT 5");
  console.log('Sample expenses:');
  for (const r of r7.rows) {
    console.log('  exp_id=' + r.id + ' report_id=' + r.report_id + ' value=' + r.value + ' status=' + r.status + ' report="' + r.name + '" r_status=' + r.r_status + ' user_cpf=' + r.user_cpf);
  }
  
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
