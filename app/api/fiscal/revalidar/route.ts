import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables } from '@/lib/fiscal/fiscal-db';
import { revalidateNotaComDoc } from '@/lib/fiscal/revalidar-danfe';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/fiscal/revalidar
// { id }              → revalida uma nota
// { stale: true }     → revalida todas as pendentes/falhas-técnicas que têm
//                       documento local mas auto_resumo ainda é de erro técnico
//                       (legado: viraram pendentes pelo backfill sem comparação)
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  await ensureFiscalTables();

  let ids: number[];
  if (body.id) {
    ids = [parseInt(body.id, 10)];
  } else if (body.stale) {
    const rows = await sql`
      SELECT id FROM fiscal_notas
      WHERE review_status IN ('pendente', 'falha_tecnica')
        AND doc_path LIKE 'fiscal/%.pdf'
        AND (auto_status = 'erro' OR auto_resumo ILIKE 'Falha%' OR auto_resumo ILIKE '%não extraível%')
      ORDER BY id
      LIMIT 300
    `;
    ids = rows.map((r: any) => r.id);
  } else {
    return NextResponse.json({ error: 'informe id ou stale: true' }, { status: 400 });
  }

  const results = { total: ids.length, revalidadas: 0, sem_doc: 0, erros: 0 };
  for (const id of ids) {
    try {
      const r = await revalidateNotaComDoc(id);
      if (r) results.revalidadas++;
      else results.sem_doc++;
    } catch {
      results.erros++;
    }
  }

  await logAudit(request, {
    action: 'fiscal.revalidar',
    entity_type: 'fiscal_nota',
    entity_id: ids.length === 1 ? ids[0] : undefined,
    details: results,
  });

  return NextResponse.json({ ok: true, ...results });
}
