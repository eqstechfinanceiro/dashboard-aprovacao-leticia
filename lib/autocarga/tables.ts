// Schema da auto-carga + overrides manuais da quinzena.
// Mesmo padrão lazy-ensure do audit.ts: CREATE/ALTER IF NOT EXISTS, flag em
// processo, nunca lança pra fora do boot da feature (chamadores tratam erro).

import { sql } from '@/lib/db/neon';

let schemaReady = false;

export async function ensureAutocargaSchema(): Promise<void> {
  if (!sql || schemaReady) return;

  // Overrides manuais de reembolso/carga_final (P0a)
  await sql`ALTER TABLE quinzena_manual_inputs
    ADD COLUMN IF NOT EXISTS reembolso_override    NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS carga_final_override  NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS reembolso_edited_by   TEXT,
    ADD COLUMN IF NOT EXISTS reembolso_edited_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS carga_final_edited_by TEXT,
    ADD COLUMN IF NOT EXISTS carga_final_edited_at TIMESTAMPTZ`;

  // Índice cartão VExpenses: user_uuid → cpf/balance — cache permanente do
  // discovery por grupo + ponte cpf via /v3/pay/users/{uuid}
  await sql`
    CREATE TABLE IF NOT EXISTS quinzena_card_map (
      user_uuid          TEXT PRIMARY KEY,
      cpf                VARCHAR(11),
      vex_name           TEXT,
      balance_account_id TEXT NOT NULL,
      account_id         TEXT,
      card_number        VARCHAR(8),
      card_group_id      TEXT NOT NULL,
      card_group_name    TEXT,
      card_status        TEXT,
      account_status     TEXT,
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_card_map_cpf ON quinzena_card_map(cpf)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_card_map_group ON quinzena_card_map(card_group_id)`;

  // Execuções da auto-carga
  await sql`
    CREATE TABLE IF NOT EXISTS quinzena_carga_runs (
      id BIGSERIAL PRIMARY KEY,
      year INT NOT NULL, month INT NOT NULL, quinzena INT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      triggered_by_email TEXT, triggered_by_name TEXT,
      pool_before NUMERIC(12,2), pool_after NUMERIC(12,2),
      total_planned NUMERIC(12,2), total_loaded NUMERIC(12,2),
      items_ok INT, items_failed INT, items_blocked INT, items_forced INT,
      error TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_carga_runs_period
    ON quinzena_carga_runs(year, month, quinzena, id DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS quinzena_carga_items (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT REFERENCES quinzena_carga_runs(id) ON DELETE CASCADE,
      year INT NOT NULL, month INT NOT NULL, quinzena INT NOT NULL,
      cpf VARCHAR(11), colaborador TEXT,
      card_group_id TEXT, balance_account_id TEXT,
      amount NUMERIC(12,2) NOT NULL,
      status TEXT NOT NULL,
      block_reason TEXT,
      forced BOOLEAN DEFAULT FALSE, forced_by TEXT,
      transaction_id TEXT,
      vex_response JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      executed_at TIMESTAMPTZ,
      estornado_at TIMESTAMPTZ,
      estornado_by TEXT,
      estorno_tx TEXT,
      estorno_pool_tx TEXT
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_carga_items_run ON quinzena_carga_items(run_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_carga_items_period_cpf
    ON quinzena_carga_items(year, month, quinzena, cpf)`;
  // Anti-dupla-carga: mesmo período+cpf carregado com sucesso no máximo 1×.
  // 'estornado' NÃO entra no índice — estornar libera o CPF pra nova carga.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_carga_loaded
    ON quinzena_carga_items(year, month, quinzena, cpf)
    WHERE status IN ('ok', 'forced_ok')`;

  // Colunas de estorno (P2) — aditivas em bases já criadas
  await sql`ALTER TABLE quinzena_carga_items
    ADD COLUMN IF NOT EXISTS estornado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS estornado_by TEXT,
    ADD COLUMN IF NOT EXISTS estorno_tx TEXT,
    ADD COLUMN IF NOT EXISTS estorno_pool_tx TEXT`;

  schemaReady = true;
}
