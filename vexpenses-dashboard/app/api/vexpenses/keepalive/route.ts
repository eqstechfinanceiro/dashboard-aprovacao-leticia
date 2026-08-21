import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { clearLaravelTokenCache } from '@/lib/laravel-token';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cronSecret = searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!sql) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const rows = await sql`
      SELECT id, laravel_token, laravel_session, xsrf_token, expires_at, source_label
      FROM vexpenses_tokens
      WHERE expires_at > NOW() - INTERVAL '1 hour'
        AND (company = 'eqs' OR company IS NULL)
      ORDER BY id
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No tokens found in DB' }, { status: 404 });
    }

    const results: any[] = [];

    for (const row of rows as any[]) {
      try {
        let cookieStr = `laravel_token=${row.laravel_token}`;
        if (row.laravel_session) cookieStr += `; laravel_session=${row.laravel_session}`;
        if (row.xsrf_token) cookieStr += `; XSRF-TOKEN=${row.xsrf_token}`;
        cookieStr += '; language=pt-BR';

        const response = await fetch('https://app.vexpenses.com/inicio-colaborador', {
          headers: {
            'Cookie': cookieStr,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location') || '';
          if (location.includes('/login')) {
            results.push({ id: row.id, source_label: row.source_label, success: false, error: 'Session expired' });
            continue;
          }
        }

        if (response.status >= 300) {
          results.push({ id: row.id, source_label: row.source_label, success: false, error: `Redirect ${response.status}` });
          continue;
        }

        const setCookies = response.headers.getSetCookie?.() || [];
        let newToken = row.laravel_token;
        let newSession = row.laravel_session;
        let newXsrf = row.xsrf_token;
        let cookiesUpdated = false;

        for (const sc of setCookies) {
          const match = sc.match(/^([^=]+)=([^;]+)/);
          if (!match) continue;
          const [, name, value] = match;
          if (name === 'laravel_token') { newToken = value; cookiesUpdated = true; }
          else if (name === 'laravel_session') { newSession = value; cookiesUpdated = true; }
          else if (name === 'XSRF-TOKEN') { newXsrf = value; cookiesUpdated = true; }
        }

        const newExpires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

        await sql`
          UPDATE vexpenses_tokens
          SET laravel_token = ${newToken},
              laravel_session = ${newSession},
              xsrf_token = ${newXsrf},
              expires_at = ${newExpires},
              updated_at = NOW()
          WHERE id = ${row.id}
        `;

        results.push({
          id: row.id,
          source_label: row.source_label,
          success: true,
          cookiesUpdated,
          newExpiry: newExpires,
        });
      } catch (err) {
        results.push({ id: row.id, source_label: row.source_label, success: false, error: String(err) });
      }
    }

    clearLaravelTokenCache();

    const successCount = results.filter(r => r.success).length;
    console.log(`[KeepAlive] Refreshed ${successCount}/${results.length} tokens`);

    return NextResponse.json({
      success: successCount > 0,
      total: results.length,
      refreshed: successCount,
      results,
    });
  } catch (error) {
    console.error('[KeepAlive] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
