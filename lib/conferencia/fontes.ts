/**
 * Fontes de documento da conferência — cadeia:
 *   1. fiscal_doc_cache (Postgres — XML já obtido antes, inclui uploads do bot)
 *   2. Z01_XMLNFE (XML embutido na tabela Z01 do TOTVS — zero custo, mesmo genericQuery)
 *   3. SDS.DS_XML (XML da fila MATA143 — cobre nota já lançada, zero custo)
 *   4. Protheus capturarXML (cria processo de pagamento que puxa o XML da SEFAZ
 *      pro SDS — mesma ação do botão "Criar Processo" do portal EQS)
 *   5. SIEG (download por chave — cookies COFRE.AUTH / login Playwright)
 *   6. MeuDanfe get/xml (GRÁTIS — só XMLs já no repositório da conta; nunca paga)
 * Todo XML obtido de 2-6 é persistido no cache pra não baixar de novo.
 */
import { sql } from '../db/neon';
import { fetchZ01XmlByChave, fetchSdsXmlByChave } from './totvs';
import { garantirAutenticacao, baixarXmlSieg, preAdicionarChaves } from './sieg';
import { baixarXmlMeudanfe, meudanfeEnabled } from './meudanfe';
import { eqsCapturarXml, eqsGetNotaByChave, eqsPortalConfigured } from '../fiscal/eqs-portal';
import { parseNfeXml } from './xml-parser';
import type { NfeXml } from './xml-parser';

export interface XmlResult {
  xml: string;
  parsed: NfeXml;
  fonte: 'cache' | 'z01_xmlnfe' | 'sds' | 'protheus_capture' | 'sieg' | 'meudanfe';
}

