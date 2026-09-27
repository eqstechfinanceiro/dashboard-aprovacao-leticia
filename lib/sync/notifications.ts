// Generic in-app notifications — the bell in the header shows these alongside
// the inactive-employee alerts.
//
// Semantics (one row per app_user × dedup_key):
//   - same dedup_key                → title/body atualizados, read state mantido
//   - condição resolvida            → resolveByDedup marca resolved_at
//   - resolved → pende de novo      → resolved_at=NULL + read_at=NULL (re-alerta)
//   - dedup diário ("k:YYYY-MM-DD") → uma notificação nova por dia (digests)
//
// Worker-safe: relative imports only, no Next.js APIs.
import { sql } from '../db/neon';
import { gestorScopeCpfs } from './inactive-alerts';

let tableEnsured = false;

export async function ensureNotificationsTable(): Promise<void> {
  if (tableEnsured || !sql) return;
  tableEnsured = true;
  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      app_user_id INT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      dedup_key TEXT NOT NULL,
      details JSONB,
      read_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (app_user_id, dedup_key)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(app_user_id, read_at)`;
}

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupKey: string;
  details?: Record<string, unknown>;
  // realerta quando o valor numérico em details.numericValue subiu vs. o anterior
  realertOnIncrease?: boolean;
}

export async function upsertNotification(userId: number, n: NotifyInput): Promise<void> {
  if (!sql) return;
  await ensureNotificationsTable();
  await sql`
    INSERT INTO notifications (app_user_id, type, title, body, link, dedup_key, details)
    VALUES (${userId}, ${n.type}, ${n.title}, ${n.body ?? null}, ${n.link ?? null},
            ${n.dedupKey}, ${n.details ? JSON.stringify(n.details) : null}::jsonb)
    ON CONFLICT (app_user_id, dedup_key) DO UPDATE SET
      title       = EXCLUDED.title,
      body        = EXCLUDED.body,
      link        = EXCLUDED.link,
      details     = EXCLUDED.details,
      resolved_at = NULL,
      read_at     = CASE
        WHEN notifications.resolved_at IS NOT NULL THEN NULL
        WHEN ${n.realertOnIncrease === true}
             AND COALESCE((EXCLUDED.details->>'total')::numeric, 0)
               > COALESCE((notifications.details->>'total')::numeric, 0) * 1.1 + 0.01
          THEN NULL
        ELSE notifications.read_at
      END
  `;
}

export async function resolveByDedup(dedupKey: string, appUserId?: number): Promise<number> {
  if (!sql) return 0;
  await ensureNotificationsTable();
  const r = appUserId != null
    ? await sql`
        UPDATE notifications SET resolved_at = NOW()
        WHERE dedup_key = ${dedupKey} AND app_user_id = ${appUserId} AND resolved_at IS NULL
        RETURNING id
      `
    : await sql`
        UPDATE notifications SET resolved_at = NOW()
        WHERE dedup_key = ${dedupKey} AND resolved_at IS NULL
        RETURNING id
      `;
  return r.length;
}

// Resolve notificações do usuário cujo dedup_key começa com o prefixo mas
// difere da chave atual — usado por digests diários pra "fechar" dias passados.
export async function resolveOtherDedups(appUserId: number, prefix: string, keepKey: string): Promise<void> {
  if (!sql) return;
  await sql`
    UPDATE notifications SET resolved_at = NOW()
    WHERE app_user_id = ${appUserId}
      AND dedup_key LIKE ${prefix + '%'}
      AND dedup_key <> ${keepKey}
      AND resolved_at IS NULL
  `;
}

export interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  details: Record<string, unknown> | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export async function listNotifications(appUserId: number, limit = 50): Promise<NotificationRow[]> {
  if (!sql) return [];
  await ensureNotificationsTable();
  const rows = await sql`
    SELECT id, type, title, body, link, details,
           read_at::text, resolved_at::text, created_at::text
    FROM notifications
    WHERE app_user_id = ${appUserId}
    ORDER BY (read_at IS NULL AND resolved_at IS NULL) DESC,
             (resolved_at IS NULL) DESC,
             created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as NotificationRow[];
}

export async function markNotificationRead(appUserId: number, id: number): Promise<boolean> {
  if (!sql) return false;
  const r = await sql`
    UPDATE notifications SET read_at = NOW()
    WHERE id = ${id} AND app_user_id = ${appUserId} AND read_at IS NULL
    RETURNING id
  `;
  return r.length > 0;
}

