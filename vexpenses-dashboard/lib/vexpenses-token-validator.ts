// Token validator — valida Laravel tokens antes de usar e mantém rotação inteligente (LRU)
import { sql } from './neon';

interface TokenRow {
  id: number;
  laravel_token: string;
  laravel_session: string | null;
  xsrf_token: string | null;
  expires_at: Date;
  source_label: string | null;
}

interface ManagedToken {
  id: number;
  token: string;
  session: string | null;
  xsrf: string | null;
  expiresAt: number;
  sourceLabel: string | null;
  cookieString: string;
  lastUsedAt: number;
  isValid: boolean;
  lastValidatedAt: number;
}

const COOLDOWN_MS = 60 * 1000;
const VALIDATION_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const TOKEN_REFRESH_MS = 8 * 60 * 60 * 1000; // 8h
const APP_URL = 'https://app.vexpenses.com';

let managedTokens: ManagedToken[] = [];
let lastLoadTime = 0;
const LOAD_CACHE_TTL = 3 * 60 * 1000;
const cooldownMap = new Map<number, number>(); // tokenId -> cooldownUntil

let validationInProgress = false;

async function loadTokensFromDB(): Promise<ManagedToken[]> {
  if (!sql) return [];

  if (managedTokens.length > 0 && Date.now() - lastLoadTime < LOAD_CACHE_TTL) {
    return managedTokens;
  }

  try {
    const rows = await sql`
      SELECT id, laravel_token, laravel_session, xsrf_token, expires_at, source_label
      FROM vexpenses_tokens
      WHERE expires_at > NOW()
        AND (company = 'eqs' OR company IS NULL)
      ORDER BY id
    `;

    if (!rows || rows.length === 0) {
      managedTokens = [];
      return [];
    }

    // Preserve lastUsedAt and isValid from previous load
    const prevMap = new Map(managedTokens.map(t => [t.id, t]));
    managedTokens = (rows as any[]).map((row) => {
      const prev = prevMap.get(row.id);
      const cookie = buildCookieString(row.laravel_token, row.laravel_session, row.xsrf_token);
      return {
        id: row.id,
        token: row.laravel_token,
        session: row.laravel_session,
        xsrf: row.xsrf_token,
        expiresAt: new Date(row.expires_at).getTime(),
        sourceLabel: row.source_label,
        cookieString: cookie,
        lastUsedAt: prev?.lastUsedAt ?? 0,
        isValid: prev?.isValid ?? true,
        lastValidatedAt: prev?.lastValidatedAt ?? 0,
      };
    });
    lastLoadTime = Date.now();
    return managedTokens;
  } catch (err) {
    console.error('[TokenValidator] Error loading tokens:', err);
    return managedTokens;
  }
}

function buildCookieString(token: string, session: string | null, xsrf: string | null): string {
  let cookie = `laravel_token=${token}`;
  if (session) cookie += `; laravel_session=${session}`;
  if (xsrf) cookie += `; XSRF-TOKEN=${xsrf}`;
  cookie += '; language=pt-BR';
  return cookie;
}

// LRU rotation — uses the token with the oldest lastUsedAt that's not in cooldown
export async function getNextValidCookie(): Promise<string | null> {
  const tokens = await loadTokensFromDB();
  if (tokens.length === 0) return null;

  const now = Date.now();

  // Filter: not expired, not in cooldown, marked as valid
  const available = tokens.filter(t => {
    if (t.expiresAt < now) return false;
    const cd = cooldownMap.get(t.id);
    if (cd && cd > now) return false;
    return t.isValid;
  });

  if (available.length === 0) {
    // Fallback: use first token even if in cooldown
    console.log('[TokenValidator] All tokens in cooldown or invalid, using fallback');
    const fallback = tokens[0];
    fallback.lastUsedAt = now;
    return fallback.cookieString;
  }

  // LRU — pick the one with oldest lastUsedAt
  available.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const selected = available[0];
  selected.lastUsedAt = now;
  return selected.cookieString;
}

export function markTokenCooldownById(cookieString: string): void {
  for (const t of managedTokens) {
    if (t.cookieString === cookieString) {
      cooldownMap.set(t.id, Date.now() + COOLDOWN_MS);
      console.log(`[TokenValidator] Token ${t.id} (${t.sourceLabel || 'unknown'}) on cooldown for ${COOLDOWN_MS}ms`);
      break;
    }
  }
}

export function markTokenInvalid(cookieString: string): void {
  for (const t of managedTokens) {
    if (t.cookieString === cookieString) {
      t.isValid = false;
      cooldownMap.set(t.id, Date.now() + COOLDOWN_MS);
      console.log(`[TokenValidator] Token ${t.id} marked as invalid`);
      break;
    }
  }
}

export function clearTokenCache(): void {
  managedTokens = [];
  lastLoadTime = 0;
  cooldownMap.clear();
}

