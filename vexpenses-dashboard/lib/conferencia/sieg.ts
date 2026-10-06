/**
 * SIEG — download de XML NF-e por chave de acesso.
 * Port de sieg_handler.py: cookies COFRE.AUTH persistidos em disco,
 * login Playwright headless como fallback, addKeys + downloadXmlLot + zip.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import https from 'https';
import { unzipFirstFile } from './zip';

const SIEG_HUB_URL = 'https://hub.sieg.com/handler/hubInfo.ashx';
const SIEG_DOWNLOAD_URL = 'https://down.sieg.com/download.ashx';
const SIEG_AUTH_URL = 'https://auth.sieg.com';
const SIEG_HUB_HOME = 'https://hub.sieg.com/';
const CERTIFICATE_ID = process.env.SIEG_CERTIFICATE_ID || '29309-80464753000197';
const SIEG_EMAIL = process.env.SIEG_EMAIL || '';
const SIEG_SENHA = process.env.SIEG_SENHA || '';

const COOKIES_FILE = path.join(process.cwd(), 'private-downloads', 'sieg_cookies.json');

let cookies: Record<string, string> | null = null;
let cookiesLoaded = false;

function cookieHeader(): string {
  return Object.entries(cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
}

function httpPost(url: string, body: FormData | URLSearchParams | undefined, timeoutMs = 30000): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const data = isForm ? (body as any) : body ? Buffer.from((body as URLSearchParams).toString()) : undefined;
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          Cookie: cookieHeader(),
          ...(isForm && data?.getHeaders ? data.getHeaders() : {}),
          ...(data && !isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf-8') }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(isForm && data.getBuffer ? data.getBuffer() : data);
    req.end();
  });
}

function httpPostMultipart(url: string, fields: Record<string, string>, timeoutMs = 30000): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const boundary = '----sieg' + Date.now().toString(16);
    const parts: Buffer[] = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const data = Buffer.concat(parts);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          Cookie: cookieHeader(),
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': data.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf-8') }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpGet(url: string, timeoutMs = 30000, hops = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { Cookie: cookieHeader() }, timeout: timeoutMs },
      (res) => {
        // down.sieg.com redireciona (302) pro host real do zip — requests seguia
        // sozinho no Python; aqui seguimos manualmente até 5 hops.
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (hops >= 5) return reject(new Error('redirects demais'));
          return resolve(httpGet(res.headers.location, timeoutMs, hops + 1));
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function carregarCookies(): boolean {
  if (cookiesLoaded) return !!cookies?.['COFRE.AUTH'];
  cookiesLoaded = true;
  try {
    const raw = JSON.parse(readFileSync(COOKIES_FILE, 'utf-8'));
    if (raw && raw['COFRE.AUTH']) {
      cookies = raw;
      return true;
    }
  } catch {}
  return false;
}

function salvarCookies() {
  try {
    mkdirSync(path.dirname(COOKIES_FILE), { recursive: true });
    writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  } catch (e: any) {
    console.warn('[sieg] falha ao salvar cookies:', e?.message);
  }
}

async function cookiesValidos(): Promise<boolean> {
  if (!cookies?.['COFRE.AUTH']) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await httpPost(`${SIEG_HUB_URL}?action=getInfoCompanyHub&cnpjOrCpf=`, undefined, 20000);
      const data = JSON.parse(r.text || 'null');
      if (r.status === 200 && data && !data.error) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** Login via Playwright headless — retorna true se obteve COFRE.AUTH. */
async function fazerLogin(): Promise<boolean> {
  if (!SIEG_EMAIL || !SIEG_SENHA) {
    console.warn('[sieg] SIEG_EMAIL/SIEG_SENHA não configurados');
    return false;
  }
  let browser: any = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(SIEG_AUTH_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.fill('#txtEmail', SIEG_EMAIL);
    await page.waitForTimeout(500);
    await page.fill('#txtPassword', SIEG_SENHA);
    await page.waitForTimeout(500);
    await page.click('#btnSubmit');
    await page.waitForURL(SIEG_HUB_HOME + '**', { timeout: 30000 });
    await page.waitForTimeout(2000);
    const list = await ctx.cookies();
    const found: Record<string, string> = {};
    for (const c of list) if (/sieg/.test(c.domain)) found[c.name] = c.value;
    await ctx.close();
    if (!found['COFRE.AUTH']) {
      console.error('[sieg] login ok mas COFRE.AUTH ausente');
      return false;
    }
    cookies = found;
    cookiesLoaded = true;
    salvarCookies();
    console.log('[sieg] login ok (COFRE.AUTH renovado)');
    return true;
  } catch (e: any) {
    console.error('[sieg] login falhou:', e?.message);
    return false;
  } finally {
    try { await browser?.close(); } catch {}
  }
}

