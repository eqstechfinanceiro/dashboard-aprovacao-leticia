import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { syncBorderoStatus } from '@/lib/fiscal/bordero-monitor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

// POST /api/borderos/refresh — "reverificar agora" da página /borderos.
// Mesmo batch do worker, disparado sob demanda pelo contas a pagar.
export async function POST(_request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  try {
    const r = await syncBorderoStatus();
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
