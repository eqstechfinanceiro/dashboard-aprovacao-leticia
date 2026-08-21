/**
 * Reset script: clears all quinzena-related tables and re-populates cadastro metadata.
 *
 * Steps:
 * 1. Create quinzena_cadastro table (CPF → colaborador, situacao, status_cartao, regional, centro_custo, gestor, diretor)
 * 2. Extract unique cadastro data from existing quinzena_controle_snapshot (most recent per CPF)
 * 3. Create quinzena_frozen_snapshots table (for freeze functionality)
 * 4. Clear ALL quinzena-related tables:
 *    - quinzena_controle_snapshot
 *    - quinzena_manual_inputs
 *    - quinzena_config
 *    - somase_snapshots
 *    - prestacao_expense_snapshots
 *    - extrato_movimentacao
 *    - prestacao_reports
 *    - prestacao_expenses
 *    - pipeline_status
 *    - quinzena_import_log
 */

import { Client } from 'pg';

const NEON_URL = 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const client = new Client({
    connectionString: NEON_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected to Neon');

  // Step 1: Create quinzena_cadastro table
  console.log('\n--- Step 1: Creating quinzena_cadastro table ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS quinzena_cadastro (
      id SERIAL PRIMARY KEY,
      cpf VARCHAR(20) UNIQUE NOT NULL,
      colaborador VARCHAR(255),
      situacao VARCHAR(50),
      status_cartao VARCHAR(100),
      regional VARCHAR(100),
      centro_custo VARCHAR(255),
      gestor VARCHAR(255),
      diretor VARCHAR(255),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('quinzena_cadastro table created');

  // Step 2: Extract unique cadastro data from existing snapshots
  console.log('\n--- Step 2: Extracting cadastro metadata from existing snapshots ---');
  const { rows: cadastroRows } = await client.query(`
    SELECT DISTINCT ON (cpf)
      cpf,
      colaborador,
      situacao,
      status_cartao,
      regional,
      centro_custo,
      gestor,
      diretor
    FROM quinzena_controle_snapshot
    WHERE cpf IS NOT NULL AND cpf != ''
    ORDER BY cpf, year DESC, month DESC, quinzena DESC
  `);
  console.log(`Found ${cadastroRows.length} unique CPFs in snapshots`);

  let inserted = 0;
  for (const row of cadastroRows) {
    await client.query(`
      INSERT INTO quinzena_cadastro (cpf, colaborador, situacao, status_cartao, regional, centro_custo, gestor, diretor)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (cpf) DO UPDATE SET
        colaborador = EXCLUDED.colaborador,
        situacao = EXCLUDED.situacao,
        status_cartao = EXCLUDED.status_cartao,
        regional = EXCLUDED.regional,
        centro_custo = EXCLUDED.centro_custo,
        gestor = EXCLUDED.gestor,
        diretor = EXCLUDED.diretor,
        updated_at = NOW()
    `, [row.cpf, row.colaborador, row.situacao, row.status_cartao, row.regional, row.centro_custo, row.gestor, row.diretor]);
    inserted++;
  }
  console.log(`Inserted/updated ${inserted} cadastro records`);

  // Also extract manual inputs (col_1qz, adiantamento, obs) — save them so we can restore later
  console.log('\n--- Step 2b: Backing up manual inputs ---');
  const { rows: manualRows } = await client.query(`
    SELECT cpf, year, month, quinzena, col_1qz, adiantamento, obs
    FROM quinzena_manual_inputs
    WHERE cpf IS NOT NULL AND cpf != ''
  `);
  console.log(`Found ${manualRows.length} manual input records to backup`);

  // Save manual inputs to a temp table
  await client.query(`
    CREATE TABLE IF NOT EXISTS quinzena_manual_inputs_backup AS
    SELECT * FROM quinzena_manual_inputs WHERE 1=0
  `);
  await client.query(`DELETE FROM quinzena_manual_inputs_backup`);
  await client.query(`INSERT INTO quinzena_manual_inputs_backup SELECT * FROM quinzena_manual_inputs`);
  console.log('Manual inputs backed up to quinzena_manual_inputs_backup');

  // Also backup quinzena_config
  console.log('\n--- Step 2c: Backing up quinzena_config ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS quinzena_config_backup AS
    SELECT * FROM quinzena_config WHERE 1=0
  `);
  await client.query(`DELETE FROM quinzena_config_backup`);
  await client.query(`INSERT INTO quinzena_config_backup SELECT * FROM quinzena_config`);
  console.log('quinzena_config backed up to quinzena_config_backup');

  // Step 3: Create quinzena_frozen_snapshots table
  console.log('\n--- Step 3: Creating quinzena_frozen_snapshots table ---');
  await client.query(`
    CREATE TABLE IF NOT EXISTS quinzena_frozen_snapshots (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      quinzena INTEGER NOT NULL,
      cpf VARCHAR(20) NOT NULL,
      colaborador VARCHAR(255),
      situacao VARCHAR(50),
      status_cartao VARCHAR(100),
      regional VARCHAR(100),
      centro_custo VARCHAR(255),
      gestor VARCHAR(255),
      diretor VARCHAR(255),
      carga NUMERIC DEFAULT 0,
      transferencia NUMERIC DEFAULT 0,
      tarifa NUMERIC DEFAULT 0,
      prestacao NUMERIC DEFAULT 0,
      saldo_prestacao NUMERIC DEFAULT 0,
      saldo_cartao NUMERIC DEFAULT 0,
      saldo_final NUMERIC DEFAULT 0,
      saldo_reembolsar NUMERIC DEFAULT 0,
      col_qz NUMERIC,
      adiantamento NUMERIC DEFAULT 0,
      obs TEXT,
      carga_parcial NUMERIC DEFAULT 0,
      reembolso NUMERIC DEFAULT 0,
      carga_final NUMERIC DEFAULT 0,
      reembolso_multiplier NUMERIC DEFAULT 0.5,
      frozen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      frozen_by VARCHAR(100),
      UNIQUE(year, month, quinzena, cpf)
    )
  `);
  console.log('quinzena_frozen_snapshots table created');

  // Step 4: Clear ALL quinzena-related tables
  console.log('\n--- Step 4: Clearing all quinzena-related tables ---');
  const tablesToClear = [
    'quinzena_controle_snapshot',
    'quinzena_manual_inputs',
    'quinzena_config',
    'somase_snapshots',
    'prestacao_expense_snapshots',
    'extrato_movimentacao',
    'prestacao_reports',
    'prestacao_expenses',
    'pipeline_status',
    'quinzena_import_log',
  ];

  for (const table of tablesToClear) {
    const { rowCount } = await client.query(`DELETE FROM ${table}`);
    console.log(`  Cleared ${table}: ${rowCount} rows deleted`);
  }

  // Restore manual inputs from backup
  console.log('\n--- Step 4b: Restoring manual inputs ---');
  await client.query(`INSERT INTO quinzena_manual_inputs SELECT * FROM quinzena_manual_inputs_backup`);
  const { rows: restored } = await client.query(`SELECT COUNT(*) as cnt FROM quinzena_manual_inputs`);
  console.log(`  Restored ${restored[0].cnt} manual input records`);

  // Restore quinzena_config from backup
  console.log('\n--- Step 4c: Restoring quinzena_config ---');
  await client.query(`INSERT INTO quinzena_config SELECT * FROM quinzena_config_backup`);
  const { rows: configRestored } = await client.query(`SELECT COUNT(*) as cnt FROM quinzena_config`);
  console.log(`  Restored ${configRestored[0].cnt} config records`);

  // Verify
  console.log('\n--- Verification ---');
  for (const table of [...tablesToClear, 'quinzena_cadastro', 'quinzena_frozen_snapshots']) {
    const { rows } = await client.query(`SELECT COUNT(*) as cnt FROM ${table}`);
    console.log(`  ${table}: ${rows[0].cnt} rows`);
  }

  await client.end();
  console.log('\nDone! Database reset complete.');
  console.log('Next step: Run the pipeline to re-populate extrato and prestacao data from API.');
}

main().catch(e => { console.error(e); process.exit(1); });
