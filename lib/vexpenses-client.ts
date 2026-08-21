const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

export function getApiUrl() {
  return API_URL;
}

export function getApiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Authorization': API_KEY,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'User-Agent': BROWSER_UA,
    'Origin': 'https://app.vexpenses.com',
    'Referer': 'https://app.vexpenses.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    ...extra,
  };
}

export async function getApiHeadersWithCookie(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers = getApiHeaders(extra);
  const { getNextLaravelCookie } = await import('./laravel-token');
  const cookie = await getNextLaravelCookie();
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  return headers;
}

export async function vexpensesFetch(path: string, options?: RequestInit): Promise<Response> {
  const headers = await getApiHeadersWithCookie(
    options?.headers ? Object.fromEntries(Object.entries(options.headers)) : undefined
  );
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function vexpensesFetchWithRotation(
  path: string,
  options?: RequestInit,
  maxRetries?: number
): Promise<Response> {
  const { getNextLaravelCookie, markTokenCooldown, getActiveTokenCount } = await import('./laravel-token');
  const retries = maxRetries ?? 3;

  for (let attempt = 0; attempt < retries; attempt++) {
    const cookie = await getNextLaravelCookie();
    const headers = getApiHeaders(
      options?.headers ? Object.fromEntries(Object.entries(options.headers)) : undefined
    );
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const resp = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
    });

    if (resp.status !== 403) return resp;

    if (cookie) {
      markTokenCooldown(cookie);
    }

    const activeCount = await getActiveTokenCount();
    if (activeCount > 0 && attempt < retries - 1) {
      await sleep(500);
      continue;
    }

    if (attempt < retries - 1) {
      await sleep(Math.min(2000 * Math.pow(2, attempt), 8000));
      continue;
    }
    return resp;
  }
  return new Response('{"error":"Max retries exceeded"}', { status: 403, headers: { 'Content-Type': 'application/json' } });
}
