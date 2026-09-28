import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables, ERRO_TIPOS, deleteFiscalDoc } from '@/lib/fiscal/fiscal-db';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';

// POST /api/fiscal/revisar
// { nota_id, decisao: 'confirmado_ok' | 'confirmado_erro',
//   erro_tipo?, erro_descricao?, review_nota? }
//
// confirmado_erro → cria registro em resultados_conferencias (aba de erros
// existente) e linka via resultados_id. Idempotente: revisar de novo a mesma
// nota com o mesmo resultado não duplica o erro.

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
  if (!notaId || !['confirmado_ok', 'confirmado_erro'].includes(decisao)) {
    return NextResponse.json(
      { error: 'nota_id e decisao (confirmado_ok|confirmado_erro) obrigatórios' },
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

  // Quem revisou — identidade vem dos headers do middleware.
  const reviewer =
    request.headers.get('x-user-name') ||
    request.headers.get('x-user-email') ||
    'desconhecido';

  let resultadosId: number | null = nota.resultados_id;

  if (decisao === 'confirmado_erro' && !resultadosId) {
    const descricao =
      (body.erro_descricao && String(body.erro_descricao).slice(0, 500)) ||
      nota.auto_resumo ||
      'Erro confirmado na conferência fiscal';
    const titulo = `NF ${nota.doc} - ${nota.fornecedor || 'fornecedor'} - ${descricao}`.slice(0, 400);
    const ins = await sql`
      INSERT INTO resultados_conferencias (titulo, tipo, erro, valor, data, fonte)
      VALUES (${titulo}, ${nota.tipo}, ${erroTipo},
              ${nota.valor ?? 0}, ${nota.emissao ?? new Date().toISOString().slice(0, 10)},
              ${RESULTADOS_FONTE})
      RETURNING id
    `;
    resultadosId = ins[0].id;
  } else if (decisao === 'confirmado_ok') {
    if (resultadosId) {
      // Revisão mudou de erro→ok: remove o registro da aba de erros para não
      // deixar um falso positivo permanentemente listado.
      await sql`DELETE FROM resultados_conferencias WHERE id = ${resultadosId} AND fonte = ${RESULTADOS_FONTE}`;
      resultadosId = null;
    }
    // Nota conferida e OK: o documento-fonte não é mais necessário na VPS.
    // Erros confirmados MANTÊM o doc (evidência na aba de erros).
    await deleteFiscalDoc(notaId);
  }

  const upd = await sql`
    UPDATE fiscal_notas SET
      review_status = ${decisao},
      reviewed_by = ${reviewer},
      reviewed_at = NOW(),
      review_nota = ${body.review_nota ? String(body.review_nota).slice(0, 500) : null},
      erro_tipo = ${decisao === 'confirmado_erro' ? erroTipo : null},
      erro_descricao = ${decisao === 'confirmado_erro' ? (body.erro_descricao ? String(body.erro_descricao).slice(0, 500) : nota.auto_resumo) : null},
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
      erro_tipo: decisao === 'confirmado_erro' ? erroTipo : null,
      resultados_id: resultadosId,
      decisao_anterior: nota.review_status,
    },
  });

  return NextResponse.json({ ok: true, nota: upd[0] });
}
