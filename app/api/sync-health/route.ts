import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { getScopeForRequest } from '@/lib/auth/scope';

export const dynamic = 'force-dynamic';

// ---- Saúde dos syncs ---------------------------------------------------------
// Visibilidade operacional sobre o sync-worker (HOT 5min / WARM 45min / COLD 24h).
// sync_runs já grava cada ciclo com meta rica — este endpoint só consolida.
//
// GET → { generated_at, healthy, cycles, domains, recent_errors }
//   cycles.{kind}: last, last_ok_at, last_error, stats_24h, overdue, stuck
//   domains[]: frescor por domínio de dados (despesas, extrato, cadastro, impacto, token)
//   recent_errors[]: últimos erros de sync_run_errors

const INTERVALS_MIN: Record<string, number> = { hot: 5, warm: 45, cold: 1440 };

interface RunRow {
  id: number;
  kind: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  meta: any;
}

const agoMin = (iso: string | null | undefined): number | null =>
  iso ? (Date.now() - new Date(iso).getTime()) / 60000 : null;

function summarizeMeta(kind: string, meta: any): string {
  if (!meta || typeof meta !== 'object') return '';
  try {
    if (kind === 'hot') {
      const parts: string[] = [];
      if (meta.discovery) {
        parts.push(`${meta.discovery.api_total ?? '?'} relatórios`);
        if (meta.discovery.new_reports) parts.push(`${meta.discovery.new_reports} novos`);
        if (meta.discovery.status_changes) parts.push(`${meta.discovery.status_changes} mudanças`);
      }
      if (meta.expenses) {
        parts.push(`${meta.expenses.synced ?? 0} despesas sync`);
        if (meta.expenses.status_updates) parts.push(`${meta.expenses.status_updates} status`);
        if (meta.expenses.errors) parts.push(`${meta.expenses.errors} erros`);
      }
      if (meta.auto_audit?.audited) parts.push(`audit: ${meta.auto_audit.audited}`);
      if (meta.auto_approve?.approved) parts.push(`aprov: ${meta.auto_approve.approved}`);
      return parts.join(' · ');
    }
    if (kind === 'warm') {
      const parts: string[] = [];
      if (meta.extrato?.total_rows !== undefined) parts.push(`extrato ${meta.extrato.total_rows} linhas`);
      if (meta.cadastro) {
        const c = meta.cadastro;
        parts.push(`cadastro ${c.updated ?? c.total ?? c.rows ?? 'ok'}`);
      }
      if (Array.isArray(meta.impacto)) parts.push(`impacto ${meta.impacto.join(',')}`);
      if (meta.inactive_alerts?.created) parts.push(`${meta.inactive_alerts.created} alertas inativos`);
      if (meta.keepalive) parts.push(`keepalive ${meta.keepalive}`);
      return parts.join(' · ');
    }
    if (kind === 'cold') {
      const parts: string[] = [];
      if (meta.total_rows !== undefined) parts.push(`extrato ${meta.total_rows} linhas`);
      if (meta.chunks_processed) parts.push(`${meta.chunks_processed} chunks`);
      if (meta.period) parts.push(meta.period);
      return parts.join(' · ');
    }
  } catch {}
  return '';
}

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }
  // Gestor com escopo restrito não vê saúde global dos syncs
  if (await getScopeForRequest(request)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const [runsRows, errRows, repUpd, extratoMov, extratoSnap, cadUpd, impUpd, tokRows] = await Promise.all([
      sql`
        SELECT id, kind, status, started_at, finished_at, meta
        FROM sync_runs
        WHERE started_at > NOW() - INTERVAL '7 days'
        ORDER BY started_at DESC
        LIMIT 600
      `,
      sql`
        SELECT run_id, kind, context, error, retryable, created_at
        FROM sync_run_errors
        ORDER BY created_at DESC
        LIMIT 50
      `,
      sql`SELECT MAX(updated_at) AS m FROM prestacao_reports`,
      sql`SELECT MAX(data)::text AS m FROM extrato_movimentacao WHERE is_snapshot = FALSE`,
      sql`SELECT MAX(data)::text AS m FROM extrato_movimentacao WHERE is_snapshot = TRUE`,
      sql`SELECT MAX(updated_at) AS m FROM quinzena_cadastro`,
      sql`SELECT MAX(synced_at) AS m FROM impacto_titulos`,
      sql`
        SELECT COUNT(*) FILTER (WHERE expires_at > NOW()) AS valid,
               MAX(expires_at) AS max_exp,
               MAX(updated_at) AS last_upd
        FROM vexpenses_tokens
        WHERE company = 'eqs' OR company IS NULL
      `,
    ]);

    const runs = runsRows as unknown as RunRow[];
    const errors = errRows as unknown as {
      run_id: number; kind: string; context: string | null;
      error: string; retryable: boolean; created_at: string;
    }[];

    const lastErrByRun = new Map<number, string>();
    const lastErrByKind = new Map<string, { at: string; context: string; error: string }>();
    for (const e of errors) {
      if (!lastErrByRun.has(e.run_id)) lastErrByRun.set(e.run_id, e.error);
      if (!lastErrByKind.has(e.kind)) {
        lastErrByKind.set(e.kind, { at: e.created_at, context: e.context || '', error: e.error });
      }
    }

    const cycles: Record<string, any> = {};
    let anyDown = false;

    for (const kind of ['hot', 'warm', 'cold']) {
      const kRuns = runs.filter((r) => r.kind === kind);
      const last = kRuns[0] ?? null;
      const lastOk = kRuns.find((r) => r.status === 'done') ?? null;
      const lastErrRun = kRuns.find((r) => r.status === 'error') ?? null;

      const dayAgo = Date.now() - 24 * 3600 * 1000;
      const k24 = kRuns.filter((r) => new Date(r.started_at).getTime() > dayAgo);
      const stats24 = {
        runs: k24.length,
        done: k24.filter((r) => r.status === 'done').length,
        error: k24.filter((r) => r.status === 'error').length,
      };

      const intervalMin = INTERVALS_MIN[kind];
      // Atraso: >2x o intervalo esperado, com piso de 15min (o HOT roda a cada
      // 5min mas um ciclo pode demorar — sem o piso ele oscila ok/atrasado).
      const overdueMin = Math.max(intervalMin * 2, 15);
      const lastOkMinAgo = agoMin(lastOk?.finished_at ?? lastOk?.started_at);
      const overdue = lastOkMinAgo === null || lastOkMinAgo > overdueMin;
      const stuck =
        last?.status === 'running' &&
        (Date.now() - new Date(last.started_at).getTime()) > 30 * 60000;
      if (overdue || stuck) anyDown = true;

      const errInfo = lastErrByKind.get(kind);

      cycles[kind] = {
        label: kind.toUpperCase(),
        interval_min: intervalMin,
        running: last?.status === 'running',
        stuck,
        overdue,
        last_status: last?.status ?? null,
        last_started_at: last?.started_at ?? null,
        last_finished_at: last?.finished_at ?? null,
        last_duration_s: last?.finished_at
          ? Math.round((new Date(last.finished_at).getTime() - new Date(last.started_at).getTime()) / 1000)
          : null,
        last_summary: last ? summarizeMeta(kind, last.meta) : '',
        last_error: lastErrRun
          ? {
              at: lastErrRun.finished_at ?? lastErrRun.started_at,
              error: lastErrRun.meta?.error || lastErrByRun.get(lastErrRun.id) || 'erro',
              context: errInfo?.context || 'cycle',
            }
          : null,
        last_ok_at: lastOk?.finished_at ?? null,
        stats_24h: stats24,
      };
    }

    const tok = tokRows[0] as any;
    const domains = [
      {
        id: 'despesas', label: 'Despesas & relatórios', source: 'HOT',
        updated_at: (repUpd[0] as any)?.m ?? null,
      },
      {
        id: 'extrato', label: 'Extrato do cartão', source: 'WARM/COLD',
        updated_at: (extratoMov[0] as any)?.m ?? null,
        extra: `snapshot até ${String((extratoSnap[0] as any)?.m ?? '?').slice(0, 10).split('-').reverse().join('/')}`,
      },
      {
        id: 'cadastro', label: 'Cadastro de colaboradores', source: 'WARM',
        updated_at: (cadUpd[0] as any)?.m ?? null,
      },
      {
        id: 'impacto', label: 'Impacto Financeiro (Protheus)', source: 'WARM',
        updated_at: (impUpd[0] as any)?.m ?? null,
      },
      {
        id: 'token', label: 'Token VExpenses (Laravel)', source: 'extensão',
        updated_at: tok?.last_upd ?? null,
        extra: tok?.max_exp
          ? `expira ${new Date(tok.max_exp).toLocaleDateString('pt-BR')}`
          : 'sem token',
        error: Number(tok?.valid ?? 0) === 0,
      },
    ];

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      healthy: !anyDown,
      cycles,
      domains,
      recent_errors: errors.map((e) => ({
        at: e.created_at,
        kind: e.kind,
        context: e.context,
        error: e.error,
        retryable: e.retryable,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[sync-health] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao consultar saúde dos syncs', detail: String(error) },
      { status: 500 }
    );
  }
}
