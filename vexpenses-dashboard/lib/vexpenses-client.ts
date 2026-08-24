import { vexpensesRateLimiter } from './vexpenses-rate-limiter';
import { getNextValidCookie, markTokenCooldownById, clearTokenCache } from './vexpenses-token-validator';

// Legacy compat re-exports for code still using laravel-token
export { getLaravelCookieString, markTokenCooldown, clearLaravelTokenCache, isLaravelTokenExpired, getActiveTokenCount } from './laravel-token';

export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
}

export function getApiHeaders(): Record<string, string> {
  return {
    'Authorization': process.env.VEXPENSES_API_KEY || '',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Origin': 'https://app.vexpenses.com',
  'Referer': 'https://app.vexpenses.com',
};

function extractXsrfTokenFromCookie(cookie: string): string | null {
  const match = cookie.match(/XSRF-TOKEN=([^;]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

export async function getApiHeadersWithCookie(extraHeaders?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...BROWSER_HEADERS,
    ...extraHeaders,
  };

  const apiKey = process.env.VEXPENSES_API_KEY;
  if (apiKey) {
    headers['Authorization'] = apiKey;
  }

  return headers;
}


export async function vexpensesFetchWithRotation(
  path: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${getApiUrl()}${path}`;
  let lastError: Error | null = null;

  const isV2 = path.includes('/v2/');
  const isV3 = path.includes('/v3/');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...BROWSER_HEADERS,
      ...options.headers as Record<string, string>,
    };

    if (isV2) {
      const apiKey = process.env.VEXPENSES_API_KEY;
      if (apiKey) {
        headers['Authorization'] = apiKey;
      }
    } else if (isV3) {
      const cookie = await getNextValidCookie();
      if (cookie) {
        headers['Cookie'] = cookie;
        const xsrf = extractXsrfTokenFromCookie(cookie);
        if (xsrf) {
          headers['X-XSRF-TOKEN'] = xsrf;
        }
      }
    } else {
      const apiKey = process.env.VEXPENSES_API_KEY;
      if (apiKey) {
        headers['Authorization'] = apiKey;
      }
      const cookie = await getNextValidCookie();
      if (cookie) {
        headers['Cookie'] = cookie;
        const xsrf = extractXsrfTokenFromCookie(cookie);
        if (xsrf) {
          headers['X-XSRF-TOKEN'] = xsrf;
        }
      }
    }

    try {
      const response = await vexpensesRateLimiter.enqueue(
        () => fetch(url, { ...options, headers, cache: 'no-store' }),
        5 // default priority
      );

      if (response.status === 429) {
        console.log(`[VExpenses Client] 429 on attempt ${attempt + 1}/${maxRetries} for ${path}`);
        vexpensesRateLimiter.pause(60_000);
        const cookieHeader = headers['Cookie'];
        if (cookieHeader) markTokenCooldownById(cookieHeader);
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
      }

      if (response.status === 401 || response.status === 403) {
        console.log(`[VExpenses Client] ${response.status} on attempt ${attempt + 1}/${maxRetries} for ${path}`);
        const cookieHeader = headers['Cookie'];
        if (cookieHeader) markTokenCooldownById(cookieHeader);
        // Only clear token cache for v3/non-v2 (auth issue, not WAF)
        if (isV3 || (!isV2 && !isV3)) {
          clearTokenCache();
        }
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }

      return response;
    } catch (error: any) {
      lastError = error;
      console.log(`[VExpenses Client] Error on attempt ${attempt + 1}/${maxRetries} for ${path}: ${error.message}`);
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxRetries} attempts: ${path}`);
}
