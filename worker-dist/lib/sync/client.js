"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_KEY = exports.API_URL = void 0;
exports.v2Headers = v2Headers;
exports.sleep = sleep;
exports.fetchWithRetry = fetchWithRetry;
// Shared VExpenses API helpers for sync modules.
exports.API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
exports.API_KEY = process.env.VEXPENSES_API_KEY || '';
function v2Headers() {
    return { Authorization: exports.API_KEY, Accept: 'application/json' };
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
/**
 * Fetch with bounded retries on 429/5xx (exponential backoff).
 * Returns the Response — caller still checks resp.ok for terminal statuses (404 etc).
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3, onRateLimit) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const resp = await fetch(url, options);
            if (resp.status === 429 || resp.status >= 500) {
                const waitMs = Math.min(10000 * Math.pow(2, attempt), 60000);
                onRateLimit?.(waitMs);
                await sleep(waitMs);
                continue;
            }
            return resp;
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < maxRetries) {
                await sleep(3000 * Math.pow(2, attempt));
                continue;
            }
            throw lastError;
        }
    }
    throw new Error('fetchWithRetry: exhausted retries');
}
