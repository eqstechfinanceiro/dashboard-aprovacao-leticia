const { neon } = require('@neondatabase/serverless');

const NEON_URL = 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(NEON_URL);

async function main() {
  // Check what date range the extrato data actually covers
  const dateRange = await sql`
    SELECT MIN(data) as min_date, MAX(data) as max_date, COUNT(*) as total_rows
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
  `;
  console.log('Extrato date range:', dateRange[0]);

  // Check counts at different cut dates
  const cuts = ['2026-06-25', '2026-06-30', '2026-07-10'];
  for (const cut of cuts) {
    const r = await sql`
      SELECT 
        COUNT(*) as rows,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0), 0) as carga_total,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) as transf_total,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Taxa'), 0) as tarifa_total
      FROM extrato_movimentacao
      WHERE is_snapshot = FALSE AND data <= ${cut}
    `;
    console.log(`Cut ${cut}: rows=${r[0].rows}, carga=${r[0].carga_total}, transf=${r[0].transf_total}, tarifa=${r[0].tarifa_total}`);
  }

  // Compare with CONTROLE totals
  console.log('\nCONTROLE totals: carga=8673602.97, transf=1257855.36, tarifa=56333.83');
}

main().catch(e => { console.error(e); process.exit(1); });
