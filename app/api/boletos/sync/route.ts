import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureBoletosTables, syncBoletos, syncBoletosEmpresa, reflagBoletos } from '@/lib/boletos/totvs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/boletos/sync?empresa=EQS — puxa SE2 do Protheus e revalida códigos
export async function POST(request: Request) {
  if (!sql) return NextResponse.json({ error: 'Banco não configurado' }, { status: 503 });
  try {
    await ensureBoletosTables();
    const url = new URL(request.url);
    if (url.searchParams.get('reflag') === '1') {
      return NextResponse.json({ ok: true, reflag: await reflagBoletos() });
    }
    const emp = url.searchParams.get('empresa')?.toUpperCase();
    const results =
      emp === 'EQS' || emp === 'BRATEC'
        ? [await syncBoletosEmpresa(emp as 'EQS' | 'BRATEC')]
        : await syncBoletos();
    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error('[boletos sync]', e);
    return NextResponse.json({ error: e?.message || 'Erro no sync' }, { status: 500 });
  }
}

// GET — status do último sync por empresa
export async function GET() {
  if (!sql) return NextResponse.json({ error: 'Banco não configurado' }, { status: 503 });
  try {
    await ensureBoletosTables();
    const rows = await sql`SELECT empresa, last_sync_at, last_count, last_flagged FROM boletos_sync_state ORDER BY empresa`;
    const total = await sql`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE flag_count>0)::int AS flagged FROM boletos_titulos`;
    return NextResponse.json({ empresas: rows, total: total[0]?.n || 0, flagged: total[0]?.flagged || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
