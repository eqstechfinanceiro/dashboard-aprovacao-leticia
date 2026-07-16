import { NextRequest, NextResponse } from 'next/server';
import { ensureUsersTable, updateUser } from '@/lib/auth-db';
import { verifyToken, AUTH_COOKIE, generateFirstAccessPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getAuthPayload(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = await getAuthPayload(request);
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  let body: {
    name?: string;
    job_title?: string | null;
    role?: 'admin' | 'gestor' | 'usuario';
    allowed_modules?: string[];
    active?: boolean;
    reset_password?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  await ensureUsersTable();

  let firstAccessPassword: string | undefined;

  if (body.reset_password) {
    firstAccessPassword = generateFirstAccessPassword();
    const updated = await updateUser(id, {
      first_access_password: firstAccessPassword,
      must_change_password: true,
      name: body.name,
      job_title: body.job_title,
      role: body.role,
      allowed_modules: body.allowed_modules,
      active: body.active,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        job_title: updated.job_title,
        role: updated.role,
        allowed_modules: updated.allowed_modules,
        must_change_password: updated.must_change_password,
        active: updated.active,
      },
      first_access_password: firstAccessPassword,
    });
  }

  const updated = await updateUser(id, {
    name: body.name,
    job_title: body.job_title,
    role: body.role,
    allowed_modules: body.allowed_modules,
    active: body.active,
  });

  if (!updated) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      job_title: updated.job_title,
      role: updated.role,
      allowed_modules: updated.allowed_modules,
      must_change_password: updated.must_change_password,
      active: updated.active,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = await getAuthPayload(request);
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  if (id === payload.id) {
    return NextResponse.json({ error: 'Não é possível desativar a si mesmo' }, { status: 400 });
  }

  await ensureUsersTable();

  const updated = await updateUser(id, { active: false });
  if (!updated) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
