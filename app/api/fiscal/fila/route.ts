import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';

export const dynamic = 'force-dynamic';

// GET /api/fiscal/fila?tipo=mercadoria|servico&status=pendente|auto_ok|...&from=&to=&q=
// Fila de trabalho do setor fiscal. Sem params: resumo do dia (últimos runs +
// contagens por status) + notas pendentes.
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  await ensureFiscalTables();

  const sp = request.nextUrl.searchParams;
  const tipo = sp.get('tipo') || 'all';
  const status = sp.get('status') || 'all';
  // scope=fila (default em uso) → fila de trabalho do fiscal, sem as
  // finalizadas; scope=historico → só erros confirmados + canceladas
  // (visão do setor que trata os erros).
  const scope = sp.get('scope') || 'all';
  const from = sp.get('from') || null;
  const to = sp.get('to') || null;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const runId = sp.get('run_id') ? parseInt(sp.get('run_id')!, 10) : null;
  const limit = Math.min(parseInt(sp.get('limit') || '300', 10) || 300, 1000);

  try {
    const runs = await sql`
      SELECT id, tipo, date_from::text, date_to::text, hostname, total_notas,
             matches, divergentes, erros, pendentes, relatorio_nome,
             push_version, created_at
      FROM fiscal_runs ORDER BY created_at DESC LIMIT 20
    `;

    const resumo = await sql`
      SELECT tipo, review_status, COUNT(*)::int AS n
      FROM fiscal_notas GROUP BY tipo, review_status
    `;

    const ultimaEmissao = await sql`
      SELECT tipo, MAX(emissao)::text AS max_emissao FROM fiscal_notas GROUP BY tipo
    `;

    const notas = await sql`
      SELECT n.id, n.run_id, n.tipo, n.doc, n.serie, n.filial, n.fornecedor,
             n.cnpj, n.valor, n.emissao::text, n.chave_acesso, n.auto_status,
             n.auto_resumo, n.checks, n.extra, n.review_status, n.reviewed_by,
             n.reviewed_at, n.review_nota, n.erro_tipo, n.erro_descricao,
             n.cancelled_by, n.cancelled_at, n.cancel_motivo,
             n.resultados_id, n.doc_path, n.doc_nome, n.created_at, n.updated_at
      FROM fiscal_notas n
      WHERE (${tipo} = 'all' OR n.tipo = ${tipo})
        AND (${status} = 'all' OR n.review_status = ${status})
        AND (${scope} <> 'fila' OR n.review_status NOT IN ('confirmado_ok', 'confirmado_erro', 'cancelado'))
        AND (${scope} <> 'historico' OR n.review_status IN ('confirmado_erro', 'cancelado'))
        AND (${from}::date IS NULL OR n.emissao >= ${from}::date)
        AND (${to}::date IS NULL OR n.emissao <= ${to}::date)
        AND (${runId}::int IS NULL OR n.run_id = ${runId})
        AND (${q} = '' OR
             lower(n.doc) LIKE ${'%' + q + '%'} OR
             lower(COALESCE(n.fornecedor, '')) LIKE ${'%' + q + '%'} OR
             lower(COALESCE(n.chave_acesso, '')) LIKE ${'%' + q + '%'})
      ORDER BY
        CASE WHEN ${scope} = 'historico' OR ${status} IN ('confirmado_ok', 'confirmado_erro', 'cancelado')
             THEN n.reviewed_at END DESC NULLS LAST,
        CASE n.review_status WHEN 'pendente' THEN 0 ELSE 1 END,
        n.emissao DESC NULLS LAST, n.doc DESC
      LIMIT ${limit}
    `;

    const resumoMap: Record<string, Record<string, number>> = {};
    for (const r of resumo) {
      resumoMap[r.tipo] = resumoMap[r.tipo] || {};
      resumoMap[r.tipo][r.review_status] = r.n;
    }

    return NextResponse.json({
      runs: runs,
      resumo: resumoMap,
      ultima_emissao: ultimaEmissao,
      notas: notas,
      total_retornado: notas.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
