import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';
import { logAudit } from '@/lib/db/audit';
import { resolveByDedup, upsertNotification } from '@/lib/sync/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/borderos/confirmar-remocao { nota_id, nota? }
// Ack do contas a pagar: "removi/estornei o título no Protheus". Tira a nota
// da fila imediatamente (o batch segue vigiando e marca removida_detectada_at
// quando o SEA sumir de fato — backstop) e devolve a nota pra fila de entrada
// de notas (review_status='pendente', mesmo reopen do /api/fiscal/revisar).
// Funciona também pra título já pago: a tratativa é estorno, mas o ack é o
// mesmo — quem confirmou assume a responsabilidade e a nota volta pra correção.
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

  const rows = await sql`SELECT em_bordero, pago FROM fiscal_bordero_status WHERE nota_id = ${notaId}`;
  if (!rows[0]) return NextResponse.json({ error: 'Nota sem status de borderô' }, { status: 404 });
  const pago = !!rows[0].pago;

  await sql`
    UPDATE fiscal_bordero_status SET
      remocao_confirmada_at = NOW(),
      remocao_confirmada_by = ${who}
    WHERE nota_id = ${notaId}
  `;
  await resolveByDedup(`bordero:remover:${notaId}`);
  await resolveByDedup(`bordero:paga:${notaId}`);

  // Devolve a nota pra entrada de notas — reabre a revisão (mesmo reopen do
  // 'pendente' em /api/fiscal/revisar): limpa decisão, erro, cancelamento e o
  // estado do monitor de re-lançamento, e tira o registro da aba de erros.
  const notaRes = await sql`SELECT id, doc, serie, review_status, resultados_id FROM fiscal_notas WHERE id = ${notaId}`;
  const nota = notaRes[0];
  let devolvida = false;
  if (nota && ['confirmado_erro', 'falha_tecnica', 'cancelado'].includes(nota.review_status)) {
    if (nota.resultados_id) {
      await sql`DELETE FROM resultados_conferencias WHERE id = ${nota.resultados_id} AND fonte = 'fiscal'`;
    }
    await sql`
      UPDATE fiscal_notas SET
        review_status = 'pendente',
        reviewed_by = NULL, reviewed_at = NULL, review_nota = NULL,
        erro_tipo = NULL, erro_descricao = NULL,
        cancelled_by = NULL, cancelled_at = NULL, cancel_motivo = NULL,
        corrigida_by = NULL, corrigida_at = NULL, corrigida_nota = NULL, corrigida_de = NULL,
        monitor_status = NULL, monitor_detail = NULL, monitor_checked_at = NULL, monitor_fingerprint = NULL,
        resultados_id = NULL,
        updated_at = NOW()
      WHERE id = ${notaId}
    `;
    devolvida = true;

    // Avisa o fiscal que a nota voltou — o card reaparece na coluna Pendente.
    const label = `NF ${nota.doc}${nota.serie ? '/' + nota.serie : ''}`;
    const fiscalUsers = await sql`
      SELECT id FROM app_users
      WHERE active = TRUE AND (role = 'admin' OR allowed_modules @> ${JSON.stringify(['fiscal'])}::jsonb)
    `;
    for (const u of fiscalUsers as any[]) {
      await upsertNotification(u.id, {
        type: 'fiscal_bordero',
        title: `${label} voltou pro entrada`,
        body: `${pago ? 'Baixa tratada (estorno)' : 'Título removido do borderô'} por ${who} — nota reaberta na fila de entrada.`,
        link: '/fiscal',
        dedupKey: `bordero:retorno:${notaId}`,
      });
    }
  }

  await logAudit(request, {
    action: 'fiscal.bordero_remocao_confirmada',
    entity_type: 'fiscal_nota',
    entity_id: notaId,
    details: {
      nota: body.nota ? String(body.nota).slice(0, 300) : null,
      pago,
      devolvida_entrada: devolvida,
      review_status_anterior: nota?.review_status ?? null,
    },
  });

  return NextResponse.json({ ok: true, devolvida_entrada: devolvida });
}
