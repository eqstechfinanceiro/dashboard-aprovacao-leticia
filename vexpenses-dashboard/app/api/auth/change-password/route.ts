import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE, generateToken } from '@/lib/auth';
import { findUserById, setUserPassword } from '@/lib/auth-db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const payload = await verifyToken(token);

  if (!payload) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  let body: { current_password?: string; new_password: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { new_password } = body;

  if (!new_password || new_password.length < 6) {
    return NextResponse.json(
      { error: 'A nova senha deve ter no mínimo 6 caracteres' },
      { status: 400 }
    );
  }

  const user = await findUserById(payload.id);

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  if (user.must_change_password && user.first_access_password) {
    if (body.current_password && body.current_password !== user.first_access_password) {
      return NextResponse.json(
        { error: 'Senha de primeiro acesso incorreta' },
        { status: 401 }
      );
    }
  }

  await setUserPassword(payload.id, new_password);

  const newToken = await generateToken({
    id: payload.id,
    email: payload.email,
    name: payload.name,
    job_title: payload.job_title,
    role: payload.role,
    modules: payload.modules,
    must_change_password: false,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
