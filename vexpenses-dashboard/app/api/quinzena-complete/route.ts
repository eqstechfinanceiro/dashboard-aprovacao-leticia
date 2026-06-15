import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

// ---- Types ------------------------------------------------------------------

interface ControleSnapshot {
  cpf: string;
  colaborador: string | null;
  situacao: string | null;
  status_cartao: string | null;
  regional: string | null;
  centro_custo: string | null;
  gestor: string | null;
  diretor: string | null;
  // Do Controle (informativo / exibicao)
  saldo_prestacao: string | null;
  saldo_cartao: string | null;
  saldo_final: string | null;
  // Da planilha de Carga (usados nas formulas)
  col_qz: string | null;
  saldo_reembolsar: string | null;
  saldo_final_carga: string | null;   // "SALDO FINAL" col 8/9 da Carga
  saldo_cartao_carga: string | null;  // "SALDO CARTAO" col 10/11 da Carga
}

interface ManualInput {
  col_1qz: string | null;
  adiantamento: string | null;
  obs: string | null;
  cpf: string | null;
}

export interface QuinzenaRow {
  cpf: string;
  colaborador: string;
  situacao: string;
  status_cartao: string;
  regional: string;
  centro_custo: string;
  gestor: string;
  diretor: string;
  // Do Controle (exibicao)
  saldo_final: number;
  saldo_cartao: number;
  saldo_prestacao: number;
  // Da Carga (formulas)
  col_qz: number | null;
  saldo_reembolsar: number;
  saldo_final_carga: number;
  saldo_cartao_carga: number;
  // Manuais
  col_qz_manual: number | null;
  adiantamento: number;
  obs: string | null;
  // Calculados
  carga_parcial: number;
  reembolso: number;
  carga_final: number;
  data_sources: {
    col_qz: 'planilha' | 'manual' | 'null';
    saldo_final: 'neon';
    saldo_cartao: 'neon';
    adiantamento: 'manual' | 'default';
  };
}

export interface QuinzenaResponse {
  period: {
    year: number;
    month: number;
    quinzena: number;
    start_date: string;
    end_date: string;
    month_name: string;
  };
  statistics: {
    total_rows: number;
    ativos: number;
    com_carga: number;
    total_carga_final: number;
    total_saldo_final: number;
    total_col_qz: number;
    has_neon_data: boolean;
  };
  data: QuinzenaRow[];
}

// ---- Helpers ----------------------------------------------------------------

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function getQuinzenaDates(year: number, month: number, quinzena: number) {
  const mm = String(month).padStart(2, '0');
  if (quinzena === 1) {
    return { start_date: `${year}-${mm}-01`, end_date: `${year}-${mm}-15` };
  }
  const lastDay = new Date(year, month, 0).getDate();
  return { start_date: `${year}-${mm}-16`, end_date: `${year}-${mm}-${lastDay}` };
}

