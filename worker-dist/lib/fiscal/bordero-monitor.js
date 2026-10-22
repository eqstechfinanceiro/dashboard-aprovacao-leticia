"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fornecedorCodigoNota = fornecedorCodigoNota;
exports.lojaNota = lojaNota;
exports.userIdsWithModule = userIdsWithModule;
exports.syncBorderoStatus = syncBorderoStatus;
/**
 * syncBorderoStatus — verificação em batch do borderô de pagamento (SEA/SE2)
 * das notas fiscais que ainda interessam ao fluxo de correção:
 *
 *   alvo = review_status em ('pendente','falha_tecnica','confirmado_erro',
 *   'cancelado')  ∪  notas que constam em borderô (continua vigiando até o
 *   SEA sumir — detecta remoção feita pelo contas a pagar no Protheus).
 *
 * Saída é cacheada em fiscal_bordero_status: a página /fiscal mostra o badge
 * sem consultar o TOTVS e a fila /borderos do contas a pagar lê daqui.
 *
 * Transições detectadas:
 *   entrou em borderô  → notifica módulo 'borderos' (fila de remoção)
 *   saiu do borderô    → removida_detectada_at + notifica 'fiscal'
 *   título baixado     → pago=true + notifica ambos (exige estorno)
 *
 * Worker-safe: relative imports only, sem Next.js APIs.
 */
