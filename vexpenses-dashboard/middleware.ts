import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { AUTH_COOKIE, HREF_TO_MODULE } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/change-password'];
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/vexpenses/update-laravel-token', '/api/vexpenses/keepalive', '/api/pipeline/cron'];

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublicApi) {
    return NextResponse.next();
  }

  if (isPublicPath) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, getSecret());
        if (payload.must_change_password && pathname === '/login') {
          return NextResponse.redirect(new URL('/change-password', request.url));
        }
        if (!payload.must_change_password && pathname === '/change-password') {
          return NextResponse.redirect(new URL('/', request.url));
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
    const moduleId = HREF_TO_MODULE[pathname];
    if (moduleId && payload.role !== 'admin') {
      const modules: string[] = payload.modules || [];
      if (!modules.includes(moduleId)) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  }

  if (pathname.startsWith('/api/users') && payload.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', String(payload.id));
  requestHeaders.set('x-user-role', String(payload.role));
  requestHeaders.set('x-user-email', String(payload.email));

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
