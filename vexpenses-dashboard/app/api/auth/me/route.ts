import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const payload = await verifyToken(token);

  if (!payload) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({
    user: {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      job_title: payload.job_title,
      role: payload.role,
      modules: payload.modules,
      must_change_password: payload.must_change_password,
    },
  });
}
