import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { isFaturaOrCartao } from '@/lib/rules/report-filters';
import { getScopeForRequest, normalizeCpf } from '@/lib/auth/scope';
import { normalizeName, resolveCpfByName } from '@/lib/quinzena/name-resolve';

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
 * Regra quinzenal (validada em jul/2026):
 *   1ª QZ: período 26 do mês anterior → 10 do mês atual  (fechamento dia 11)
 *   2ª QZ: período 11 → 25 do mês atual                  (fechamento dia 25)
 *
 * Cutoff financeiro (carga/transf/tarifa/prestação): dia 30 do mês anterior
 * Saldo cartão CONTROLE: último snapshot até dia 1 do mês atual
 * Saldo cartão CARGA: último snapshot até a data de fechamento (11 ou 25)
 */
function getQuinzenaDates(year: number, month: number, quinzena: number) {
  const mm = String(month).padStart(2, '0');
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const pmm = String(prevMonth).padStart(2, '0');

  // Financial data cutoff: last day of previous month (same for both quinzenas)
  const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const financial_cutoff = `${prevYear}-${pmm}-${String(prevMonthLastDay).padStart(2, '0')}`;

  // Saldo cartão CONTROLE: last snapshot up to day 1 of current month
  const saldo_cartao_controle_date = `${year}-${mm}-01`;

  if (quinzena === 1) {
    return {
      start_date:    `${prevYear}-${pmm}-26`,
      end_date:      `${year}-${mm}-10`,
      fechamento:    `${year}-${mm}-11`,
      financial_cutoff,
      saldo_cartao_controle_date,
      saldo_cartao_carga_date: `${year}-${mm}-11`,
    };
  }
  return {
    start_date:  `${year}-${mm}-11`,
    end_date:    `${year}-${mm}-25`,
    fechamento:  `${year}-${mm}-25`,
    financial_cutoff,
    saldo_cartao_controle_date,
    saldo_cartao_carga_date: `${year}-${mm}-25`,
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

// Resolucao nome->CPF centralizada em @/lib/quinzena/name-resolve (aliases
// manuais + fallback de prefixo nao-ambiguo). Nao manter copia local aqui.

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
  const forceCalc = searchParams.get('forceCalc') === 'true';

  if (
    isNaN(year) || isNaN(month) || isNaN(quinzena) ||
    month < 1 || month > 12 || ![1, 2].includes(quinzena)
  ) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  const { start_date, end_date, fechamento, financial_cutoff, saldo_cartao_controle_date, saldo_cartao_carga_date } = getQuinzenaDates(year, month, quinzena);

  const scope = await getScopeForRequest(request);
  const inScope = (cpf: string | null | undefined) =>
    !scope || (!!cpf && scope.cpfs.has(normalizeCpf(cpf) ?? '__none__'));

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

    // 1. Check if this period is frozen (skip if forceCalc=true)
    const frozenRows = forceCalc ? [] : await sql`
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

      // Situacao é dado cadastral — sobrepõe o valor atual do cadastro (que já
      // incorpora o RH) sobre o congelado. Desligamentos/afastamentos posteriores
      // ao freeze aparecem de imediato; valores financeiros ficam congelados.
      const sitRows = await sql`SELECT cpf, situacao FROM quinzena_cadastro WHERE cpf IS NOT NULL`;
      const sitByCpf = new Map<string, string>();
      for (const r of sitRows as any[]) if (r.situacao) sitByCpf.set(r.cpf, r.situacao);

      // Return frozen data directly
      let rows: QuinzenaRow[] = frozenSnapshots.map((snap) => {
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
          situacao: sitByCpf.get(snap.cpf) ?? snap.situacao ?? '',
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

      if (scope) rows = rows.filter(r => inScope(r.cpf));

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
    // When duplicate names exist, prefer the CPF with non-null situacao (real user over ghost entry)
    const nomeToCpf = new Map<string, string>();
    const nomeHasSituacao = new Set<string>();
    for (const c of cadastroBase) {
      const normalized = normalizeName(c.colaborador);
      if (!normalized) continue;
      const hasSituacao = c.situacao !== null && c.situacao !== undefined && c.situacao !== '';
      if (!nomeToCpf.has(normalized)) {
        nomeToCpf.set(normalized, c.cpf);
        if (hasSituacao) nomeHasSituacao.add(normalized);
      } else {
        // Duplicate name — prefer the one with situacao
        if (hasSituacao && !nomeHasSituacao.has(normalized)) {
          nomeToCpf.set(normalized, c.cpf);
          nomeHasSituacao.add(normalized);
        }
      }
    }
    const fuzzyCache = new Map<string, string>();

    // 2d. Extrato cumulativo até financial_cutoff (dia 30 do mês anterior)
    // Dedup: use codigo_transacao when present, else use hora as tiebreaker
    // (same-day fees have different hora, true duplicates have same hora)
    const extratoRows = await sql`
      WITH deduped AS (
        SELECT DISTINCT ON (
          UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
        )
          UPPER(usuario) AS usuario_up,
          data, tipo, valor, codigo_transacao, descricao
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND data <= ${financial_cutoff}
        ORDER BY UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
      )
      SELECT
        usuario_up,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0
          AND NOT (descricao ~* 'estorno.*taxa|taxa.*estorno|^CHARGEBACK_')), 0) AS carga_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) AS transf_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo IN ('Taxa', 'Estorno de taxa')
          OR (tipo = 'Transferência' AND descricao ~* 'estorno.*taxa|taxa.*estorno|^CHARGEBACK_')), 0) AS tarifa_raw
      FROM deduped
      GROUP BY usuario_up
    `;

    // 2e. Somase (prestação de contas) — Aprovado+Enviado reports, cumulative since card creation
    // Filter FATURA/CARTAO in JS using comprehensive filter (catches all variations)
    const reportRows = await sql`
      SELECT r.id, r.name
      FROM prestacao_reports r
      WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
        AND r.user_cpf IS NOT NULL
    `;
    const validReportIds = reportRows
      .filter((r: { id: number; name: string }) => !isFaturaOrCartao(r.name || ''))
      .map((r: { id: number }) => r.id);

    let somaseRows: { user_cpf: string; total: string }[] = [];
    if (validReportIds.length > 0) {
      somaseRows = await sql`
        SELECT
          r.user_cpf,
          COALESCE(SUM(e.value), 0)::text AS total
        FROM prestacao_reports r
        JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE r.id = ANY(${validReportIds})
          AND COALESCE(e.raw_data->>'payment_method_id', '') != '627401'
        GROUP BY r.user_cpf
      `;
    }
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

    const unresolvedExtrato = new Map<string, number>();
    for (const r of extratoRows) {
      const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
      if (cpf) {
        const carga = Number(r.carga_raw || 0);
        const transf = Math.abs(Number(r.transf_raw || 0));
        const tarifa = Math.abs(Number(r.tarifa_raw || 0));
        // Accumulate: multiple extrato names may resolve to same CPF
        cargaByCpf.set(cpf, (cargaByCpf.get(cpf) ?? 0) + carga);
        transfByCpf.set(cpf, (transfByCpf.get(cpf) ?? 0) + transf);
        tarifaByCpf.set(cpf, (tarifaByCpf.get(cpf) ?? 0) + tarifa);
      } else {
        const net = Number(r.carga_raw || 0) - Math.abs(Number(r.transf_raw || 0)) - Math.abs(Number(r.tarifa_raw || 0));
        if (net !== 0) unresolvedExtrato.set(String(r.usuario_up), (unresolvedExtrato.get(String(r.usuario_up)) ?? 0) + net);
      }
    }
    if (unresolvedExtrato.size > 0) {
      console.warn('[quinzena-complete] Extrato sem cadastro (valores fora do cálculo):',
        [...unresolvedExtrato.entries()].map(([n, v]) => `${n} (R$ ${v.toFixed(2)})`).join(', '));
    }
    // Calculate saldo_prestacao after accumulating all extrato for each CPF
    for (const cpf of cargaByCpf.keys()) {
      const somase = somaseByCpf.get(cpf) ?? 0;
      const sp = r2(cargaByCpf.get(cpf)! - transfByCpf.get(cpf)! - tarifaByCpf.get(cpf)! - somase);
      saldoPrestacaoByCpf.set(cpf, sp);
    }

    // 2g. Saldo cartão — two views:
    //   CONTROLE: last snapshot up to day 1 of current month (used in saldo_final calculation)
    //   CARGA: last snapshot up to closing date (11 or 25) — the "real-time" balance
    //   Saldo cartão = valor do último snapshot (NULL = 0, ex: cartão cancelado/inativo)
    const saldoControleRows = await sql`
      SELECT DISTINCT ON (UPPER(TRIM(usuario)))
        UPPER(TRIM(usuario)) AS usuario_up,
        COALESCE(valor, 0) AS saldo
      FROM extrato_movimentacao
      WHERE is_snapshot = TRUE
        AND data <= ${saldo_cartao_controle_date}
      ORDER BY UPPER(TRIM(usuario)), data DESC
    `;

    const saldoCargaRows = await sql`
      SELECT DISTINCT ON (UPPER(TRIM(usuario)))
        UPPER(TRIM(usuario)) AS usuario_up,
        COALESCE(valor, 0) AS saldo
      FROM extrato_movimentacao
      WHERE is_snapshot = TRUE
        AND data <= ${saldo_cartao_carga_date}
      ORDER BY UPPER(TRIM(usuario)), data DESC
    `;

    const saldoCartaoControleByCpf = new Map<string, number>();
    for (const r of saldoControleRows) {
      const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
      if (cpf) {
        const saldo = toNum(r.saldo as string);
        saldoCartaoControleByCpf.set(cpf, r2((saldoCartaoControleByCpf.get(cpf) ?? 0) + saldo));
      }
    }

    const saldoCartaoCargaByCpf = new Map<string, number>();
    for (const r of saldoCargaRows) {
      const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
      if (cpf) {
        const saldo = toNum(r.saldo as string);
        saldoCartaoCargaByCpf.set(cpf, r2((saldoCartaoCargaByCpf.get(cpf) ?? 0) + saldo));
      }
    }

    // 3. Build rows from cadastro + calculated data
    let rows: QuinzenaRow[] = cadastroBase.map((snap) => {
      const manual = manualByCpf.get(snap.cpf) ?? null;

      const sp = saldoPrestacaoByCpf.get(snap.cpf) ?? 0;
      const sc_controle = saldoCartaoControleByCpf.get(snap.cpf) ?? 0;
      const sc_carga = saldoCartaoCargaByCpf.get(snap.cpf) ?? 0;
      const carga = cargaByCpf.get(snap.cpf) ?? 0;
      const transf = transfByCpf.get(snap.cpf) ?? 0;
      const tarifa = tarifaByCpf.get(snap.cpf) ?? 0;
      const prestacao = somaseByCpf.get(snap.cpf) ?? 0;

      // Saldo final uses CONTROLE saldo cartão (snapshot up to day 1)
      const sf_novo = r2(sp - sc_controle);

      const saldo_final = sf_novo;
      const saldo_cartao = sc_controle;
      const saldo_prestacao = sp;
      const saldo_final_carga = Math.max(sf_novo, 0);
      // Carga calculations use CARGA saldo cartão (snapshot up to closing date)
      const saldo_cartao_carga = sc_carga;
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
        saldo_prestacao:   sp,
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

    if (scope) rows = rows.filter(r => inScope(r.cpf));

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

    // Data freshness check: how many reports might be stale (non-final status)
    // and when was the last sync
    const staleReports = await sql`
      SELECT COUNT(*) as cnt
      FROM prestacao_reports r
      WHERE r.user_cpf IS NOT NULL
        AND r.name NOT ILIKE '%FATURA%'
        AND r.name NOT ILIKE '%CARTAO%'
        AND r.status NOT ILIKE 'Aprovado'
        AND r.status NOT ILIKE 'Enviado'
        AND r.status NOT ILIKE 'Deletado'
    `;
    const staleCount = parseInt(staleReports[0]?.cnt || '0', 10);

    const lastSyncRow = await sql`
      SELECT MAX(updated_at) as last_sync
      FROM prestacao_reports
    `;
    const lastSync = lastSyncRow[0]?.last_sync;

    // Add freshness info to response
    const responseWithFreshness = {
      ...response,
      // Nomes do extrato que não resolveram para um CPF do cadastro — valores
      // ficam FORA do cálculo (surfaced aqui pro pre-freeze checklist)
      unresolved_extrato: [...unresolvedExtrato.entries()]
        .map(([nome, net]) => ({ nome, net: r2(net) }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
      data_freshness: {
        last_sync_at: lastSync,
        reports_with_non_final_status: staleCount,
        warning: staleCount > 0
          ? `${staleCount} relatórios com status não-final (ABERTO/REABERTO/REPROVADO). Execute o sync antes de gerar a planilha.`
          : null,
      },
    };

    return NextResponse.json(responseWithFreshness, {
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

  const postScope = await getScopeForRequest(request);
  if (postScope && !postScope.cpfs.has(normalizeCpf(cpf) ?? '__none__')) {
    return NextResponse.json(
      { error: 'Colaborador fora do seu escopo de gestão' },
      { status: 403 },
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
