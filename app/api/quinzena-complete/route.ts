import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

// ---- Types ------------------------------------------------------------------

interface CadastroRow {
  cpf: string;
  colaborador: string | null;
  situacao: string | null;
  status_cartao: string | null;
  regional: string | null;
  centro_custo: string | null;
  gestor: string | null;
  diretor: string | null;
}

interface ManualInput {
  col_1qz: string | null;
  adiantamento: string | null;
  obs: string | null;
  cpf: string | null;
}

interface FrozenSnapshot {
  cpf: string;
  colaborador: string | null;
  situacao: string | null;
  status_cartao: string | null;
  regional: string | null;
  centro_custo: string | null;
  gestor: string | null;
  diretor: string | null;
  carga: string | null;
  transferencia: string | null;
  tarifa: string | null;
  prestacao: string | null;
  saldo_prestacao: string | null;
  saldo_cartao: string | null;
  saldo_final: string | null;
  saldo_reembolsar: string | null;
  col_qz: string | null;
  adiantamento: string | null;
  obs: string | null;
  carga_parcial: string | null;
  reembolso: string | null;
  carga_final: string | null;
  reembolso_multiplier: string | null;
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
  // Calculated from API
  carga: number;
  transferencia: number;
  tarifa: number;
  prestacao: number;
  saldo_prestacao: number;
  saldo_cartao: number;
  saldo_final: number;
  saldo_reembolsar: number;
  // Manual / formula
  col_qz: number | null;
  saldo_final_carga: number;
  saldo_cartao_carga: number;
  col_qz_manual: number | null;
  adiantamento: number;
  obs: string | null;
  carga_parcial: number;
  reembolso: number;
  carga_final: number;
  data_sources: {
    col_qz: 'manual' | 'null';
    adiantamento: 'manual' | 'default';
  };
  _data_source: 'frozen' | 'calculado';
  _is_frozen: boolean;
}

export interface QuinzenaResponse {
  data_mode: 'frozen' | 'calculado';
  reembolso_multiplier: number;
  is_frozen: boolean;
  frozen_at: string | null;
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
  };
  data: QuinzenaRow[];
}

// ---- Helpers ----------------------------------------------------------------

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Regra quinzenal validada (regra_quinzena.json):
 *   1ª QZ: 26 do mês anterior → 10 do mês atual  (fechamento dia 10)
 *   2ª QZ: 11 → 25 do mês atual                  (fechamento dia 25)
 */
function getQuinzenaDates(year: number, month: number, quinzena: number) {
  const mm = String(month).padStart(2, '0');
  if (quinzena === 1) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const pmm = String(prevMonth).padStart(2, '0');
    // SOMASE cutoff: next quinzena's end date (when sheet is finalized)
    const somase_cutoff = `${year}-${mm}-25`;
    return {
      start_date:    `${prevYear}-${pmm}-26`,
      end_date:      `${year}-${mm}-10`,
      fechamento:    `${year}-${mm}-10`,
      somase_cutoff,
    };
  }
  // QZ2: next quinzena is QZ1 of next month (ending on the 10th)
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  const nmm = String(nextMonth).padStart(2, '0');
  const somase_cutoff = `${nextYear}-${nmm}-10`;
  return {
    start_date:  `${year}-${mm}-11`,
    end_date:    `${year}-${mm}-25`,
    fechamento:  `${year}-${mm}-25`,
  };
}

function toNum(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Normalize name for matching: remove accents, uppercase, trim */
function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s.toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

/** Simple similarity ratio (based on Levenshtein-like character matching) */
function fuzzyMatchRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  // Use Set-based bigram similarity (fast, good enough for short names)
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(a), bb = bigrams(b);
  let intersection = 0;
  for (const bg of ba) if (bb.has(bg)) intersection++;
  return (2 * intersection) / (ba.size + bb.size);
}

