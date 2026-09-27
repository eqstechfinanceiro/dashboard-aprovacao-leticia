import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import {
  ensureFiscalTables,
  computeReviewStatus,
  FISCAL_TIPOS,
  AUTO_STATUS,
} from '@/lib/fiscal/fiscal-db';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';

// Payload enviado pelos runners Python locais (conferencia-notas-mercadoria e
// download-notas-de-servico). Auth: x-fiscal-secret (bypass no middleware,
// escopo restrito a este endpoint).
//
// Body:
// {
//   run: { tipo, date_from, date_to, hostname?, relatorio_nome? },
//   notas: [{
//     doc, serie?, filial?, fornecedor?, cnpj?, valor?, emissao? (YYYY-MM-DD),
//     chave_acesso?, auto_status: 'match'|'divergente'|'erro'|'pendente',
//     auto_resumo?, checks?: [{field,expected,actual,match}], extra?
//   }]
// }

interface NotaIn {
  doc: string;
  serie?: string | null;
  filial?: string | null;
  fornecedor?: string | null;
  cnpj?: string | null;
  valor?: number | null;
  emissao?: string | null;
  chave_acesso?: string | null;
  auto_status: string;
  auto_resumo?: string | null;
  checks?: unknown;
  extra?: unknown;
}

function cleanStr(v: unknown, max = 300): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function cleanDate(v: unknown): string | null {
  const s = cleanStr(v, 20);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function cleanNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });

  let body: { run?: any; notas?: NotaIn[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const run = body.run;
  const notas = Array.isArray(body.notas) ? body.notas : [];
  if (!run || !FISCAL_TIPOS.includes(run.tipo) || !cleanDate(run.date_from) || !cleanDate(run.date_to)) {
    return NextResponse.json(
      { error: 'run { tipo, date_from, date_to } obrigatório e válido' },
      { status: 400 }
    );
  }
  if (notas.length === 0) {
    return NextResponse.json({ error: 'notas vazio' }, { status: 400 });
  }
  if (notas.length > 5000) {
    return NextResponse.json({ error: 'máx 5000 notas por importação' }, { status: 400 });
  }

  const valid = notas.filter(
    (n) => cleanStr(n.doc, 60) && AUTO_STATUS.includes(n.auto_status as any)
  );
  if (valid.length === 0) {
    return NextResponse.json(
      { error: 'nenhuma nota válida (doc + auto_status obrigatórios)' },
      { status: 400 }
    );
  }

  await ensureFiscalTables();

  const counts = { match: 0, divergente: 0, erro: 0, pendente: 0 };
  for (const n of valid) counts[n.auto_status as keyof typeof counts]++;

  const runResult = await sql`
    INSERT INTO fiscal_runs (tipo, date_from, date_to, hostname, total_notas, matches, divergentes, erros, pendentes, relatorio_nome)
    VALUES (${run.tipo}, ${cleanDate(run.date_from)}, ${cleanDate(run.date_to)},
            ${cleanStr(run.hostname, 100)}, ${valid.length}, ${counts.match},
            ${counts.divergente}, ${counts.erro}, ${counts.pendente}, ${cleanStr(run.relatorio_nome, 300)})
    RETURNING id
  `;
  const runId = runResult[0].id as number;

  // Upsert idempotente: a mesma nota (tipo+doc+serie+filial+emissao+fornecedor)
  // reimportada atualiza o diagnóstico automático, mas preserva revisão humana.
  let inserted = 0;
  let updated = 0;
  let preserved = 0;

  for (const n of valid) {
    const autoStatus = n.auto_status as string;
    const reviewStatus = computeReviewStatus(autoStatus as any);
    const res = await sql`
      INSERT INTO fiscal_notas
        (run_id, tipo, doc, serie, filial, fornecedor, cnpj, valor, emissao,
         chave_acesso, auto_status, auto_resumo, checks, extra, review_status)
      VALUES
        (${runId}, ${run.tipo}, ${cleanStr(n.doc, 60)}, ${cleanStr(n.serie, 20)},
         ${cleanStr(n.filial, 20)}, ${cleanStr(n.fornecedor, 200)}, ${cleanStr(n.cnpj, 20)},
         ${cleanNum(n.valor)}, ${cleanDate(n.emissao)}, ${cleanStr(n.chave_acesso, 60)},
         ${autoStatus}, ${cleanStr(n.auto_resumo, 500)},
         ${n.checks ? JSON.stringify(n.checks) : null},
         ${n.extra ? JSON.stringify(n.extra) : null},
         ${reviewStatus})
      ON CONFLICT (tipo, doc, COALESCE(serie, ''), COALESCE(filial, ''), COALESCE(emissao, '1900-01-01'::date), COALESCE(fornecedor, '')) DO UPDATE SET
        run_id = EXCLUDED.run_id,
        cnpj = COALESCE(EXCLUDED.cnpj, fiscal_notas.cnpj),
        valor = COALESCE(EXCLUDED.valor, fiscal_notas.valor),
        chave_acesso = COALESCE(EXCLUDED.chave_acesso, fiscal_notas.chave_acesso),
        auto_status = EXCLUDED.auto_status,
        auto_resumo = EXCLUDED.auto_resumo,
        checks = COALESCE(EXCLUDED.checks, fiscal_notas.checks),
        extra = COALESCE(EXCLUDED.extra, fiscal_notas.extra),
        -- Decisão humana nunca é sobrescrita; auto_ok só desce pra pendente se
        -- o novo resultado automático deixou de ser match.
        review_status = CASE
          WHEN fiscal_notas.review_status IN ('confirmado_ok', 'confirmado_erro')
            THEN fiscal_notas.review_status
          ELSE ${reviewStatus}
        END,
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS was_inserted, review_status
    `;
    const row = res[0];
    if (row.was_inserted) inserted++;
    else updated++;
    if (row.review_status === 'confirmado_ok' || row.review_status === 'confirmado_erro') preserved++;
  }

  await logAudit(request, {
    action: 'fiscal.import',
    entity_type: 'fiscal_run',
    entity_id: runId,
    details: {
      tipo: run.tipo,
      periodo: `${cleanDate(run.date_from)}~${cleanDate(run.date_to)}`,
      total: valid.length,
      inserted,
      updated,
      matches: counts.match,
      divergentes: counts.divergente,
      erros: counts.erro,
      pendentes: counts.pendente,
    },
  });

  return NextResponse.json({
    ok: true,
    run_id: runId,
    total: valid.length,
    inserted,
    updated,
    revisoes_preservadas: preserved,
    counts,
  });
}
