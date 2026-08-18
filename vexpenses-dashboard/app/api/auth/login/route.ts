import { NextRequest, NextResponse } from 'next/server';
import { ensureUsersTable, findUserByEmail, comparePassword } from '@/lib/auth-db';
import { generateToken, AUTH_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { email: string; password: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email e senha são obrigatórios' },
      { status: 400 }
    );
  }

  await ensureUsersTable();

  const user = await findUserByEmail(email);

  if (!user || !user.active) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }

  let valid = false;

  if (user.must_change_password && user.first_access_password) {
    if (password === user.first_access_password) {
      valid = true;
    }
  }

  if (!valid && user.password_hash) {
    valid = await comparePassword(password, user.password_hash);
  }

  if (!valid) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }

  const token = await generateToken({
    id: user.id,
    email: user.email,
    name: user.name,
    job_title: user.job_title,
    role: user.role,
    modules: user.allowed_modules as string[],
    must_change_password: user.must_change_password,
  });

  const response = NextResponse.json({
    ok: true,
    must_change_password: user.must_change_password,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      job_title: user.job_title,
      role: user.role,
      modules: user.allowed_modules,
    },
  });

  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
