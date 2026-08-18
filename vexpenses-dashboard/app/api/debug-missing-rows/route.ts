import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // Check specific codigo_transacao from planilha for DJONATAN's missing 680
  const djonatanCod = await sql`
    SELECT data, hora, codigo_transacao, tipo, valor, usuario
    FROM extrato_movimentacao
    WHERE codigo_transacao = '98FB88C0FBE49448'
       OR codigo_transacao LIKE '98FB88C0FBE49448%'
  `;

  // Check all DJONATAN positive Transferência with their codigo_transacao
  const djonatanAll = await sql`
    SELECT data, hora, codigo_transacao, valor
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'DJONATAN JULIO GORGES VENTURI'
      AND tipo = 'Transferência'
      AND valor > 0
      AND data <= '2026-07-31'
    ORDER BY data, hora
  `;

  // Check LUIS CARLOS BROERING - all positive Transferência
  const luisCarlosAll = await sql`
    SELECT data, hora, codigo_transacao, valor
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'LUIS CARLOS BROERING'
      AND tipo = 'Transferência'
      AND valor > 0
      AND data <= '2026-07-31'
    ORDER BY data, hora
  `;

  // Check SILVIO - negative Transferência (transferencia)
  const silvioAll = await sql`
    SELECT data, hora, codigo_transacao, valor
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND UPPER(usuario) = 'SILVIO VINICIUS PINHEIRO GOES'
      AND tipo = 'Transferência'
      AND valor < 0
      AND data <= '2026-07-31'
    ORDER BY data, hora
  `;

  // Check if Taxa has any positive values
  const taxaPositive = await sql`
    SELECT COUNT(*) as cnt, SUM(valor) as total
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND tipo = 'Taxa'
      AND valor > 0
      AND data <= '2026-07-31'
  `;

  return NextResponse.json({
    djonatan_cod_98FB: djonatanCod,
    djonatan_all_carga: djonatanAll,
    luis_carlos_all_carga: luisCarlosAll,
    silvio_all_transf: silvioAll,
    taxa_positive: taxaPositive[0],
  });
}
