import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { clearLaravelTokenCache } from '@/lib/laravel-token';

export const dynamic = 'force-dynamic';

const EXTENSION_SECRET = process.env.VEXPENSES_EXTENSION_SECRET || '';

async function ensureTokenTable() {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS vexpenses_tokens (
      id INT PRIMARY KEY DEFAULT 1,
      laravel_token TEXT,
      laravel_session TEXT,
      xsrf_token TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE
    )
  `;
}

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  let body: {
    laravel_token: string;
    laravel_session?: string;
    xsrf_token?: string;
    expires_at?: number;
    secret?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!body.laravel_token) {
    return NextResponse.json({ error: 'laravel_token é obrigatório' }, { status: 400 });
  }

  if (EXTENSION_SECRET && body.secret !== EXTENSION_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  await ensureTokenTable();

  const expiresAt = body.expires_at
    ? new Date(body.expires_at * 1000).toISOString()
    : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  await sql`
    INSERT INTO vexpenses_tokens (id, laravel_token, laravel_session, xsrf_token, updated_at, expires_at)
    VALUES (1, ${body.laravel_token}, ${body.laravel_session || null}, ${body.xsrf_token || null}, NOW(), ${expiresAt})
    ON CONFLICT (id)
    DO UPDATE SET laravel_token = EXCLUDED.laravel_token,
                  laravel_session = EXCLUDED.laravel_session,
                  xsrf_token = EXCLUDED.xsrf_token,
                  updated_at = NOW(),
                  expires_at = EXCLUDED.expires_at
  `;
  clearLaravelTokenCache();

  return NextResponse.json({ ok: true, expires_at: expiresAt });
}

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await ensureTokenTable();

  const rows = await sql`
    SELECT laravel_token, laravel_session, updated_at, expires_at
    FROM vexpenses_tokens
    WHERE id = 1
  `;

  if (!rows || rows.length === 0) {
    return NextResponse.json({ has_token: false });
  }

  const row = rows[0] as any;
  const isExpired = new Date(row.expires_at).getTime() < Date.now();

  return NextResponse.json({
    has_token: !isExpired,
    is_expired: isExpired,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
  });
}
