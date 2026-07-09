import { sql } from './neon';

let cachedToken: { token: string; session: string | null; xsrf: string | null; expiresAt: number } | null = null;

export async function getLaravelToken(): Promise<{ token: string; session: string | null; xsrf: string | null } | null> {
  if (!sql) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return { token: cachedToken.token, session: cachedToken.session, xsrf: cachedToken.xsrf };
  }

  try {
    const rows = await sql`
      SELECT laravel_token, laravel_session, xsrf_token, expires_at
      FROM vexpenses_tokens
      WHERE id = 1
    `;

    if (!rows || rows.length === 0) return null;

    const row = rows[0] as any;
    const expiresAt = new Date(row.expires_at).getTime();

    if (expiresAt < Date.now()) {
      cachedToken = null;
      return null;
    }

    cachedToken = {
      token: row.laravel_token,
      session: row.laravel_session,
      xsrf: row.xsrf_token,
      expiresAt,
    };

    return { token: row.laravel_token, session: row.laravel_session, xsrf: row.xsrf_token };
  } catch {
    return null;
  }
}

export function clearLaravelTokenCache(): void {
  cachedToken = null;
}

export function isLaravelTokenExpired(): boolean {
  return cachedToken === null || cachedToken.expiresAt < Date.now();
}

export async function getLaravelCookieString(): Promise<string | null> {
  const result = await getLaravelToken();
  if (!result) return null;

  let cookie = `laravel_token=${result.token}`;
  if (result.session) {
    cookie += `; laravel_session=${result.session}`;
  }
  if (result.xsrf) {
    cookie += `; XSRF-TOKEN=${result.xsrf}`;
  }
  cookie += '; language=pt-BR';
  return cookie;
}