export async function markAllNotificationsRead(appUserId: number): Promise<number> {
  if (!sql) return 0;
  const r = await sql`
    UPDATE notifications SET read_at = NOW()
    WHERE app_user_id = ${appUserId} AND read_at IS NULL AND resolved_at IS NULL
    RETURNING id
  `;
  return r.length;
}

// Notifica todos os admins ativos — usado por rotas (quinzena pronta) e worker.
export async function notifyAdmins(n: Omit<NotifyInput, 'dedupKey'> & { dedupKey: string }): Promise<number> {
  if (!sql) return 0;
  const admins = (await targetUsers()).filter((u) => u.role === 'admin');
  for (const a of admins) await upsertNotification(a.id, n);
  return admins.length;
}

// ---- usuários alvo -----------------------------------------------------------

interface AppUserRow {
  id: number;
  role: string;
  email: string;
  vexpenses_user_id: number | null;
  scope_flows: number[] | string | null;
}

async function targetUsers(): Promise<AppUserRow[]> {
  const rows = await sql`
    SELECT id, role, email, vexpenses_user_id, scope_flows
    FROM app_users WHERE active = TRUE
  `;
  return rows as unknown as AppUserRow[];
}

function parseFlows(v: number[] | string | null): number[] {
  if (Array.isArray(v)) return v.map(Number).filter((n) => !isNaN(n));
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.map(Number).filter((n: number) => !isNaN(n));
    } catch {}
  }
  return [];
}

async function scopeCpfsForUser(u: AppUserRow): Promise<Set<string> | null> {
  if (u.role === 'admin') return null; // null = sem restrição
  return gestorScopeCpfs({
    id: u.id,
    vexpenses_user_id: u.vexpenses_user_id,
    scope_flows: parseFlows(u.scope_flows),
    email: u.email,
  });
}

// ---- gerador 1: falha de sync → admins ----------------------------------------

const SYNC_THRESHOLDS_MIN: Record<string, number> = { hot: 30, warm: 120, cold: 1500 };

export async function generateSyncFailureNotifications(): Promise<void> {
  if (!sql) return;
  await ensureNotificationsTable();

  const runs = await sql`
    SELECT DISTINCT ON (kind) kind, status, started_at, finished_at, meta
    FROM sync_runs ORDER BY kind, started_at DESC
  `;
  const lastOk = await sql`
    SELECT kind, MAX(finished_at) AS ok_at FROM sync_runs
    WHERE status = 'done' GROUP BY kind
  `;
  const okAt = new Map<string, number>();
  for (const r of lastOk as any[]) okAt.set(r.kind, new Date(r.ok_at).getTime());

  const admins = (await targetUsers()).filter((u) => u.role === 'admin');

  for (const kind of ['hot', 'warm', 'cold']) {
    const dedup = `sync:${kind}`;
    const last = (runs as any[]).find((r) => r.kind === kind);
    const okAgoMin = okAt.has(kind) ? (Date.now() - okAt.get(kind)!) / 60000 : Infinity;
    const unhealthy =
      !last || last.status === 'error' || okAgoMin > (SYNC_THRESHOLDS_MIN[kind] ?? 60);

    if (!unhealthy) {
      await resolveByDedup(dedup);
      continue;
    }
    const motivo = !last
      ? 'nenhum ciclo registrado'
      : last.status === 'error'
        ? `último ciclo com erro: ${(last.meta?.error || '').slice(0, 140) || 'ver Saúde dos Syncs'}`
        : `sem sucesso há ${Math.round(okAgoMin)} min`;
    for (const a of admins) {
      await upsertNotification(a.id, {
        type: 'sync_failure',
        title: `Sync ${kind.toUpperCase()} com problema`,
        body: motivo,
        link: '/sync-health',
        dedupKey: dedup,
        details: { kind, motivo },
      });
    }
  }
}

// ---- gerador 2: digest de aprovações pendentes --------------------------------
// Relatórios ENVIADO esperando aprovação — por escopo do gestor.
// Dedup diário: uma notificação por dia por usuário enquanto houver pendências.

