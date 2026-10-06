import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Confirma (ou cancela) um run de remessa que está 'aguardando_confirmacao'.
 * confirmar → phase='envio' + status='queued' (o worker re-clama e executa)
 * cancelar  → status='cancelado'
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { action } = await request.json().catch(() => ({}));
  if (action !== 'confirmar' && action !== 'cancelar') {
    return NextResponse.json({ error: "action deve ser 'confirmar' ou 'cancelar'" }, { status: 400 });
  }

  const rows = await sql`SELECT id, status, selection FROM comprovantes_runs WHERE id = ${id}`;
  const run = rows[0];
  if (!run) return NextResponse.json({ error: 'run não encontrado' }, { status: 404 });
  if (run.status !== 'aguardando_confirmacao') {
    return NextResponse.json({ error: `run está '${run.status}', não aguardando confirmação` }, { status: 409 });
  }

  if (action === 'cancelar') {
    await sql`UPDATE comprovantes_runs SET status='cancelado', finished_at=NOW() WHERE id=${id}`;
    return NextResponse.json({ ok: true, status: 'cancelado' });
  }

  const sel = { ...(run.selection as any), phase: 'envio' };
  await sql`UPDATE comprovantes_runs
    SET status='queued', selection=${JSON.stringify(sel)}::jsonb, started_at=NULL, finished_at=NULL
    WHERE id=${id}`;
  return NextResponse.json({ ok: true, status: 'queued' });
}
