import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { syncBorderoStatus } from '@/lib/fiscal/bordero-monitor';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

// POST /api/fiscal/bordero/refresh — fora do ciclo de 45min do worker, roda o
// batch de verificação SEA/SE2 agora (botão "reverificar" das páginas).
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  try {
    const r = await syncBorderoStatus();
    await logAudit(request, {
      action: 'fiscal.bordero_refresh',
      entity_type: 'fiscal',
      details: { checked: r.checked, em_bordero: r.em_bordero, removidas: r.removidas, pagas: r.pagas },
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