export async function generateApprovalDigest(): Promise<void> {
  if (!sql) return;
  await ensureNotificationsTable();

  const pendentes = await sql`
    SELECT r.user_cpf, COUNT(*) AS n,
           MIN(r.created_at) AS mais_antigo,
           COALESCE(SUM(e.v), 0)::float AS total
    FROM prestacao_reports r
    LEFT JOIN (
      SELECT report_id, SUM(value) AS v FROM prestacao_expenses GROUP BY report_id
    ) e ON e.report_id = r.id
    WHERE r.status = 'ENVIADO'
    GROUP BY r.user_cpf
  `;
  const byCpf = new Map<string, { n: number; mais_antigo: string; total: number }>();
  for (const r of pendentes as any[]) {
    const cpf = String(r.user_cpf ?? '').replace(/\D/g, '').padStart(11, '0');
    if (cpf) byCpf.set(cpf, { n: Number(r.n), mais_antigo: r.mais_antigo, total: Number(r.total) });
  }

  const today = new Date().toISOString().slice(0, 10);
  const dedup = `digest:aprovacoes:${today}`;

  for (const u of await targetUsers()) {
    if (!['admin', 'gestor'].includes(u.role)) continue;
    const scope = await scopeCpfsForUser(u);
    let n = 0, total = 0, oldest: string | null = null;
    for (const [cpf, p] of byCpf) {
      if (scope && !scope.has(cpf)) continue;
      n += p.n;
      total += p.total;
      if (!oldest || p.mais_antigo < oldest) oldest = p.mais_antigo;
    }
    if (n === 0) {
      await resolveByDedup(dedup, u.id);
      await resolveOtherDedups(u.id, 'digest:aprovacoes:', dedup);
      continue;
    }
    const dias = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000) : 0;
    const totalPart = total > 0.01
      ? `Total ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · `
      : '';
    await resolveOtherDedups(u.id, 'digest:aprovacoes:', dedup);
    await upsertNotification(u.id, {
      type: 'approval_digest',
      title: `${n} relatório${n > 1 ? 's' : ''} aguardando aprovação`,
      body: `${totalPart}mais antigo há ${dias} dia${dias === 1 ? '' : 's'}`,
      link: '/aprovacoes',
      dedupKey: dedup,
      details: { total: Math.round(total * 100) / 100, n, dias },
      realertOnIncrease: true,
    });
  }
}

// ---- gerador 3: prestação parada >30d -----------------------------------------
// Relatórios ABERTO/REABERTO criados há mais de 30 dias — dinheiro sacado/
// gasto sem prestação de contas. Notificação persistente: re-alerta se o total
// subir >10%, resolve quando zera.

const PRESTACAO_STALE_DAYS = 30;

export async function generatePrestacaoStaleNotifications(): Promise<void> {
  if (!sql) return;
  await ensureNotificationsTable();

  const stale = await sql`
    SELECT r.user_cpf, r.user_name, COUNT(*) AS n,
           COALESCE(SUM(e.v), 0)::float AS total
    FROM prestacao_reports r
    LEFT JOIN (
      SELECT report_id, SUM(value) AS v FROM prestacao_expenses GROUP BY report_id
    ) e ON e.report_id = r.id
    WHERE r.status IN ('ABERTO', 'REABERTO')
      AND r.created_at < NOW() - INTERVAL '30 days'
    GROUP BY r.user_cpf, r.user_name
  `;
  const byCpf = new Map<string, { n: number; total: number; nome: string }>();
  for (const r of stale as any[]) {
    const cpf = String(r.user_cpf ?? '').replace(/\D/g, '').padStart(11, '0');
    if (cpf) byCpf.set(cpf, { n: Number(r.n), total: Number(r.total), nome: r.user_name });
  }

  const dedup = 'prestacao:parada';
  const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  for (const u of await targetUsers()) {
    if (!['admin', 'gestor'].includes(u.role)) continue;
    const scope = await scopeCpfsForUser(u);
    let n = 0, total = 0;
    const nomes: string[] = [];
    for (const [cpf, p] of byCpf) {
      if (scope && !scope.has(cpf)) continue;
      n += p.n;
      total += p.total;
      if (nomes.length < 4 && p.nome) nomes.push(p.nome);
    }
    if (n === 0) {
      await resolveByDedup(dedup, u.id);
      continue;
    }
    await upsertNotification(u.id, {
      type: 'prestacao_stale',
      title: `${BRL(total)} em prestação parada há +${PRESTACAO_STALE_DAYS}d`,
      body: `${n} relatório${n > 1 ? 's' : ''} aberto${n > 1 ? 's' : ''} antigo${n > 1 ? 's' : ''}${nomes.length ? ` — ${nomes.join(', ')}${byCpf.size > nomes.length ? '…' : ''}` : ''}`,
      link: '/gestao-caixa',
      dedupKey: dedup,
      details: { total: Math.round(total * 100) / 100, n },
      realertOnIncrease: true,
    });
  }
}
