import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';
import { logAudit } from '@/lib/db/audit';
import { resolveByDedup } from '@/lib/sync/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/borderos/confirmar-remocao { nota_id, nota? }
// Ack do contas a pagar: "removi o título do borderô no Protheus". Tira a
// nota da fila imediatamente; o batch segue vigiando e marca
// removida_detectada_at quando o SEA sumir de fato (backstop).
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 });
  await ensureFiscalTables();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const notaId = parseInt(body.nota_id, 10);
  if (!notaId) return NextResponse.json({ error: 'nota_id obrigatório' }, { status: 400 });

  const who = request.headers.get('x-user-name') || request.headers.get('x-user-email') || 'desconhecido';

  const rows = await sql`SELECT em_bordero FROM fiscal_bordero_status WHERE nota_id = ${notaId}`;
  if (!rows[0]) return NextResponse.json({ error: 'Nota sem status de borderô' }, { status: 404 });

  await sql`
    UPDATE fiscal_bordero_status SET
      remocao_confirmada_at = NOW(),
      remocao_confirmada_by = ${who}
    WHERE nota_id = ${notaId}
  `;
  await resolveByDedup(`bordero:remover:${notaId}`);

  await logAudit(request, {
    action: 'fiscal.bordero_remocao_confirmada',
    entity_type: 'fiscal_nota',
    entity_id: notaId,
    details: { nota: body.nota ? String(body.nota).slice(0, 300) : null },
  });

  return NextResponse.json({ ok: true });
}
