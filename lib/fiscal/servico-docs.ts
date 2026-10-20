/**
 * Anexos de notas de serviço — portal EQS antigo (Django, /old).
 *
 * O runner local baixa só o primeiro doc tipo 'G' por processo — quando a nota
 * falha na validação (doc/valor não encontrado) o fiscal precisa dos OUTROS
 * anexos do processo (a NFS real costuma estar lá junto com boletos). Este
 * módulo lista TODOS os documentos do processo e os anexa à nota.
 *
 * Fluxo (descoberto no runner legado download-notas-de-servico/automation.py):
 *   1. Login Django: GET /old/auth/ (csrftoken) → POST /old/auth/ → sessionid
 *   2. Processo: wsrfornecedor (CNPJ→SA2) + wsrprocpag (doc+fornec→NDSRECNO)
 *   3. Chave: CDSDOC+CDSSERIE+CDSFORNEC+CDSLOJA+NDSRECNO
 *   4. GET /old/api/arquivo/lista/{grupo}/{filial}/SDS?chave=... → docs
 *      [{arquivo_id, tipo('G'=nota,'B'=boleto,...), nome, data}]
 *   5. GET /old/arquivo/{arquivo_id} → binário
 *
 * Persistência: fiscal_notas_docs (um row por arquivo) + fiscal_notas.doc_path
 * aponta pro primeiro doc 'G' quando a nota ainda não tem evidência.
 */
import https from 'https';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { sql } from '../db/neon';
import { FISCAL_DOCS_DIR } from './fiscal-db';
import { eqsGetFornecedorByCnpj, eqsGetProcesso, eqsPortalConfigured } from './eqs-portal';

const OLD_BASE = 'https://portal.eqsengenharia.com.br';
const USER = process.env.PORTAL_EQS_USER || '';
const PASS = process.env.PORTAL_EQS_PASS || '';
// Tenants (grupo,filial) tentados em ordem — serviço não carrega empresa.
const TENANTS = ['02,02', '11,01'];
const MAX_DOC_BYTES = 8 * 1024 * 1024;
const RESYNC_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 45_000;

let tableEnsured = false;
export async function ensureServicoDocsTable(): Promise<void> {
  if (tableEnsured || !sql) return;
  tableEnsured = true;
  await sql`
    CREATE TABLE IF NOT EXISTS fiscal_notas_docs (
      id BIGSERIAL PRIMARY KEY,
      nota_id BIGINT NOT NULL REFERENCES fiscal_notas(id) ON DELETE CASCADE,
      arquivo_id BIGINT NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT,
      path TEXT NOT NULL,
      size INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (nota_id, arquivo_id)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_fiscal_notas_docs_nota ON fiscal_notas_docs(nota_id)`;
}

// ---- HTTP raw (portal antigo usa session cookie Django; cert ok mas cookie jar manual)
function httpReq(url: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; headers: Record<string, any>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: opts.method || 'GET', headers: opts.headers || {}, rejectUnauthorized: false, timeout: TIMEOUT_MS },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ---- Sessão Django (reutilizada até expirar)
let sessionCookies = '';
let sessionAt = 0;

