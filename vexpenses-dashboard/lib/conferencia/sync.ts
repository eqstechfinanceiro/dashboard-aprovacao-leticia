/**
 * syncConferencia — conferência de mercadoria rodando no sync-worker da VPS.
 *
 * Modelo ledger por nota (não "dia a dia"): cada NF da SF1 vira linha em
 * fiscal_notas com review_status. Ciclo curto (warm ~45min) confere só:
 *   - linhas novas (sem registro)
 *   - 'pendente' (divergente — reprocessa: XML vem do cache, TOTVS pode ter
 *      sido corrigido)
 *   - 'falha_tecnica' elegível a retry (backoff exponencial)
 * 'auto_ok'/'confirmado_*'/'cancelado' NUNCA reprocessam — dedup garantido.
 *
 * Janela móvel por F1_DTDIGIT (default 14d): cobre fim de semana e notas
 * digitadas com atraso — o gap sexta→segunda do PC não existe mais.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { sql } from '../db/neon';
import { ensureFiscalTables, computeReviewStatus } from '../fiscal/fiscal-db';
import { fetchMercadoriaNfs } from './totvs';
import { ensureDocCacheTable, cacheHasChaves, prepararSieg, obterXmlNfe } from './fontes';
import { compareNf } from './comparator';

const DOCS_DIR = () => path.join(process.cwd(), 'private-downloads', 'fiscal');
const JANELA_DIAS = Math.max(2, parseInt(process.env.CONFERENCIA_JANELA_DIAS || '14', 10));
const MAX_NFS_CICLO = Math.max(1, parseInt(process.env.CONFERENCIA_MAX_NFS || '250', 10));
const RETRY_BASE_MIN = 30;
const RETRY_MAX_MIN = 24 * 60;

let colsEnsured = false;
async function ensureRetryCols() {
  if (colsEnsured || !sql) return;
  colsEnsured = true;
  await sql`ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS conferencia_tentativas INT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS conferencia_next_retry TIMESTAMPTZ`;
}

const trim = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
const nul = (v: any) => { const s = trim(v); return s ? s.slice(0, 300) : null; };
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const isoDate = (v: any) => { const s = trim(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

interface LedgerRow {
  id: number;
  key: string;
  review_status: string;
  conferencia_tentativas: number;
  conferencia_next_retry: string | null;
}

function dedupKey(doc: string, serie: string, filial: string, emissao: string | null, fornecedor: string) {
  return [trim(doc), trim(serie), trim(filial), emissao || '1900-01-01', trim(fornecedor)].join('|');
}

async function upsertNota(runId: number, nota: {
  doc: string; serie: string; filial: string; fornecedor: string; cnpj: string;
  valor: number | null; emissao: string | null; chave: string;
  autoStatus: string; autoResumo: string; checks: unknown; extra: unknown;
  tentativas: number; nextRetry: Date | null;
}): Promise<number> {
  const reviewStatus = computeReviewStatus(nota.autoStatus as any);
  const res = await sql`
    INSERT INTO fiscal_notas
      (run_id, tipo, doc, serie, filial, fornecedor, cnpj, valor, emissao,
       chave_acesso, auto_status, auto_resumo, checks, extra, review_status,
       conferencia_tentativas, conferencia_next_retry)
    VALUES
      (${runId}, 'mercadoria', ${trim(nota.doc).slice(0, 60)}, ${nul(nota.serie)},
       ${nul(nota.filial)}, ${nul(nota.fornecedor)}, ${nul(nota.cnpj)},
       ${nota.valor}, ${nota.emissao}, ${nul(nota.chave)},
       ${nota.autoStatus}, ${nul(nota.autoResumo)},
       ${nota.checks ? JSON.stringify(nota.checks) : null},
       ${nota.extra ? JSON.stringify(nota.extra) : null},
       ${reviewStatus}, ${nota.tentativas}, ${nota.nextRetry ? nota.nextRetry.toISOString() : null})
    ON CONFLICT (tipo, doc, COALESCE(serie, ''), COALESCE(filial, ''), COALESCE(emissao, '1900-01-01'::date), COALESCE(fornecedor, '')) DO UPDATE SET
      run_id = EXCLUDED.run_id,
      cnpj = COALESCE(EXCLUDED.cnpj, fiscal_notas.cnpj),
      valor = COALESCE(EXCLUDED.valor, fiscal_notas.valor),
      chave_acesso = COALESCE(EXCLUDED.chave_acesso, fiscal_notas.chave_acesso),
      auto_status = EXCLUDED.auto_status,
      auto_resumo = EXCLUDED.auto_resumo,
      checks = COALESCE(EXCLUDED.checks, fiscal_notas.checks),
      extra = COALESCE(EXCLUDED.extra, fiscal_notas.extra),
      review_status = CASE
        WHEN fiscal_notas.review_status IN ('confirmado_ok', 'confirmado_erro')
          THEN fiscal_notas.review_status
        ELSE EXCLUDED.review_status
      END,
      conferencia_tentativas = EXCLUDED.conferencia_tentativas,
      conferencia_next_retry = EXCLUDED.conferencia_next_retry,
      updated_at = NOW()
    RETURNING id`;
  return res[0].id as number;
}

async function anexarXml(notaId: number, xml: string, chave: string) {
  try {
    mkdirSync(DOCS_DIR(), { recursive: true });
    const safe = `NFe_${chave}.xml`;
    writeFileSync(path.join(DOCS_DIR(), `${notaId}_${safe}`), xml, 'utf-8');
    await sql`UPDATE fiscal_notas SET doc_path=${`fiscal/${notaId}_${safe}`}, doc_nome=${safe} WHERE id=${notaId}`;
  } catch (e: any) {
    console.warn('[conferencia] falha ao anexar XML:', e?.message);
  }
}

export interface ConferenciaResult {
  runId: number | null;
  total: number;
  conferidas: number;
  match: number;
  divergentes: number;
  falhas: number;
  puladas: number;
  fontes: Record<string, number>;
  error?: string;
}

export async function syncConferencia(opts: { janelaDias?: number; useSieg?: boolean; maxNfs?: number } = {}): Promise<ConferenciaResult> {
  const out: ConferenciaResult = {
    runId: null, total: 0, conferidas: 0, match: 0, divergentes: 0,
    falhas: 0, puladas: 0, fontes: {},
  };
  if (!sql) { out.error = 'DB indisponível'; return out; }

  try {
    await ensureFiscalTables();
    await ensureDocCacheTable();
    await ensureRetryCols();

    const janela = opts.janelaDias ?? JANELA_DIAS;
    const dateTo = new Date();
    const dateFrom = new Date(Date.now() - janela * 86400_000);
    const fromStr = ymd(dateFrom);
    const toStr = ymd(dateTo);

    // Ledger: linhas existentes de mercadoria → dedup por chave natural.
    const ledger = new Map<string, LedgerRow>();
    const rows = await sql`
      SELECT id, doc, serie, filial, emissao, fornecedor, review_status,
             conferencia_tentativas, conferencia_next_retry
      FROM fiscal_notas WHERE tipo='mercadoria'`;
    for (const r of rows) {
      const em = r.emissao ? new Date(r.emissao).toISOString().slice(0, 10) : '1900-01-01';
      ledger.set(dedupKey(r.doc, r.serie, r.filial, em, r.fornecedor), {
        id: r.id, key: '', review_status: r.review_status,
        conferencia_tentativas: r.conferencia_tentativas ?? 0,
        conferencia_next_retry: r.conferencia_next_retry,
      });
    }

    const { nfs, errors } = await fetchMercadoriaNfs(fromStr, toStr, 'SPED');
    out.total = nfs.length;
    if (errors.length) console.warn('[conferencia] erros parciais TOTVS:', errors.join('; '));

    const fromIso = `${fromStr.slice(0, 4)}-${fromStr.slice(4, 6)}-${fromStr.slice(6, 8)}`;
    const toIso = `${toStr.slice(0, 4)}-${toStr.slice(4, 6)}-${toStr.slice(6, 8)}`;
    const run = await sql`
      INSERT INTO fiscal_runs (tipo, date_from, date_to, hostname, total_notas, push_version)
      VALUES ('mercadoria', ${fromIso}, ${toIso}, 'vps-worker', ${out.total}, 'vps-f1')
      RETURNING id`;
    out.runId = run[0]?.id ?? null;
    const runId = out.runId ?? 0; // RETURNING sempre devolve id; 0 é fallback defensivo

    if (!nfs.length) return out;

    const maxNfs = opts.maxNfs ?? MAX_NFS_CICLO;

    // Elegíveis = sem linha | pendente | falha_tecnica com retry vencido.
    const TERMINAL = new Set(['auto_ok', 'confirmado_ok', 'confirmado_erro', 'cancelado']);
    const now = Date.now();
    const elegiveis = nfs.filter((nf) => {
      const h = nf.header;
      const k = dedupKey(h.f1_doc, h.f1_serie, h.f1_filial, isoDate(h.f1_emissao), h.f1_fornece);
      const ex = ledger.get(k);
      if (!ex) return true;
      if (TERMINAL.has(ex.review_status)) { out.puladas++; return false; }
      if (ex.review_status === 'falha_tecnica' && ex.conferencia_next_retry) {
        if (new Date(ex.conferencia_next_retry).getTime() > now) { out.puladas++; return false; }
      }
      return true;
    }).slice(0, maxNfs);

    // Pré-registra no SIEG as chaves elegíveis fora do cache (lote único).
    if (opts.useSieg !== false && elegiveis.length) {
      const chaves = elegiveis.map((nf) => trim(nf.header.f1_chvnfe)).filter((c) => /^\d{44}$/.test(c));
      const cached = await cacheHasChaves(chaves);
      const faltando = chaves.filter((c) => !cached.has(c));
      if (faltando.length) {
        try {
          const added = await prepararSieg(faltando);
          console.log(`[conferencia] SIEG pré-registro: ${added}/${faltando.length} chaves`);
        } catch (e: any) {
          console.warn('[conferencia] SIEG pré-registro falhou:', e?.message);
        }
      }
    }

    for (const nf of elegiveis) {
      const h = nf.header;
      const emissao = isoDate(h.f1_emissao);
      const k = dedupKey(h.f1_doc, h.f1_serie, h.f1_filial, emissao, h.f1_fornece);
      const ex = ledger.get(k);
      const tent = (ex?.conferencia_tentativas ?? 0) + 1;
      const chave = trim(h.f1_chvnfe);

      const base = {
        doc: trim(h.f1_doc), serie: trim(h.f1_serie), filial: trim(h.f1_filial),
        fornecedor: trim(h.f1_fornece), cnpj: trim(h.a2_cgc),
        valor: Number(h.f1_valbrut) || null, emissao, chave,
      };
      const extraBase = {
        empresa: h._empresa, usuario: h.f1_userlgi || null,
        f1_dtdigit: trim(h.f1_dtdigit), itens_totvs: nf.items.length,
      };

      let xmlRes = null;
      try {
        xmlRes = await obterXmlNfe(chave, { sieg: opts.useSieg !== false });
      } catch (e: any) {
        console.warn(`[conferencia] fontes falharam ${chave}:`, e?.message);
      }

      if (!xmlRes) {
        const nextRetry = new Date(now + Math.min(RETRY_BASE_MIN * Math.pow(2, tent - 1), RETRY_MAX_MIN) * 60_000);
        await upsertNota(runId, {
          ...base,
          autoStatus: 'erro',
          autoResumo: 'XML não obtido em nenhuma fonte (cache/Z01/SIEG)',
          checks: [{ field: 'XML', expected: 'NF-e', actual: chave ? 'não obtido' : 'sem chave na SF1', match: false }],
          extra: { ...extraBase, tentativa: tent },
          tentativas: tent, nextRetry,
        });
        out.falhas++;
        out.conferidas++;
        continue;
      }

      out.fontes[xmlRes.fonte] = (out.fontes[xmlRes.fonte] || 0) + 1;
      let cmp;
      try {
        cmp = compareNf(h, nf.items, xmlRes.parsed);
      } catch (e: any) {
        const nextRetry = new Date(now + RETRY_BASE_MIN * 60_000);
        await upsertNota(runId, {
          ...base, autoStatus: 'erro', autoResumo: `comparação falhou: ${e?.message}`,
          checks: null, extra: { ...extraBase, fonte_xml: xmlRes.fonte, tentativa: tent },
          tentativas: tent, nextRetry,
        });
        out.falhas++;
        out.conferidas++;
        continue;
      }

      const autoStatus = cmp.status === 'MATCH' ? 'match' : 'divergente';
      const notaId = await upsertNota(runId, {
        ...base, autoStatus, autoResumo: cmp.summary,
        checks: [...cmp.header_checks, ...cmp.item_checks.flat()],
        extra: {
          ...extraBase, fonte_xml: xmlRes.fonte, mismatch_count: cmp.mismatch_count,
          chave_xml: xmlRes.parsed.chave || null, tentativa: tent,
        },
        tentativas: 0, nextRetry: null,
      });
      if (autoStatus !== 'match') {
        await anexarXml(notaId, xmlRes.xml, chave || 'sem-chave');
        out.divergentes++;
      } else {
        out.match++;
      }
      out.conferidas++;
      ledger.set(k, { id: notaId, key: k, review_status: computeReviewStatus(autoStatus as any), conferencia_tentativas: 0, conferencia_next_retry: null });
    }

    if (out.runId) {
      await sql`
        UPDATE fiscal_runs SET total_notas=${out.total}, matches=${out.match},
          divergentes=${out.divergentes}, erros=${out.falhas}, pendentes=0
        WHERE id=${out.runId}`;
    }
    return out;
  } catch (e: any) {
    out.error = e?.message || String(e);
    return out;
  }
}
