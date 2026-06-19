import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

/**
 * Retorna todos os períodos disponíveis para seleção no dashboard.
 *
 * Um período é considerado disponível se:
 *   a) Tem snapshot importado em quinzena_controle_snapshot (dados históricos completos), OU
 *   b) Tem transações no extrato_movimentacao (cálculo automático via Neon)
 *
 * A resposta inclui flag `has_snapshot` para o frontend diferenciar
 * períodos com dados completos (snapshot) de períodos calculados on-the-fly.
 */

interface PeriodRow {
  year: number;
  month: number;
  quinzena: number;
  has_snapshot: boolean;
  snapshot_rows: number;
  extrato_rows: number;
}

function getQuinzenaDateRange(year: number, month: number, quinzena: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0');
  if (quinzena === 1) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const pmm = String(prevMonth).padStart(2, '0');
    return { start: `${prevYear}-${pmm}-26`, end: `${year}-${mm}-10` };
  }
  return { start: `${year}-${mm}-11`, end: `${year}-${mm}-25` };
}

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  try {
    // 1. Períodos com snapshot importado
    const snapshotRows = await sql`
      SELECT
        year,
        month,
        quinzena,
        COUNT(*) AS snapshot_rows
      FROM quinzena_controle_snapshot
      GROUP BY year, month, quinzena
      ORDER BY year DESC, month DESC, quinzena DESC
    `;

    // 2. Períodos inferidos do extrato (agrupando por quinzena conforme regra 26/10 e 11/25)
    //    Estratégia: pegar min/max date do extrato e gerar todos os períodos cobertos
    const extratoRange = await sql`
      SELECT
        MIN(data) AS min_date,
        MAX(data) AS max_date
      FROM extrato_movimentacao
      WHERE is_snapshot = FALSE
    `;

    const minDate = extratoRange[0]?.min_date as string | null;
    const maxDate = extratoRange[0]?.max_date as string | null;

    // Gerar todos os períodos quinzenais cobertos pelo extrato
    const extractoPeriods: { year: number; month: number; quinzena: number }[] = [];
    if (minDate && maxDate) {
      const start = new Date(minDate);
      const end   = new Date(maxDate);

      // Iterar meses de start até end
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

      while (cur <= endMonth) {
        const y = cur.getFullYear();
        const m = cur.getMonth() + 1;

        // 1ª QZ: 26(mês ant)–10(mês atual)
        const q1start = new Date(y, m - 2, 26);
        const q1end   = new Date(y, m - 1, 10);
        if (q1end >= start && q1start <= end) {
          extractoPeriods.push({ year: y, month: m, quinzena: 1 });
        }

        // 2ª QZ: 11–25(mês atual)
        const q2start = new Date(y, m - 1, 11);
        const q2end   = new Date(y, m - 1, 25);
        if (q2end >= start && q2start <= end) {
          extractoPeriods.push({ year: y, month: m, quinzena: 2 });
        }

        cur.setMonth(cur.getMonth() + 1);
      }
    }

    // 3. Montar mapa de snapshots
    const snapshotMap = new Map<string, number>();
    for (const r of snapshotRows) {
      const key = `${r.year}-${r.month}-${r.quinzena}`;
      snapshotMap.set(key, parseInt(String(r.snapshot_rows)));
    }

    // 4. Contar linhas do extrato por período (só para períodos do extrato não cobertos por snapshot)
    // Para performance, verificamos apenas se há pelo menos 1 transação no período
    const periods: PeriodRow[] = [];

    // Primeiro adicionar todos com snapshot
    for (const r of snapshotRows) {
      const key = `${r.year}-${r.month}-${r.quinzena}`;
      periods.push({
        year: Number(r.year),
        month: Number(r.month),
        quinzena: Number(r.quinzena),
        has_snapshot: true,
        snapshot_rows: parseInt(String(r.snapshot_rows)),
        extrato_rows: 0,
      });
      snapshotMap.set(key, parseInt(String(r.snapshot_rows)));
    }

    // Depois adicionar períodos do extrato sem snapshot
    const periodSet = new Set(periods.map(p => `${p.year}-${p.month}-${p.quinzena}`));
    for (const ep of extractoPeriods) {
      const key = `${ep.year}-${ep.month}-${ep.quinzena}`;
      if (!periodSet.has(key)) {
        const { start, end } = getQuinzenaDateRange(ep.year, ep.month, ep.quinzena);
        const countRes = await sql`
          SELECT COUNT(*) AS cnt
          FROM extrato_movimentacao
          WHERE is_snapshot = FALSE
            AND data BETWEEN ${start} AND ${end}
        `;
        const cnt = parseInt(String(countRes[0]?.cnt ?? '0'));
        if (cnt > 0) {
          periods.push({
            year: ep.year,
            month: ep.month,
            quinzena: ep.quinzena,
            has_snapshot: false,
            snapshot_rows: 0,
            extrato_rows: cnt,
          });
          periodSet.add(key);
        }
      }
    }

    // Ordenar: mais recente primeiro
    periods.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (b.month !== a.month) return b.month - a.month;
      return b.quinzena - a.quinzena;
    });

    return NextResponse.json({ periods });
  } catch (error) {
    console.error('[quinzena/available-periods]:', error);
    return NextResponse.json(
      { error: 'Erro ao consultar periodos disponiveis', detail: String(error) },
      { status: 500 },
    );
  }
}
