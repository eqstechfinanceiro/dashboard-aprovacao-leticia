import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { logAudit } from '@/lib/db/audit';
import { getScopeForRequest } from '@/lib/auth/scope';
import { recomputeFrozenDerived } from '@/lib/quinzena/recalc-frozen';

export const dynamic = 'force-dynamic';

interface ImportEntry {
  cpf: string;
  nome: string;
  valor: number;
}

// Colunas importáveis — além da planilha de QZ, os demais campos manuais podem
// vir de planilha (ex.: reembolso calculado fora do sistema e lançado em lote).
type ImportField = 'col_1qz' | 'adiantamento' | 'reembolso' | 'carga_final';
const IMPORT_FIELDS: ImportField[] = ['col_1qz', 'adiantamento', 'reembolso', 'carga_final'];

interface ImportBody {
  year: number;
  month: number;
  quinzena: number;
  entries: ImportEntry[];
  field?: ImportField;
  zeroCpfsNotInFile?: boolean;
}

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  }

  const { year, month, quinzena, entries } = body;
  const field: ImportField = body.field ?? 'col_1qz';
  // Zerar quem não está no arquivo só faz sentido pra planilha de QZ (spec:
  // quem não aparecer fica null). Demais campos importam em modo merge —
  // listas parciais de reembolso/adiantamento não podem apagar o resto.
  const zeroAbsent = field === 'col_1qz' && body.zeroCpfsNotInFile !== false;

  if (
    !year || !month || !quinzena ||
    !Array.isArray(entries) ||
    month < 1 || month > 12 ||
    ![1, 2].includes(quinzena) ||
    !IMPORT_FIELDS.includes(field)
  ) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: 'Nenhuma entrada para importar' }, { status: 400 });
  }

  // Importação é escrita global/em lote — gestores editam inline no seu escopo,
  // nunca importam.
  if (await getScopeForRequest(request)) {
    return NextResponse.json(
      { error: 'Gestores não podem importar planilhas (ação global). Edite inline no seu escopo.' },
      { status: 403 },
    );
  }

  // Validate entries
  for (const e of entries) {
    if (!e.cpf || e.cpf.length !== 11 || !/^\d{11}$/.test(e.cpf)) {
      return NextResponse.json({ error: `CPF invalido: "${e.cpf}"` }, { status: 400 });
    }
    if (typeof e.valor !== 'number' || isNaN(e.valor)) {
      return NextResponse.json({ error: `Valor invalido para CPF ${e.cpf}` }, { status: 400 });
    }
    if (field !== 'col_1qz' && e.valor < 0) {
      return NextResponse.json({ error: `Valor negativo para CPF ${e.cpf}` }, { status: 400 });
    }
  }

  const userEmail = request.headers.get('x-user-email') || 'unknown';
  const entityId = `${year}-${String(month).padStart(2, '0')}-Q${quinzena}`;

  try {
    const frozenRes = await sql`
      SELECT COUNT(*)::int AS cnt FROM quinzena_frozen_snapshots
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
    `;
    const isFrozen = Number(frozenRes[0].cnt) > 0;

    if (isFrozen) {
      // ---- Modo congelado: escreve no snapshot + recalcula derivados -------
      // CPFs com carga já executada são selados — importar neles deixaria o
      // valor gravado diferente do dinheiro que saiu do pool.
      const loaded = await sql`
        SELECT cpf FROM quinzena_carga_items
        WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
          AND status IN ('ok', 'forced_ok')
      `.catch(() => [] as any[]);
      const loadedSet = new Set((loaded as any[]).map((r) => r.cpf));

      const writable = entries.filter((e) => !loadedSet.has(e.cpf));
      const skippedLoaded = entries.filter((e) => loadedSet.has(e.cpf)).map((e) => e.cpf);
      const wCpfs = writable.map((e) => e.cpf);
      const wVals = writable.map((e) => e.valor);

      if (wCpfs.length > 0) {
        if (field === 'col_1qz' || field === 'adiantamento') {
          const snapCol = field === 'col_1qz' ? 'col_qz' : 'adiantamento';
          await sql.query(
            `UPDATE quinzena_frozen_snapshots s SET ${snapCol} = v.valor
             FROM (SELECT * FROM unnest($1::text[], $2::numeric[])) AS v(cpf, valor)
             WHERE s.cpf = v.cpf AND s.year = $3 AND s.month = $4 AND s.quinzena = $5`,
            [wCpfs, wVals, year, month, quinzena],
          );
          // Espelha em manual_inputs — se a quinzena for descongelada depois,
          // a importação não se perde (o modo calculado lê de lá)
          await sql.query(
            `INSERT INTO quinzena_manual_inputs (cpf, year, month, quinzena, ${field}, updated_at)
             SELECT v.cpf, $2, $3, $4, v.valor, NOW()
             FROM (SELECT * FROM unnest($1::text[], $5::numeric[])) AS v(cpf, valor)
             ON CONFLICT (cpf, year, month, quinzena) WHERE cpf IS NOT NULL
             DO UPDATE SET ${field} = EXCLUDED.${field}, updated_at = NOW()`,
            [wCpfs, year, month, quinzena, wVals],
          );
          if (zeroAbsent) {
            await sql.query(
              `UPDATE quinzena_frozen_snapshots SET col_qz = NULL
               WHERE year = $1 AND month = $2 AND quinzena = $3
                 AND cpf <> ALL($4::text[])`,
              [year, month, quinzena, wCpfs],
            );
            await sql.query(
              `UPDATE quinzena_manual_inputs SET col_1qz = NULL, updated_at = NOW()
               WHERE year = $1 AND month = $2 AND quinzena = $3
                 AND cpf IS NOT NULL AND cpf <> ALL($4::text[])`,
              [year, month, quinzena, wCpfs],
            );
          }
        } else {
          // Override de resultado → manual_inputs (fonte do badge + recalc)
          await sql.query(
            `INSERT INTO quinzena_manual_inputs
               (cpf, year, month, quinzena, ${field}_override, ${field}_edited_by, ${field}_edited_at, updated_at)
             SELECT v.cpf, $2, $3, $4, v.valor, $5, NOW(), NOW()
             FROM (SELECT * FROM unnest($1::text[], $6::numeric[])) AS v(cpf, valor)
             ON CONFLICT (cpf, year, month, quinzena) WHERE cpf IS NOT NULL
             DO UPDATE SET ${field}_override   = EXCLUDED.${field}_override,
                           ${field}_edited_by  = EXCLUDED.${field}_edited_by,
                           ${field}_edited_at  = NOW(),
                           updated_at        = NOW()`,
            [wCpfs, year, month, quinzena, userEmail, wVals],
          );
        }
      }

      // Recalcula derivados — zerar ausentes afeta todas as linhas do snapshot
      let affected = wCpfs;
      if (field === 'col_1qz' && zeroAbsent) {
        const all = await sql`
          SELECT cpf FROM quinzena_frozen_snapshots
          WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
        `;
        affected = (all as any[]).map((r) => r.cpf);
      }
      const rec = await recomputeFrozenDerived(affected, year, month, quinzena);
      const notInSnapshot = writable.filter((e) => !rec.has(e.cpf)).map((e) => e.cpf);

      await logAudit(request, {
        action: 'quinzena.import_frozen',
        entity_type: 'quinzena',
        entity_id: entityId,
        details: {
          field,
          imported: rec.size,
          skipped_loaded: skippedLoaded.length,
          skipped_not_in_snapshot: notInSnapshot.length,
          zeroed_absent: zeroAbsent && field === 'col_1qz' ? Math.max(0, affected.length - wCpfs.length) : 0,
          total_valor: writable.reduce((s, e) => s + (e.valor || 0), 0),
        },
      });

      return NextResponse.json({
        ok: true,
        frozen: true,
        imported: rec.size,
        failed: 0,
        skipped_loaded: skippedLoaded.length ? skippedLoaded : undefined,
        skipped_not_in_snapshot: notInSnapshot.length ? notInSnapshot : undefined,
      });
    }

    // ---- Modo calculado: escreve em quinzena_manual_inputs ------------------
    const cpfsInFile = entries.map(e => e.cpf);

    if (field === 'col_1qz' && zeroAbsent) {
      await sql`
        UPDATE quinzena_manual_inputs
        SET col_1qz = NULL, updated_at = NOW()
        WHERE year   = ${year}
          AND month  = ${month}
          AND quinzena = ${quinzena}
          AND cpf IS NOT NULL
          AND cpf <> ALL(${cpfsInFile})
      `;
    }

    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      try {
        if (field === 'reembolso' || field === 'carga_final') {
          await sql.query(
            `INSERT INTO quinzena_manual_inputs
               (cpf, year, month, quinzena, ${field}_override, ${field}_edited_by, ${field}_edited_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
             ON CONFLICT (cpf, year, month, quinzena) WHERE cpf IS NOT NULL
             DO UPDATE SET ${field}_override   = EXCLUDED.${field}_override,
                           ${field}_edited_by  = EXCLUDED.${field}_edited_by,
                           ${field}_edited_at  = NOW(),
                           updated_at        = NOW()`,
            [entry.cpf, year, month, quinzena, entry.valor, userEmail],
          );
        } else {
          // field ∈ IMPORT_FIELDS (whitelist) — seguro interpolar como identificador
          await sql.query(
            `INSERT INTO quinzena_manual_inputs (cpf, year, month, quinzena, ${field})
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (cpf, year, month, quinzena) WHERE cpf IS NOT NULL
             DO UPDATE SET ${field} = EXCLUDED.${field}, updated_at = NOW()`,
            [entry.cpf, year, month, quinzena, entry.valor],
          );
        }
        imported++;
      } catch (err) {
        failed++;
        errors.push(`CPF ${entry.cpf}: ${String(err)}`);
      }
    }

    await logAudit(request, {
      action: field === 'col_1qz' ? 'quinzena.import_qz' : 'quinzena.import_field',
      entity_type: 'quinzena',
      entity_id: entityId,
      details: {
        field,
        imported,
        failed,
        total_valor: entries.reduce((s, e) => s + (e.valor || 0), 0),
      },
    });

    return NextResponse.json({
      ok: true,
      imported,
      failed,
      zeroed: field === 'col_1qz' && zeroAbsent ? cpfsInFile.length : 0,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });

  } catch (error) {
    console.error('[quinzena/import-qz]:', error);
    return NextResponse.json(
      { error: 'Erro ao importar', detail: String(error) },
      { status: 500 },
    );
  }
}