function toNum(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

/**
 * Formulas confirmadas por inspeção direta nas planilhas de Carga:
 *
 *   col_qz_efetivo  = col_qz_manual ?? col_qz_planilha ?? 0
 *
 *   CARGA_PARCIAL = max(0, col_qz_efetivo - saldo_final_carga - saldo_cartao_carga - adiantamento)
 *     Onde saldo_final_carga e saldo_cartao_carga vêm da planilha de CARGA (não do Controle).
 *     Eles representam o saldo já usado/prestado — quando positivo reduz a carga.
 *
 *   REEMBOLSO = max(0, saldo_reembolsar) * 0.5
 *     O multiplicador 0.5 está na célula N4 da planilha CARGA 1QZ.
 *     saldo_reembolsar negativo significa sem direito a reembolso.
 *
 *   CARGA_FINAL = CARGA_PARCIAL + REEMBOLSO
 */
function calcFinancials(
  col_qz_efetivo: number,
  saldo_final_carga: number,
  saldo_cartao_carga: number,
  saldo_reembolsar: number,
  adiantamento: number,
) {
  const carga_parcial = Math.max(
    0,
    col_qz_efetivo - saldo_final_carga - saldo_cartao_carga - adiantamento,
  );
  const reembolso  = Math.max(0, saldo_reembolsar) * 0.5;
  const carga_final = carga_parcial + reembolso;
  return { carga_parcial, reembolso, carga_final };
}

// ---- GET --------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year     = parseInt(searchParams.get('year')     ?? '2026');
  const month    = parseInt(searchParams.get('month')    ?? '5');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '1');

  if (
    isNaN(year) || isNaN(month) || isNaN(quinzena) ||
    month < 1 || month > 12 || ![1, 2].includes(quinzena)
  ) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  const { start_date, end_date } = getQuinzenaDates(year, month, quinzena);

  try {
    // 1. Snapshot do Neon — inclui dados do Controle e da Carga
    const snapshotRows = await sql`
      SELECT
        cpf, colaborador, situacao, status_cartao,
        regional, centro_custo, gestor, diretor,
        saldo_prestacao::text,
        saldo_cartao::text,
        saldo_final::text,
        col_qz::text,
        saldo_reembolsar::text,
        saldo_final_carga::text,
        saldo_cartao_carga::text
      FROM quinzena_controle_snapshot
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      ORDER BY colaborador ASC NULLS LAST
    `;
    const snapshots = snapshotRows as unknown as ControleSnapshot[];

    // 2. Entradas manuais para este periodo
    const manualRows = await sql`
      SELECT col_1qz::text, adiantamento::text, obs, cpf
      FROM quinzena_manual_inputs
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
    `;
    const manuals = manualRows as unknown as ManualInput[];

    const manualByCpf = new Map<string, ManualInput>();
    for (const m of manuals) {
      if (m.cpf) manualByCpf.set(m.cpf, m);
    }

    const hasNeonData = snapshots.length > 0;

    // 3. Montar linhas
    const rows: QuinzenaRow[] = snapshots.map((snap) => {
      const manual = manualByCpf.get(snap.cpf) ?? null;

      // Controle — exibicao
      const saldo_final      = toNum(snap.saldo_final);
      const saldo_cartao     = toNum(snap.saldo_cartao);
      const saldo_prestacao  = toNum(snap.saldo_prestacao);

      // Carga — formulas
      const col_qz            = snap.col_qz !== null ? toNum(snap.col_qz) : null;
      const saldo_reembolsar  = toNum(snap.saldo_reembolsar);
      const saldo_final_carga = toNum(snap.saldo_final_carga);
      const saldo_cartao_carga = toNum(snap.saldo_cartao_carga);

      // Override manual
      const col_qz_manual =
        manual?.col_1qz !== null && manual?.col_1qz !== undefined
          ? toNum(manual.col_1qz)
          : null;

      const adiantamento =
        manual?.adiantamento !== null && manual?.adiantamento !== undefined
          ? toNum(manual.adiantamento)
          : 0;

      // Valor efetivo: manual tem prioridade sobre planilha
      const col_qz_efetivo = col_qz_manual !== null ? col_qz_manual : (col_qz ?? 0);

      const { carga_parcial, reembolso, carga_final } = calcFinancials(
        col_qz_efetivo, saldo_final_carga, saldo_cartao_carga, saldo_reembolsar, adiantamento,
      );

      return {
        cpf: snap.cpf,
        colaborador:       snap.colaborador ?? '',
        situacao:          snap.situacao ?? '',
        status_cartao:     snap.status_cartao ?? '',
        regional:          snap.regional ?? '',
        centro_custo:      snap.centro_custo ?? '',
        gestor:            snap.gestor ?? '',
        diretor:           snap.diretor ?? '',
        saldo_final,
        saldo_cartao,
        saldo_prestacao,
        col_qz,
        saldo_reembolsar,
        saldo_final_carga,
        saldo_cartao_carga,
        col_qz_manual,
        adiantamento,
        obs: manual?.obs ?? null,
        carga_parcial,
        reembolso,
        carga_final,
        data_sources: {
          col_qz: col_qz_manual !== null
            ? 'manual' as const
            : col_qz !== null
              ? 'planilha' as const
              : 'null' as const,
          saldo_final:   'neon' as const,
          saldo_cartao:  'neon' as const,
          adiantamento:  adiantamento > 0 ? 'manual' as const : 'default' as const,
        },
      };
    });

    // 4. Estatisticas
    const ativos            = rows.filter(r => r.situacao?.toUpperCase() === 'ATIVO').length;
    const com_carga         = rows.filter(r => r.carga_final > 0).length;
    const total_carga_final = rows.reduce((s, r) => s + r.carga_final, 0);
    const total_saldo_final = rows.reduce((s, r) => s + r.saldo_final, 0);
    const total_col_qz      = rows.reduce((s, r) => s + (r.col_qz ?? 0), 0);

    const response: QuinzenaResponse = {
      period: {
        year, month, quinzena,
        start_date, end_date,
        month_name: MONTH_NAMES[month] ?? String(month),
      },
      statistics: {
        total_rows: rows.length,
        ativos,
        com_carga,
        total_carga_final,
        total_saldo_final,
        total_col_qz,
        has_neon_data: hasNeonData,
      },
      data: rows,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });

  } catch (error) {
    console.error('[quinzena-complete] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao consultar dados', detail: String(error) },
      { status: 500 },
    );
  }
}

