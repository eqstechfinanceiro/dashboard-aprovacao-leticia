import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { AUTH_COOKIE, HREF_TO_MODULES, canAccessModule } from '@/lib/auth/auth';

const PUBLIC_PATHS = ['/login', '/change-password', '/auto-login'];
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/vexpenses/update-laravel-token', '/api/vexpenses/keepalive', '/api/pipeline/cron', '/api/auto-login', '/api/health'];

// GETs com side-effect global (disparam sync) ou dados brutos sem escopo —
// bloqueados para gestores mesmo em leitura.
const GESTOR_BLOCKED_API_PREFIXES = [
  '/api/cache/preload',
  '/api/cache/refresh',
  '/api/pipeline/run',
  '/api/pipeline/step',
  '/api/fix-',
  '/api/smart-download-expenses',
];

// Operações sensíveis restritas a role=admin (jobs de sync, correções em massa,
// bulk upserts). Antes ficavam abertas a qualquer usuário autenticado.
const ADMIN_ONLY_API_PREFIXES = [
  '/api/fix-',
  '/api/pipeline/run',
  '/api/pipeline/step',
  '/api/smart-download-expenses',
  '/api/reports/upsert',
  '/api/preload',
  '/api/download-progress',
];

// Módulos cujos dados alimentam as APIs /api/vexpenses — qualquer um deles libera.
const VEXPENSES_MODULES = [
  'dashboard', 'aprovacoes', 'pending-approvals', 'analytics', 'gestao-caixa',
  'quinzena-dinamica', 'controle', 'fechamento', 'aprovacao-dinamica', 'resultados',
];

