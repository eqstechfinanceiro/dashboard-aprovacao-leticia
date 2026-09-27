"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureInactiveAlertsTable = ensureInactiveAlertsTable;
exports.gestorScopeCpfs = gestorScopeCpfs;
exports.generateInactiveAlerts = generateInactiveAlerts;
exports.listUnreadAlerts = listUnreadAlerts;
exports.listAllAlerts = listAllAlerts;
exports.markAlertRead = markAlertRead;
exports.markAllRead = markAllRead;
// Inactive-employee alerts — detects employees that became inactive (cadastro)
// while still holding balances (saldos do último snapshot congelado de quinzena)
// and notifies the gestor responsible for their approval flow.
//
// Semantics (one row per app_user × cpf):
//   - new inactive-with-saldo  → new unread alert
//   - still inactive           → saldos refreshed, read state kept
//   - balance resolved/ativo   → resolved_at set (stays in history)
//   - resolved → pending again → resolved_at cleared + read_at reset (re-alert)
//
// Runs in the worker WARM cycle (after refreshCadastro) and on-demand via the
// /api/inactive-alerts?generate=1 endpoint (admin only). Worker-safe: relative
// imports only, caches read directly from api_cache.
const neon_1 = require("../db/neon");
const client_1 = require("./client");
// ---- schema -----------------------------------------------------------------
let tableEnsured = false;
async function ensureInactiveAlertsTable() {
    if (tableEnsured || !neon_1.sql)
        return;
    tableEnsured = true;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS inactive_employee_alerts (
      id SERIAL PRIMARY KEY,
      app_user_id INT NOT NULL,
      cpf VARCHAR(11) NOT NULL,
      colaborador VARCHAR(255) NOT NULL,
      regional VARCHAR(255),
      centro_custo VARCHAR(255),
      gestor VARCHAR(255),
      situacao VARCHAR(100),
      status_cartao VARCHAR(100),
      saldo_prestacao NUMERIC(12,2) DEFAULT 0,
      saldo_cartao NUMERIC(12,2) DEFAULT 0,
      saldo_reembolsar NUMERIC(12,2) DEFAULT 0,
      detected_at DATE NOT NULL,
      read_at TIMESTAMP WITH TIME ZONE,
      resolved_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
    await (0, neon_1.sql) `ALTER TABLE inactive_employee_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_inactive_alerts_user ON inactive_employee_alerts(app_user_id)`;
    await (0, neon_1.sql) `CREATE INDEX IF NOT EXISTS idx_inactive_alerts_unread ON inactive_employee_alerts(app_user_id, read_at)`;
    // One alert per user×employee — needed for ON CONFLICT re-alert semantics.
    // Dedupe defensively first in case an earlier constraint allowed duplicates.
    await (0, neon_1.sql) `
    DELETE FROM inactive_employee_alerts a
    USING inactive_employee_alerts b
    WHERE a.app_user_id = b.app_user_id AND a.cpf = b.cpf AND a.id > b.id
  `;
    await (0, neon_1.sql) `
    CREATE UNIQUE INDEX IF NOT EXISTS inactive_alerts_user_cpf_uniq
    ON inactive_employee_alerts(app_user_id, cpf)
  `;
}
// ---- helpers ----------------------------------------------------------------
function normalizeCpf(cpf) {
    const digits = String(cpf ?? '').replace(/\D/g, '');
    return digits ? digits.padStart(11, '0') : null;
}
function normalizeName(s) {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
// ---- VExpenses scope data (worker-safe copies of scope.ts loaders) ------------
const MEMBERS_TTL = 10 * 60 * 1000;
let membersCache = null;
const FLOWS_TTL = 10 * 60 * 1000;
let flowsCache = null;
async function cacheGet(key) {
    if (!neon_1.sql)
        return null;
    const rows = await (0, neon_1.sql) `SELECT cache_data FROM api_cache WHERE cache_key = ${key} LIMIT 1`;
    const payload = rows[0]?.cache_data;
    return typeof payload === 'string' ? JSON.parse(payload) : payload;
}
async function loadTeamMembers() {
    if (membersCache && Date.now() - membersCache.at < MEMBERS_TTL)
        return membersCache.data;
    // Cache variants used by the dashboard (raw member rows with cpf + approval_flow_id)
    for (const key of ['team-members:null', 'team-members:', 'team-members:include']) {
        try {
            const cached = await cacheGet(key);
            const arr = cached?.data ?? cached;
            if (Array.isArray(arr) && arr.length > 0) {
                membersCache = { at: Date.now(), data: arr };
                return arr;
            }
        }
        catch { }
    }
    // Fallback: paginated fetch from VExpenses
    const data = [];
    try {
        let page = 1;
        while (page <= 30) {
            const res = await (0, client_1.fetchWithRetry)(`${client_1.API_URL}/v2/team-members?paginate=true&page=${page}&per_page=100`, { headers: { Authorization: client_1.API_KEY, Accept: 'application/json' } }, 2);
            if (!res.ok)
                break;
            const body = await res.json();
            const batch = body.data || [];
            data.push(...batch);
            if (page >= (body.last_page || 1) || batch.length === 0)
                break;
            page++;
        }
    }
    catch { }
    membersCache = { at: Date.now(), data };
    return data;
}
async function loadFlowStep2() {
    if (flowsCache && Date.now() - flowsCache.at < FLOWS_TTL)
        return flowsCache.step2;
    const map = new Map();
    try {
        const cached = await cacheGet('vexpenses-data:approval-flows');
        const steps = cached?.stepApprovers;
        if (Array.isArray(steps) && steps.length > 0) {
            for (const [flowId, stepList] of steps) {
                const ordered = [...stepList].sort((a, b) => a[0] - b[0]);
                const step2 = ordered.find(([o]) => o === 2) || ordered[1];
                if (step2)
                    map.set(flowId, (step2[1] || []).map(Number).filter((n) => !isNaN(n)));
            }
            flowsCache = { at: Date.now(), step2: map };
            return map;
        }
    }
    catch { }
    try {
        const res = await (0, client_1.fetchWithRetry)(`${client_1.API_URL}/v2/approval-flows?include=steps`, {
            headers: { Authorization: client_1.API_KEY, Accept: 'application/json' },
        }, 2);
        if (res.ok) {
            const body = await res.json();
            const flows = body.data || [];
            for (const f of flows) {
                const steps = f.steps?.data || f.steps || [];
                const step2 = steps.find((s) => s.order === 2) || steps[1];
                if (!step2)
                    continue;
                const approvers = [];
                for (const g of step2.groups?.data || step2.groups || []) {
                    for (const a of g.approvers || []) {
                        const id = parseInt(a, 10);
                        if (!isNaN(id))
                            approvers.push(id);
                    }
                }
                map.set(f.id, approvers);
            }
        }
    }
    catch { }
    flowsCache = { at: Date.now(), step2: map };
    return map;
}
/** CPFs a gestor can see — same derivation as scope.ts (etapa-2 flows or scope_flows). */
async function gestorScopeCpfs(user) {
    const cpfs = new Set();
    const members = await loadTeamMembers();
    let vexId = user.vexpenses_user_id;
    if (!vexId && user.email) {
        const m = members.find((x) => (x.email || '').toLowerCase() === user.email.toLowerCase());
        if (m)
            vexId = m.id;
    }
    let flowIds = user.scope_flows && user.scope_flows.length > 0 ? user.scope_flows : [];
    if (flowIds.length === 0 && vexId) {
        const step2 = await loadFlowStep2();
        for (const [flowId, approvers] of step2) {
            if (approvers.includes(vexId))
                flowIds.push(flowId);
        }
    }
    const flowSet = new Set(flowIds);
    for (const m of members) {
        if (m.approval_flow_id && flowSet.has(m.approval_flow_id)) {
            const c = normalizeCpf(m.cpf);
            if (c)
                cpfs.add(c);
        }
    }
    if (vexId) {
        const self = members.find((x) => x.id === vexId);
        if (self) {
            const c = normalizeCpf(self.cpf);
            if (c)
                cpfs.add(c);
        }
    }
    return cpfs;
}
function isInactiveByCadastro(situacao, statusCartao) {
    const sit = (situacao || '').toUpperCase();
    const card = (statusCartao || '').toUpperCase();
    return sit.includes('INATIVO') || sit.includes('DESLIGAD') ||
        sit.includes('SUSPENSO') || sit.includes('APOSENTADORIA') || sit.includes('PERICIA') ||
        card.includes('INATIV') || card.includes('CANCEL');
}
/**
 * Employees currently inactive that still hold balances.
 * Inactive = cadastro says so OR the VExpenses team-members API says
 * active=false (freshest source — catches inactivations between cadastro
 * refreshes). Saldos come from the latest frozen quinzena snapshot.
 */
async function findInactiveWithSaldo() {
    if (!neon_1.sql)
        return [];
    // API truth: member.active === false
    const members = await loadTeamMembers();
    const apiInactiveCpfs = new Set();
    for (const m of members) {
        if (m.active === false) {
            const c = normalizeCpf(m.cpf);
            if (c)
                apiInactiveCpfs.add(c);
        }
    }
    // Everyone holding a balance in the latest frozen snapshot + cadastro meta
    const rows = await (0, neon_1.sql) `
    WITH last_snap AS (
      SELECT year, month, quinzena FROM quinzena_frozen_snapshots
      ORDER BY year DESC, month DESC, quinzena DESC LIMIT 1
    )
    SELECT lpad(regexp_replace(s.cpf, '\\D', '', 'g'), 11, '0') AS cpf,
           COALESCE(c.colaborador, s.colaborador) AS colaborador,
           COALESCE(c.regional, s.regional) AS regional,
           COALESCE(c.centro_custo, s.centro_custo) AS centro_custo,
           COALESCE(c.gestor, s.gestor) AS gestor,
           COALESCE(NULLIF(c.situacao,''), s.situacao) AS situacao,
           COALESCE(NULLIF(c.status_cartao,''), s.status_cartao) AS status_cartao,
           COALESCE(s.saldo_prestacao,0)::float AS saldo_prestacao,
           COALESCE(s.saldo_cartao,0)::float AS saldo_cartao,
           COALESCE(s.saldo_reembolsar,0)::float AS saldo_reembolsar
    FROM quinzena_frozen_snapshots s
    CROSS JOIN last_snap ls
    LEFT JOIN quinzena_cadastro c
      ON lpad(regexp_replace(c.cpf, '\\D', '', 'g'), 11, '0') = lpad(regexp_replace(s.cpf, '\\D', '', 'g'), 11, '0')
    WHERE s.year = ls.year AND s.month = ls.month AND s.quinzena = ls.quinzena
      AND (COALESCE(s.saldo_prestacao,0) > 0 OR COALESCE(s.saldo_cartao,0) > 0 OR COALESCE(s.saldo_reembolsar,0) > 0)
  `;
    return rows.map(r => {
        const apiInactive = apiInactiveCpfs.has(r.cpf);
        const cadInactive = isInactiveByCadastro(r.situacao, r.status_cartao);
        if (!apiInactive && !cadInactive)
            return null;
        // Detected via API but cadastro still says ATIVO (stale) — report the truth
        if (apiInactive && !cadInactive)
            return { ...r, situacao: 'INATIVO' };
        return r;
    }).filter((r) => r !== null);
}
/**
 * Scan for inactive employees with balances and upsert per-user alerts.
 * Marks resolved_at on alerts whose employee left the pending set (balance
 * zeroed, reactivated, or out of the gestor's scope).
 */
async function generateInactiveAlerts() {
    if (!neon_1.sql)
        return { created: 0, updated: 0, resolved: 0 };
    await ensureInactiveAlertsTable();
    const inativos = await findInactiveWithSaldo();
    const byCpf = new Map();
    for (const r of inativos)
        byCpf.set(r.cpf, r);
    const users = await (0, neon_1.sql) `
    SELECT id, role, email, vexpenses_user_id, scope_flows
    FROM app_users WHERE active = TRUE AND role IN ('gestor','admin')
  `;
    let created = 0, updated = 0, resolved = 0;
    for (const u of users) {
        // Scope: admins see all; gestores only their flow's CPFs
        let scopeCpfs = null;
        if (u.role !== 'admin') {
            let flows = null;
            if (Array.isArray(u.scope_flows))
                flows = u.scope_flows.map(Number).filter((n) => !isNaN(n));
            else if (typeof u.scope_flows === 'string') {
                try {
                    const p = JSON.parse(u.scope_flows);
                    if (Array.isArray(p))
                        flows = p.map(Number).filter((n) => !isNaN(n));
                }
                catch { }
            }
            scopeCpfs = await gestorScopeCpfs({ id: u.id, vexpenses_user_id: u.vexpenses_user_id, scope_flows: flows, email: u.email });
            if (scopeCpfs.size === 0) {
                // Gestor with empty scope — resolve all his pending alerts
                const del = await (0, neon_1.sql) `
          UPDATE inactive_employee_alerts SET resolved_at = NOW()
          WHERE app_user_id = ${u.id} AND resolved_at IS NULL
          RETURNING id
        `;
                resolved += del.length;
                continue;
            }
        }
        const keep = [];
        for (const [cpf] of byCpf) {
            if (scopeCpfs && !scopeCpfs.has(cpf))
                continue;
            keep.push(cpf);
        }
        // Resolve alerts no longer pending for this user
        const del = keep.length === 0
            ? await (0, neon_1.sql) `
          UPDATE inactive_employee_alerts SET resolved_at = NOW()
          WHERE app_user_id = ${u.id} AND resolved_at IS NULL
          RETURNING id
        `
            : await (0, neon_1.sql) `
          UPDATE inactive_employee_alerts SET resolved_at = NOW()
          WHERE app_user_id = ${u.id} AND resolved_at IS NULL AND NOT (cpf = ANY(${keep}))
          RETURNING id
        `;
        resolved += del.length;
        // Upsert current pending alerts
        for (const cpf of keep) {
            const inv = byCpf.get(cpf);
            try {
                const r = await (0, neon_1.sql) `
          INSERT INTO inactive_employee_alerts
            (app_user_id, cpf, colaborador, regional, centro_custo, gestor,
             situacao, status_cartao, saldo_prestacao, saldo_cartao, saldo_reembolsar,
             detected_at)
          VALUES (${u.id}, ${cpf}, ${inv.colaborador}, ${inv.regional}, ${inv.centro_custo},
                  ${inv.gestor}, ${inv.situacao}, ${inv.status_cartao},
                  ${inv.saldo_prestacao}, ${inv.saldo_cartao}, ${inv.saldo_reembolsar},
                  CURRENT_DATE)
          ON CONFLICT (app_user_id, cpf) DO UPDATE SET
            saldo_prestacao = EXCLUDED.saldo_prestacao,
            saldo_cartao    = EXCLUDED.saldo_cartao,
            saldo_reembolsar = EXCLUDED.saldo_reembolsar,
            situacao        = EXCLUDED.situacao,
            status_cartao   = EXCLUDED.status_cartao,
            resolved_at     = NULL,
            read_at         = CASE WHEN inactive_employee_alerts.resolved_at IS NOT NULL
                                   THEN NULL ELSE inactive_employee_alerts.read_at END
          RETURNING (xmax = 0) AS inserted
        `;
                if (r[0]?.inserted)
                    created++;
                else
                    updated++;
            }
            catch { }
        }
    }
    return { created, updated, resolved };
}
// ---- queries used by the API -------------------------------------------------
async function listUnreadAlerts(appUserId) {
    if (!neon_1.sql)
        return [];
    await ensureInactiveAlertsTable();
    const rows = await (0, neon_1.sql) `
    SELECT id, app_user_id, cpf, colaborador, regional, centro_custo, gestor,
           situacao, status_cartao,
           saldo_prestacao::float, saldo_cartao::float, saldo_reembolsar::float,
           detected_at::text, read_at::text, resolved_at::text, created_at::text
    FROM inactive_employee_alerts
    WHERE app_user_id = ${appUserId} AND read_at IS NULL AND resolved_at IS NULL
    ORDER BY detected_at DESC, created_at DESC
  `;
    return rows;
}
async function listAllAlerts(appUserId, limit = 50) {
    if (!neon_1.sql)
        return [];
    await ensureInactiveAlertsTable();
    const rows = await (0, neon_1.sql) `
    SELECT id, app_user_id, cpf, colaborador, regional, centro_custo, gestor,
           situacao, status_cartao,
           saldo_prestacao::float, saldo_cartao::float, saldo_reembolsar::float,
           detected_at::text, read_at::text, resolved_at::text, created_at::text
    FROM inactive_employee_alerts
    WHERE app_user_id = ${appUserId}
    ORDER BY (read_at IS NULL AND resolved_at IS NULL) DESC,
             (resolved_at IS NULL) DESC,
             detected_at DESC, created_at DESC
    LIMIT ${limit}
  `;
    return rows;
}
async function markAlertRead(appUserId, alertId) {
    if (!neon_1.sql)
        return false;
    await ensureInactiveAlertsTable();
    const rows = await (0, neon_1.sql) `
    UPDATE inactive_employee_alerts
    SET read_at = NOW()
    WHERE id = ${alertId} AND app_user_id = ${appUserId} AND read_at IS NULL AND resolved_at IS NULL
    RETURNING id
  `;
    return rows.length > 0;
}
async function markAllRead(appUserId) {
    if (!neon_1.sql)
        return 0;
    await ensureInactiveAlertsTable();
    const rows = await (0, neon_1.sql) `
    UPDATE inactive_employee_alerts
    SET read_at = NOW()
    WHERE app_user_id = ${appUserId} AND read_at IS NULL AND resolved_at IS NULL
    RETURNING id
  `;
    return rows.length;
}