function collectCookies(jar: Map<string, string>, headers: Record<string, any>) {
  for (const c of (headers['set-cookie'] as string[]) || []) {
    const kv = c.split(';')[0];
    const i = kv.indexOf('=');
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
}

export async function oldPortalSession(force = false): Promise<string | null> {
  if (!force && sessionCookies && Date.now() - sessionAt < 50 * 60 * 1000) return sessionCookies;
  if (!USER || !PASS) return null;
  const jar = new Map<string, string>();
  let r = await httpReq(`${OLD_BASE}/old/auth/`);
  collectCookies(jar, r.headers);
  let csrf = jar.get('csrftoken') || '';
  if (!csrf) {
    const m = r.body.toString('utf-8').match(/csrfmiddlewaretoken["\s]+value="([^"]+)"/);
    if (m) csrf = m[1];
  }
  const cookieStr = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  r = await httpReq(`${OLD_BASE}/old/auth/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${OLD_BASE}/old/auth/`,
      Cookie: cookieStr(),
    },
    body: `username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}&csrfmiddlewaretoken=${encodeURIComponent(csrf)}`,
  });
  collectCookies(jar, r.headers);
  if (!jar.get('sessionid')) return null;
  sessionCookies = cookieStr();
  sessionAt = Date.now();
  return sessionCookies;
}

export interface PortalDocItem {
  arquivo_id: number;
  tipo: string;
  nome: string;
  data: string;
}

export async function oldPortalListDocs(cookies: string, grupo: string, filial: string, chave: string): Promise<PortalDocItem[]> {
  const r = await httpReq(
    `${OLD_BASE}/old/api/arquivo/lista/${grupo}/${filial}/SDS?chave=${encodeURIComponent(chave)}`,
    { headers: { Cookie: cookies, Accept: 'application/json' } }
  );
  if (r.status !== 200) return [];
  try {
    const data = JSON.parse(r.body.toString('utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function oldPortalDownload(cookies: string, arquivoId: number): Promise<Buffer | null> {
  const r = await httpReq(`${OLD_BASE}/old/arquivo/${arquivoId}`, { headers: { Cookie: cookies } });
  if (r.status !== 200 || !r.body.length || r.body.length > MAX_DOC_BYTES) return null;
  return r.body;
}

function buildChave(proc: Record<string, any>): string {
  return (
    String(proc.CDSDOC || '').trim() +
    String(proc.CDSSERIE || '').trim() +
    String(proc.CDSFORNEC || '').trim() +
    String(proc.CDSLOJA || '').trim() +
    String(proc.NDSRECNO || '').trim()
  );
}

function safeName(nome: string): string {
  return (nome || 'documento.pdf').replace(/[<>:"/\\|?*]/g, '_').slice(0, 120);
}

export interface ServicoDocsResumo {
  processadas: number;
  com_docs: number;
  anexados: number;
  sem_docs: number;
  proc_nao_encontrado: number;
  erros: { nota_id: number; erro: string }[];
}

/**
 * Anexa todos os documentos do processo do portal EQS às notas de serviço
 * pendentes/em falha. Idempotente por (nota_id, arquivo_id). `force` reprocessa
 * notas sincronizadas recentemente.
 */
export async function syncServicoDocs(opts: { notaId?: number; limit?: number; force?: boolean } = {}): Promise<ServicoDocsResumo> {
  const out: ServicoDocsResumo = { processadas: 0, com_docs: 0, anexados: 0, sem_docs: 0, proc_nao_encontrado: 0, erros: [] };
  if (!sql || !eqsPortalConfigured()) return out;
  await ensureServicoDocsTable();

  const notaId = opts.notaId || null;
  const limit = Math.min(opts.limit ?? 15, 200);
  const force = !!opts.force;

  const notas = await sql`
    SELECT id, doc, cnpj, fornecedor, doc_path, doc_nome, extra
    FROM fiscal_notas
    WHERE tipo = 'servico'
      AND review_status IN ('pendente', 'falha_tecnica')
      AND cnpj ~ '^[0-9]{14}$'
      AND (${notaId}::bigint IS NULL OR id = ${notaId})
      AND (${force}
           OR extra->>'portal_docs_at' IS NULL
           OR (extra->>'portal_docs_at')::timestamptz < NOW() - (${RESYNC_AFTER_MS} || ' milliseconds')::interval)
    ORDER BY id
    LIMIT ${limit}`;

  if (!notas.length) return out;
  const cookies = await oldPortalSession();
  if (!cookies) {
    out.erros.push({ nota_id: 0, erro: 'login no portal antigo falhou' });
    return out;
  }
  mkdirSync(FISCAL_DOCS_DIR(), { recursive: true });

  for (const n of notas) {
    out.processadas++;
    try {
      // Resolve o processo (doc+fornecedor) no tenant onde ele existir.
      let proc: Record<string, any> | null = null;
      let tenant = TENANTS[0];
      for (const t of TENANTS) {
        const fornec = await eqsGetFornecedorByCnpj(String(n.cnpj).trim(), t).catch(() => null);
        if (!fornec) continue;
        proc = await eqsGetProcesso(String(n.doc).trim(), fornec.cod, t).catch(() => null);
        if (proc) { tenant = t; break; }
      }
      if (!proc) {
        out.proc_nao_encontrado++;
        await sql`UPDATE fiscal_notas SET extra = COALESCE(extra,'{}'::jsonb) || ${JSON.stringify({ portal_docs_at: new Date().toISOString(), portal_docs_count: 0, portal_docs_status: 'proc_nao_encontrado' })}::jsonb, updated_at = NOW() WHERE id = ${n.id}`;
        continue;
      }

      const chave = buildChave(proc);
      const [grupo, filial] = tenant.split(',');
      const docs = await oldPortalListDocs(cookies, grupo, filial, chave);
      if (!docs.length) {
        out.sem_docs++;
        await sql`UPDATE fiscal_notas SET extra = COALESCE(extra,'{}'::jsonb) || ${JSON.stringify({ portal_docs_at: new Date().toISOString(), portal_docs_count: 0, portal_docs_status: 'sem_docs' })}::jsonb, updated_at = NOW() WHERE id = ${n.id}`;
        continue;
      }

      // Já anexados — baixa só o que falta.
      const existentes = new Set(
        (await sql`SELECT arquivo_id::text AS a FROM fiscal_notas_docs WHERE nota_id = ${n.id}`).map((r: any) => r.a)
      );
      let novos = 0;
      let pathPrimeiroG: { path: string; nome: string } | null = null;
      for (const d of docs) {
        const aid = String(d.arquivo_id);
        const nome = safeName(d.nome);
        const rel = `fiscal/sd${n.id}_${aid}_${nome}`;
        if (!existentes.has(aid)) {
          const buf = await oldPortalDownload(cookies, Number(aid));
          if (!buf) continue;
          writeFileSync(path.join(process.cwd(), 'private-downloads', rel), buf);
          await sql`
            INSERT INTO fiscal_notas_docs (nota_id, arquivo_id, nome, tipo, path, size)
            VALUES (${n.id}, ${Number(aid)}, ${nome}, ${d.tipo || ''}, ${rel}, ${buf.length})
            ON CONFLICT (nota_id, arquivo_id) DO NOTHING`;
          novos++;
        }
        if (d.tipo === 'G' && !pathPrimeiroG) pathPrimeiroG = { path: rel, nome };
      }
      out.anexados += novos;
      out.com_docs++;

      // Evidência principal: primeiro doc 'G' (a nota) quando a nota não tem doc.
      if (!n.doc_path && pathPrimeiroG) {
        await sql`UPDATE fiscal_notas SET doc_path = ${pathPrimeiroG.path}, doc_nome = ${pathPrimeiroG.nome}, updated_at = NOW() WHERE id = ${n.id} AND (doc_path IS NULL OR doc_path = '')`;
      }
      const totalDocs = existentes.size + novos;
      await sql`UPDATE fiscal_notas SET extra = COALESCE(extra,'{}'::jsonb) || ${JSON.stringify({ portal_docs_at: new Date().toISOString(), portal_docs_count: totalDocs, portal_docs_status: 'ok' })}::jsonb, updated_at = NOW() WHERE id = ${n.id}`;
    } catch (e: any) {
      out.erros.push({ nota_id: n.id, erro: String(e?.message || e).slice(0, 200) });
    }
  }
  return out;
}
