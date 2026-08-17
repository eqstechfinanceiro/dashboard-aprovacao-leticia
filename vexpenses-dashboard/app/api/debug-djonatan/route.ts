import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // DJONATAN positive Transferência rows (carga)
  const djonatanCarga = await sql`
    SELECT data, hora, codigo_transacao, valor, descricao
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'DJONATAN JULIO GORGES VENTURI'
      AND tipo = 'Transferência'
      AND valor > 0
      AND data <= '2026-07-31'
    ORDER BY data, hora
  `;

  // LUIS CARLOS BROERING positive Transferência rows (carga)
  const luisCarlosCarga = await sql`
    SELECT data, hora, codigo_transacao, valor, descricao
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'LUIS CARLOS BROERING'
      AND tipo = 'Transferência'
      AND valor > 0
      AND data <= '2026-07-31'
    ORDER BY data, hora
  `;

  return NextResponse.json({
    djonatan_carga: djonatanCarga,
    djonatan_carga_sum: djonatanCarga.reduce((s, r) => s + Number(r.valor), 0),
    luis_carlos_carga: luisCarlosCarga,
    luis_carlos_carga_sum: luisCarlosCarga.reduce((s, r) => s + Number(r.valor), 0),
  });
}
