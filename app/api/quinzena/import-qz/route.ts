import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

interface ImportEntry {
  cpf: string;
  nome: string;
  valor: number;
}

interface ImportBody {
  year: number;
  month: number;
  quinzena: number;
  entries: ImportEntry[];
  zeroCpfsNotInFile: boolean; // always true per spec
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

  if (
    !year || !month || !quinzena ||
    !Array.isArray(entries) ||
    month < 1 || month > 12 ||
    ![1, 2].includes(quinzena)
  ) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: 'Nenhuma entrada para importar' }, { status: 400 });
  }

  // Validate entries
  for (const e of entries) {
    if (!e.cpf || e.cpf.length !== 11 || !/^\d{11}$/.test(e.cpf)) {
      return NextResponse.json({ error: `CPF invalido: "${e.cpf}"` }, { status: 400 });
    }
    if (typeof e.valor !== 'number' || isNaN(e.valor)) {
      return NextResponse.json({ error: `Valor invalido para CPF ${e.cpf}` }, { status: 400 });
    }
  }

  try {
    // 1. Zero out col_1qz for all CPFs in this period that are NOT in the file
    //    (per spec: quem não aparecer fica null)
    const cpfsInFile = entries.map(e => e.cpf);

    await sql`
      UPDATE quinzena_manual_inputs
      SET col_1qz = NULL, updated_at = NOW()
      WHERE year   = ${year}
        AND month  = ${month}
        AND quinzena = ${quinzena}
        AND cpf IS NOT NULL
        AND cpf <> ALL(${cpfsInFile})
    `;

    // 2. Upsert each entry
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      try {
        await sql`
          INSERT INTO quinzena_manual_inputs (cpf, year, month, quinzena, col_1qz)
          VALUES (${entry.cpf}, ${year}, ${month}, ${quinzena}, ${entry.valor})
          ON CONFLICT (cpf, year, month, quinzena) WHERE cpf IS NOT NULL
          DO UPDATE SET
            col_1qz    = EXCLUDED.col_1qz,
            updated_at = NOW()
        `;
        imported++;
      } catch (err) {
        failed++;
        errors.push(`CPF ${entry.cpf}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      failed,
      zeroed: cpfsInFile.length,
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
