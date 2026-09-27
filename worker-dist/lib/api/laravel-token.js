"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLaravelCookieString = getLaravelCookieString;
exports.getNextLaravelCookie = getNextLaravelCookie;
exports.markTokenCooldown = markTokenCooldown;
exports.clearLaravelTokenCache = clearLaravelTokenCache;
exports.isLaravelTokenExpired = isLaravelTokenExpired;
exports.getActiveTokenCount = getActiveTokenCount;
const neon_1 = require("../db/neon");
let allCachedTokens = [];
let lastLoadTime = 0;
const CACHE_TTL_MS = 3 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const cooldownMap = new Map();
let rotationIndex = 0;
async function loadAllTokens() {
    if (!neon_1.sql)
        return [];
    if (allCachedTokens.length > 0 && Date.now() - lastLoadTime < CACHE_TTL_MS) {
        return allCachedTokens;
    }
    try {
        const rows = await (0, neon_1.sql) `
      SELECT id, laravel_token, laravel_session, xsrf_token, expires_at
      FROM vexpenses_tokens
      WHERE expires_at > NOW()
        AND (company = 'eqs' OR company IS NULL)
      ORDER BY id
    `;
        if (!rows || rows.length === 0) {
            allCachedTokens = [];
            return [];
        }
        allCachedTokens = rows.map((row) => {
            const cookie = buildCookieString(row.laravel_token, row.laravel_session, row.xsrf_token);
            return {
                token: row.laravel_token,
                session: row.laravel_session,
                xsrf: row.xsrf_token,
                expiresAt: new Date(row.expires_at).getTime(),
                cookieString: cookie,
            };
        });
        lastLoadTime = Date.now();
        return allCachedTokens;
    }
    catch {
        return allCachedTokens;
    }
}
function buildCookieString(token, session, xsrf) {
    let cookie = `laravel_token=${token}`;
    if (session)
        cookie += `; laravel_session=${session}`;
    if (xsrf)
        cookie += `; XSRF-TOKEN=${xsrf}`;
    cookie += '; language=pt-BR';
    return cookie;
}
async function getLaravelCookieString() {
    const tokens = await loadAllTokens();
    if (tokens.length === 0)
        return null;
    return tokens[0].cookieString;
}
async function getNextLaravelCookie() {
    const tokens = await loadAllTokens();
    if (tokens.length === 0)
        return null;
    const now = Date.now();
    for (let i = 0; i < tokens.length; i++) {
        const idx = (rotationIndex + i) % tokens.length;
        const t = tokens[idx];
        const cooldownUntil = cooldownMap.get(t.token);
        if (cooldownUntil && cooldownUntil > now)
            continue;
        rotationIndex = (idx + 1) % tokens.length;
        return t.cookieString;
    }
    return tokens[0].cookieString;
}
function markTokenCooldown(cookieString) {
    for (const t of allCachedTokens) {
        if (t.cookieString === cookieString) {
            cooldownMap.set(t.token, Date.now() + COOLDOWN_MS);
            break;
        }
    }
}
function clearLaravelTokenCache() {
    allCachedTokens = [];
    lastLoadTime = 0;
    cooldownMap.clear();
}
function isLaravelTokenExpired() {
    return allCachedTokens.length === 0 || allCachedTokens.every(t => t.expiresAt < Date.now());
}
async function getActiveTokenCount() {
    const tokens = await loadAllTokens();
    const now = Date.now();
    return tokens.filter(t => {
        const cd = cooldownMap.get(t.token);
        return !cd || cd < now;
    }).length;
}
