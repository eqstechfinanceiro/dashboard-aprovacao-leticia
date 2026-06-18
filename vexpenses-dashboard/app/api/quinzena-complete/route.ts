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
  _data_source: 'snapshot' | 'calculado';
}

export interface QuinzenaResponse {
  data_mode: 'snapshot' | 'calculado';
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
    return {
      start_date:    `${prevYear}-${pmm}-26`,
      end_date:      `${year}-${mm}-10`,
      fechamento:    `${year}-${mm}-10`,
    };
  }
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
 *   CARGA_PARCIAL = col_qz_efetivo - saldo_final - saldo_cartao - adiantamento
 *     (se negativo → 0, exceto cadastro pendente que força 0)
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
): { carga_parcial: number; reembolso: number; carga_final: number } {
  const isPendente = status_cartao.toLowerCase().includes('pendente');

  if (isPendente) {
    return { carga_parcial: 0, reembolso: 0, carga_final: 0 };
  }

  const carga_parcial = r2(col_qz_efetivo - saldo_final - saldo_cartao - adiantamento);
  const reembolso     = quinzena === 1 ? r2(Math.max(0, saldo_reembolsar) * 0.5) : 0;
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
    // 1. Snapshot do Neon — inclui dados do Controle e da Carga (histórico importado)
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

    // 3. Se não há snapshot importado, calcular via extrato + cadastro do período mais recente
    //    Busca dados cadastrais do último snapshot disponível + extrato do período
    let extratoByCpf: Map<string, { carga: number; transferencia: number; tarifa: number }> = new Map();
    let saldoCartaoByCpf: Map<string, number> = new Map();
    let cadastroBase: ControleSnapshot[] = [];
    let somaseByCpf: Map<string, number> = new Map();
    let somasePrevByCpf: Map<string, number> = new Map();

    if (!hasNeonData) {
      // Cadastro base: usar snapshot mais recente disponível (para dados cadastrais)
      const cadastroRows = await sql`
        SELECT DISTINCT ON (cpf)
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
        ORDER BY cpf, year DESC, month DESC, quinzena DESC
      `;
      cadastroBase = cadastroRows as unknown as ControleSnapshot[];

      // Mapa nome_normalizado → cpf usando cadastro (accent-insensitive)
      const nomeToCpf = new Map<string, string>();
      for (const c of cadastroBase) {
        const normalized = normalizeName(c.colaborador);
        if (normalized) nomeToCpf.set(normalized, c.cpf);
      }
      const fuzzyCache = new Map<string, string>();

      // Cutoff: a planilha é finalizada quando a próxima quinzena fecha
      // 1QZ month M (closing 10/M) → cutoff = 25/M (2QZ same month closing)
      // 2QZ month M (closing 25/M) → cutoff = 10/(M+1) (1QZ next month closing)
      let cutoffDate: string;
      let prevClosingDate: string;
      if (quinzena === 1) {
        cutoffDate = `${year}-${String(month).padStart(2, '0')}-25`;
        prevClosingDate = `${year}-${String(month).padStart(2, '0')}-10`;
      } else {
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        cutoffDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-10`;
        prevClosingDate = `${year}-${String(month).padStart(2, '0')}-25`;
      }

      // Extrato cumulativo: delta = cum(<=cutoff) - cum(<=prevClosing)
      // Captura transações late-arriving dentro e após o período oficial
      const extratoCutoffRows = await sql`
        SELECT
          UPPER(usuario) AS usuario_up,
          COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0), 0) AS carga_raw,
          COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) AS transf_raw,
          COALESCE(SUM(valor) FILTER(WHERE tipo = 'Taxa'), 0) AS tarifa_raw
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND data <= ${cutoffDate}
        GROUP BY UPPER(usuario)
      `;
      const extratoPrevRows = await sql`
        SELECT
          UPPER(usuario) AS usuario_up,
          COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0), 0) AS carga_raw,
          COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) AS transf_raw,
          COALESCE(SUM(valor) FILTER(WHERE tipo = 'Taxa'), 0) AS tarifa_raw
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND data <= ${prevClosingDate}
        GROUP BY UPPER(usuario)
      `;

      const cumCutoff = new Map<string, { carga: number; transf: number; tarifa: number }>();
      for (const r of extratoCutoffRows) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        if (cpf) {
          cumCutoff.set(cpf, {
            carga: Number(r.carga_raw || 0),
            transf: Number(r.transf_raw || 0),
            tarifa: Number(r.tarifa_raw || 0),
          });
        }
      }
      const cumPrev = new Map<string, { carga: number; transf: number; tarifa: number }>();
      for (const r of extratoPrevRows) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        if (cpf) {
          cumPrev.set(cpf, {
            carga: Number(r.carga_raw || 0),
            transf: Number(r.transf_raw || 0),
            tarifa: Number(r.tarifa_raw || 0),
          });
        }
      }

      // delta_carga = (carga_cutoff - carga_prev) - (|transf_cutoff| - |transf_prev|) - (|tarifa_cutoff| - |tarifa_prev|)
      for (const [cpf, cc] of cumCutoff) {
        const cp = cumPrev.get(cpf) ?? { carga: 0, transf: 0, tarifa: 0 };
        const deltaCarga = (cc.carga - cp.carga) - (Math.abs(cc.transf) - Math.abs(cp.transf)) - (Math.abs(cc.tarifa) - Math.abs(cp.tarifa));
        extratoByCpf.set(cpf, {
          carga: deltaCarga,
          transferencia: 0,
          tarifa: 0,
        });
      }

      // Saldo do cartão: snapshot mais recente <= cutoff (planilha é finalizada no cutoff)
      const saldoRows = await sql`
        SELECT DISTINCT ON (UPPER(usuario))
          UPPER(usuario) AS usuario_up,
          valor::text AS saldo
        FROM extrato_movimentacao
        WHERE is_snapshot = TRUE
          AND data <= ${cutoffDate}
        ORDER BY UPPER(usuario), data DESC
      `;
      for (const r of saldoRows) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        if (cpf) saldoCartaoByCpf.set(cpf, toNum(r.saldo as string));
      }

      // Somase (prestacao acumulada) para delta_prestacao
      // 1QZ month M → 'YYYY-MM-1'; 2QZ month M → 'YYYY-(M+1)-2'
      let currSomaseId: string;
      let prevSomaseId: string;
      if (quinzena === 2) {
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        currSomaseId = `${nextYear}-${String(nextMonth).padStart(2, '0')}-2`;
        prevSomaseId = `${year}-${String(month).padStart(2, '0')}-1`;
      } else {
        currSomaseId = `${year}-${String(month).padStart(2, '0')}-1`;
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        prevSomaseId = `${prevYear}-${String(prevMonth).padStart(2, '0')}-2`;
      }
      const somaseRows = await sql`
        SELECT user_cpf, total::text
        FROM somase_snapshots
        WHERE quinzena = ${currSomaseId}
           OR quinzena = ${`${year}-${String(month).padStart(2, '0')}-${quinzena}`}
      `;
      for (const r of somaseRows) {
        if (r.user_cpf) somaseByCpf.set(r.user_cpf, toNum(r.total as string));
      }
      const somasePrevRows = await sql`
        SELECT user_cpf, total::text
        FROM somase_snapshots
        WHERE quinzena = ${prevSomaseId}
      `;
      for (const r of somasePrevRows) {
        if (r.user_cpf) somasePrevByCpf.set(r.user_cpf, toNum(r.total as string));
      }
    }

    // 4. Montar linhas — snapshot histórico OU cálculo automático
    const sourceSnaps = hasNeonData ? snapshots : cadastroBase;

    const rows: QuinzenaRow[] = sourceSnaps.map((snap) => {
      const manual = manualByCpf.get(snap.cpf) ?? null;

      let saldo_final: number;
      let saldo_cartao: number;
      let saldo_prestacao: number;
      let col_qz: number | null;
      let saldo_reembolsar: number;
      let saldo_final_carga: number;
      let saldo_cartao_carga: number;
      let dataSource: 'snapshot' | 'calculado';

      if (hasNeonData) {
        // Dados do snapshot histórico importado
        // PAINEL saldo_final can be negative; CARGA splits into saldo_final=max(0,sf) and saldo_reembolsar=max(-sf,0)
        dataSource = 'snapshot';
        const sf_painel = toNum(snap.saldo_final);  // PAINEL value (can be negative)
        saldo_final_carga = snap.saldo_final_carga !== null ? toNum(snap.saldo_final_carga) : Math.max(sf_painel, 0);
        saldo_cartao_carga = snap.saldo_cartao_carga !== null ? toNum(snap.saldo_cartao_carga) : toNum(snap.saldo_cartao);
        saldo_reembolsar  = snap.saldo_reembolsar !== null ? toNum(snap.saldo_reembolsar) : Math.max(-sf_painel, 0);
        saldo_final       = sf_painel;  // Use PAINEL value (allows negative, matches planilha)
        saldo_cartao      = saldo_cartao_carga;
        saldo_prestacao   = toNum(snap.saldo_prestacao);
        col_qz            = snap.col_qz !== null ? toNum(snap.col_qz) : null;
      } else {
        // Cálculo automático via extrato + snapshot anterior como âncora
        dataSource = 'calculado';
        const ext = extratoByCpf.get(snap.cpf) ?? { carga: 0, transferencia: 0, tarifa: 0 };
        const sc  = saldoCartaoByCpf.get(snap.cpf) ?? toNum(snap.saldo_cartao);

        // Âncora: saldo_prestacao do último snapshot disponível
        const sp_ancora = toNum(snap.saldo_prestacao);
        // Δ do período atual
        const delta_carga = ext.carga + ext.transferencia - ext.tarifa;
        // Δ prestação: diferença entre somase atual e anterior
        // Missing somase = 0 (no approved expenses recorded for that quinzena)
        const somase_atual = somaseByCpf.get(snap.cpf) ?? 0;
        const somase_prev = somasePrevByCpf.get(snap.cpf) ?? 0;
        const delta_prestacao = r2(somase_atual - somase_prev);
        // sp_novo = ancora + delta_carga - delta_prestacao
        const sp_novo = r2(sp_ancora + delta_carga - delta_prestacao);
        const sf_novo = r2(sp_novo - sc);              // saldo final = saldo_prest - saldo_cartao

        saldo_prestacao   = sp_novo;
        saldo_cartao      = sc;
        saldo_cartao_carga = sc;
        saldo_final       = sf_novo;  // Allow negative (match planilha PAINEL)
        saldo_final_carga = Math.max(sf_novo, 0);  // CARGA column = max(0, sf)
        saldo_reembolsar  = Math.max(-sf_novo, 0);  // CARGA column = max(-sf, 0)
        col_qz            = null; // sem planilha, col_qz vem apenas de manuais
      }

      // Manuais
      const col_qz_manual =
        manual?.col_1qz !== null && manual?.col_1qz !== undefined
          ? toNum(manual.col_1qz)
          : null;

      const adiantamento =
        manual?.adiantamento !== null && manual?.adiantamento !== undefined
          ? toNum(manual.adiantamento)
          : 0;

      const col_qz_efetivo = col_qz_manual !== null ? col_qz_manual : (col_qz ?? 0);

      const { carga_parcial, reembolso, carga_final } = calcFinancials(
        col_qz_efetivo,
        saldo_final,
        saldo_cartao,
        saldo_reembolsar,
        adiantamento,
        quinzena,
        snap.status_cartao ?? '',
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
        _data_source: dataSource,
      };
    });

    // 4. Estatisticas
    const ativos            = rows.filter(r => r.situacao?.toUpperCase() === 'ATIVO').length;
    const com_carga         = rows.filter(r => r.carga_final > 0).length;
    const total_carga_final = rows.reduce((s, r) => s + r.carga_final, 0);
    const total_saldo_final = rows.reduce((s, r) => s + r.saldo_final, 0);
    const total_col_qz      = rows.reduce((s, r) => s + (r.col_qz_manual ?? r.col_qz ?? 0), 0);

    const data_mode = hasNeonData ? 'snapshot' : 'calculado';

    const response: QuinzenaResponse = {
      data_mode,
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
