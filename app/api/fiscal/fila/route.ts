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
  // finalizadas — exceto quando `status` pede explicitamente uma finalizada
  // (visão individual das confirmadas OK/erro). scope=historico → só erros
  // confirmados + canceladas. scope=kanban → colunas do quadro (pendentes,
  // falhas técnicas e decisões humanas — auto_ok fica fora).
  const scope = sp.get('scope') || 'all';
  const from = sp.get('from') || null;
  const to = sp.get('to') || null;
  const q = (sp.get('q') || '').trim().toLowerCase();
  // div: tipo de divergência (sufixo do field do check — ex.: 'TES',
  // 'Valor Total', 'ICMS Item'). Filtra notas que têm ao menos um check
  // com match=false desse tipo.
  const div = (sp.get('div') || '').trim();
  // empresa: extra->>'empresa' (EQS/BRATEC). Vazio → todas.
  const empresa = (sp.get('empresa') || '').trim().toUpperCase();
  const runId = sp.get('run_id') ? parseInt(sp.get('run_id')!, 10) : null;
  const limit = Math.min(parseInt(sp.get('limit') || '300', 10) || 300, 1000);
  // 'auto_ok' é a visão "aprovadas" — inclui as aprovadas com aviso de CST.
  // 'auto_ok_aviso' filtra só as avisadas.
  // 'reconf' = pendente aguardando reconferência automática (extra.reconf) —
  // não é acionável; sai da fila 'pendente' e vira visão própria.
  const statusList = status === 'auto_ok' ? ['auto_ok', 'auto_ok_aviso']
    : status === 'reconf' ? ['pendente'] : [status];

  try {
    const runs = await sql`
      SELECT id, tipo, date_from::text, date_to::text, hostname, total_notas,
             matches, divergentes, erros, pendentes, relatorio_nome,
             push_version, created_at
      FROM fiscal_runs ORDER BY created_at DESC LIMIT 20
    `;

    const resumo = await sql`
      SELECT tipo,
             CASE WHEN review_status = 'pendente' AND extra->>'reconf' = 'true'
                  THEN 'reconf' ELSE review_status END AS review_status,
             COUNT(*)::int AS n
      FROM fiscal_notas GROUP BY 1, 2
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
             n.corrigida_by, n.corrigida_at, n.corrigida_nota, n.corrigida_de,
             n.resultados_id, n.doc_path, n.doc_nome, n.created_at, n.updated_at,
             n.monitor_status, n.monitor_checked_at,
             COALESCE(bs.em_bordero, FALSE) AS em_bordero,
             COALESCE(bs.pago, FALSE) AS bordero_pago,
             bs.checked_at AS bordero_checked_at,
             COALESCE(dd.docs, '[]'::jsonb) AS docs
      FROM fiscal_notas n
      LEFT JOIN fiscal_bordero_status bs ON bs.nota_id = n.id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'tipo', d.tipo)
                         ORDER BY (d.tipo = 'G') DESC, d.id) AS docs
        FROM fiscal_notas_docs d WHERE d.nota_id = n.id
      ) dd ON true
      WHERE (${tipo} = 'all' OR n.tipo = ${tipo})
        AND (${status} = 'all' OR n.review_status = ANY(${statusList}))
        AND (${status} <> 'reconf' OR n.extra->>'reconf' = 'true')
        AND (${status} = 'reconf' OR ${q} <> '' OR n.extra->>'reconf' IS DISTINCT FROM 'true')
        AND (${scope} <> 'fila' OR ${status} IN ('confirmado_ok', 'confirmado_erro', 'cancelado', 'corrigida')
             OR n.review_status NOT IN ('confirmado_ok', 'confirmado_erro', 'cancelado', 'corrigida'))
        AND (${scope} <> 'historico' OR n.review_status IN ('confirmado_erro', 'cancelado', 'corrigida'))
        AND (${scope} <> 'kanban' OR n.review_status IN ('pendente', 'falha_tecnica', 'confirmado_ok', 'confirmado_erro', 'cancelado', 'corrigida'))
        AND (${from}::date IS NULL OR n.emissao >= ${from}::date)
        AND (${to}::date IS NULL OR n.emissao <= ${to}::date)
        AND (${runId}::int IS NULL OR n.run_id = ${runId})
        AND (${empresa} = '' OR upper(COALESCE(n.extra->>'empresa', '')) = ${empresa})
        AND (${q} = '' OR
             lower(n.doc) LIKE ${'%' + q + '%'} OR
             lower(COALESCE(n.fornecedor, '')) LIKE ${'%' + q + '%'} OR
             lower(COALESCE(n.chave_acesso, '')) LIKE ${'%' + q + '%'})
        AND (${div} = '' OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(n.checks, '[]'::jsonb)) c,
               LATERAL jsonb_array_elements(
                 CASE WHEN jsonb_typeof(c) = 'array' THEN c ELSE jsonb_build_array(c) END
               ) cc,
               LATERAL (SELECT btrim(substring(cc->>'field' from '([^·]+)$')) AS f) lbl
          WHERE (cc->>'match')::boolean = false
            AND CASE
                  WHEN lbl.f ~* '^doc .+ não encontrado$' THEN 'Doc não encontrado'
                  WHEN lbl.f ~* '^valor .+ não encontrado$' THEN 'Valor não encontrado'
                  WHEN lbl.f ~* '^(iss|irrf|inss) .+ não encontrado$'
                    THEN upper(split_part(lbl.f, ' ', 1)) || ' não encontrado'
                  WHEN lbl.f ~* '^erro ao ler pdf' THEN 'Erro ao ler PDF'
                  ELSE lbl.f
                END = ${div}
        ))
      ORDER BY
        CASE WHEN ${scope} = 'historico' OR ${status} IN ('confirmado_ok', 'confirmado_erro', 'cancelado', 'corrigida')
             THEN COALESCE(n.corrigida_at, n.cancelled_at, n.reviewed_at) END DESC NULLS LAST,
        CASE n.review_status WHEN 'pendente' THEN 0 ELSE 1 END,
        n.emissao DESC NULLS LAST, n.doc DESC
      LIMIT ${limit}
    `;

    // Tipos de divergência presentes no conjunto filtrado (menos o próprio
    // filtro `div`) — alimenta o dropdown da página.
    const divTipos = await sql`
      SELECT DISTINCT
        CASE
          WHEN lbl.f ~* '^doc .+ não encontrado$' THEN 'Doc não encontrado'
          WHEN lbl.f ~* '^valor .+ não encontrado$' THEN 'Valor não encontrado'
          WHEN lbl.f ~* '^(iss|irrf|inss) .+ não encontrado$'
            THEN upper(split_part(lbl.f, ' ', 1)) || ' não encontrado'
          WHEN lbl.f ~* '^erro ao ler pdf' THEN 'Erro ao ler PDF'
          ELSE lbl.f
        END AS t
      FROM fiscal_notas n,
           LATERAL jsonb_array_elements(COALESCE(n.checks, '[]'::jsonb)) c,
           LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(c) = 'array' THEN c ELSE jsonb_build_array(c) END
           ) cc,
           LATERAL (SELECT btrim(substring(cc->>'field' from '([^·]+)$')) AS f) lbl
      WHERE (cc->>'match')::boolean = false
        AND lbl.f IS NOT NULL AND lbl.f <> ''
        AND (${tipo} = 'all' OR n.tipo = ${tipo})
        AND (${status} = 'all' OR n.review_status = ANY(${statusList}))
        AND (${status} = 'reconf' OR ${q} <> '' OR n.extra->>'reconf' IS DISTINCT FROM 'true')
        AND (${status} <> 'reconf' OR n.extra->>'reconf' = 'true')
        AND (${scope} <> 'fila' OR ${status} IN ('confirmado_ok', 'confirmado_erro', 'cancelado', 'corrigida')
             OR n.review_status NOT IN ('confirmado_ok', 'confirmado_erro', 'cancelado', 'corrigida'))
        AND (${scope} <> 'historico' OR n.review_status IN ('confirmado_erro', 'cancelado', 'corrigida'))
        AND (${scope} <> 'kanban' OR n.review_status IN ('pendente', 'falha_tecnica', 'confirmado_ok', 'confirmado_erro', 'cancelado', 'corrigida'))
        AND (${from}::date IS NULL OR n.emissao >= ${from}::date)
        AND (${to}::date IS NULL OR n.emissao <= ${to}::date)
        AND (${runId}::int IS NULL OR n.run_id = ${runId})
        AND (${empresa} = '' OR upper(COALESCE(n.extra->>'empresa', '')) = ${empresa})
        AND (${q} = '' OR
             lower(n.doc) LIKE ${'%' + q + '%'} OR
             lower(COALESCE(n.fornecedor, '')) LIKE ${'%' + q + '%'} OR
             lower(COALESCE(n.chave_acesso, '')) LIKE ${'%' + q + '%'})
      ORDER BY t
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
      div_tipos: divTipos.map((r: any) => r.t),
      total_retornado: notas.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
