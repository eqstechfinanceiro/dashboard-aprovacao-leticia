import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { getScopeForRequest } from '@/lib/auth/scope';
import { ensureAuditTable } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';

// GET /api/audit-log?action=&entity_type=&entity_id=&user=&q=&from=&to=&page=&per_page=
// Somente admin/usuários sem escopo restrito — log de auditoria é global.
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }
  if (await getScopeForRequest(request)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    await ensureAuditTable();

    const sp = new URL(request.url).searchParams;
    const action = sp.get('action')?.trim();
    const entityType = sp.get('entity_type')?.trim();
    const entityId = sp.get('entity_id')?.trim();
    const user = sp.get('user')?.trim();
    const q = sp.get('q')?.trim();
    const from = sp.get('from')?.trim();
    const to = sp.get('to')?.trim();
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const perPage = Math.min(200, Math.max(10, parseInt(sp.get('per_page') || '50', 10) || 50));

    const where: string[] = [];
    const vals: any[] = [];
    const add = (cond: string, ...vs: any[]) => {
      const base = vals.length;
      let i = 0;
      where.push(cond.replace(/\?/g, () => `$${base + ++i}`));
      vals.push(...vs);
    };

    if (action) add('action = ?', action);
    if (entityType) add('entity_type = ?', entityType);
    if (entityId) add('entity_id = ?', entityId);
    if (user) add('user_email ILIKE ?', `%${user}%`);
    if (from) add('created_at >= ?::timestamptz', from);
    if (to) add("created_at < (?::date + interval '1 day')", to);
    if (q) {
      add(
        '(action ILIKE ? OR entity_id ILIKE ? OR details::text ILIKE ? OR user_email ILIKE ?)',
        `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await sql.query(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`, vals);
    const total = Number(countRows.rows[0]?.c ?? 0);

    vals.push(perPage, (page - 1) * perPage);
    const rows = await sql.query(
      `SELECT id, created_at, user_id, user_email, user_name, user_role, action, entity_type, entity_id, details, ip
       FROM audit_log ${whereSql}
       ORDER BY id DESC
       LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      vals
    );

    const actions = await sql`SELECT DISTINCT action FROM audit_log ORDER BY action`;

    return NextResponse.json({
      total,
      page,
      per_page: perPage,
      rows: rows.rows,
      actions: actions.map((a: any) => a.action),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[audit-log] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao consultar auditoria', detail: String(error) },
      { status: 500 }
    );
  }
}