let cacheEnsured = false;
export async function ensureDocCacheTable() {
  if (cacheEnsured || !sql) return;
  cacheEnsured = true;
  await sql`
    CREATE TABLE IF NOT EXISTS fiscal_doc_cache (
      chave_acesso VARCHAR(44) PRIMARY KEY,
      xml TEXT,
      mime VARCHAR(64) NOT NULL DEFAULT 'text/xml',
      fonte VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
}

async function cacheGet(chave: string): Promise<string | null> {
  try {
    const rows = await sql`SELECT xml FROM fiscal_doc_cache WHERE chave_acesso=${chave} AND xml IS NOT NULL`;
    return rows[0]?.xml || null;
  } catch { return null; }
}

async function cachePut(chave: string, xml: string, fonte: string) {
  try {
    await sql`INSERT INTO fiscal_doc_cache (chave_acesso, xml, mime, fonte)
      VALUES (${chave}, ${xml}, 'text/xml', ${fonte})
      ON CONFLICT (chave_acesso) DO UPDATE SET xml=EXCLUDED.xml, fonte=EXCLUDED.fonte`;
  } catch {}
}

/** Chaves que já têm XML em cache — usado pra decidir quais pré-registrar no SIEG. */
export async function cacheHasChaves(chaves: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!chaves.length) return out;
  try {
    const rows = await sql`SELECT chave_acesso FROM fiscal_doc_cache WHERE chave_acesso = ANY(${chaves}) AND xml IS NOT NULL`;
    for (const r of rows) out.add(r.chave_acesso);
  } catch {}
  return out;
}

/** Pré-registra chaves no SIEG em lote (uma vez por ciclo — evita 10s/NF). */
export async function prepararSieg(chaves: string[]): Promise<number> {
  const auth = await garantirAutenticacao();
  if (!auth) return -1;
  return preAdicionarChaves(chaves);
}

/**
 * Obtém o XML da NF pela chave — cache → Z01 → SIEG.
 * Retorna { xml, parsed, fonte } ou null se nenhuma fonte produziu XML parseável.
 */
/** Persiste XML obtido por fonte externa (ex.: upload do bot Lince via /api/fiscal/doc-cache). */
export async function salvarXmlCache(chaveAcesso: string, xml: string, fonte: string): Promise<boolean> {
  const chave = (chaveAcesso || '').trim();
  if (!/^\d{44}$/.test(chave) || !xml || !xml.includes('<')) return false;
  await ensureDocCacheTable();
  await cachePut(chave, xml, fonte);
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Captura o XML via Protheus (POST /wsrprocpag/capturarXML) e aguarda ele cair
 * no SDS — a captura SEFAZ é assíncrona dentro do Protheus. Quando a nota já
 * está em processo de pagamento o Protheus recusa com "ja em processo"; nesse
 * caso re-olhamos o SDS uma última vez (o XML pode ter chegado depois da nossa
 * primeira consulta). Retorna o XML ou null.
 */
async function capturarXmlProtheus(chave: string): Promise<string | null> {
  try {
    const nota = await eqsGetNotaByChave(chave);
    const cap = await eqsCapturarXml(chave, { cnpjDestino: nota?.cnpjDestino || undefined });
    if (!cap.ok && !cap.jaEmProcesso) {
      console.warn(`[fontes] capturarXML ${chave.slice(0, 10)}… → ${cap.error || 'falhou'}`);
      return null;
    }
    const tentativas = cap.ok ? 6 : 1; // criou processo → captura assíncrona; já-em-processo → re-check único
    for (let i = 0; i < tentativas; i++) {
      if (i > 0) await sleep(4000);
      const xml = (await fetchSdsXmlByChave(chave)) || (await fetchZ01XmlByChave(chave));
      if (xml) return xml;
    }
    return null;
  } catch (e: any) {
    console.warn(`[fontes] capturarXML ${chave.slice(0, 10)}… erro:`, e?.message);
    return null;
  }
}

export async function obterXmlNfe(chaveAcesso: string, opts: { sieg?: boolean; meudanfe?: boolean; protheusCapture?: boolean } = {}): Promise<XmlResult | null> {
  const chave = (chaveAcesso || '').trim();
  if (chave.length !== 44) return null;

  const cached = await cacheGet(chave);
  if (cached) {
    const parsed = parseNfeXml(cached);
    if (parsed) return { xml: cached, parsed, fonte: 'cache' };
  }

  const z01xml = await fetchZ01XmlByChave(chave);
  if (z01xml) {
    const parsed = parseNfeXml(z01xml);
    if (parsed) {
      await cachePut(chave, z01xml, 'z01_xmlnfe');
      return { xml: z01xml, parsed, fonte: 'z01_xmlnfe' };
    }
  }

  const sdsXml = await fetchSdsXmlByChave(chave);
  if (sdsXml) {
    const parsed = parseNfeXml(sdsXml);
    if (parsed) {
      await cachePut(chave, sdsXml, 'sds');
      return { xml: sdsXml, parsed, fonte: 'sds' };
    }
  }

  if (opts.protheusCapture !== false && eqsPortalConfigured()) {
    const capXml = await capturarXmlProtheus(chave);
    if (capXml) {
      const parsed = parseNfeXml(capXml);
      if (parsed) {
        await cachePut(chave, capXml, 'protheus_capture');
        return { xml: capXml, parsed, fonte: 'protheus_capture' };
      }
    }
  }

  if (opts.sieg !== false) {
    if (await garantirAutenticacao()) {
      const xml = await baixarXmlSieg(chave);
      if (xml) {
        const parsed = parseNfeXml(xml);
        if (parsed) {
          await cachePut(chave, xml, 'sieg');
          return { xml, parsed, fonte: 'sieg' };
        }
      }
    }
  }

  if (opts.meudanfe !== false && meudanfeEnabled()) {
    const xml = await baixarXmlMeudanfe(chave);
    if (xml) {
      const parsed = parseNfeXml(xml);
      if (parsed) {
        await cachePut(chave, xml, 'meudanfe');
        return { xml, parsed, fonte: 'meudanfe' };
      }
    }
  }
  return null;
}
