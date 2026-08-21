import { sql } from './neon';

interface TokenRow {
  id: number;
  token: string;
  session: string | null;
  xsrf: string | null;
  expiresAt: number;
}

interface CachedToken {
  token: string;
  session: string | null;
  xsrf: string | null;
  expiresAt: number;
  cookieString: string;
}

let allCachedTokens: CachedToken[] = [];
let lastLoadTime = 0;
const CACHE_TTL_MS = 3 * 60 * 1000;

const COOLDOWN_MS = 60 * 1000;
const cooldownMap = new Map<string, number>();

let rotationIndex = 0;

async function loadAllTokens(): Promise<CachedToken[]> {
  if (!sql) return [];

  if (allCachedTokens.length > 0 && Date.now() - lastLoadTime < CACHE_TTL_MS) {
    return allCachedTokens;
  }

  try {
    const rows = await sql`
      SELECT id, laravel_token, laravel_session, xsrf_token, expires_at
      FROM vexpenses_tokens
      WHERE expires_at > NOW()
      ORDER BY id
    `;

    if (!rows || rows.length === 0) {
      allCachedTokens = [];
      return [];
    }

    allCachedTokens = rows.map((row: any) => {
      const cookie = buildCookieString(row.laravel_token, row.laravel_session, row.xsrf_token);
      return {
        token: row.laravel_token,
        session: row.laravel_session,
        xsrf: row.xsrf_token,
        expiresAt: new Date(row.expires_at).getTime(),
        cookieString: cookie,
      };
    });
    lastLoadTime = Date.now();
    return allCachedTokens;
  } catch {
    return allCachedTokens;
  }
}

function buildCookieString(token: string, session: string | null, xsrf: string | null): string {
  let cookie = `laravel_token=${token}`;
  if (session) cookie += `; laravel_session=${session}`;
  if (xsrf) cookie += `; XSRF-TOKEN=${xsrf}`;
  cookie += '; language=pt-BR';
  return cookie;
}

export async function getLaravelCookieString(): Promise<string | null> {
  const tokens = await loadAllTokens();
  if (tokens.length === 0) return null;
  return tokens[0].cookieString;
}

export async function getNextLaravelCookie(): Promise<string | null> {
  const tokens = await loadAllTokens();
  if (tokens.length === 0) return null;

  const now = Date.now();
  for (let i = 0; i < tokens.length; i++) {
    const idx = (rotationIndex + i) % tokens.length;
    const t = tokens[idx];
    const cooldownUntil = cooldownMap.get(t.token);
    if (cooldownUntil && cooldownUntil > now) continue;
    rotationIndex = (idx + 1) % tokens.length;
    return t.cookieString;
  }
  return tokens[0].cookieString;
}

export function markTokenCooldown(cookieString: string): void {
  for (const t of allCachedTokens) {
    if (t.cookieString === cookieString) {
      cooldownMap.set(t.token, Date.now() + COOLDOWN_MS);
      break;
    }
  }
}

export function clearLaravelTokenCache(): void {
  allCachedTokens = [];
  lastLoadTime = 0;
  cooldownMap.clear();
}

export function isLaravelTokenExpired(): boolean {
  return allCachedTokens.length === 0 || allCachedTokens.every(t => t.expiresAt < Date.now());
}

export async function getActiveTokenCount(): Promise<number> {
  const tokens = await loadAllTokens();
  const now = Date.now();
  return tokens.filter(t => {
    const cd = cooldownMap.get(t.token);
    return !cd || cd < now;
  }).length;
}
