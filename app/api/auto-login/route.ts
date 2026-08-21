import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Database not available' }, { status: 503 });
  }

  try {
    const rows = await sql`
      SELECT laravel_token, laravel_session, xsrf_token, expires_at
      FROM vexpenses_tokens
      WHERE id = 1
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Token não encontrado' }, { status: 404 });
    }

    const row = rows[0] as any;
    const isExpired = new Date(row.expires_at).getTime() < Date.now();

    if (isExpired) {
      return NextResponse.json({ error: 'Token expirado. Acesse app.vexpenses.com para atualizar via extensão.' }, { status: 410 });
    }

    return NextResponse.json({
      laravel_token: row.laravel_token,
      laravel_session: row.laravel_session,
      xsrf_token: row.xsrf_token,
      expires_at: row.expires_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