/** Resolve extrato usuario name to CPF via exact normalized match, then fuzzy (>= 0.88) */
function resolveCpfByName(
  extratoName: string,
  nomeToCpf: Map<string, string>,
  fuzzyCache: Map<string, string>
): string | undefined {
  const normalized = normalizeName(extratoName);
  // Exact match
  const exact = nomeToCpf.get(normalized);
  if (exact) return exact;
  // Fuzzy cache (avoid re-computing for same name)
  const cached = fuzzyCache.get(normalized);
  if (cached) return cached;
  // Fuzzy match
  let bestCpf: string | undefined;
  let bestRatio = 0;
  for (const [cadName, cpf] of nomeToCpf) {
    const ratio = fuzzyMatchRatio(normalized, cadName);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestCpf = cpf;
    }
  }
  if (bestRatio >= 0.88 && bestCpf) {
    fuzzyCache.set(normalized, bestCpf);
    return bestCpf;
  }
  return undefined;
}

/**
 * Fórmulas confirmadas por inspeção direta nas planilhas de Carga (validado 100% em mai/2026):
 *
 *   col_qz_efetivo  = col_qz_manual ?? col_qz_planilha ?? 0
 *
 *   CARGA_PARCIAL = col_qz_efetivo - saldo_final_carga - saldo_cartao_carga - adiantamento
 *     (saldo_final_carga = max(0, saldo_final); se negativo → 0, exceto cadastro pendente que força 0)
 *
 *   REEMBOLSO = max(0, saldo_reembolsar) * 0.5   ← SOMENTE na 1ª QZ
 *               0                                 ← sempre na 2ª QZ
 *
 *   CARGA_FINAL = max(0, CARGA_PARCIAL) + REEMBOLSO
 *
 * Regras de negócio:
 *   - status_cartao contém "pendente" → carga_parcial=0, carga_final=0
 *   - Reembolso é mensal único: pago na 1ª QZ, 0 na 2ª QZ
 */
