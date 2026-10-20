import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';
import { resolverComprovantesPortal } from '@/lib/comprovantes/portal-fgts';
import { eqsPortalConfigured } from '@/lib/fiscal/eqs-portal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/comprovantes/runs/<id>/resolver-portal
 * Identifica envios FGTS 'sem_par_txt'/'valor_ambiguo' consultando os
 * processos de pagamento do portal EQS (guias anexadas: cobv, trabalhador,
 * valor da guia). Resolvidos viram 'pronto' com meta.portal preenchido.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  if (!eqsPortalConfigured()) {
    return NextResponse.json({ error: 'portal EQS não configurado (PORTAL_EQS_USER/PASS)' }, { status: 503 });
  }

  const run = (await sql`SELECT id, status FROM comprovantes_runs WHERE id = ${id}`)[0];
  if (!run) return NextResponse.json({ error: 'run não encontrado' }, { status: 404 });

  const resumo = await resolverComprovantesPortal(id);
  const envios = await sql`
    SELECT status, COUNT(*)::int AS n FROM comprovantes_envios WHERE run_id = ${id} GROUP BY status`;
  return NextResponse.json({ ok: true, resumo, porStatus: envios });
}
