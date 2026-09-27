"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSettingsTable = ensureSettingsTable;
exports.getSetting = getSetting;
exports.setSetting = setSetting;
const neon_1 = require("./neon");
let ensured = false;
async function ensureSettingsTable() {
    if (ensured || !neon_1.sql)
        return;
    await (0, neon_1.sql) `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
    ensured = true;
}
async function getSetting(key) {
    if (!neon_1.sql)
        return null;
    await ensureSettingsTable();
    const rows = await (0, neon_1.sql) `SELECT value FROM app_settings WHERE key = ${key}`;
    return rows.length > 0 ? rows[0].value : null;
}
async function setSetting(key, value, updatedBy) {
    if (!neon_1.sql)
        return;
    await ensureSettingsTable();
    await (0, neon_1.sql) `
    INSERT INTO app_settings (key, value, updated_by, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${updatedBy || null}, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `;
}
