import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

interface SnapshotRow {
  year: number;
  month: number;
  quinzena: number;
  total: string;
  imported_at: string;
}

// Returns all periods (year+month+quinzena) that have data in Neon.
// The frontend uses this to show only selectors with real data available.
export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  try {
    const rows = (await sql`
      SELECT
        year,
        month,
        quinzena,
        COUNT(*) AS total,
        MAX(imported_at) AS imported_at
      FROM quinzena_controle_snapshot
      GROUP BY year, month, quinzena
      ORDER BY year DESC, month DESC, quinzena DESC
    `) as unknown as SnapshotRow[];

    const snapshots = rows.map(r => ({
      year: r.year,
      month: r.month,
      quinzena: r.quinzena,
      total_rows: parseInt(String(r.total)),
      imported_at: r.imported_at,
    }));

    return NextResponse.json({ snapshots });
  } catch (error) {
    console.error('[quinzena/snapshots]:', error);
    return NextResponse.json(
      { error: 'Erro ao consultar snapshots', detail: String(error) },
      { status: 500 },
    );
  }
}
