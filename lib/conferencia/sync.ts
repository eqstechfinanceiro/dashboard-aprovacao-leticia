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
import { carregarTesOverride } from './tes-override';

const DOCS_DIR = () => path.join(process.cwd(), 'private-downloads', 'fiscal');
const JANELA_DIAS = Math.max(2, parseInt(process.env.CONFERENCIA_JANELA_DIAS || '14', 10));
const MAX_NFS_CICLO = Math.max(1, parseInt(process.env.CONFERENCIA_MAX_NFS || '250', 10));
const RETRY_BASE_MIN = 30;
const RETRY_MAX_MIN = 24 * 60;
const LOG_MAX = 150;

// Estado do ciclo ao vivo — a página /fiscal lê via GET /api/fiscal/ciclo.
let stateEnsured = false;
async function ensureStateTable() {
  if (stateEnsured || !sql) return;
  stateEnsured = true;
  await sql`
    CREATE TABLE IF NOT EXISTS conferencia_state (
      id INT PRIMARY KEY,
      fase TEXT NOT NULL DEFAULT 'idle',
      janela_dias INT,
      total INT NOT NULL DEFAULT 0,
      elegiveis INT NOT NULL DEFAULT 0,
      conferidas INT NOT NULL DEFAULT 0,
      match INT NOT NULL DEFAULT 0,
      divergentes INT NOT NULL DEFAULT 0,
      falhas INT NOT NULL DEFAULT 0,
      puladas INT NOT NULL DEFAULT 0,
      fontes JSONB NOT NULL DEFAULT '{}',
      current_doc TEXT,
      last_run_id BIGINT,
      error TEXT,
      log JSONB NOT NULL DEFAULT '[]',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`INSERT INTO conferencia_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  await sql`ALTER TABLE conferencia_state ADD COLUMN IF NOT EXISTS elegiveis INT NOT NULL DEFAULT 0`;
}

