import { SignJWT, jwtVerify } from 'jose';

export const AUTH_COOKIE = 'vexp_auth_token';
const JWT_EXPIRES = '7d';
const ALG = 'HS256';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado');
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
  { id: 'dashboard', label: 'Visão Geral' },
  { id: 'aprovacoes', label: 'Aprovações' },
  { id: 'pending-approvals', label: 'Pendências' },
  { id: 'analytics', label: 'Despesas' },
  { id: 'gestao-caixa', label: 'Posição de Caixa' },
  { id: 'quinzena-dinamica', label: 'Quinzena Dinâmica' },
  { id: 'controle', label: 'Controle' },
  { id: 'fechamento', label: 'Fechamento' },
  { id: 'aprovacao-dinamica', label: 'Aprovação Dinâmica' },
  { id: 'automacao-comprovantes', label: 'Automação Comprovantes' },
  { id: 'ferramentas-itau', label: 'Ferramentas Itaú' },
  { id: 'cartorios', label: 'Cartórios' },
  { id: 'resultados', label: 'Resultados (aba em Pendências)' },
  { id: 'pendencias', label: 'Pendências Protheus' },
  { id: 'impacto-financeiro', label: 'Impacto Financeiro' },
  { id: 'boletos', label: 'Boletos — Inconsistências' },
  { id: 'sync-health', label: 'Saúde dos Syncs' },
  { id: 'audit-log', label: 'Log de Auditoria' },
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'configuracoes', label: 'Configurações' },
] as const;

export const MODULE_HREF_MAP: Record<string, string> = {
  dashboard: '/',
  aprovacoes: '/aprovacoes',
  'pending-approvals': '/pending-approvals',
  analytics: '/analytics',
  'gestao-caixa': '/gestao-caixa',
  'quinzena-dinamica': '/quinzena-dinamica',
  controle: '/controle',
  fechamento: '/fechamento',
  'aprovacao-dinamica': '/aprovacao-dinamica',
  'automacao-comprovantes': '/automacao-comprovantes',
  'ferramentas-itau': '/ferramentas-itau',
  cartorios: '/cartorios',
  resultados: '/pendencias',
  pendencias: '/pendencias',
  'impacto-financeiro': '/impacto-financeiro',
  boletos: '/boletos',
  'sync-health': '/sync-health',
  'audit-log': '/audit-log',
  fiscal: '/fiscal',
  configuracoes: '/configuracoes',
};

// Página unificada: /pendencias aceita qualquer um dos dois módulos (as abas
// internas são filtradas por grant individual). Vários módulos podem mapear
// para o mesmo href — o check de acesso passa se QUALQUER um for permitido.
export const HREF_TO_MODULES: Record<string, string[]> = Object.entries(MODULE_HREF_MAP).reduce(
  (acc, [mod, href]) => {
    (acc[href] = acc[href] || []).push(mod);
    return acc;
  },
  {} as Record<string, string[]>
);

// Módulos que NUNCA são liberados por bypass de admin — exigem grant explícito
// em allowed_modules para qualquer role (inclusive admin).
export const RESTRICTED_MODULES = new Set(['configuracoes', 'aprovacao-dinamica', 'automacao-comprovantes', 'cartorios']);

export function canAccessModule(role: string, modules: string[] | undefined, moduleId: string): boolean {
  if (RESTRICTED_MODULES.has(moduleId)) return !!modules?.includes(moduleId);
  return role === 'admin' || !!modules?.includes(moduleId);
}
