import { NextRequest, NextResponse } from 'next/server';
import { listChangelog, createChangelog } from '@/lib/changelog';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';

// GET /api/changelog — aberto a qualquer usuário logado (sem módulo no mapa).
// POST /api/changelog — admin-only (verificado por dentro via x-user-role).
export async function GET() {
  try {
    return NextResponse.json({ entries: await listChangelog() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ error: 'Somente admin' }, { status: 403 });
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const r = await createChangelog({
    version: String(body.version || ''),
    date: String(body.date || ''),
    title: String(body.title || ''),
    items: Array.isArray(body.items) ? body.items : [],
    updated_by: request.headers.get('x-user-name') || request.headers.get('x-user-email'),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  await logAudit(request, {
    action: 'changelog.create',
    entity_type: 'changelog',
    entity_id: String(body.version),
    details: { title: body.title, items: (body.items || []).length },
  });
  return NextResponse.json({ ok: true });
}
