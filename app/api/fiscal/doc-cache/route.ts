import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureDocCacheTable, salvarXmlCache } from '@/lib/conferencia/fontes';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/fiscal/doc-cache — recebe XMLs de fontes internas 100% grátis
// (ex.: XMLs que o bot Lince já baixa do TOTVS em C:\temp\xml) e grava no
// fiscal_doc_cache, alimentando a conferência sem depender de SIEG.
//
// Auth: x-fiscal-secret (mesmo segredo do import; escopo no middleware).
//
// Body: { docs: [{ chave, xml, fonte? }] }  — ou { chave, xml } direto.
const MAX_DOCS = 2000;

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const docs = Array.isArray(body?.docs)
    ? body.docs
    : body?.chave && body?.xml
      ? [body]
      : [];
  if (!docs.length) return NextResponse.json({ error: 'docs vazio' }, { status: 400 });
  if (docs.length > MAX_DOCS) return NextResponse.json({ error: `máx ${MAX_DOCS} docs por chamada` }, { status: 400 });

  await ensureDocCacheTable();

  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const d of docs) {
    const chave = String(d?.chave || '').replace(/\D/g, '');
    const xml = typeof d?.xml === 'string' ? d.xml : null;
    const fonte = String(d?.fonte || 'upload_bot').slice(0, 32);
    if (!/^\d{44}$/.test(chave) || !xml || !xml.includes('<')) {
      skipped++;
      continue;
    }
    try {
      const ok = await salvarXmlCache(chave, xml, fonte);
      if (ok) saved++;
      else skipped++;
    } catch (e: any) {
      skipped++;
      if (errors.length < 5) errors.push(`${chave.slice(0, 12)}…: ${e?.message}`);
    }
  }

  await logAudit(request, {
    action: 'fiscal.doc_cache_push',
    entity_type: 'fiscal_doc_cache',
    details: { recebidos: docs.length, salvos: saved, ignorados: skipped, fonte: docs[0]?.fonte || 'upload_bot' },
  });

  return NextResponse.json({ ok: true, recebidos: docs.length, salvos: saved, ignorados: skipped, erros: errors });
}
