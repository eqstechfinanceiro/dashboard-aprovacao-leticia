import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';

// GET /api/fiscal/exportar-xml — mesmos filtros do /fila
// (tipo, status, scope, from, to, q). Baixa um XML com as notas listadas —
// funciona nas três visões da página (Mercadoria, Serviço, Histórico).

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function el(tag: string, v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return s ? `<${tag}>${esc(s)}</${tag}>` : `<${tag}/>`;
}

export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  await ensureFiscalTables();

  const sp = request.nextUrl.searchParams;
  const tipo = sp.get('tipo') || 'all';
  const status = sp.get('status') || 'all';
  const scope = sp.get('scope') || 'all';
  const from = sp.get('from') || null;
  const to = sp.get('to') || null;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const limit = Math.min(parseInt(sp.get('limit') || '1000', 10) || 1000, 5000);

  const notas = await sql`
    SELECT n.id, n.tipo, n.doc, n.serie, n.filial, n.fornecedor, n.cnpj,
           n.valor, n.emissao::text, n.chave_acesso, n.auto_status,
           n.auto_resumo, n.review_status, n.reviewed_by, n.reviewed_at,
           n.erro_tipo, n.erro_descricao, n.cancelled_by, n.cancelled_at,
           n.cancel_motivo, n.created_at
    FROM fiscal_notas n
    WHERE (${tipo} = 'all' OR n.tipo = ${tipo})
      AND (${status} = 'all' OR n.review_status = ${status})
      AND (${scope} <> 'fila' OR n.review_status NOT IN ('confirmado_ok', 'confirmado_erro', 'cancelado'))
      AND (${scope} <> 'historico' OR n.review_status IN ('confirmado_erro', 'cancelado'))
      AND (${from}::date IS NULL OR n.emissao >= ${from}::date)
      AND (${to}::date IS NULL OR n.emissao <= ${to}::date)
      AND (${q} = '' OR
           lower(n.doc) LIKE ${'%' + q + '%'} OR
           lower(COALESCE(n.fornecedor, '')) LIKE ${'%' + q + '%'} OR
           lower(COALESCE(n.chave_acesso, '')) LIKE ${'%' + q + '%'})
    ORDER BY n.emissao DESC NULLS LAST, n.doc DESC
    LIMIT ${limit}
  `;

  const items = notas
    .map(
      (n: any) => `  <nota>
    ${el('id', n.id)}
    ${el('tipo', n.tipo)}
    ${el('numero', n.doc)}
    ${el('serie', n.serie)}
    ${el('filial', n.filial)}
    ${el('fornecedor', n.fornecedor)}
    ${el('cnpj', n.cnpj)}
    ${el('valor', n.valor)}
    ${el('emissao', n.emissao)}
    ${el('chave_acesso', n.chave_acesso)}
    ${el('status_automatico', n.auto_status)}
    ${el('resumo_automatico', n.auto_resumo)}
    ${el('status_revisao', n.review_status)}
    ${el('revisado_por', n.reviewed_by)}
    ${el('revisado_em', n.reviewed_at)}
    ${el('erro_tipo', n.erro_tipo)}
    ${el('erro_descricao', n.erro_descricao)}
    ${el('cancelada_por', n.cancelled_by)}
    ${el('cancelada_em', n.cancelled_at)}
    ${el('cancelamento_motivo', n.cancel_motivo)}
  </nota>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<conferencia_fiscal gerado_em="${esc(new Date().toISOString())}" total="${notas.length}" tipo="${esc(tipo)}" scope="${esc(scope)}" status="${esc(status)}">
${items}
</conferencia_fiscal>
`;

  await logAudit(request, {
    action: 'fiscal.exportar_xml',
    entity_type: 'fiscal_nota',
    entity_id: '-',
    details: { tipo, status, scope, total: notas.length },
  });

  const fname = `fiscal-${scope}-${tipo}-${new Date().toISOString().slice(0, 10)}.xml`;
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
