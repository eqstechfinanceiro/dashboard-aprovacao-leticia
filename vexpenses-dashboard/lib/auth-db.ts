import { sql } from './neon';
import bcrypt from 'bcryptjs';

export interface AppUser {
  id: number;
  email: string;
  name: string;
  job_title: string | null;
  password_hash: string | null;
  first_access_password: string | null;
  role: 'admin' | 'gestor' | 'usuario';
  allowed_modules: string[];
  must_change_password: boolean;
  active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

let tableEnsured = false;

export async function ensureUsersTable(): Promise<void> {
  if (tableEnsured || !sql) return;
  tableEnsured = true;

  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      job_title VARCHAR(255),
      password_hash VARCHAR(255),
      first_access_password VARCHAR(50),
      role VARCHAR(20) NOT NULL DEFAULT 'usuario',
      allowed_modules JSONB NOT NULL DEFAULT '[]',
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INT REFERENCES app_users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(active)`;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  if (!sql) return null;
  const rows = await sql`
    SELECT id, email, name, job_title, password_hash, first_access_password,
           role, allowed_modules, must_change_password, active,
           created_by, created_at, updated_at
    FROM app_users
    WHERE email = ${email.toLowerCase()}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) return null;
  return rows[0] as unknown as AppUser;
}

export async function findUserById(id: number): Promise<AppUser | null> {
  if (!sql) return null;
  const rows = await sql`
    SELECT id, email, name, job_title, password_hash, first_access_password,
           role, allowed_modules, must_change_password, active,
           created_by, created_at, updated_at
    FROM app_users
    WHERE id = ${id}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) return null;
  return rows[0] as unknown as AppUser;
}

export async function listUsers(): Promise<AppUser[]> {
  if (!sql) return [];
  const rows = await sql`
    SELECT id, email, name, job_title, password_hash, first_access_password,
           role, allowed_modules, must_change_password, active,
           created_by, created_at, updated_at
    FROM app_users
    ORDER BY created_at DESC
  `;
  return rows as unknown as AppUser[];
}

export async function createUser(data: {
  email: string;
  name: string;
  job_title?: string | null;
  role: 'admin' | 'gestor' | 'usuario';
  allowed_modules: string[];
  first_access_password: string;
  created_by?: number | null;
}): Promise<AppUser> {
  if (!sql) throw new Error('Database not available');

  const rows = await sql`
    INSERT INTO app_users (email, name, job_title, role, allowed_modules, first_access_password, must_change_password, created_by)
    VALUES (${data.email.toLowerCase()}, ${data.name}, ${data.job_title ?? null}, ${data.role}, ${JSON.stringify(data.allowed_modules)}, ${data.first_access_password}, TRUE, ${data.created_by ?? null})
    RETURNING id, email, name, job_title, password_hash, first_access_password,
              role, allowed_modules, must_change_password, active,
              created_by, created_at, updated_at
  `;
  return rows[0] as unknown as AppUser;
}

export async function updateUser(id: number, data: {
  name?: string;
  job_title?: string | null;
  role?: 'admin' | 'gestor' | 'usuario';
  allowed_modules?: string[];
  active?: boolean;
  first_access_password?: string | null;
  must_change_password?: boolean;
}): Promise<AppUser | null> {
  if (!sql) return null;

  const existing = await findUserById(id);
  if (!existing) return null;

  const name = data.name ?? existing.name;
  const job_title = data.job_title !== undefined ? data.job_title : existing.job_title;
  const role = data.role ?? existing.role;
  const allowed_modules = data.allowed_modules ?? existing.allowed_modules;
  const active = data.active ?? existing.active;
  const first_access_password = data.first_access_password !== undefined ? data.first_access_password : existing.first_access_password;
  const must_change_password = data.must_change_password ?? existing.must_change_password;

  const rows = await sql`
    UPDATE app_users
    SET name = ${name}, job_title = ${job_title}, role = ${role},
        allowed_modules = ${JSON.stringify(allowed_modules)}, active = ${active},
        first_access_password = ${first_access_password},
        must_change_password = ${must_change_password},
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, email, name, job_title, password_hash, first_access_password,
              role, allowed_modules, must_change_password, active,
              created_by, created_at, updated_at
  `;
  return (rows[0] as unknown as AppUser) ?? null;
}

export async function setUserPassword(id: number, newPassword: string): Promise<void> {
  if (!sql) return;
  const hash = await hashPassword(newPassword);
  await sql`
    UPDATE app_users
    SET password_hash = ${hash}, first_access_password = NULL,
        must_change_password = FALSE, updated_at = NOW()
    WHERE id = ${id}
  `;
}
