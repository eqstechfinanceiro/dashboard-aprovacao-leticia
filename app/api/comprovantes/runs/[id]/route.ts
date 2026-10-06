import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { getRun } from '@/lib/comprovantes/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const { run, envios } = await getRun(id);
  if (!run) return NextResponse.json({ error: 'run não encontrado' }, { status: 404 });
  return NextResponse.json({ run, envios });
}
