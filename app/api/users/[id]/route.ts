import { NextRequest, NextResponse } from 'next/server';
import { ensureUsersTable, updateUser } from '@/lib/db/auth-db';
import { verifyToken, AUTH_COOKIE, generateFirstAccessPassword } from '@/lib/auth/auth';
import { logAudit } from '@/lib/db/audit';

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
  if (!payload || !(payload.modules || []).includes('configuracoes')) {
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
    vexpenses_user_id?: number | null;
    scope_flows?: number[] | null;
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
      vexpenses_user_id: body.vexpenses_user_id,
      scope_flows: body.scope_flows,
      active: body.active,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }
    await logAudit(request, {
      action: 'usuario.reset_password',
      entity_type: 'usuario',
      entity_id: updated.email,
      details: { user_id: id },
    });
    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        job_title: updated.job_title,
        role: updated.role,
        allowed_modules: updated.allowed_modules,
        vexpenses_user_id: updated.vexpenses_user_id,
        scope_flows: updated.scope_flows,
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
    vexpenses_user_id: body.vexpenses_user_id,
    scope_flows: body.scope_flows,
    active: body.active,
  });

  if (!updated) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  await logAudit(request, {
    action: 'usuario.update',
    entity_type: 'usuario',
    entity_id: updated.email,
    details: {
      user_id: id,
      changes: {
        name: body.name, job_title: body.job_title, role: body.role,
        allowed_modules: body.allowed_modules, vexpenses_user_id: body.vexpenses_user_id,
        scope_flows: body.scope_flows, active: body.active,
      },
    },
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      job_title: updated.job_title,
      role: updated.role,
      allowed_modules: updated.allowed_modules,
      vexpenses_user_id: updated.vexpenses_user_id,
      scope_flows: updated.scope_flows,
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
  if (!payload || !(payload.modules || []).includes('configuracoes')) {
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

  await logAudit(request, {
    action: 'usuario.deactivate',
    entity_type: 'usuario',
    entity_id: updated.email,
    details: { user_id: id },
  });

  return NextResponse.json({ ok: true });
}