// ---- POST: salvar campo manual ----------------------------------------------

const ALLOWED_FIELDS = ['col_1qz', 'adiantamento', 'obs'] as const;
type AllowedField = typeof ALLOWED_FIELDS[number];

export async function POST(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  let body: {
    cpf: string;
    year: number;
    month: number;
    quinzena: number;
    field: AllowedField;
    value: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 });
  }

  const { cpf, year, month, quinzena, field, value } = body;

  if (!cpf || !year || !month || !quinzena || !field) {
    return NextResponse.json(
      { error: 'Campos obrigatorios: cpf, year, month, quinzena, field' },
      { status: 400 },
    );
  }

  if (!ALLOWED_FIELDS.includes(field)) {
    return NextResponse.json(
      { error: `Campo invalido. Permitidos: ${ALLOWED_FIELDS.join(', ')}` },
      { status: 400 },
    );
  }

  if (field === 'col_1qz' || field === 'adiantamento') {
    const n = parseFloat(String(value));
    if (value !== null && isNaN(n)) {
      return NextResponse.json(
        { error: `${field} deve ser numerico ou null` },
        { status: 400 },
      );
    }
  }

  try {
    if (field === 'col_1qz') {
      const numVal = value === null ? null : parseFloat(String(value));
      await sql`
        INSERT INTO quinzena_manual_inputs (cpf, year, month, quinzena, col_1qz)
        VALUES (${cpf}, ${year}, ${month}, ${quinzena}, ${numVal})
        ON CONFLICT (cpf, year, month, quinzena) WHERE cpf IS NOT NULL
        DO UPDATE SET col_1qz = EXCLUDED.col_1qz, updated_at = NOW()
      `;
    } else if (field === 'adiantamento') {
      const numVal = value === null ? null : parseFloat(String(value));
      await sql`
        INSERT INTO quinzena_manual_inputs (cpf, year, month, quinzena, adiantamento)
        VALUES (${cpf}, ${year}, ${month}, ${quinzena}, ${numVal})
        ON CONFLICT (cpf, year, month, quinzena) WHERE cpf IS NOT NULL
        DO UPDATE SET adiantamento = EXCLUDED.adiantamento, updated_at = NOW()
      `;
    } else {
      const strVal = value === null ? null : String(value);
      await sql`
        INSERT INTO quinzena_manual_inputs (cpf, year, month, quinzena, obs)
        VALUES (${cpf}, ${year}, ${month}, ${quinzena}, ${strVal})
        ON CONFLICT (cpf, year, month, quinzena) WHERE cpf IS NOT NULL
        DO UPDATE SET obs = EXCLUDED.obs, updated_at = NOW()
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[quinzena-complete POST]:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar', detail: String(error) },
      { status: 500 },
    );
  }
}
