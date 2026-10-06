import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { getSetting, setSetting } from '@/lib/db/settings';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';
import { getSpStatus } from '@/lib/comprovantes/sharepoint';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET → estado dos gates + conexão SharePoint
export async function GET() {
  const uploadEnabled = (await getSetting<boolean>('comprovantes_upload_enabled')) === true;
  const e2docEnabled = (await getSetting<boolean>('e2doc_send_enabled')) === true;
  const meta = sql
    ? await sql`SELECT key, updated_by, updated_at FROM app_settings WHERE key IN ('comprovantes_upload_enabled', 'e2doc_send_enabled')`
    : [];
  return NextResponse.json({
    upload_enabled: uploadEnabled,
    e2doc_enabled: e2docEnabled,
    meta: Object.fromEntries(meta.map((m: any) => [m.key, { updated_by: m.updated_by, updated_at: m.updated_at }])),
    sharepoint: getSpStatus(),
  });
}

// POST { gate: 'comprovantes_upload_enabled' | 'e2doc_send_enabled', enabled: bool }
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const { gate, enabled } = body;
  if (!['comprovantes_upload_enabled', 'e2doc_send_enabled'].includes(gate)) {
    return NextResponse.json({ error: 'gate inválido' }, { status: 400 });
  }
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) é obrigatório' }, { status: 400 });
  }
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;
  await setSetting(gate, enabled, session?.email || null);
  return NextResponse.json({ gate, enabled, updated_by: session?.email || null });
}