const neon_1 = require("../db/neon");
const fiscal_db_1 = require("./fiscal-db");
const totvs_1 = require("../conferencia/totvs");
const totvs_2 = require("../impacto/totvs");
const audit_1 = require("../db/audit");
const notifications_1 = require("../sync/notifications");
const trim = (v) => (v === null || v === undefined ? '' : String(v).trim());
// Código SA2 do fornecedor — a coluna `fornecedor` guarda o código em notas
// do syncConferencia mas o NOME em notas de serviço e importações avulsas;
// o código canônico fica em extra.fornecedor_cod (backfill orgânico).
function fornecedorCodigoNota(n) {
    const fromExtra = trim(n.extra?.fornecedor_cod || n.extra?.recno || '');
    if (fromExtra)
        return fromExtra;
    const v = trim(n.fornecedor);
    return (0, totvs_1.isFornecCodigo)(v) ? v : '';
}
function lojaNota(n) {
    return trim(n.extra?.f1_loja || n.extra?.loja || n.extra?.fornecedor_loja || '');
}
// Resolve códigos SA2 por CNPJ em batch — uma query por tenant com
// A2_CGC IN (...). Usada antes do check de borderô/monitor pra notas cujo
// `fornecedor` é nome. Também faz backfill do extra p/ corridas futuras.
async function resolveFornecedoresPorCnpj(notas) {
    const out = new Map();
    const cnpjs = [...new Set(notas.map((n) => trim(n.cnpj)).filter((c) => /^\d{14}$/.test(c)))];
    if (!neon_1.sql || !cnpjs.length)
        return out;
    const inList = cnpjs.map((c) => `'${c}'`).join(',');
    const porCnpj = new Map();
    for (const [emp, tenantId] of Object.entries(totvs_2.EMPRESAS)) {
        const d = await (0, totvs_2.genericQuery)(tenantId, {
            tables: 'SA2', fields: 'A2_COD,A2_LOJA,A2_CGC',
            where: `SA2.A2_CGC IN (${inList}) AND SA2.D_E_L_E_T_=' '`,
            page: '1', pageSize: '500',
        }).catch(() => null);
        for (const it of d?.items || []) {
            const cgc = trim(it.a2_cgc);
            if (cgc && !porCnpj.has(cgc))
                porCnpj.set(cgc, { cod: trim(it.a2_cod), loja: trim(it.a2_loja), empresa: emp });
        }
    }
    for (const n of notas) {
        const f = porCnpj.get(trim(n.cnpj));
        if (!f)
            continue;
        out.set(n.id, f);
        // Backfill: grava o código no extra pra não resolver de novo.
        try {
            await (0, neon_1.sql) `UPDATE fiscal_notas SET extra = COALESCE(extra,'{}'::jsonb) || ${JSON.stringify({ fornecedor_cod: f.cod, fornecedor_loja: f.loja, loja: lojaNota(n) || f.loja, empresa: trim(n.extra?.empresa) || f.empresa })}::jsonb WHERE id = ${n.id}`;
        }
        catch { }
    }
    return out;
}
/** Usuários ativos com um módulo — destino das notificações in-app. */
async function userIdsWithModule(module) {
    if (!neon_1.sql)
        return [];
    const rows = await (0, neon_1.sql) `
    SELECT id FROM app_users
    WHERE active = TRUE
      AND (role = 'admin' OR allowed_modules @> ${JSON.stringify([module])}::jsonb)
  `;
    return rows.map((r) => r.id);
}
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
async function syncBorderoStatus(opts = {}) {
    const out = { checked: 0, em_bordero: 0, removidas: 0, pagas: 0, errors: [] };
    if (!neon_1.sql) {
        out.errors.push('DB indisponível');
        return out;
    }
    await (0, fiscal_db_1.ensureFiscalTables)();
    const notas = await (0, neon_1.sql) `
    SELECT n.id, n.doc, n.serie, n.fornecedor, n.cnpj, n.tipo, n.chave_acesso, n.extra, n.review_status,
           bs.em_bordero AS prev_em_bordero, bs.pago AS prev_pago,
           bs.remocao_confirmada_at, bs.removida_detectada_at
    FROM fiscal_notas n
    LEFT JOIN fiscal_bordero_status bs ON bs.nota_id = n.id
    WHERE n.review_status IN ('pendente','falha_tecnica','confirmado_erro','cancelado')
       OR bs.em_bordero = TRUE
    ORDER BY n.id
  `;
    const alvo = notas.slice(0, opts.limit ?? 2000);
    if (!alvo.length)
        return out;
    // Fornecedor gravado como nome (serviço ou importação avulsa) — resolve o
    // código SA2 por CNPJ antes do batch, senão o match fino descarta a linha.
    const semCodigo = alvo.filter((n) => !fornecedorCodigoNota(n) && /^\d{14}$/.test(trim(n.cnpj)));
    const resolvidos = await resolveFornecedoresPorCnpj(semCodigo);
    // Primeiro run = baseline: popula o cache sem disparar notificações
    // (tudo que já está em borderô "entra" de uma vez e inundaria o sino).
    const prevRows = await (0, neon_1.sql) `SELECT count(*)::int AS n FROM fiscal_bordero_status`;
    const baseline = Number(prevRows[0]?.n || 0) === 0;
    const refs = alvo.map((n) => {
        const res = resolvidos.get(n.id);
        return {
            id: n.id,
            doc: trim(n.doc),
            serie: trim(n.serie),
            fornec: fornecedorCodigoNota(n) || res?.cod || '',
            loja: lojaNota(n) || res?.loja || '',
            empresa: trim(n.extra?.empresa).toUpperCase() || res?.empresa || '',
        };
    });
    const { porNota, errors } = await (0, totvs_1.fetchBorderoStatusBatch)(refs);
    out.errors.push(...errors);
    out.checked = alvo.length;
    // Destinatários calculados uma vez por ciclo.
    const fiscalUsers = await userIdsWithModule('fiscal');
    const borderoUsers = await userIdsWithModule('borderos');
    for (const n of alvo) {
        const borderos = porNota.get(n.id) || [];
        const emBordero = borderos.length > 0;
        const pago = borderos.some((b) => !!b.baixa);
        const prevEm = !!n.prev_em_bordero;
        const prevPago = !!n.prev_pago;
        if (emBordero)
            out.em_bordero++;
        const removidaAgora = prevEm && !emBordero && !n.removida_detectada_at;
        const pagaAgora = pago && !prevPago;
        const entrouAgora = emBordero && !prevEm;
        await (0, neon_1.sql) `
      INSERT INTO fiscal_bordero_status
        (nota_id, em_bordero, pago, borderos, checked_at, check_error, removida_detectada_at)
      VALUES (${n.id}, ${emBordero}, ${pago}, ${JSON.stringify(borderos)}::jsonb, NOW(), NULL,
              ${removidaAgora ? new Date().toISOString() : n.removida_detectada_at})
      ON CONFLICT (nota_id) DO UPDATE SET
        em_bordero = EXCLUDED.em_bordero,
        pago = EXCLUDED.pago,
        borderos = EXCLUDED.borderos,
        checked_at = NOW(),
        check_error = NULL,
        removida_detectada_at = EXCLUDED.removida_detectada_at
    `;
        const label = `NF ${n.doc}${n.serie ? '/' + n.serie : ''}`;
        if (!baseline && entrouAgora && ['confirmado_erro', 'cancelado'].includes(n.review_status)) {
            // Nota com problema entrou em pagamento — fila de remoção do AP.
            for (const uid of borderoUsers) {
                await (0, notifications_1.upsertNotification)(uid, {
                    type: 'fiscal_bordero',
                    title: `${label} em borderô — remover`,
                    body: `Nota com ${n.review_status === 'cancelado' ? 'cancelamento' : 'erro confirmado'} entrou em borderô de pagamento. Remover o título pra liberar a correção.`,
                    link: '/borderos',
                    dedupKey: `bordero:remover:${n.id}`,
                });
            }
        }
        if (removidaAgora) {
            out.removidas++;
            await auditSys('fiscal.bordero_removida_auto', n.id, { doc: n.doc, serie: n.serie });
            await (0, notifications_1.resolveByDedup)(`bordero:remover:${n.id}`);
            for (const uid of fiscalUsers) {
                await (0, notifications_1.upsertNotification)(uid, {
                    type: 'fiscal_bordero',
                    title: `${label} saiu do borderô`,
                    body: 'O título foi removido do borderô — a correção/cancelamento pode prosseguir.',
                    link: '/fiscal',
                    dedupKey: `bordero:removida:${n.id}`,
                });
            }
        }
        if (!baseline && pagaAgora) {
            out.pagas++;
            await auditSys('fiscal.bordero_paga', n.id, { doc: n.doc, serie: n.serie, borderos });
            const msg = 'O título foi baixado (pago) — correção exige estorno, não remoção de borderô.';
            for (const uid of [...new Set([...fiscalUsers, ...borderoUsers])]) {
                await (0, notifications_1.upsertNotification)(uid, {
                    type: 'fiscal_bordero',
                    title: `${label} paga em borderô`,
                    body: msg,
                    link: '/borderos',
                    dedupKey: `bordero:paga:${n.id}`,
                });
            }
        }
    }
    return out;
}