export async function getActiveTokenCount(): Promise<number> {
  const tokens = await loadTokensFromDB();
  const now = Date.now();
  return tokens.filter(t => {
    if (t.expiresAt < now) return false;
    const cd = cooldownMap.get(t.id);
    if (cd && cd > now) return false;
    return t.isValid;
  }).length;
}

export async function getTotalTokenCount(): Promise<number> {
  const tokens = await loadTokensFromDB();
  return tokens.length;
}

// Validate a single token by making a lightweight request to app.vexpenses.com
async function validateToken(token: ManagedToken): Promise<boolean> {
  try {
    const response = await fetch(`${APP_URL}/inicio-colaborador`, {
      headers: {
        'Cookie': token.cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });

    // If redirected to login, token is expired
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') || '';
      if (location.includes('/login')) {
        console.log(`[TokenValidator] Token ${token.id} expired (redirected to login)`);
        return false;
      }
    }

    if (response.status >= 400) {
      console.log(`[TokenValidator] Token ${token.id} invalid (status ${response.status})`);
      return false;
    }

    // Token is valid — refresh cookies if server sent new ones
    const setCookies = response.headers.getSetCookie?.() || [];
    let updated = false;
    let newToken = token.token;
    let newSession = token.session;
    let newXsrf = token.xsrf;

    for (const sc of setCookies) {
      const match = sc.match(/^([^=]+)=([^;]+)/);
      if (!match) continue;
      const [, name, value] = match;
      if (name === 'laravel_token') { newToken = value; updated = true; }
      else if (name === 'laravel_session') { newSession = value; updated = true; }
      else if (name === 'XSRF-TOKEN') { newXsrf = value; updated = true; }
    }

    if (updated && sql) {
      const newExpires = new Date(Date.now() + TOKEN_REFRESH_MS).toISOString();
      await sql`
        UPDATE vexpenses_tokens
        SET laravel_token = ${newToken},
            laravel_session = ${newSession},
            xsrf_token = ${newXsrf},
            expires_at = ${newExpires},
            updated_at = NOW()
        WHERE id = ${token.id}
      `;
      // Update in-memory
      token.token = newToken;
      token.session = newSession;
      token.xsrf = newXsrf;
      token.expiresAt = Date.now() + TOKEN_REFRESH_MS;
      token.cookieString = buildCookieString(newToken, newSession, newXsrf);
      console.log(`[TokenValidator] Token ${token.id} refreshed with new cookies`);
    }

    token.isValid = true;
    token.lastValidatedAt = Date.now();
    return true;
  } catch (err) {
    console.log(`[TokenValidator] Token ${token.id} validation error:`, err);
    // Don't mark as invalid on network errors — might be transient
    return token.isValid;
  }
}

// Validate all tokens that haven't been validated recently
export async function validateAllTokens(): Promise<{ total: number; valid: number; invalid: number }> {
  if (validationInProgress) {
    console.log('[TokenValidator] Validation already in progress, skipping');
    return { total: managedTokens.length, valid: 0, invalid: 0 };
  }

  validationInProgress = true;
  try {
    const tokens = await loadTokensFromDB();
    const now = Date.now();
    const toValidate = tokens.filter(t =>
      t.isValid && (now - t.lastValidatedAt) > VALIDATION_INTERVAL_MS
    );

    if (toValidate.length === 0) {
      return { total: tokens.length, valid: tokens.filter(t => t.isValid).length, invalid: tokens.filter(t => !t.isValid).length };
    }

    console.log(`[TokenValidator] Validating ${toValidate.length} tokens...`);

    // Validate sequentially to avoid burst
    let valid = 0;
    let invalid = 0;
    for (const token of toValidate) {
      const isValid = await validateToken(token);
      if (isValid) valid++;
      else invalid++;
      // Small delay between validations
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[TokenValidator] Validation complete: ${valid} valid, ${invalid} invalid`);
    return { total: tokens.length, valid, invalid };
  } finally {
    validationInProgress = false;
  }
}

// Get token stats for debugging
export async function getTokenStats(): Promise<{
  total: number;
  active: number;
  inCooldown: number;
  invalid: number;
  tokens: Array<{ id: number; sourceLabel: string | null; isValid: boolean; inCooldown: boolean; expiresAt: number }>;
}> {
  const tokens = await loadTokensFromDB();
  const now = Date.now();
  return {
    total: tokens.length,
    active: tokens.filter(t => t.isValid && (!cooldownMap.get(t.id) || cooldownMap.get(t.id)! < now)).length,
    inCooldown: tokens.filter(t => {
      const cd = cooldownMap.get(t.id);
      return cd && cd > now;
    }).length,
    invalid: tokens.filter(t => !t.isValid).length,
    tokens: tokens.map(t => ({
      id: t.id,
      sourceLabel: t.sourceLabel,
      isValid: t.isValid,
      inCooldown: (cooldownMap.get(t.id) ?? 0) > now,
      expiresAt: t.expiresAt,
    })),
  };
}
