import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { clearLaravelTokenCache } from '@/lib/laravel-token';

export const dynamic = 'force-dynamic';

const EXTENSION_SECRET = process.env.VEXPENSES_EXTENSION_SECRET || '';

async function ensureTokenTable() {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS vexpenses_tokens (
      id SERIAL PRIMARY KEY,
      laravel_token TEXT,
      laravel_session TEXT,
      xsrf_token TEXT,
      source_label TEXT,
      company TEXT DEFAULT 'eqs',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP WITH TIME ZONE
    )
  `;
  await sql`
    ALTER TABLE vexpenses_tokens ADD COLUMN IF NOT EXISTS source_label TEXT
  `;
  await sql`
    ALTER TABLE vexpenses_tokens ADD COLUMN IF NOT EXISTS company TEXT DEFAULT 'eqs'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_vexpenses_tokens_expires ON vexpenses_tokens(expires_at)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_vexpenses_tokens_company ON vexpenses_tokens(company)
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
    source_label?: string;
    company?: string;
    token_id?: number;
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

  const expiresAt = body.expires_at
    ? new Date(body.expires_at * 1000).toISOString()
    : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  const sourceLabel = body.source_label || 'default';
  const company = body.company || 'eqs';

  if (body.token_id) {
    await sql`
      UPDATE vexpenses_tokens
      SET laravel_token = ${body.laravel_token},
          laravel_session = ${body.laravel_session || null},
          xsrf_token = ${body.xsrf_token || null},
          source_label = ${sourceLabel},
          company = ${company},
          updated_at = NOW(),
          expires_at = ${expiresAt}
      WHERE id = ${body.token_id}
    `;
  } else {
    const existing = await sql`
      SELECT id FROM vexpenses_tokens WHERE source_label = ${sourceLabel} AND company = ${company} LIMIT 1
    `;
    if (existing && existing.length > 0) {
      await sql`
        UPDATE vexpenses_tokens
        SET laravel_token = ${body.laravel_token},
            laravel_session = ${body.laravel_session || null},
            xsrf_token = ${body.xsrf_token || null},
            company = ${company},
            updated_at = NOW(),
            expires_at = ${expiresAt}
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO vexpenses_tokens (laravel_token, laravel_session, xsrf_token, source_label, company, updated_at, expires_at)
        VALUES (${body.laravel_token}, ${body.laravel_session || null}, ${body.xsrf_token || null}, ${sourceLabel}, ${company}, NOW(), ${expiresAt})
      `;
    }
  }
  clearLaravelTokenCache();

  return NextResponse.json({ ok: true, expires_at: expiresAt, source_label: sourceLabel });
}

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  await ensureTokenTable();

  const rows = await sql`
    SELECT id, source_label, company, updated_at, expires_at
    FROM vexpenses_tokens
    ORDER BY id
  `;

  if (!rows || rows.length === 0) {
    return NextResponse.json({ has_token: false, token_count: 0 });
  }

  const now = Date.now();
  const activeTokens = rows.filter((r: any) => new Date(r.expires_at).getTime() > now);

  return NextResponse.json({
    has_token: activeTokens.length > 0,
    token_count: rows.length,
    active_count: activeTokens.length,
    tokens: rows.map((r: any) => ({
      id: r.id,
      source_label: r.source_label,
      company: r.company,
      updated_at: r.updated_at,
      expires_at: r.expires_at,
      is_expired: new Date(r.expires_at).getTime() < now,
    })),
  });
}
