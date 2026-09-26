import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureImpactoTables, syncImpacto } from '@/lib/impacto/totvs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/impacto/sync?full=1 — puxa títulos com acréscimo do Protheus (SE2+SA2+SED+SEZ+CTT)
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco não configurado' }, { status: 503 });
  try {
    await ensureImpactoTables();
    const full = request.nextUrl.searchParams.get('full') === '1';
    const results = await syncImpacto({ full });
    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error('[impacto sync]', e);
    return NextResponse.json({ error: e?.message || 'Erro no sync' }, { status: 500 });
  }
}

// GET — status do último sync por empresa
export async function GET() {
  if (!sql) return NextResponse.json({ error: 'Banco não configurado' }, { status: 503 });
  try {
    await ensureImpactoTables();
    const rows = await sql`SELECT empresa, last_sync_at, last_full_from, last_count FROM impacto_sync_state ORDER BY empresa`;
    const total = await sql`SELECT COUNT(*)::int AS n FROM impacto_titulos`;
    return NextResponse.json({ empresas: rows, total: total[0]?.n || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
