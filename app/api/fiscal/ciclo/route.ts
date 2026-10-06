import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';

export const dynamic = 'force-dynamic';

// GET /api/fiscal/ciclo — observabilidade do ciclo de conferência na VPS:
// estado ao vivo (conferencia_state), runs recentes e erros do worker.
export async function GET() {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  await ensureFiscalTables();
  await sql`
    CREATE TABLE IF NOT EXISTS conferencia_state (
      id INT PRIMARY KEY,
      fase TEXT NOT NULL DEFAULT 'idle',
      janela_dias INT,
      total INT NOT NULL DEFAULT 0,
      elegiveis INT NOT NULL DEFAULT 0,
      conferidas INT NOT NULL DEFAULT 0,
      match INT NOT NULL DEFAULT 0,
      divergentes INT NOT NULL DEFAULT 0,
      falhas INT NOT NULL DEFAULT 0,
      puladas INT NOT NULL DEFAULT 0,
      fontes JSONB NOT NULL DEFAULT '{}',
      current_doc TEXT,
      last_run_id BIGINT,
      error TEXT,
      log JSONB NOT NULL DEFAULT '[]',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`INSERT INTO conferencia_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  await sql`ALTER TABLE conferencia_state ADD COLUMN IF NOT EXISTS elegiveis INT NOT NULL DEFAULT 0`;

  try {
    const state = (await sql`SELECT * FROM conferencia_state WHERE id=1`)[0] || {};

    const runs = await sql`
      SELECT id, tipo, date_from::text, date_to::text, hostname, total_notas,
             matches, divergentes, erros, pendentes, push_version, created_at
      FROM fiscal_runs
      WHERE hostname = 'vps-worker' OR push_version LIKE 'vps%'
      ORDER BY created_at DESC LIMIT 10`;

    const fila = await sql`
      SELECT review_status, COUNT(*)::int AS n
      FROM fiscal_notas WHERE tipo='mercadoria'
      GROUP BY review_status`;

    let erros: any[] = [];
    try {
      erros = await sql`
        SELECT run_id, kind, context, error, created_at
        FROM sync_run_errors
        WHERE context = 'conferencia'
        ORDER BY created_at DESC LIMIT 20`;
    } catch {}

    return NextResponse.json({ state, runs, fila, erros });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
  }
}
