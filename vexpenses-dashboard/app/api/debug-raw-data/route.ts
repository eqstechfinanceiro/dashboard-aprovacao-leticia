import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  // Get raw_data for a few reports to see what date fields VExpenses provides
  const samples = await sql`
    SELECT id, name, status, raw_data
    FROM prestacao_reports
    WHERE status ILIKE 'Aprovado'
      AND NOT (name ILIKE '%FATURA%' OR name ILIKE '%CARTAO%')
    ORDER BY id DESC
    LIMIT 3
  `;

  // Also check ENVIADO
  const enviadoSamples = await sql`
    SELECT id, name, status, raw_data
    FROM prestacao_reports
    WHERE status ILIKE 'Enviado'
      AND NOT (name ILIKE '%FATURA%' OR name ILIKE '%CARTAO%')
    ORDER BY id DESC
    LIMIT 3
  `;

  // Get all distinct keys in raw_data
  const keysResult = await sql`
    SELECT DISTINCT jsonb_object_keys(raw_data) as key
    FROM prestacao_reports
    WHERE raw_data IS NOT NULL
    ORDER BY key
  `;

  return NextResponse.json({
    raw_data_keys: keysResult.map((r: any) => r.key),
    aprovado_samples: samples.map((r: any) => ({ id: r.id, name: r.name, status: r.status, raw_data: r.raw_data })),
    enviado_samples: enviadoSamples.map((r: any) => ({ id: r.id, name: r.name, status: r.status, raw_data: r.raw_data })),
  });
}
