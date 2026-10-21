// Changelog de produto — tabela changelog_entries + seed bundlado.
// Semeado na primeira leitura (ON CONFLICT DO NOTHING): o seed cobre versões
// novas automaticamente e nunca sobrescreve edições feitas via UI.
import { sql } from '../db/neon';
import { CHANGELOG_SEED } from './seed';

export interface ChangelogItem {
  tag: 'feat' | 'improve' | 'fix';
  text: string;
}

export interface ChangelogEntry {
  version: string;
  seq: number;
  date: string;
  title: string;
  items: ChangelogItem[];
  updated_at: string;
  updated_by: string | null;
}

let ensured = false;

export async function ensureChangelogTable(): Promise<void> {
  if (ensured || !sql) return;
  ensured = true;
  await sql`
    CREATE TABLE IF NOT EXISTS changelog_entries (
      version    TEXT PRIMARY KEY,
      seq        INT NOT NULL,
      date       DATE NOT NULL,
      title      TEXT NOT NULL,
      items      JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_changelog_seq ON changelog_entries(seq)`;
  // Seed idempotente — uma linha por versão, nunca toca em edições humanas.
  for (const e of CHANGELOG_SEED) {
    await sql`
      INSERT INTO changelog_entries (version, seq, date, title, items, updated_by)
      VALUES (${e.version}, ${e.seq}, ${e.date}::date, ${e.title}, ${JSON.stringify(e.items)}::jsonb, 'seed')
      ON CONFLICT (version) DO NOTHING
    `;
  }
}

export async function listChangelog(): Promise<ChangelogEntry[]> {
  if (!sql) return CHANGELOG_SEED.map((e) => ({ ...e, updated_at: '', updated_by: 'seed' }));
  await ensureChangelogTable();
  const rows = await sql`
    SELECT version, seq, date::text, title, items, updated_at, updated_by
    FROM changelog_entries ORDER BY seq ASC
  `;
  return rows as ChangelogEntry[];
}

export async function createChangelog(entry: {
  version: string; date: string; title: string; items: ChangelogItem[]; updated_by?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!sql) return { ok: false, error: 'DB indisponível' };
  await ensureChangelogTable();
  const version = entry.version.trim();
  if (!version) return { ok: false, error: 'version obrigatória' };
  const exists = await sql`SELECT 1 FROM changelog_entries WHERE version = ${version}`;
  if (exists.length) return { ok: false, error: `Versão ${version} já existe` };
  // seq = MIN-1 → versão nova sempre ordena primeiro, sem mexer nas antigas.
  const r = await sql`SELECT COALESCE(MIN(seq), 0) - 1 AS seq FROM changelog_entries`;
  await sql`
    INSERT INTO changelog_entries (version, seq, date, title, items, updated_by)
    VALUES (${version}, ${r[0].seq}, ${entry.date || new Date().toISOString().slice(0, 10)}::date,
            ${entry.title || version}, ${JSON.stringify(entry.items || [])}::jsonb, ${entry.updated_by || null})
  `;
  return { ok: true };
}

export async function updateChangelog(version: string, patch: {
  date?: string; title?: string; items?: ChangelogItem[]; updated_by?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!sql) return { ok: false, error: 'DB indisponível' };
  await ensureChangelogTable();
  const rows = await sql`SELECT version FROM changelog_entries WHERE version = ${version}`;
  if (!rows.length) return { ok: false, error: 'Versão não encontrada' };
  await sql`
    UPDATE changelog_entries SET
      date = COALESCE(${patch.date ?? null}::date, date),
      title = COALESCE(${patch.title ?? null}, title),
      items = COALESCE(${patch.items ? JSON.stringify(patch.items) : null}::jsonb, items),
      updated_by = COALESCE(${patch.updated_by ?? null}, updated_by),
      updated_at = NOW()
    WHERE version = ${version}
  `;
  return { ok: true };
}

export async function deleteChangelog(version: string): Promise<{ ok: boolean; error?: string }> {
  if (!sql) return { ok: false, error: 'DB indisponível' };
  await ensureChangelogTable();
  await sql`DELETE FROM changelog_entries WHERE version = ${version}`;
  return { ok: true };
}
