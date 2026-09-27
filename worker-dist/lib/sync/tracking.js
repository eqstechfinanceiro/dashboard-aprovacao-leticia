"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWaitingStepMap = getWaitingStepMap;
// Shared lookup: report_id -> current waiting approval step, sourced from the
// approval-tracking cache (Excel acompanhamento). Reports absent from the map
// are treated as step 1 — they were never approved.
const neon_1 = require("../db/neon");
async function getWaitingStepMap() {
    const map = new Map();
    if (!neon_1.sql)
        return map;
    try {
        const rows = await (0, neon_1.sql) `
      SELECT cache_data FROM api_cache WHERE cache_key = 'vexpenses-data:approval-tracking'
    `;
        const payload = rows[0]?.cache_data;
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const list = (data?.data ?? data)?.waitingStepMap;
        if (Array.isArray(list))
            for (const [rid, step] of list)
                map.set(Number(rid), Number(step));
    }
    catch (e) {
        console.error('[Tracking] waitingStepMap lookup failed:', e);
    }
    return map;
}
