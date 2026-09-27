import { NextRequest } from 'next/server';
import { sql } from '@/lib/db/neon';

// Audit log — quem fez o quê, quando. Requisito de operação financeira:
// disputas de "quem aprovou/congelou/editou" precisam de registro imutável.
//
// A tabela é append-only por convenção: o sistema nunca faz UPDATE/DELETE
// nela — correções são novas entradas.

let tableReady = false;

export async function ensureAuditTable() {
  if (!sql || tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id INT,
      user_email TEXT,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details JSONB,
      ip TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)`;
  tableReady = true;
}

export interface AuditEntry {
  action: string;            // ex.: 'quinzena.freeze', 'relatorio.approve'
  entity_type?: string;      // ex.: 'quinzena', 'report', 'titulo', 'usuario'
  entity_id?: string | number;
  details?: Record<string, unknown>;
}

// Grava uma entrada de auditoria a partir dos headers injetados pelo
// middleware (x-user-id/role/email). Nunca lança — auditoria não pode
// derrubar a operação principal.
export async function logAudit(request: NextRequest, entry: AuditEntry) {
  if (!sql) return;
  try {
    await ensureAuditTable();
    const userId = parseInt(request.headers.get('x-user-id') || '', 10) || null;
    const email = request.headers.get('x-user-email') || null;
    const name = request.headers.get('x-user-name') || null;
    const role = request.headers.get('x-user-role') || null;
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;
    await sql`
      INSERT INTO audit_log (user_id, user_email, user_name, user_role, action, entity_type, entity_id, details, ip)
      VALUES (
        ${userId}, ${email}, ${name}, ${role},
        ${entry.action},
        ${entry.entity_type ?? null},
        ${entry.entity_id != null ? String(entry.entity_id) : null},
        ${entry.details ? JSON.stringify(entry.details) : null}::jsonb,
        ${ip}
      )
    `;
  } catch (e) {
    console.error('[audit] falha ao gravar:', e);
  }
}
