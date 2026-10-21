import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables, ERRO_TIPOS, deleteFiscalDoc } from '@/lib/fiscal/fiscal-db';
import { enviarTeamsErroFiscal } from '@/lib/fiscal/teams';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';

// POST /api/fiscal/revisar
// { nota_id, decisao: 'confirmado_ok' | 'confirmado_erro' | 'cancelado' | 'pendente' | 'corrigida',
//   erro_tipo?, erro_descricao?, review_nota?, cancel_motivo?, corrigida_nota? }
// 'pendente' = reabrir a nota (volta pra fila) — usado pelo kanban ao arrastar
// um card de volta e pela ação "desfazer".
// 'corrigida' = o setor de entrada de notas corrigiu a nota no TOTVS — só a
// partir de confirmado_erro; registra quem corrigiu/quando/como e tira a nota
// da aba de erros (resultados_conferencias).
//
// confirmado_erro → cria registro em resultados_conferencias (aba de erros
// existente) e linka via resultados_id. Idempotente: revisar de novo a mesma
// nota com o mesmo resultado não duplica o erro.
// cancelado → só a partir de confirmado_erro; marca que a nota foi
// cancelada no ERP (outro setor), guardando quem/quando/motivo.

const RESULTADOS_FONTE = 'fiscal';

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const notaId = parseInt(body.nota_id, 10);
  const decisao = String(body.decisao || '');
  if (!notaId || !['confirmado_ok', 'confirmado_erro', 'cancelado', 'pendente', 'corrigida', 'desfazer_correcao'].includes(decisao)) {
    return NextResponse.json(
      { error: 'nota_id e decisao (confirmado_ok|confirmado_erro|cancelado|pendente|corrigida|desfazer_correcao) obrigatórios' },
      { status: 400 }
    );
  }

  const erroTipo = body.erro_tipo ? String(body.erro_tipo) : null;
  if (decisao === 'confirmado_erro' && (!erroTipo || !ERRO_TIPOS.includes(erroTipo as any))) {
    return NextResponse.json(
      { error: `erro_tipo obrigatório: ${ERRO_TIPOS.join(', ')}` },
      { status: 400 }
    );
  }

  await ensureFiscalTables();

  const notaRes = await sql`SELECT * FROM fiscal_notas WHERE id = ${notaId}`;
  if (notaRes.length === 0) {
    return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
  }
  const nota = notaRes[0];

  // Cancelamento só faz sentido sobre um erro confirmado; desfazer o
  // cancelamento devolve a nota para confirmado_erro.
  if (decisao === 'cancelado' && nota.review_status !== 'confirmado_erro') {
    return NextResponse.json(
      { error: 'Só é possível cancelar uma nota com erro confirmado' },
      { status: 409 }
    );
  }

  // Correção: erro confirmado OU cancelada podem ser marcadas corrigidas
  // (nota cancelada no ERP também pode voltar corrigida depois). O status de
  // origem fica em corrigida_de pro "desfazer" restaurar certo.
  if (decisao === 'corrigida' && !['confirmado_erro', 'cancelado'].includes(nota.review_status)) {
    return NextResponse.json(
      { error: 'Só é possível marcar como corrigida uma nota com erro confirmado ou cancelada' },
      { status: 409 }
    );
  }

  // Desfazer correção devolve a nota ao status de origem (corrigida_de):
  // erro confirmado ou cancelada. O erro continua real — recria a linha na
  // aba de erros.
  if (decisao === 'desfazer_correcao' && nota.review_status !== 'corrigida') {
    return NextResponse.json(
      { error: 'Só é possível desfazer a correção de uma nota corrigida' },
      { status: 409 }
    );
  }

  // Quem revisou — identidade vem dos headers do middleware.
  const reviewer =
    request.headers.get('x-user-name') ||
    request.headers.get('x-user-email') ||
    'desconhecido';

  let resultadosId: number | null = nota.resultados_id;

  const isDesfazer = decisao === 'desfazer_correcao';
  const statusFinal = isDesfazer
    ? (nota.corrigida_de === 'cancelado' ? 'cancelado' : 'confirmado_erro')
    : decisao;

  if ((decisao === 'confirmado_erro' || isDesfazer) && !resultadosId) {
    const descricao =
      (decisao === 'confirmado_erro' && body.erro_descricao && String(body.erro_descricao).slice(0, 500)) ||
      nota.erro_descricao ||
      nota.auto_resumo ||
      'Erro confirmado na conferência fiscal';
    const titulo = `NF ${nota.doc} - ${nota.fornecedor || 'fornecedor'} - ${descricao}`.slice(0, 400);
    const ins = await sql`
      INSERT INTO resultados_conferencias (titulo, tipo, erro, valor, data, fonte)
      VALUES (${titulo}, ${nota.tipo}, ${decisao === 'confirmado_erro' ? erroTipo : (nota.erro_tipo || 'outro')},
              ${nota.valor ?? 0}, ${nota.emissao ?? new Date().toISOString().slice(0, 10)},
              ${RESULTADOS_FONTE})
      RETURNING id
    `;
    resultadosId = ins[0].id;
  } else if (decisao === 'confirmado_ok' || decisao === 'pendente' || decisao === 'corrigida') {
    if (resultadosId) {
      // Revisão mudou de erro→ok/corrigida: remove o registro da aba de erros
      // para não deixar um falso positivo permanentemente listado.
      await sql`DELETE FROM resultados_conferencias WHERE id = ${resultadosId} AND fonte = ${RESULTADOS_FONTE}`;
      resultadosId = null;
    }
    // Nota conferida e OK: o documento-fonte não é mais necessário na VPS.
    // Erros confirmados MANTÊM o doc (evidência na aba de erros).
    // Reabrir (pendente) também não precisa segurar o arquivo.
    if (decisao === 'confirmado_ok') await deleteFiscalDoc(notaId);
  }

  const isCancel = decisao === 'cancelado';
  const isReopen = decisao === 'pendente';
  const isCorrigida = decisao === 'corrigida';
  const upd = await sql`
    UPDATE fiscal_notas SET
      review_status = ${statusFinal},
      reviewed_by = ${isCancel || isCorrigida || isDesfazer ? nota.reviewed_by : (isReopen ? null : reviewer)},
      reviewed_at = ${isCancel || isCorrigida || isDesfazer ? nota.reviewed_at : (isReopen ? null : new Date().toISOString())},
      review_nota = ${isCancel || isCorrigida || isDesfazer ? nota.review_nota : (body.review_nota ? String(body.review_nota).slice(0, 500) : null)},
      erro_tipo = ${decisao === 'confirmado_erro' ? erroTipo : (isCancel || isCorrigida || isDesfazer ? nota.erro_tipo : null)},
      erro_descricao = ${decisao === 'confirmado_erro' ? (body.erro_descricao ? String(body.erro_descricao).slice(0, 500) : nota.auto_resumo) : (isCancel || isCorrigida || isDesfazer ? nota.erro_descricao : null)},
      cancelled_by = ${isCancel ? reviewer : (isCorrigida || isDesfazer ? nota.cancelled_by : null)},
      cancelled_at = ${isCancel ? new Date().toISOString() : (isCorrigida || isDesfazer ? nota.cancelled_at : null)},
      cancel_motivo = ${isCancel && body.cancel_motivo ? String(body.cancel_motivo).slice(0, 500) : (isCorrigida || isDesfazer ? nota.cancel_motivo : null)},
      corrigida_by = ${isCorrigida ? reviewer : (isDesfazer || decisao === 'confirmado_erro' ? null : nota.corrigida_by)},
      corrigida_at = ${isCorrigida ? new Date().toISOString() : (isDesfazer || decisao === 'confirmado_erro' ? null : nota.corrigida_at)},
      corrigida_nota = ${isCorrigida ? (body.corrigida_nota ? String(body.corrigida_nota).slice(0, 500) : null) : (isDesfazer || decisao === 'confirmado_erro' ? null : nota.corrigida_nota)},
      corrigida_de = ${isCorrigida ? nota.review_status : null},
      resultados_id = ${resultadosId},
      updated_at = NOW()
    WHERE id = ${notaId}
    RETURNING id, review_status, resultados_id
  `;

  await logAudit(request, {
    action: 'fiscal.revisar',
    entity_type: 'fiscal_nota',
    entity_id: notaId,
    details: {
      decisao,
      tipo: nota.tipo,
      doc: nota.doc,
      fornecedor: nota.fornecedor,
      erro_tipo: decisao === 'confirmado_erro' ? erroTipo : nota.erro_tipo,
      cancel_motivo: decisao === 'cancelado' ? (body.cancel_motivo || null) : null,
      corrigida_nota: decisao === 'corrigida' ? (body.corrigida_nota || null) : null,
      resultados_id: resultadosId,
      decisao_anterior: nota.review_status,
    },
  });

  // Notificação no Teams ao confirmar erro — fire-and-forget: falha do
  // webhook nunca pode impedir a revisão de ser registrada.
  if (decisao === 'confirmado_erro') {
    enviarTeamsErroFiscal({
      ...nota,
      erro_tipo: erroTipo,
      erro_descricao: body.erro_descricao ? String(body.erro_descricao).slice(0, 500) : nota.auto_resumo,
    }, reviewer).catch((e) => console.error('[Fiscal] envio ao Teams falhou:', e?.message || e));
  }

  return NextResponse.json({ ok: true, nota: upd[0] });
}