function calcFinancials(
  col_qz_efetivo: number,
  saldo_final: number,
  saldo_cartao: number,
  saldo_reembolsar: number,
  adiantamento: number,
  quinzena: number,
  status_cartao: string,
  reembolso_multiplier: number = 0.5,
): { carga_parcial: number; reembolso: number; carga_final: number } {
  const isPendente = status_cartao.toLowerCase().includes('pendente');

  if (isPendente) {
    return { carga_parcial: 0, reembolso: 0, carga_final: 0 };
  }

  const carga_parcial = r2(col_qz_efetivo - saldo_final - saldo_cartao - adiantamento);
  const reembolso     = quinzena === 1 ? r2(Math.max(0, saldo_reembolsar) * reembolso_multiplier) : 0;
  const carga_final   = r2(Math.max(0, carga_parcial) + reembolso);

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

  const { start_date, end_date, fechamento } = getQuinzenaDates(year, month, quinzena);

  try {
    // 0. Read reembolso multiplier from config table
    const configRows = await sql`
      SELECT reembolso_multiplier::text
      FROM quinzena_config
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
    `;
    const reembolsoMultiplier = configRows[0]
      ? parseFloat(configRows[0].reembolso_multiplier as string)
      : 0.5;

    // 1. Check if this period is frozen
    const frozenRows = await sql`
      SELECT
        cpf, colaborador, situacao, status_cartao,
        regional, centro_custo, gestor, diretor,
        carga::text, transferencia::text, tarifa::text, prestacao::text,
        saldo_prestacao::text, saldo_cartao::text, saldo_final::text,
        saldo_reembolsar::text, col_qz::text, adiantamento::text, obs,
        carga_parcial::text, reembolso::text, carga_final::text,
        reembolso_multiplier::text,
        frozen_at
      FROM quinzena_frozen_snapshots
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      ORDER BY colaborador ASC NULLS LAST
    `;

    const isFrozen = frozenRows.length > 0;
    let frozenAt: string | null = null;

    if (isFrozen) {
      // Get frozen_at timestamp from first row
      const frozenSnapshots = frozenRows as unknown as (FrozenSnapshot & { frozen_at: string })[];
      frozenAt = frozenSnapshots[0]?.frozen_at ?? null;

      // Return frozen data directly
      const rows: QuinzenaRow[] = frozenSnapshots.map((snap) => {
        const sf = toNum(snap.saldo_final);
        const sc = toNum(snap.saldo_cartao);
        const sp = toNum(snap.saldo_prestacao);
        const sr = toNum(snap.saldo_reembolsar);
        const col_qz = snap.col_qz !== null ? toNum(snap.col_qz) : null;
        const adiantamento = toNum(snap.adiantamento);
        const carga_parcial = toNum(snap.carga_parcial);
        const reembolso = toNum(snap.reembolso);
        const carga_final = toNum(snap.carga_final);

        return {
          cpf: snap.cpf,
          colaborador: snap.colaborador ?? '',
          situacao: snap.situacao ?? '',
          status_cartao: snap.status_cartao ?? '',
          regional: snap.regional ?? '',
          centro_custo: snap.centro_custo ?? '',
          gestor: snap.gestor ?? '',
          diretor: snap.diretor ?? '',
          carga: toNum(snap.carga),
          transferencia: toNum(snap.transferencia),
          tarifa: toNum(snap.tarifa),
          prestacao: toNum(snap.prestacao),
          saldo_prestacao: sp,
          saldo_cartao: sc,
          saldo_final: sf,
          saldo_reembolsar: sr,
          col_qz,
          saldo_final_carga: Math.max(sf, 0),
          saldo_cartao_carga: sc,
          col_qz_manual: col_qz,
          adiantamento,
          obs: snap.obs ?? null,
          carga_parcial,
          reembolso,
          carga_final,
          data_sources: {
            col_qz: col_qz !== null ? 'manual' as const : 'null' as const,
            adiantamento: adiantamento > 0 ? 'manual' as const : 'default' as const,
          },
          _data_source: 'frozen' as const,
          _is_frozen: true,
        };
      });

      const ativos = rows.filter(r => r.situacao?.toUpperCase() === 'ATIVO').length;
      const com_carga = rows.filter(r => r.carga_final > 0).length;
      const total_carga_final = rows.reduce((s, r) => s + r.carga_final, 0);
      const total_saldo_final = rows.reduce((s, r) => s + r.saldo_final, 0);
      const total_col_qz = rows.reduce((s, r) => s + (r.col_qz_manual ?? r.col_qz ?? 0), 0);

      const response: QuinzenaResponse = {
        data_mode: 'frozen',
        reembolso_multiplier: reembolsoMultiplier,
        is_frozen: true,
        frozen_at: frozenAt,
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
        },
        data: rows,
      };

      return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
    }

    // 2. Not frozen — calculate from API data
    // 2a. Load cadastro (metadata for all users)
    const cadastroRows = await sql`
      SELECT
        cpf, colaborador, situacao, status_cartao,
        regional, centro_custo, gestor, diretor
      FROM quinzena_cadastro
      ORDER BY colaborador ASC NULLS LAST
    `;
    const cadastroBase = cadastroRows as unknown as CadastroRow[];

    // 2b. Load manual inputs
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

    // 2c. Build name→cpf map for extrato matching
    const nomeToCpf = new Map<string, string>();
    for (const c of cadastroBase) {
      const normalized = normalizeName(c.colaborador);
      if (normalized) nomeToCpf.set(normalized, c.cpf);
    }
    const fuzzyCache = new Map<string, string>();

    // 2d. Extrato cumulativo até end_date
    const extratoRows = await sql`
      SELECT
        UPPER(usuario) AS usuario_up,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0), 0) AS carga_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) AS transf_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Taxa'), 0) AS tarifa_raw
      FROM extrato_movimentacao
      WHERE is_snapshot = FALSE
        AND data <= ${end_date}
      GROUP BY UPPER(usuario)
    `;

    // 2e. Somase (prestação de contas) from web export data
    const somaseRows = await sql`
      SELECT
        r.user_cpf,
        COALESCE(SUM(e.value), 0)::text AS total
      FROM prestacao_reports r
      JOIN prestacao_expenses e ON e.report_id = r.id
      WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
        AND r.user_cpf IS NOT NULL
        AND r.created_at <= ${end_date}
        AND r.name NOT ILIKE 'FATURA%'
        AND r.name NOT ILIKE 'Cartão%'
        AND r.name NOT ILIKE 'CARTAO%'
      GROUP BY r.user_cpf
    `;
    const somaseByCpf = new Map<string, number>();
    for (const r of somaseRows) {
      if (r.user_cpf) {
        somaseByCpf.set(r.user_cpf, toNum(r.total as string));
      }
    }

    // 2f. Calculate saldo prestação and saldo cartão for each CPF
    const saldoPrestacaoByCpf = new Map<string, number>();
    const cargaByCpf = new Map<string, number>();
    const transfByCpf = new Map<string, number>();
    const tarifaByCpf = new Map<string, number>();

    for (const r of extratoRows) {
      const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
      if (cpf) {
        const carga = Number(r.carga_raw || 0);
        const transf = Math.abs(Number(r.transf_raw || 0));
        const tarifa = Math.abs(Number(r.tarifa_raw || 0));
        const somase = somaseByCpf.get(cpf) ?? 0;
        const sp = r2(carga - transf - tarifa - somase);
        saldoPrestacaoByCpf.set(cpf, sp);
        cargaByCpf.set(cpf, carga);
        transfByCpf.set(cpf, transf);
        tarifaByCpf.set(cpf, tarifa);
      }
    }

    // 2g. Saldo cartão: hybrid approach (snapshot + adjustment, or computed)
    const saldoRows = quinzena === 1
      ? await sql`
          WITH latest_snap AS (
            SELECT DISTINCT ON (UPPER(usuario))
              UPPER(usuario) AS usuario_up,
              valor AS saldo,
              data AS snapshot_date
            FROM extrato_movimentacao
            WHERE is_snapshot = TRUE
              AND valor IS NOT NULL
              AND data <= ${end_date}
            ORDER BY UPPER(usuario), data DESC
          ),
          post_snap_txns AS (
            SELECT UPPER(e.usuario) AS usuario_up, SUM(e.valor) AS adjustment
            FROM extrato_movimentacao e
            JOIN latest_snap s ON UPPER(e.usuario) = s.usuario_up
            WHERE e.is_snapshot = FALSE
              AND e.data > s.snapshot_date
              AND e.data <= ${end_date}
            GROUP BY UPPER(e.usuario)
          ),
          computed_balance AS (
            SELECT UPPER(usuario) AS usuario_up, COALESCE(SUM(valor), 0) AS saldo
            FROM extrato_movimentacao
            WHERE is_snapshot = FALSE
              AND data <= ${end_date}
            GROUP BY UPPER(usuario)
          )
          SELECT COALESCE(s.usuario_up, c.usuario_up) AS usuario_up,
                 COALESCE(s.saldo, 0) + COALESCE(p.adjustment, 0) AS snap_saldo,
                 COALESCE(c.saldo, 0) AS computed_saldo,
                 (s.usuario_up IS NOT NULL) AS has_snapshot
          FROM latest_snap s
          FULL OUTER JOIN post_snap_txns p ON p.usuario_up = s.usuario_up
          FULL OUTER JOIN computed_balance c ON c.usuario_up = COALESCE(s.usuario_up, p.usuario_up)
        `
      : await sql`
          WITH latest_snap AS (
            SELECT DISTINCT ON (UPPER(usuario))
              UPPER(usuario) AS usuario_up,
              valor AS saldo,
              data AS snapshot_date
            FROM extrato_movimentacao
            WHERE is_snapshot = TRUE
              AND valor IS NOT NULL
              AND data < ${end_date}
            ORDER BY UPPER(usuario), data DESC
          ),
          post_snap_txns AS (
            SELECT UPPER(e.usuario) AS usuario_up, SUM(e.valor) AS adjustment
            FROM extrato_movimentacao e
            JOIN latest_snap s ON UPPER(e.usuario) = s.usuario_up
            WHERE e.is_snapshot = FALSE
              AND e.data > s.snapshot_date
              AND e.data < ${end_date}
            GROUP BY UPPER(e.usuario)
          ),
          computed_balance AS (
            SELECT UPPER(usuario) AS usuario_up, COALESCE(SUM(valor), 0) AS saldo
            FROM extrato_movimentacao
            WHERE is_snapshot = FALSE
              AND data < ${end_date}
            GROUP BY UPPER(usuario)
          )
          SELECT COALESCE(s.usuario_up, c.usuario_up) AS usuario_up,
                 COALESCE(s.saldo, 0) + COALESCE(p.adjustment, 0) AS snap_saldo,
                 COALESCE(c.saldo, 0) AS computed_saldo,
                 (s.usuario_up IS NOT NULL) AS has_snapshot
          FROM latest_snap s
          FULL OUTER JOIN post_snap_txns p ON p.usuario_up = s.usuario_up
          FULL OUTER JOIN computed_balance c ON c.usuario_up = COALESCE(s.usuario_up, p.usuario_up)
        `;

    const saldoCartaoByCpf = new Map<string, number>();
    for (const r of saldoRows) {
      const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
      if (cpf) {
        const hasSnap = r.has_snapshot;
        const snapSaldo = toNum(r.snap_saldo as string);
        const computedSaldo = toNum(r.computed_saldo as string);
        saldoCartaoByCpf.set(cpf, r2(hasSnap ? snapSaldo : computedSaldo));
      }
    }

    // 3. Build rows from cadastro + calculated data
    const rows: QuinzenaRow[] = cadastroBase.map((snap) => {
      const manual = manualByCpf.get(snap.cpf) ?? null;

      const sp = saldoPrestacaoByCpf.get(snap.cpf) ?? 0;
      const sc = saldoCartaoByCpf.get(snap.cpf) ?? 0;
      const carga = cargaByCpf.get(snap.cpf) ?? 0;
      const transf = transfByCpf.get(snap.cpf) ?? 0;
      const tarifa = tarifaByCpf.get(snap.cpf) ?? 0;
      const prestacao = somaseByCpf.get(snap.cpf) ?? 0;

      const sf_novo = r2(sp - sc);

      const saldo_final = sf_novo;
      const saldo_cartao = sc;
      const saldo_prestacao = sp;
      const saldo_final_carga = Math.max(sf_novo, 0);
      const saldo_cartao_carga = sc;
      const saldo_reembolsar = Math.max(-sf_novo, 0);

      // Manuais
      const col_qz_manual =
        manual?.col_1qz !== null && manual?.col_1qz !== undefined
          ? toNum(manual.col_1qz)
          : null;

      const adiantamento =
        manual?.adiantamento !== null && manual?.adiantamento !== undefined
          ? toNum(manual.adiantamento)
          : 0;

      const col_qz_efetivo = col_qz_manual !== null ? col_qz_manual : 0;

      const { carga_parcial, reembolso, carga_final } = calcFinancials(
        col_qz_efetivo,
        saldo_final_carga,
        saldo_cartao_carga,
        saldo_reembolsar,
        adiantamento,
        quinzena,
        snap.status_cartao ?? '',
        reembolsoMultiplier,
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
        carga,
        transferencia:     transf,
        tarifa,
        prestacao,
        saldo_prestacao,
        saldo_cartao,
        saldo_final,
        saldo_reembolsar,
        col_qz:            null,
        saldo_final_carga,
        saldo_cartao_carga,
        col_qz_manual,
        adiantamento,
        obs: manual?.obs ?? null,
        carga_parcial,
        reembolso,
        carga_final,
        data_sources: {
          col_qz: col_qz_manual !== null ? 'manual' as const : 'null' as const,
          adiantamento: adiantamento > 0 ? 'manual' as const : 'default' as const,
        },
        _data_source: 'calculado' as const,
        _is_frozen: false,
      };
    });

    // 4. Estatisticas
    const ativos            = rows.filter(r => r.situacao?.toUpperCase() === 'ATIVO').length;
    const com_carga         = rows.filter(r => r.carga_final > 0).length;
    const total_carga_final = rows.reduce((s, r) => s + r.carga_final, 0);
    const total_saldo_final = rows.reduce((s, r) => s + r.saldo_final, 0);
    const total_col_qz      = rows.reduce((s, r) => s + (r.col_qz_manual ?? r.col_qz ?? 0), 0);

    const response: QuinzenaResponse = {
      data_mode: 'calculado',
      reembolso_multiplier: reembolsoMultiplier,
      is_frozen: false,
      frozen_at: null,
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
