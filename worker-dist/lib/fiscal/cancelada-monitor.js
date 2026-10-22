"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCanceladaMonitor = syncCanceladaMonitor;
/**
 * syncCanceladaMonitor — vigilância contínua das notas marcadas 'cancelado'.
 *
 * O sync de conferência trata 'cancelado' como status TERMINAL (nunca
 * reprocessa), então sem este monitor uma nota cancelada que foi excluída e
 * re-lançada no TOTVS ficaria invisível — ninguém saberia se o re-lançamento
 * aconteceu nem se veio corrigido.
 *
 * Por nota cancelada (janela configurável, default 180d):
 *   1. fetchNfByIdentidade — SF1+SD1 exatas (doc/série/fornecedor/loja),
 *      incluindo linhas deletadas.
 *   2. Sem SF1 ativa            → 'excluida' (aguardando re-lançamento).
 *   3. SF1 ativa, mesmo hash    → 'aguardando_exclusao' (ainda não mexeram).
 *   4. SF1 ativa, hash mudou (ou voltou após exclusão) → re-lançamento:
 *      re-compara header+itens contra o XML em cache (fontes zero-custo:
 *      cache/Z01/SDS — sem SIEG pago) → 'relancada_ok' | 'relancada_divergente'.
 *      Sem XML disponível → 'relancada_pendente'.
 *   5. Entrada em relancada_* → notifica módulo 'fiscal' + audit.
 *
 * Nunca altera review_status — a confirmação "corrigida" continua humana.
 * Worker-safe: relative imports only, sem Next.js APIs.
 */