let stateLog: { t: string; m: string }[] = [];
async function setState(patch: Record<string, any>, logMsg?: string) {
  if (!sql) return;
  if (logMsg) {
    stateLog.push({ t: new Date().toISOString(), m: logMsg });
    if (stateLog.length > LOG_MAX) stateLog = stateLog.slice(-LOG_MAX);
    patch.log = JSON.stringify(stateLog);
    console.log(`[conferencia] ${logMsg}`);
  }
  const sets = Object.keys(patch).map((k, i) => `${k}=$${i + 1}`).join(', ');
  const vals = Object.values(patch);
  try {
    await (sql as any).query(
      `UPDATE conferencia_state SET ${sets}, updated_at=NOW() WHERE id=1`, vals);
  } catch {}
}

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
  tentativas: number; nextRetry: Date | null; cstOnly?: boolean; tipo?: string;
}): Promise<number> {
  const reviewStatus = computeReviewStatus(nota.autoStatus as any, nota.cstOnly === true);
  const tipo = nota.tipo || 'mercadoria';
  // Elo por chave: o fornecedor é gravado em formatos diferentes conforme a
  // fonte (código SA2 no sync, xNome no import de XML) e a constraint por
  // fornecedor criava linhas duplicadas da mesma NF. Chave casada → UPDATE na
  // linha existente sem tocar nas colunas da constraint.
  if (/^\d{44}$/.test(nota.chave || '')) {
    const found = await sql`
      SELECT id, tipo, review_status, review_nota, reviewed_by, reviewed_at,
             doc_path, doc_nome, resultados_id
      FROM fiscal_notas
      WHERE chave_acesso = ${nota.chave} AND tipo IN ('mercadoria', 'vexpenses', 'serviço')
      ORDER BY id`;
    if (found.length) {
      // Dup cross-tipo (mesma chave como mercadoria+vexpenses): a linha do tipo
      // alvo é a canônica — as outras herdam review/doc nela e são removidas,
      // senão o flip de tipo viola fiscal_notas_tipo_chave_uq.
      const target =
        found.find((r: any) => r.tipo === 'vexpenses') ||
        found.find((r: any) => r.tipo === tipo) ||
        found[found.length - 1];
      const id = target.id as number;
      const rank = (s: string) => (s === 'confirmado_erro' ? 0 : s === 'confirmado_ok' ? 1 : 2);
      const stales = found
        .filter((r: any) => r.id !== id)
        .sort((a: any, b: any) => rank(a.review_status) - rank(b.review_status));
      for (const stale of stales) {
        await sql`
          UPDATE fiscal_notas SET
            review_status = CASE
              WHEN review_status IN ('confirmado_ok', 'confirmado_erro') THEN review_status
              WHEN ${stale.review_status ?? null} IN ('confirmado_ok', 'confirmado_erro') THEN ${stale.review_status ?? null}
              ELSE review_status END,
            review_nota = COALESCE(review_nota, ${stale.review_nota ?? null}),
            reviewed_by = COALESCE(reviewed_by, ${stale.reviewed_by ?? null}),
            reviewed_at = COALESCE(reviewed_at, ${stale.reviewed_at ?? null}),
            doc_path = COALESCE(doc_path, ${stale.doc_path ?? null}),
            doc_nome = COALESCE(doc_nome, ${stale.doc_nome ?? null}),
            resultados_id = COALESCE(resultados_id, ${stale.resultados_id ?? null}),
            updated_at = NOW()
          WHERE id = ${id}`;
        await sql`DELETE FROM fiscal_notas WHERE id = ${stale.id}`;
      }
      await sql`
        UPDATE fiscal_notas SET
          tipo = CASE WHEN tipo = 'vexpenses' THEN 'vexpenses' ELSE ${tipo} END,
          run_id = ${runId},
          cnpj = COALESCE(${nul(nota.cnpj)}, cnpj),
          valor = COALESCE(${nota.valor}, valor),
          auto_status = ${nota.autoStatus},
          auto_resumo = COALESCE(${nul(nota.autoResumo)}, auto_resumo),
          checks = COALESCE(${nota.checks ? JSON.stringify(nota.checks) : null}::jsonb, checks),
          extra = COALESCE(${nota.extra ? JSON.stringify(nota.extra) : null}::jsonb, extra),
          review_status = CASE
            WHEN review_status IN ('confirmado_ok', 'confirmado_erro') THEN review_status
            ELSE ${reviewStatus}
          END,
          conferencia_tentativas = ${nota.tentativas},
          conferencia_next_retry = ${nota.nextRetry ? nota.nextRetry.toISOString() : null},
          updated_at = NOW()
        WHERE id = ${id}`;
      return id;
    }
  }
  const res = await sql`
    INSERT INTO fiscal_notas
      (run_id, tipo, doc, serie, filial, fornecedor, cnpj, valor, emissao,
       chave_acesso, auto_status, auto_resumo, checks, extra, review_status,
       conferencia_tentativas, conferencia_next_retry)
    VALUES
      (${runId}, ${tipo}, ${trim(nota.doc).slice(0, 60)}, ${nul(nota.serie)},
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

// Notas de despesa VExpenses são lançadas no TOTVS como SPED (espécie de
// mercadoria) e entrariam na fila misturadas. O elo confiável é a chave NF-e,
// carregada de 3 fontes (primeira que acha ganha):
//   1. z01.totvs_z01_items.chvnfe — itens de despesa lançados no TOTVS pela
//      automação protheus-reports-vex (elo direto despesa↔chave↔doc)
//   2. expense_doc_classification.chave_acesso — chave lida do anexo da
//      despesa por OCR (Gemini) ou classificação humana
//   3. raw_data.observation — chave digitada na observação (legado, raro)
// Quem casa vira tipo='vexpenses' e carrega expense_id/report_id no extra —
// o vínculo "a qual relatório pertence" que o SD1 mostra.
interface VexLink { expense_id: number | null; report_id: number | null; report_name: string | null }

async function loadVexChaves(): Promise<Map<string, VexLink>> {
  const m = new Map<string, VexLink>();
  const add = (chave: any, link: VexLink) => {
    const c = String(chave || '').replace(/\D/g, '');
    if (/^\d{44}$/.test(c) && !m.has(c)) m.set(c, link);
  };
  try {
    const rows = await sql`
      SELECT z.chvnfe AS chave, e.id AS expense_id, e.report_id, rp.name AS report_name
      FROM z01.totvs_z01_items z
      LEFT JOIN prestacao_expenses e ON e.id::text = z.vexpenses_id
      LEFT JOIN prestacao_reports rp ON rp.id = e.report_id
      WHERE z.chvnfe ~ '^[0-9]{44}$'`;
    for (const r of rows as any[]) {
      add(r.chave, { expense_id: r.expense_id ?? null, report_id: r.report_id ?? null, report_name: r.report_name || null });
    }
  } catch (e: any) {
    console.warn('[conferencia] falha ao carregar chaves vexpenses (z01):', e?.message);
  }
  try {
    const rows = await sql`
      SELECT dc.chave_acesso AS chave, dc.expense_id, dc.report_id, rp.name AS report_name
      FROM expense_doc_classification dc
      LEFT JOIN prestacao_reports rp ON rp.id = dc.report_id
      WHERE dc.chave_acesso ~ '^[0-9]{44}$'`;
    for (const r of rows as any[]) {
      add(r.chave, { expense_id: r.expense_id, report_id: r.report_id, report_name: r.report_name || null });
    }
  } catch (e: any) {
    console.warn('[conferencia] falha ao carregar chaves vexpenses (doc_class):', e?.message);
  }
  try {
    const rows = await sql`
      SELECT e.id AS expense_id, e.report_id, rp.name AS report_name,
             regexp_replace(COALESCE(e.raw_data->>'observation', ''), '[^0-9]', '', 'g') AS chave
      FROM prestacao_expenses e
      LEFT JOIN prestacao_reports rp ON rp.id = e.report_id
      WHERE e.raw_data->>'observation' ~ '[0-9]{4}'`;
    for (const r of rows as any[]) {
      add(r.chave, { expense_id: r.expense_id, report_id: r.report_id, report_name: r.report_name || null });
    }
  } catch (e: any) {
    console.warn('[conferencia] falha ao carregar chaves vexpenses (observation):', e?.message);
  }
  return m;
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
    await ensureStateTable();
    stateLog = [];

    const janela = opts.janelaDias ?? JANELA_DIAS;
    const dateTo = new Date();
    const dateFrom = new Date(Date.now() - janela * 86400_000);
    const fromStr = ymd(dateFrom);
    const toStr = ymd(dateTo);

    // Ledger: linhas existentes (mercadoria + vexpenses reclassificadas) → dedup.
    // Indexa por dedupKey E por 'C:'+chave — linhas gravadas com fornecedor em
    // formato divergente (nome vs código SA2) continuam deduplicando pela chave.
    // id DESC: em grupos duplicados, a linha mais nova vence como canônica.
    const ledger = new Map<string, LedgerRow>();
    const rows = await sql`
      SELECT id, doc, serie, filial, emissao, fornecedor, chave_acesso, review_status,
             conferencia_tentativas, conferencia_next_retry
      FROM fiscal_notas WHERE tipo IN ('mercadoria', 'vexpenses')
      ORDER BY id DESC`;
    for (const r of rows) {
      const em = r.emissao ? new Date(r.emissao).toISOString().slice(0, 10) : '1900-01-01';
      const row: LedgerRow = {
        id: r.id,
        key: dedupKey(r.doc, r.serie, r.filial, em, r.fornecedor),
        review_status: r.review_status,
        conferencia_tentativas: r.conferencia_tentativas ?? 0,
        conferencia_next_retry: r.conferencia_next_retry,
      };
      ledger.set(row.key, row);
      const ck = trim(r.chave_acesso);
      if (/^\d{44}$/.test(ck)) {
        const k2 = `C:${ck}`;
        if (!ledger.has(k2)) ledger.set(k2, row);
      }
    }

    await setState(
      { fase: 'totvs', janela_dias: janela, total: 0, conferidas: 0, match: 0, divergentes: 0, falhas: 0, puladas: 0, fontes: '{}', current_doc: null, error: null, log: '[]', started_at: new Date().toISOString(), finished_at: null },
      `ciclo iniciado — janela ${janela}d (${fromStr}~${toStr})`);

    const { nfs, errors } = await fetchMercadoriaNfs(fromStr, toStr, 'SPED');
    out.total = nfs.length;
    if (errors.length) console.warn('[conferencia] erros parciais TOTVS:', errors.join('; '));
    await setState({ total: out.total }, `TOTVS: ${out.total} NFs na janela${errors.length ? ` (${errors.join('; ')})` : ''}`);

    const fromIso = `${fromStr.slice(0, 4)}-${fromStr.slice(4, 6)}-${fromStr.slice(6, 8)}`;
    const toIso = `${toStr.slice(0, 4)}-${toStr.slice(4, 6)}-${toStr.slice(6, 8)}`;
    const run = await sql`
      INSERT INTO fiscal_runs (tipo, date_from, date_to, hostname, total_notas, push_version)
      VALUES ('mercadoria', ${fromIso}, ${toIso}, 'vps-worker', ${out.total}, 'vps-f1')
      RETURNING id`;
    out.runId = run[0]?.id ?? null;
    const runId = out.runId ?? 0; // RETURNING sempre devolve id; 0 é fallback defensivo

    if (!nfs.length) return out;

    // Chaves NF-e amarradas a despesas VExpenses — classifica tipo e já
    // reclassifica retroativamente notas que entraram como mercadoria.
    const vexChaves = await loadVexChaves();
    if (vexChaves.size) {
      const rec = await sql`
        UPDATE fiscal_notas n SET tipo='vexpenses', updated_at=NOW()
        WHERE n.tipo='mercadoria' AND n.chave_acesso = ANY(${[...vexChaves.keys()]})
          AND NOT EXISTS (
            SELECT 1 FROM fiscal_notas x
            WHERE x.tipo='vexpenses' AND x.chave_acesso = n.chave_acesso)
        RETURNING n.id`;
      const n = Array.isArray(rec) ? rec.length : 0;
      if (n) console.log(`[conferencia] ${n} nota(s) reclassificadas mercadoria→vexpenses`);
    }

    // Dup residual cross-tipo: mesma chave como mercadoria E vexpenses (o import
    // legado insere 'mercadoria' sem casar a linha vex — scoping por tipo). A
    // linha vex é a canônica e herda review/doc da dup antes de removê-la —
    // senão o flip acima violaria fiscal_notas_tipo_chave_uq no próximo ciclo.
    const collapsed = await sql`
      WITH d AS (
        SELECT n.id, n.review_status, n.review_nota, n.reviewed_by, n.reviewed_at,
               n.doc_path, n.doc_nome, n.resultados_id, v.id AS keeper
        FROM fiscal_notas n
        JOIN fiscal_notas v ON v.tipo='vexpenses' AND v.chave_acesso = n.chave_acesso
        WHERE n.tipo='mercadoria' AND n.chave_acesso IS NOT NULL
      ), upd AS (
        UPDATE fiscal_notas k SET
          review_status = CASE
            WHEN k.review_status IN ('confirmado_ok','confirmado_erro') THEN k.review_status
            WHEN d.review_status IN ('confirmado_ok','confirmado_erro') THEN d.review_status
            WHEN k.review_status IN ('pendente','falha_tecnica') THEN d.review_status
            ELSE k.review_status END,
          review_nota = COALESCE(k.review_nota, d.review_nota),
          reviewed_by = COALESCE(k.reviewed_by, d.reviewed_by),
          reviewed_at = COALESCE(k.reviewed_at, d.reviewed_at),
          doc_path = COALESCE(k.doc_path, d.doc_path),
          doc_nome = COALESCE(k.doc_nome, d.doc_nome),
          resultados_id = COALESCE(k.resultados_id, d.resultados_id),
          updated_at = NOW()
        FROM d WHERE k.id = d.keeper
        RETURNING d.id AS stale_id
      )
      DELETE FROM fiscal_notas n WHERE n.id IN (SELECT stale_id FROM upd)
      RETURNING n.id`;
    const nCollapsed = Array.isArray(collapsed) ? collapsed.length : 0;
    if (nCollapsed) console.log(`[conferencia] ${nCollapsed} dup(s) cross-tipo (mesma chave mercadoria+vexpenses) consolidadas`);

    const maxNfs = opts.maxNfs ?? MAX_NFS_CICLO;

    // Elegíveis = sem linha | pendente | falha_tecnica com retry vencido.
    const TERMINAL = new Set(['auto_ok', 'auto_ok_aviso', 'confirmado_ok', 'confirmado_erro', 'cancelado']);
    const now = Date.now();
    const keyFor = (h: any) => {
      const ck = trim(h.f1_chvnfe);
      return /^\d{44}$/.test(ck)
        ? `C:${ck}`
        : dedupKey(h.f1_doc, h.f1_serie, h.f1_filial, isoDate(h.f1_emissao), h.f1_fornece);
    };
    const elegiveis = nfs.filter((nf) => {
      const h = nf.header;
      const k = keyFor(h);
      const ex = ledger.get(k) || ledger.get(dedupKey(h.f1_doc, h.f1_serie, h.f1_filial, isoDate(h.f1_emissao), h.f1_fornece));
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
          await setState({ fase: 'sieg_prep' }, `SIEG pré-registro: ${faltando.length} chaves fora do cache`);
          const added = await prepararSieg(faltando);
          console.log(`[conferencia] SIEG pré-registro: ${added}/${faltando.length} chaves`);
          await setState({}, `SIEG pré-registro: ${added}/${faltando.length} adicionadas`);
        } catch (e: any) {
          console.warn('[conferencia] SIEG pré-registro falhou:', e?.message);
          await setState({}, `SIEG pré-registro falhou: ${e?.message}`);
        }
      }
    }
    await setState({ fase: 'conferindo', elegiveis: elegiveis.length }, `conferindo ${elegiveis.length} notas (${out.puladas} puladas por dedup/backoff)`);

    let i = 0;
    for (const nf of elegiveis) {
      i++;
      const h = nf.header;
      const emissao = isoDate(h.f1_emissao);
      const k = keyFor(h);
      const ex = ledger.get(k) || ledger.get(dedupKey(h.f1_doc, h.f1_serie, h.f1_filial, emissao, h.f1_fornece));
      const tent = (ex?.conferencia_tentativas ?? 0) + 1;
      const chave = trim(h.f1_chvnfe);
      const vex = vexChaves.get(chave) || null;

      const base = {
        doc: trim(h.f1_doc), serie: trim(h.f1_serie), filial: trim(h.f1_filial),
        fornecedor: trim(h.f1_fornece), cnpj: trim(h.a2_cgc),
        valor: Number(h.f1_valbrut) || null, emissao, chave,
      };
      const extraBase = {
        empresa: h._empresa, usuario: h.f1_userlgi || null,
        f1_dtdigit: trim(h.f1_dtdigit), itens_totvs: nf.items.length,
        ...(vex ? { vexpenses: { expense_id: vex.expense_id, report_id: vex.report_id, report_name: vex.report_name } } : {}),
      };

      let xmlRes = null;
      try {
        xmlRes = await obterXmlNfe(chave, { sieg: opts.useSieg !== false });
      } catch (e: any) {
        console.warn(`[conferencia] fontes falharam ${chave}:`, e?.message);
      }

      if (!xmlRes) {
        const nextRetry = new Date(now + Math.min(RETRY_BASE_MIN * Math.pow(2, tent - 1), RETRY_MAX_MIN) * 60_000);
        await setState(
          { conferidas: out.conferidas + 1, falhas: out.falhas + 1, current_doc: base.doc },
          `[${i}/${elegiveis.length}] NF ${base.doc} s/${base.serie} — XML não obtido (tentativa ${tent}, retry ${nextRetry.toISOString().slice(11, 16)}Z)`);
        await upsertNota(runId, {
          ...base, tipo: vex ? 'vexpenses' : 'mercadoria',
          autoStatus: 'erro',
          autoResumo: 'XML não obtido em nenhuma fonte (cache/Z01/SDS/SIEG)',
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
        const tesOvr = await carregarTesOverride(h._empresa || 'EQS');
        cmp = compareNf(h, nf.items, xmlRes.parsed, tesOvr);
      } catch (e: any) {
        const nextRetry = new Date(now + RETRY_BASE_MIN * 60_000);
        await upsertNota(runId, {
          ...base, tipo: vex ? 'vexpenses' : 'mercadoria',
          autoStatus: 'erro', autoResumo: `comparação falhou: ${e?.message}`,
          checks: null, extra: { ...extraBase, fonte_xml: xmlRes.fonte, tentativa: tent },
          tentativas: tent, nextRetry,
        });
        out.falhas++;
        out.conferidas++;
        continue;
      }

      const autoStatus = cmp.status === 'MATCH' ? 'match' : 'divergente';
      const notaId = await upsertNota(runId, {
        ...base, tipo: vex ? 'vexpenses' : 'mercadoria', autoStatus, autoResumo: cmp.summary,
        checks: [...cmp.header_checks, ...cmp.item_checks.flat()],
        extra: {
          ...extraBase, fonte_xml: xmlRes.fonte, mismatch_count: cmp.mismatch_count,
          chave_xml: xmlRes.parsed.chave || null, tentativa: tent,
        },
        tentativas: 0, nextRetry: null, cstOnly: cmp.cst_only === true,
      });
      if (autoStatus !== 'match') {
        await anexarXml(notaId, xmlRes.xml, chave || 'sem-chave');
        out.divergentes++;
      } else {
        out.match++;
      }
      out.conferidas++;
      if (autoStatus !== 'match' || i % 10 === 0 || i === elegiveis.length) {
        await setState(
          { conferidas: out.conferidas, match: out.match, divergentes: out.divergentes, falhas: out.falhas, fontes: JSON.stringify(out.fontes), current_doc: base.doc },
          autoStatus !== 'match'
            ? cmp.cst_only
              ? `[${i}/${elegiveis.length}] NF ${base.doc} — AVISO CST (${cmp.mismatch_count} × ${xmlRes.fonte})`
              : `[${i}/${elegiveis.length}] NF ${base.doc} — DIVERGENTE (${cmp.mismatch_count} × ${xmlRes.fonte})`
            : `[${i}/${elegiveis.length}] ${out.match} ok / ${out.divergentes} div / ${out.falhas} falhas`);
      }
      ledger.set(k, { id: notaId, key: k, review_status: computeReviewStatus(autoStatus as any, cmp.cst_only === true), conferencia_tentativas: 0, conferencia_next_retry: null });
    }

    if (out.runId) {
      await sql`
        UPDATE fiscal_runs SET total_notas=${out.total}, matches=${out.match},
          divergentes=${out.divergentes}, erros=${out.falhas}, pendentes=0
        WHERE id=${out.runId}`;
    }
    await setState(
      { fase: 'idle', conferidas: out.conferidas, match: out.match, divergentes: out.divergentes, falhas: out.falhas, puladas: out.puladas, fontes: JSON.stringify(out.fontes), current_doc: null, last_run_id: out.runId, finished_at: new Date().toISOString() },
      `ciclo concluído — ${out.conferidas} conferidas: ${out.match} ok / ${out.divergentes} div / ${out.falhas} falhas (${out.puladas} puladas)`);
    return out;
  } catch (e: any) {
    out.error = e?.message || String(e);
    await setState({ fase: 'idle', error: out.error, finished_at: new Date().toISOString() }, `ciclo ERRO: ${out.error}`).catch(() => {});
    return out;
  }
}
