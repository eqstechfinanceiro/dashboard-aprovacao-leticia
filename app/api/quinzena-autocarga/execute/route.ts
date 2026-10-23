import { NextRequest, NextResponse } from 'next/server';
import { denyIfNotAutocarga } from '@/lib/autocarga/allowlist';
import { executeAutoCarga, ExecuteError } from '@/lib/autocarga/execute';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/quinzena-autocarga/execute {year, month, quinzena}
// Executa a carga real: deposit pool→grupo (delta) e transfers grupo→cartão,
// com resultado por CPF gravado em quinzena_carga_runs/items. Idempotente —
// CPF já carregado no período nunca recebe duas vezes.
export async function POST(request: NextRequest) {
  const deny = denyIfNotAutocarga(request);
  if (deny) return deny;

  let body: { year: number; month: number; quinzena: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  }
  const { year, month, quinzena } = body;
  if (!year || !month || ![1, 2].includes(quinzena)) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  const userEmail = request.headers.get('x-user-email') || 'unknown';
  const userName = request.headers.get('x-user-name') || '';

  try {
    const outcome = await executeAutoCarga(
      year, month, quinzena,
      { email: userEmail, name: userName },
      (entry) => logAudit(request, entry),
    );
    return NextResponse.json(outcome);
  } catch (e) {
    if (e instanceof ExecuteError) {
      return NextResponse.json({ error: e.message, ...e.payload }, { status: e.statusCode });
    }
    throw e;
  }
}
