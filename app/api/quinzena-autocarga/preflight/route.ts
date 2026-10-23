import { NextRequest, NextResponse } from 'next/server';
import { denyIfNotAutocarga } from '@/lib/autocarga/allowlist';
import { buildCargaPlan, PlanError } from '@/lib/autocarga/plan';
import { VexpayAuthError } from '@/lib/vexpay/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET /api/quinzena-autocarga/preflight?year&month&quinzena
// Plano completo da carga sem mover 1 centavo: cargas, bloqueados, já
// carregados, depósitos por grupo e pool disponível.
export async function GET(request: NextRequest) {
  const deny = denyIfNotAutocarga(request);
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '0');
  const month = parseInt(searchParams.get('month') ?? '0');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '0');
  if (!year || !month || ![1, 2].includes(quinzena)) {
    return NextResponse.json({ error: 'Parametros invalidos: year, month, quinzena' }, { status: 400 });
  }

  try {
    const plan = await buildCargaPlan(year, month, quinzena);
    return NextResponse.json(plan, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof PlanError && e.code === 'not_frozen') {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof VexpayAuthError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error('[autocarga/preflight]', e);
    return NextResponse.json({ error: 'Erro ao montar plano de carga', detail: String(e) }, { status: 500 });
  }
}