export async function garantirAutenticacao(): Promise<boolean> {
  carregarCookies();
  if (await cookiesValidos()) return true;
  return fazerLogin();
}

/** Pré-adiciona chaves ao SIEG em lotes (evita 10s por NF). */
export async function preAdicionarChaves(chaves: string[]): Promise<number> {
  const validas = chaves.map((c) => c.trim()).filter((c) => c.length === 44 && /^\d+$/.test(c));
  let added = 0;
  for (let i = 0; i < validas.length; i += 50) {
    const batch = validas.slice(i, i + 50);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await httpPostMultipart(
          `${SIEG_HUB_URL}?action=addKeys&cnpjOrCpf=`,
          { certificateId: CERTIFICATE_ID, keys: batch.join(',') },
          60000,
        );
        const j = JSON.parse(r.text || '{}');
        added += j.TotalSuccess || 0;
        break;
      } catch {
        await new Promise((r2) => setTimeout(r2, 3000));
      }
    }
  }
  if (added > 0) await new Promise((r) => setTimeout(r, 10000));
  return added;
}

async function adicionarChave(chave: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await httpPostMultipart(
        `${SIEG_HUB_URL}?action=addKeys&cnpjOrCpf=`,
        { certificateId: CERTIFICATE_ID, keys: chave },
        30000,
      );
      return JSON.parse(r.text || '{}');
    } catch {
      await new Promise((r2) => setTimeout(r2, 3000));
    }
  }
  throw new Error(`addKeys falhou (3 tentativas) ${chave}`);
}

async function solicitarDownload(chave: string, tipoXml = 1): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await httpPostMultipart(
        `${SIEG_HUB_URL}?action=downloadXmlLot&cnpjOrCpf=`,
        { keysToDownload: `${chave}|${tipoXml}` },
        15000,
      );
      const j = JSON.parse(r.text || '{}');
      if (!j.Success) throw new Error(`SIEG download: ${j.Message}`);
      return j.ZipKey;
    } catch (e: any) {
      if (attempt === 2) throw e;
      await new Promise((r2) => setTimeout(r2, 3000));
    }
  }
  throw new Error('downloadXmlLot falhou');
}

async function baixarZip(zipKey: string): Promise<Buffer> {
  const [token, partsStr] = zipKey.split('|');
  const parts = parseInt(partsStr, 10);
  const all: Buffer[] = [];
  for (let i = 1; i <= parts; i++) {
    let ok = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        all.push(await httpGet(`${SIEG_DOWNLOAD_URL}?zippart=${token}&part=${i}`, 30000));
        ok = true;
        break;
      } catch {
        await new Promise((r2) => setTimeout(r2, 3000));
      }
    }
    if (!ok) throw new Error(`baixar_zip falhou na parte ${i}`);
  }
  return Buffer.concat(all);
}

/**
 * Baixa o XML da NF-e pela chave. O Python chama pre_adicionar_chaves em lote
 * antes — dentro do retry, addKeys é dead code (só executaria com flags que
 * nunca sobem). Aqui: download direto com retries; quem precisa adicionar a
 * chave chama preAdicionarChaves no orquestrador.
 */
export async function baixarXmlSieg(chaveAcesso: string, tipoXml = 1, maxRetries = 3): Promise<string | null> {
  const chave = chaveAcesso.trim();
  if (chave.length !== 44 || !/^\d+$/.test(chave)) return null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const zipKey = await solicitarDownload(chave, tipoXml);
      const zipBuf = await baixarZip(zipKey);
      const entry = unzipFirstFile(zipBuf);
      if (!entry) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      return entry.data.toString('utf-8');
    } catch (e: any) {
      console.warn(`[sieg] tentativa ${attempt + 1} falhou ${chave}:`, e?.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}
