// Integração com o portal EQS / Protheus REST (microsiga).
// O Protheus já faz a distribuição DF-e da SEFAZ server-side (com o certificado
// da EQS no servidor), então conseguimos metadados + DANFE de qualquer NF-e
// recebida só com a chave de acesso — sem certificado local.
//
// Endpoints usados (descobertos no bundle Angular do portal):
//   POST {base}/api/oauth2/v1/token      → JWT (grant_type=password)
//   GET  {base}/wsrnfesefaz/{chave44}    → metadados da nota recebida
//   GET  {base}/wsrdanfe/entrada/{chave} → DANFE em PDF
//
// Credenciais via env: PORTAL_EQS_USER / PORTAL_EQS_PASS (mesma conta da
// automação). Se ausentes, as funções retornam null — a feature degrada
// silenciosamente em vez de quebrar a página fiscal.

import https from 'https';

const BASE = (process.env.PORTAL_EQS_BASE || 'https://microsiga.eqsengenharia.com.br:17080/rest').replace(/\/+$/, '');
const USER = process.env.PORTAL_EQS_USER || '';
const PASS = process.env.PORTAL_EQS_PASS || '';
const TENANT = process.env.PORTAL_EQS_TENANT || '02,02';
const TIMEOUT_MS = 25_000;

export function eqsPortalConfigured(): boolean {
  return !!USER && !!PASS;
}

// ---- HTTP helper (cert do microsiga é auto-assinado → rejectUnauthorized:false)
function httpRequest(path: string, opts: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${BASE}${path}`,
      {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        rejectUnauthorized: false,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            contentType: String(res.headers['content-type'] || ''),
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ---- JWT com cache (reutiliza até expirar)
let cachedToken = '';
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const res = await httpRequest('/api/oauth2/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: `grant_type=password&username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`,
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`token HTTP ${res.status}`);
  const data = JSON.parse(res.body.toString('utf-8'));
  const token = data.access_token || '';
  if (!token) throw new Error('token ausente na resposta');
  cachedToken = token;
  // Protheus devolve expires_in (s). Margem de 1min; fallback 5min.
  const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 300_000;
  tokenExpiresAt = Date.now() + ttl - 60_000;
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    tenantid: TENANT,
    CUSRID: '001859',
    TIPOUSUARIO: 'protheus',
    'X-PO-Screen-Lock': 'true',
    Accept: 'application/json, text/plain, */*',
  };
}

export interface EqsNotaSefaz {
  filial: string;
  cnpjEmitente: string;
  emitente: string;
  chave: string;
  numero: string;
  serie: string;
  situacaoDoc: string;
  dataRecebimento: string;
  valor: number;
  raw: Record<string, unknown>;
}

// Metadados da NF-e recebida (inbox SEFAZ do Protheus). null se não achar.
export async function eqsGetNotaByChave(chave: string): Promise<EqsNotaSefaz | null> {
  if (!eqsPortalConfigured() || !/^\d{44}$/.test(chave)) return null;
  const token = await getToken();
  const res = await httpRequest(`/wsrnfesefaz/${chave}`, { headers: authHeaders(token) });
  if (res.status < 200 || res.status >= 300) return null;
  const d = JSON.parse(res.body.toString('utf-8'));
  if (!d || !d.CC00CHVNFE) return null;
  return {
    filial: String(d.CC00FILIAL || ''),
    cnpjEmitente: String(d.CC00CNPJEM || ''),
    emitente: String(d.CC00NOEMIT || ''),
    chave: String(d.CC00CHVNFE || ''),
    numero: String(d.CC00NUMNFE || ''),
    serie: String(d.CC00SERNFE || ''),
    situacaoDoc: String(d.CC00SITDOC || ''),
    dataRecebimento: String(d.DC00DTREC || ''),
    valor: Number(d.NC00VLDOC) || 0,
    raw: d,
  };
}

// DANFE em PDF renderizado pelo Protheus. null se indisponível.
export async function eqsGetDanfePdf(chave: string): Promise<Buffer | null> {
  if (!eqsPortalConfigured() || !/^\d{44}$/.test(chave)) return null;
  const token = await getToken();
  const res = await httpRequest(`/wsrdanfe/entrada/${chave}`, { headers: authHeaders(token) });
  if (res.status < 200 || res.status >= 300 || !res.body.subarray(0, 5).equals(Buffer.from('%PDF-'))) return null;
  return res.body;
}

// Fornecedor pelo CNPJ (14 dígitos). Retorna {cod, loja} do SA2 ou null.
export async function eqsGetFornecedorByCnpj(cnpj: string): Promise<{ cod: string; loja: string } | null> {
  if (!eqsPortalConfigured() || !/^\d{14}$/.test(cnpj)) return null;
  const token = await getToken();
  const res = await httpRequest(`/wsrfornecedor?CA2CGC=${cnpj}&page=1&pageSize=3`, { headers: authHeaders(token) });
  if (res.status < 200 || res.status >= 300) return null;
  const items = JSON.parse(res.body.toString('utf-8')).items || [];
  const f = items.find((x: any) => String(x.CA2CGC || '').trim() === cnpj) || items[0];
  if (!f) return null;
  return { cod: String(f.CA2COD || '').trim(), loja: String(f.CA2LOJA || '01').trim() };
}

// Processo de pagamento pela nota de serviço (doc + fornecedor).
// Retorna o NDSRECNO — usado no deep link do portal Angular.
export async function eqsGetProcessoRecno(doc: string, fornecCod: string): Promise<string | null> {
  if (!eqsPortalConfigured() || !doc || !fornecCod) return null;
  const token = await getToken();
  const q = new URLSearchParams({
    page: '1',
    pageSize: '50',
    DDSEMISSA_DE: '2024-01-01T00:00:00-03:00',
    DDSEMISSA_ATE: '2030-12-31',
    CDSDOC: doc.trim(),
    CDSFORNEC: fornecCod,
    CDSMODELO: 'S',
    CDSMODELO_NOT_IN: 'R',
  });
  const res = await httpRequest(`/wsrprocpag?${q}`, { headers: authHeaders(token) });
  if (res.status < 200 || res.status >= 300) return null;
  const items = JSON.parse(res.body.toString('utf-8')).items || [];
  const recno = items[0]?.NDSRECNO;
  return recno ? String(recno).trim() : null;
}
