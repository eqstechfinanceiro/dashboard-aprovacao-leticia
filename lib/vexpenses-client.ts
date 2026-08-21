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

export async function vexpensesFetch(path: string, options?: RequestInit): Promise<Response> {
  const headers = getApiHeaders(
    options?.headers ? Object.fromEntries(Object.entries(options.headers)) : undefined
  );
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}
