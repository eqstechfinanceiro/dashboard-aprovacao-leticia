import { NextRequest, NextResponse } from 'next/server';
import { ensureUsersTable, findUserByEmail, createUser, updateUser } from '@/lib/auth-db';
import { generateFirstAccessPassword, nameFromEmail } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'italo.medrado@eqsengenharia.com.br',
  'leticia@eqsengenharia.com.br',
];

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const body = await request.json().catch(() => ({}));
  const providedSecret = body?.secret || authHeader?.replace('Bearer ', '');
  const forceReset = body?.force_reset === true;

  if (cronSecret && providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  await ensureUsersTable();

  const results: Array<{ email: string; created: boolean; first_access_password?: string; error?: string }> = [];

  for (const email of ADMIN_EMAILS) {
    const existing = await findUserByEmail(email);

    if (existing) {
      if (forceReset || (existing.must_change_password && !existing.first_access_password)) {
        const newPass = generateFirstAccessPassword();
        await updateUser(existing.id, {
          first_access_password: newPass,
          must_change_password: true,
        });
        results.push({ email, created: false, first_access_password: newPass });
      } else if (existing.must_change_password && existing.first_access_password) {
        results.push({ email, created: false, first_access_password: existing.first_access_password });
      } else {
        results.push({ email, created: false });
      }
      continue;
    }

    const firstAccessPassword = generateFirstAccessPassword();
    const name = nameFromEmail(email);

    try {
      await createUser({
        email,
        name,
        job_title: 'Administrador',
        role: 'admin',
        allowed_modules: [],
        first_access_password: firstAccessPassword,
      });
      results.push({ email, created: true, first_access_password: firstAccessPassword });
    } catch (error: any) {
      results.push({ email, created: false, error: String(error) });
    }
  }

  return NextResponse.json({ results });
}
