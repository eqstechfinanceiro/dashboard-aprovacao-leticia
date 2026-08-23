import { getNextLaravelCookie, markTokenCooldown, clearLaravelTokenCache } from './laravel-token';

export function getApiUrl(): string {
  return process.env.VEXPENSES_API_URL || 'https://api.vexpenses.com';
}

export function getApiHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${process.env.VEXPENSES_API_KEY || ''}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

export async function getApiHeadersWithCookie(extraHeaders?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const apiKey = process.env.VEXPENSES_API_KEY;
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const cookie = await getLaravelCookieStringWithRotation();
  if (cookie) {
    headers['Cookie'] = cookie;
  }

  return headers;
}

async function getLaravelCookieStringWithRotation(): Promise<string | null> {
  return await getNextLaravelCookie();
}

export async function vexpensesFetchWithRotation(
  path: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${getApiUrl()}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const cookie = await getNextLaravelCookie();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const apiKey = process.env.VEXPENSES_API_KEY;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        cache: 'no-store',
      });

      if (response.status === 429) {
        console.log(`[VExpenses Client] 429 on attempt ${attempt + 1}/${maxRetries} for ${path}`);
        if (cookie) markTokenCooldown(cookie);
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }

      if (response.status === 401 || response.status === 403) {
        console.log(`[VExpenses Client] ${response.status} on attempt ${attempt + 1}/${maxRetries} for ${path}`);
        if (cookie) markTokenCooldown(cookie);
        clearLaravelTokenCache();
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
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