const neon_1 = require("../db/neon");
const fiscal_db_1 = require("./fiscal-db");
const totvs_1 = require("../conferencia/totvs");
const fontes_1 = require("../conferencia/fontes");
const comparator_1 = require("../conferencia/comparator");
const tes_override_1 = require("../conferencia/tes-override");
const audit_1 = require("../db/audit");
const notifications_1 = require("../sync/notifications");
const bordero_monitor_1 = require("./bordero-monitor");
const trim = (v) => (v === null || v === undefined ? '' : String(v).trim());
const JANELA_DIAS_DEFAULT = 180;
async function auditSys(action, notaId, details) {
    if (!neon_1.sql)
        return;
    try {
        await (0, audit_1.ensureAuditTable)();
        await (0, neon_1.sql) `
      INSERT INTO audit_log (user_id, user_email, user_name, user_role, action, entity_type, entity_id, details)
      VALUES (NULL, NULL, 'sync-worker', 'system', ${action}, 'fiscal_nota', ${String(notaId)}, ${JSON.stringify(details)}::jsonb)
    `;
    }
    catch { }
}
async function syncCanceladaMonitor(opts = {}) {
    const out = { checked: 0, aguardando: 0, excluidas: 0, relancadas: 0, erros: 0 };
    if (!neon_1.sql) {
        return out;
    }
    await (0, fiscal_db_1.ensureFiscalTables)();
    const janela = opts.janelaDias ?? JANELA_DIAS_DEFAULT;
    const notas = await (0, neon_1.sql) `
    SELECT id, doc, serie, fornecedor, cnpj, valor, tipo, chave_acesso, extra,
           cancelled_by, cancelled_at, monitor_fingerprint, monitor_status
    FROM fiscal_notas
    WHERE review_status = 'cancelado'
      AND cancelled_at > NOW() - (${janela} || ' days')::interval
    ORDER BY cancelled_at DESC
  `;
    const alvo = notas.slice(0, opts.limit ?? 400);
    if (!alvo.length)
        return out;
    const fiscalUsers = await (0, bordero_monitor_1.userIdsWithModule)('fiscal');
    const tesCache = new Map();
    for (const n of alvo) {
        out.checked++;
        const label = `NF ${n.doc}${n.serie ? '/' + n.serie : ''} · ${n.fornecedor || ''}`;
        try {
            const snap = await (0, totvs_1.fetchNfByIdentidade)({
                doc: trim(n.doc),
                serie: trim(n.serie),
                fornec: (0, bordero_monitor_1.fornecedorCodigoNota)(n),
                loja: (0, bordero_monitor_1.lojaNota)(n),
                empresa: trim(n.extra?.empresa).toUpperCase(),
                cnpj: trim(n.cnpj),
            });
            let status;
            let detail = { ultima_verificacao: new Date().toISOString() };
            let fingerprint = n.monitor_fingerprint;
            const prevStatus = n.monitor_status;
            if (!snap.encontrada) {
                status = 'excluida';
                detail.empresa = snap.empresa;
            }
            else {
                const fp = snap.fingerprint;
                const mudou = fingerprint ? fp !== fingerprint : false;
                const voltouDoLimbo = prevStatus === 'excluida';
                if (!mudou && !voltouDoLimbo) {
                    status = 'aguardando_exclusao';
                    fingerprint = fp; // baseline: estado TOTVS atual
                    detail.empresa = snap.empresa;
                }
                else {
                    // Re-lançamento detectado — re-confere contra o XML em cache.
                    fingerprint = fp;
                    detail.empresa = snap.empresa;
                    detail.dtdigit = trim(snap.header?.f1_dtdigit);
                    const chave = trim(n.chave_acesso || snap.header?.f1_chvnfe || '');
                    let xmlRes = null;
                    if (/^\d{44}$/.test(chave)) {
                        try {
                            xmlRes = await (0, fontes_1.obterXmlNfe)(chave, { sieg: false, meudanfe: false, protheusCapture: false });
                        }
                        catch { }
                    }
                    if (!xmlRes) {
                        status = 'relancada_pendente';
                    }
                    else {
                        const emp = snap.empresa || 'EQS';
                        if (!tesCache.has(emp))
                            tesCache.set(emp, await (0, tes_override_1.carregarTesOverride)(emp).catch(() => undefined));
                        const cmp = (0, comparator_1.compareNf)(snap.header, snap.items, xmlRes.parsed, tesCache.get(emp));
                        status = cmp.status === 'MATCH' ? 'relancada_ok' : 'relancada_divergente';
                        detail.checks_recompare = cmp.header_checks.concat(cmp.item_checks.flat()).filter((c) => !c.match).slice(0, 20);
                        detail.mismatch_count = cmp.mismatch_count;
                        detail.fonte_xml = xmlRes.fonte;
                    }
                }
            }
            await (0, neon_1.sql) `
        UPDATE fiscal_notas SET
          monitor_fingerprint = ${fingerprint},
          monitor_status = ${status},
          monitor_checked_at = NOW(),
          monitor_detail = ${JSON.stringify(detail)}::jsonb,
          updated_at = NOW()
        WHERE id = ${n.id}
      `;
            if (status === 'aguardando_exclusao')
                out.aguardando++;
            else if (status === 'excluida')
                out.excluidas++;
            if (status.startsWith('relancada') && prevStatus !== status) {
                out.relancadas++;
                const okTxt = status === 'relancada_ok'
                    ? 'confere com o XML — pode marcar como corrigida'
                    : status === 'relancada_divergente'
                        ? 'ainda diverge do XML — revisar antes de corrigir'
                        : 're-lançada, mas sem XML pra re-conferir';
                await auditSys('fiscal.relancada_detectada', n.id, {
                    doc: n.doc, serie: n.serie, status,
                    cancelled_by: n.cancelled_by, detail,
                });
                for (const uid of fiscalUsers) {
                    await (0, notifications_1.upsertNotification)(uid, {
                        type: 'fiscal_relancada',
                        title: `${label} re-lançada`,
                        body: `Nota cancelada por ${n.cancelled_by || '—'} foi re-lançada no TOTVS e ${okTxt}.`,
                        link: '/fiscal',
                        dedupKey: `fiscal:relancada:${n.id}:${status}`,
                    });
                }
            }
        }
        catch (e) {
            out.erros++;
            await (0, neon_1.sql) `
        UPDATE fiscal_notas SET monitor_status = 'erro_monitor', monitor_checked_at = NOW(),
          monitor_detail = ${JSON.stringify({ erro: String(e?.message || e).slice(0, 300) })}::jsonb
        WHERE id = ${n.id}
      `.catch(() => { });
        }
    }
    return out;
}
