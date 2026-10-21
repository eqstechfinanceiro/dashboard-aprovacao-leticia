import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureAuditTable } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/historico?q=&action=&entity_type=&from=&to=&page=&per_page=
// Feed amigável de atividades — lê o audit_log (quem fez o quê, quando)
// com filtros por usuário, tipo de ação, entidade e período.
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  await ensureAuditTable();

  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const action = (sp.get('action') || '').trim();
  const entityType = (sp.get('entity_type') || '').trim();
  const from = sp.get('from') || null;
  const to = sp.get('to') || null;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(sp.get('per_page') || '25', 10) || 25));

  const rows = await sql`
    SELECT id, created_at, user_id, user_email, user_name, user_role,
           action, entity_type, entity_id, details
    FROM audit_log
    WHERE (${q} = '' OR lower(COALESCE(user_name,'')) LIKE ${'%' + q + '%'}
           OR lower(COALESCE(user_email,'')) LIKE ${'%' + q + '%'}
           OR lower(COALESCE(entity_id,'')) LIKE ${'%' + q + '%'})
      AND (${action} = '' OR action = ${action})
      AND (${entityType} = '' OR entity_type = ${entityType})
      AND (${from}::date IS NULL OR created_at >= ${from}::date)
      AND (${to}::date IS NULL OR created_at < (${to}::date + 1))
    ORDER BY created_at DESC
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `;

  const total = await sql`
    SELECT COUNT(*)::int AS n FROM audit_log
    WHERE (${q} = '' OR lower(COALESCE(user_name,'')) LIKE ${'%' + q + '%'}
           OR lower(COALESCE(user_email,'')) LIKE ${'%' + q + '%'}
           OR lower(COALESCE(entity_id,'')) LIKE ${'%' + q + '%'})
      AND (${action} = '' OR action = ${action})
      AND (${entityType} = '' OR entity_type = ${entityType})
      AND (${from}::date IS NULL OR created_at >= ${from}::date)
      AND (${to}::date IS NULL OR created_at < (${to}::date + 1))
  `;

  const actions = await sql`SELECT DISTINCT action FROM audit_log WHERE action IS NOT NULL ORDER BY action`;
  const entities = await sql`SELECT DISTINCT entity_type FROM audit_log WHERE entity_type IS NOT NULL ORDER BY entity_type`;

  return NextResponse.json({
    rows,
    total: total[0]?.n || 0,
    page,
    per_page: perPage,
    actions: actions.map((r: any) => r.action),
    entity_types: entities.map((r: any) => r.entity_type),
  });
}
