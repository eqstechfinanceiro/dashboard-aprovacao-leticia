import { NextRequest, NextResponse } from 'next/server';
import { ensureUsersTable, listUsers, createUser, AppUser } from '@/lib/auth-db';
import { generateFirstAccessPassword, nameFromEmail, verifyToken, AUTH_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getAuthPayload(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

function sanitizeUser(u: AppUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    job_title: u.job_title,
    role: u.role,
    allowed_modules: u.allowed_modules,
    must_change_password: u.must_change_password,
    active: u.active,
    created_at: u.created_at,
  };
}

export async function GET(request: NextRequest) {
  const payload = await getAuthPayload(request);
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  await ensureUsersTable();
  const users = await listUsers();
  return NextResponse.json({ users: users.map(sanitizeUser) });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthPayload(request);
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  let body: {
    email: string;
    name?: string;
    job_title?: string | null;
    role: 'admin' | 'gestor' | 'usuario';
    allowed_modules: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { email, role, allowed_modules } = body;

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  }

  if (!['admin', 'gestor', 'usuario'].includes(role)) {
    return NextResponse.json({ error: 'Cargo inválido' }, { status: 400 });
  }

  if (!Array.isArray(allowed_modules)) {
    return NextResponse.json({ error: 'Módulos inválidos' }, { status: 400 });
  }

  await ensureUsersTable();

  const name = body.name?.trim() || nameFromEmail(email);
  const firstAccessPassword = generateFirstAccessPassword();

  try {
    const user = await createUser({
      email,
      name,
      job_title: body.job_title?.trim() || null,
      role,
      allowed_modules,
      first_access_password: firstAccessPassword,
      created_by: payload.id,
    });

    return NextResponse.json({
      user: sanitizeUser(user),
      first_access_password: firstAccessPassword,
    });
  } catch (error: any) {
    if (error?.message?.includes('unique') || error?.message?.includes('duplicate')) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro ao criar usuário', detail: String(error) }, { status: 500 });
  }
}