// APIs atreladas a módulos — sem grant em NENHUM dos módulos listados, 403.
const API_MODULE_MAP: [string, string[]][] = [
  ['/api/users', ['configuracoes']],
  ['/api/aprovacao-dinamica', ['aprovacao-dinamica']],
  ['/api/comprovantes', ['automacao-comprovantes']],
  ['/api/itau', ['ferramentas-itau']],
  ['/api/resultados', ['resultados']],
  ['/api/pendencias', ['pendencias']],
  ['/api/impacto', ['impacto-financeiro']],
  ['/api/cartorios', ['cartorios']],
  ['/api/quinzena', ['quinzena-dinamica', 'controle', 'configuracoes']],
  ['/api/fechamento', ['fechamento', 'configuracoes']],
  ['/api/analytics/posicao-caixa', ['gestao-caixa']],
  ['/api/analytics/despesas', ['analytics']],
  ['/api/analytics/visao-geral', ['dashboard']],
  ['/api/pipeline/status', ['configuracoes']],
  ['/api/sync-expenses', ['quinzena-dinamica']],
  ['/api/sync-health', ['sync-health', 'configuracoes']],
  ['/api/audit-log', ['audit-log', 'configuracoes']],
  ['/api/fiscal', ['fiscal', 'configuracoes']],
  ['/api/vexpenses', VEXPENSES_MODULES],
];

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado');
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Paths com "." (assets estáticos) passam direto — exceto /api/*, que sempre
  // exige auth mesmo com extensão na URL (ex.: /api/downloads/arquivo.exe).
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || (pathname.includes('.') && !pathname.startsWith('/api/'))) {
    return NextResponse.next();
  }

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublicApi) {
    return NextResponse.next();
  }

  // Automação interna (sync-worker / cron externo): segredo compartilhado dá
  // acesso às APIs como identidade sintética de sistema. Fail-closed: sem
  // CRON_SECRET configurado, nada passa.
  const cronSecret = process.env.CRON_SECRET;
  const providedCron = request.headers.get('x-cron-secret');
  if (cronSecret && providedCron === cronSecret && pathname.startsWith('/api/')) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', '0');
    requestHeaders.set('x-user-role', 'admin');
    requestHeaders.set('x-user-email', 'autopilot@interno');
    requestHeaders.set('x-user-name', 'Fechamento automático');
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Importador fiscal local (automações Python): segredo dedicado, escopo
  // estrito a POST /api/fiscal/import. Fail-closed igual ao cron.
  const fiscalSecret = process.env.FISCAL_IMPORT_SECRET;
  const providedFiscal = request.headers.get('x-fiscal-secret');
  if (
    fiscalSecret &&
    providedFiscal === fiscalSecret &&
    pathname === '/api/fiscal/import' &&
    request.method === 'POST'
  ) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', '0');
    requestHeaders.set('x-user-role', 'admin');
    requestHeaders.set('x-user-email', 'fiscal-import@interno');
    requestHeaders.set('x-user-name', 'Importador fiscal');
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isPublicPath) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, getSecret());
        if (payload.must_change_password && pathname === '/login') {
          return NextResponse.redirect(new URL('/change-password', request.url));
        }
        if (!payload.must_change_password && pathname === '/login') {
          return NextResponse.redirect(new URL('/', request.url));
        }
      } catch {
        // invalid token — let them stay on public pages
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  let payload: any = null;
  try {
    const { payload: verified } = await jwtVerify(token, getSecret());
    payload = verified;
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.delete(AUTH_COOKIE);
    return res;
  }

  if (payload.must_change_password && pathname !== '/change-password') {
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
      return NextResponse.json({ error: 'Troca de senha obrigatória' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/change-password', request.url));
  }

  if (pathname !== '/' && pathname !== '/change-password' && !pathname.startsWith('/api/')) {
    const moduleIds = HREF_TO_MODULES[pathname] ?? HREF_TO_MODULES['/' + pathname.split('/')[1]];
    if (moduleIds && !moduleIds.some((m) => canAccessModule(String(payload.role), payload.modules as string[] | undefined, m))) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Gate de módulo para APIs (chamada direta não pode burlar a sidebar).
  if (pathname.startsWith('/api/')) {
    const role = String(payload.role);
    const mods = payload.modules as string[] | undefined;

    // /api/cache: leitura (metadata/status) é usada pelas páginas; mutações e
    // endpoints de debug são admin-only.
    const cacheReadOnly =
      pathname.startsWith('/api/cache/') &&
      ['GET', 'HEAD'].includes(request.method) &&
      !['/api/cache/debug', '/api/cache/test', '/api/cache/preload', '/api/cache/refresh'].some((p) => pathname.startsWith(p));

    if (
      role !== 'admin' &&
      (ADMIN_ONLY_API_PREFIXES.some((p) => pathname.startsWith(p)) ||
        (pathname.startsWith('/api/cache/') && !cacheReadOnly))
    ) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const apiMods = API_MODULE_MAP.find(([prefix]) => pathname.startsWith(prefix))?.[1];
    if (apiMods && !apiMods.some((m) => canAccessModule(role, mods, m))) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }

  // Gestores são somente-leitura: qualquer escrita fora da whitelist é bloqueada.
  // Rotas permitidas para escrita por gestores (cada uma valida o escopo por dentro).
  if (
    payload.role === 'gestor' &&
    pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  ) {
    const WRITE_ALLOWED = ['/api/auth/', '/api/suporte', '/api/fechamento/sync', '/api/inactive-alerts', '/api/itau'];
    if (!WRITE_ALLOWED.some((p) => pathname.startsWith(p))) {
      return NextResponse.json({ error: 'Ação não permitida para gestores' }, { status: 403 });
    }
  }

  // GETs bloqueados para gestores (side-effects globais / dados sem escopo).
  if (
    payload.role === 'gestor' &&
    pathname.startsWith('/api/') &&
    GESTOR_BLOCKED_API_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', String(payload.id));
  requestHeaders.set('x-user-role', String(payload.role));
  requestHeaders.set('x-user-email', String(payload.email));
  requestHeaders.set('x-user-name', String(payload.name ?? ''));

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
