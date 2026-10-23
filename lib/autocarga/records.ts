// Persistência de runs/itens da auto-carga.

import { sql } from '@/lib/db/neon';

export async function createRun(
  year: number, month: number, quinzena: number,
  email: string, name: string,
  poolBefore: number | null, totalPlanned: number,
): Promise<number> {
  const rows = await sql`
    INSERT INTO quinzena_carga_runs
      (year, month, quinzena, status, triggered_by_email, triggered_by_name,
       pool_before, total_planned)
    VALUES
      (${year}, ${month}, ${quinzena}, 'running', ${email}, ${name},
       ${poolBefore}, ${totalPlanned})
    RETURNING id
  `;
  return Number((rows[0] as any).id);
}

export interface ItemInsert {
  cpf: string;
  colaborador: string;
  card_group_id?: string | null;
  balance_account_id?: string | null;
  amount: number;
  status: 'ok' | 'failed' | 'blocked' | 'skipped' | 'forced_ok' | 'forced_failed';
  block_reason?: string | null;
  forced?: boolean;
  forced_by?: string | null;
  transaction_id?: string | null;
  vex_response?: unknown;
}

export async function insertItems(
  runId: number, year: number, month: number, quinzena: number,
  items: ItemInsert[],
): Promise<void> {
  for (const it of items) {
    await sql`
      INSERT INTO quinzena_carga_items
        (run_id, year, month, quinzena, cpf, colaborador, card_group_id,
         balance_account_id, amount, status, block_reason, forced, forced_by,
         transaction_id, vex_response, executed_at)
      VALUES
        (${runId}, ${year}, ${month}, ${quinzena}, ${it.cpf}, ${it.colaborador},
         ${it.card_group_id ?? null}, ${it.balance_account_id ?? null},
         ${it.amount}, ${it.status}, ${it.block_reason ?? null},
         ${it.forced ?? false}, ${it.forced_by ?? null},
         ${it.transaction_id ?? null},
         ${it.vex_response ? JSON.stringify(it.vex_response) : null}::jsonb,
         CASE WHEN ${it.status} IN ('ok','forced_ok','failed','forced_failed') THEN NOW() ELSE NULL END)
    `;
  }
}

export async function finishRun(
  runId: number,
  fields: {
    status: 'done' | 'partial' | 'failed' | 'aborted';
    pool_after?: number | null;
    total_loaded?: number;
    items_ok?: number;
    items_failed?: number;
    items_blocked?: number;
    items_forced?: number;
    error?: string | null;
  },
): Promise<void> {
  await sql`
    UPDATE quinzena_carga_runs SET
      status = ${fields.status},
      pool_after = ${fields.pool_after ?? null},
      total_loaded = ${fields.total_loaded ?? 0},
      items_ok = ${fields.items_ok ?? 0},
      items_failed = ${fields.items_failed ?? 0},
      items_blocked = ${fields.items_blocked ?? 0},
      items_forced = ${fields.items_forced ?? 0},
      error = ${fields.error ?? null},
      finished_at = NOW()
    WHERE id = ${runId}
  `;
}
