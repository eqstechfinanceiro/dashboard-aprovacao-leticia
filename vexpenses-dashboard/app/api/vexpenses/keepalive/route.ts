import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cronSecret = searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);

    // Load current cookies from DB
    const rows = await sql`
      SELECT laravel_token, laravel_session, xsrf_token, expires_at
      FROM vexpenses_tokens WHERE id = 1
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No tokens found in DB' }, { status: 404 });
    }

    const row = rows[0] as any;
    const expiresAt = new Date(row.expires_at).getTime();

    // Build cookie string
    let cookieStr = `laravel_token=${row.laravel_token}`;
    if (row.laravel_session) {
      cookieStr += `; laravel_session=${row.laravel_session}`;
    }
    if (row.xsrf_token) {
      cookieStr += `; XSRF-TOKEN=${row.xsrf_token}`;
    }
    cookieStr += '; language=pt-BR';

    // Make a lightweight request to keep the session alive
    // Using the admin dashboard page - it refreshes the Laravel session cookies
    const response = await fetch('https://app.vexpenses.com/inicio-colaborador', {
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });

    // Extract Set-Cookie headers
    const setCookies = response.headers.getSetCookie?.() || [];
    
    let newToken = row.laravel_token;
    let newSession = row.laravel_session;
    let newXsrf = row.xsrf_token;
    let cookiesUpdated = false;

    for (const sc of setCookies) {
      // Parse cookie name=value
      const match = sc.match(/^([^=]+)=([^;]+)/);
      if (!match) continue;
      const [, name, value] = match;

      if (name === 'laravel_token') {
        newToken = value;
        cookiesUpdated = true;
      } else if (name === 'laravel_session') {
        newSession = value;
        cookiesUpdated = true;
      } else if (name === 'XSRF-TOKEN') {
        newXsrf = value;
        cookiesUpdated = true;
      }
    }

    // Calculate new expiry (8 hours from now)
    const newExpires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

    if (cookiesUpdated) {
      await sql`
        UPDATE vexpenses_tokens 
        SET laravel_token = ${newToken}, 
            laravel_session = ${newSession}, 
            xsrf_token = ${newXsrf},
            expires_at = ${newExpires}
        WHERE id = 1
      `;
      console.log('[KeepAlive] Cookies refreshed, new expiry:', newExpires);
    } else {
      // Even if cookies didn't change in the response, update expiry
      await sql`
        UPDATE vexpenses_tokens SET expires_at = ${newExpires} WHERE id = 1
      `;
      console.log('[KeepAlive] No new cookies in response, updated expiry to:', newExpires);
    }

    return NextResponse.json({
      success: true,
      status: response.status,
      cookiesUpdated,
      newExpiry: newExpires,
      wasExpired: expiresAt < Date.now(),
    });
  } catch (error) {
    console.error('[KeepAlive] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
