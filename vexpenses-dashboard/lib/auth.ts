import { SignJWT, jwtVerify } from 'jose';

export const AUTH_COOKIE = 'vexp_auth_token';
const JWT_EXPIRES = '7d';
const ALG = 'HS256';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

export interface AuthPayload {
  id: number;
  email: string;
  name: string;
  job_title: string | null;
  role: 'admin' | 'gestor' | 'usuario';
  modules: string[];
  must_change_password: boolean;
}

export async function generateToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AuthPayload;
  } catch {
    return null;
  }
}

export function generateFirstAccessPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars[Math.floor(Math.random() * chars.length)];
    part2 += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${part1}-${part2}`;
}

export function nameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  const parts = localPart.split(/[._-]+/);
  const name = parts
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
  return name || email;
}

export const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'aprovacoes', label: 'Aprovações' },
  { id: 'pending-approvals', label: 'Pendências' },
  { id: 'despesas', label: 'Despesas' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'status-caixa', label: 'Status Caixa' },
  { id: 'gestao-caixa', label: 'Gestão Caixa' },
  { id: 'quinzena-dinamica', label: 'Quinzena Dinâmica' },
  { id: 'controle', label: 'Controle' },
  { id: 'aprovacao-dinamica', label: 'Aprovação Dinâmica' },
  { id: 'configuracoes', label: 'Configurações' },
] as const;

export const MODULE_HREF_MAP: Record<string, string> = {
  dashboard: '/',
  aprovacoes: '/aprovacoes',
  'pending-approvals': '/pending-approvals',
  despesas: '/despesas',
  analytics: '/analytics',
  'status-caixa': '/status-caixa',
  'gestao-caixa': '/gestao-caixa',
  'quinzena-dinamica': '/quinzena-dinamica',
  controle: '/controle',
  'aprovacao-dinamica': '/aprovacao-dinamica',
  configuracoes: '/configuracoes',
};

export const HREF_TO_MODULE: Record<string, string> = Object.entries(MODULE_HREF_MAP).reduce(
  (acc, [mod, href]) => {
    acc[href] = mod;
    return acc;
  },
  {} as Record<string, string>
);
