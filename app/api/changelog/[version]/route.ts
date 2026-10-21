import { NextRequest, NextResponse } from 'next/server';
import { updateChangelog, deleteChangelog } from '@/lib/changelog';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';

function adminOnly(request: NextRequest) {
  return request.headers.get('x-user-role') === 'admin';
}

// PATCH /api/changelog/[version] { date?, title?, items? } — admin.
export async function PATCH(request: NextRequest, { params }: { params: { version: string } }) {
  if (!adminOnly(request)) {
    return NextResponse.json({ error: 'Somente admin' }, { status: 403 });
  }
  const { version } = params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const r = await updateChangelog(decodeURIComponent(version), {
    date: body.date ? String(body.date) : undefined,
    title: body.title !== undefined ? String(body.title) : undefined,
    items: Array.isArray(body.items) ? body.items : undefined,
    updated_by: request.headers.get('x-user-name') || request.headers.get('x-user-email'),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  await logAudit(request, {
    action: 'changelog.update',
    entity_type: 'changelog',
    entity_id: version,
    details: { campos: Object.keys(body) },
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/changelog/[version] — admin.
export async function DELETE(request: NextRequest, { params }: { params: { version: string } }) {
  if (!adminOnly(request)) {
    return NextResponse.json({ error: 'Somente admin' }, { status: 403 });
  }
  const { version } = params;
  const r = await deleteChangelog(decodeURIComponent(version));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  await logAudit(request, {
    action: 'changelog.delete',
    entity_type: 'changelog',
    entity_id: version,
  });
  return NextResponse.json({ ok: true });
}
