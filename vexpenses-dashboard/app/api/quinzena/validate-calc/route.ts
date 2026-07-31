import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function getQuinzenaDates(year: number, month: number, quinzena: number) {
  const mm = String(month).padStart(2, '0');
  if (quinzena === 1) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const pmm = String(prevMonth).padStart(2, '0');
    return {
      start_date: `${prevYear}-${pmm}-26`,
      end_date:   `${year}-${mm}-10`,
      fechamento: `${year}-${mm}-10`,
    };
  }
  return {
    start_date: `${year}-${mm}-11`,
    end_date:   `${year}-${mm}-25`,
    fechamento: `${year}-${mm}-25`,
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

/** Simple similarity ratio (based on bigram intersection) */
function fuzzyMatchRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
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

/** Resolve extrato usuario name to CPF via exact normalized match, then fuzzy (>= 0.88), then prefix */
function resolveCpfByName(
  extratoName: string,
  nomeToCpf: Map<string, string>,
  fuzzyCache: Map<string, string>
): string | undefined {
  const normalized = normalizeName(extratoName);
  const exact = nomeToCpf.get(normalized);
  if (exact) return exact;
  const cached = fuzzyCache.get(normalized);
  if (cached) return cached;
  // Fuzzy match FIRST (handles LUIZ vs LUIS, typos, etc.)
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
  // Prefix match: fallback for truncated names (15 chars, then 10)
  if (normalized.length >= 10) {
    const prefix15 = normalized.slice(0, 15);
    for (const [cadName, cpf] of nomeToCpf) {
      if (cadName.slice(0, 15) === prefix15) return cpf;
    }
    const prefix10 = normalized.slice(0, 10);
    for (const [cadName, cpf] of nomeToCpf) {
      if (cadName.slice(0, 10) === prefix10) return cpf;
    }
  }
  return undefined;
}

interface Diff {
  cpf: string;
  colaborador: string;
  campo: string;
  snapshot: number;
  calculado: number;
  delta: number;
}

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year     = parseInt(searchParams.get('year')     ?? '2026');
  const month    = parseInt(searchParams.get('month')    ?? '5');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '1');

  if (isNaN(year) || isNaN(month) || isNaN(quinzena) || month < 1 || month > 12 || ![1,2].includes(quinzena)) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  const { start_date, end_date, fechamento } = getQuinzenaDates(year, month, quinzena);

  try {
    // 1. Snapshot do periodo (ground truth)
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

    if (snapshotRows.length === 0) {
      return NextResponse.json({ error: 'Sem snapshot para este periodo. Nada para validar.' }, { status: 404 });
    }

    // 2. Entradas manuais
    const manualRows = await sql`
      SELECT col_1qz::text, adiantamento::text, obs, cpf
      FROM quinzena_manual_inputs
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
    `;
    const manualByCpf = new Map<string, { col_1qz: string | null; adiantamento: string | null }>();
    for (const m of manualRows) {
      if (m.cpf) manualByCpf.set(m.cpf, { col_1qz: m.col_1qz as string | null, adiantamento: m.adiantamento as string | null });
    }

    // 3. Cadastro base: ultimo snapshot ANTERIOR ao periodo (ancora correta)
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
      WHERE (year, month, quinzena) < (${year}, ${month}, ${quinzena})
      ORDER BY cpf, year DESC, month DESC, quinzena DESC
    `;

    // Mapa nome_normalizado -> cpf e ancora por cpf
    const nomeToCpf = new Map<string, string>();
    const ancoraByCpf = new Map<string, { saldo_prestacao: number; saldo_cartao: number }>();
    for (const c of cadastroRows) {
      const normalized = normalizeName(c.colaborador);
      if (normalized) nomeToCpf.set(normalized, c.cpf);
      if (c.cpf) {
        ancoraByCpf.set(c.cpf, {
          saldo_prestacao: toNum(c.saldo_prestacao),
          saldo_cartao: toNum(c.saldo_cartao),
        });
      }
    }
    const fuzzyCache = new Map<string, string>();

    // 3b. Somase (prestacao acumulada) para a quinzena atual e anterior
    // Naming convention in somase_snapshots:
    //   1QZ month M → 'YYYY-MM-1' (same month planilha)
    //   2QZ month M → 'YYYY-(M+1)-2' (next month planilha, e.g. 2QZ May = '2026-06-2')
    let currQuinzenaId: string;
    let prevQuinzenaId: string;
    if (quinzena === 2) {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      currQuinzenaId = `${nextYear}-${String(nextMonth).padStart(2, '0')}-2`;
      prevQuinzenaId = `${year}-${String(month).padStart(2, '0')}-1`;
    } else {
      currQuinzenaId = `${year}-${String(month).padStart(2, '0')}-1`;
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      prevQuinzenaId = `${prevYear}-${String(prevMonth).padStart(2, '0')}-2`;
    }
    // Try current naming, fallback to direct naming
    const somaseRows = await sql`
      SELECT user_cpf, total::text, quinzena
      FROM somase_snapshots
      WHERE quinzena = ${currQuinzenaId}
         OR quinzena = ${`${year}-${String(month).padStart(2, '0')}-${quinzena}`}
    `;
    const somaseByCpf = new Map<string, number>();
    for (const r of somaseRows) {
      if (r.user_cpf) somaseByCpf.set(r.user_cpf, toNum(r.total as string));
    }

    const somasePrevRows = await sql`
      SELECT user_cpf, total::text
      FROM somase_snapshots
      WHERE quinzena = ${prevQuinzenaId}
    `;
    const somasePrevByCpf = new Map<string, number>();
    for (const r of somasePrevRows) {
      if (r.user_cpf) somasePrevByCpf.set(r.user_cpf, toNum(r.total as string));
    }

    // 4. Extrato cumulativo: delta = cum(<=cutoff) - cum(<=prevClosing)
    // A planilha é finalizada quando a próxima quinzena fecha
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

    const extratoCutoffRows = await sql`
      WITH deduped AS (
        SELECT DISTINCT ON (
          UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
        )
          UPPER(usuario) AS usuario_up, data, tipo, valor, codigo_transacao
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND data <= ${cutoffDate}
        ORDER BY UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
      )
      SELECT
        usuario_up,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0), 0) AS carga_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) AS transf_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Taxa'), 0) AS tarifa_raw
      FROM deduped
      GROUP BY usuario_up
    `;
    const extratoPrevRows = await sql`
      WITH deduped AS (
        SELECT DISTINCT ON (
          UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
        )
          UPPER(usuario) AS usuario_up, data, tipo, valor, codigo_transacao
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND data <= ${prevClosingDate}
        ORDER BY UPPER(usuario), data, tipo, valor,
          COALESCE(NULLIF(codigo_transacao, ''), hora::text)
      )
      SELECT
        usuario_up,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0), 0) AS carga_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) AS transf_raw,
        COALESCE(SUM(valor) FILTER(WHERE tipo = 'Taxa'), 0) AS tarifa_raw
      FROM deduped
      GROUP BY usuario_up
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

    const extratoByCpf = new Map<string, { carga: number; transferencia: number; tarifa: number }>();
    for (const [cpf, cc] of cumCutoff) {
      const cp = cumPrev.get(cpf) ?? { carga: 0, transf: 0, tarifa: 0 };
      const deltaCarga = (cc.carga - cp.carga) - (Math.abs(cc.transf) - Math.abs(cp.transf)) - (Math.abs(cc.tarifa) - Math.abs(cp.tarifa));
      extratoByCpf.set(cpf, { carga: deltaCarga, transferencia: 0, tarifa: 0 });
    }

    // 5. Saldo cartao (ultimo snapshot <= cutoff)
    const saldoRows = await sql`
      SELECT DISTINCT ON (UPPER(usuario))
        UPPER(usuario) AS usuario_up,
        valor::text AS saldo
      FROM extrato_movimentacao
      WHERE is_snapshot = TRUE
        AND data <= ${cutoffDate}
      ORDER BY UPPER(usuario), data DESC
    `;
    const saldoCartaoByCpf = new Map<string, number>();
    for (const r of saldoRows) {
      const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
      if (cpf) saldoCartaoByCpf.set(cpf, toNum(r.saldo as string));
    }

    // 6. Comparar cada linha
    const diffs: Diff[] = [];
    const stats = {
      total: snapshotRows.length,
      sem_ancora: 0,
      com_somase: 0,
      com_somase_prev: 0,
      saldo_final_ok: 0,
      saldo_cartao_ok: 0,
      saldo_prestacao_ok: 0,
      saldo_reembolsar_ok: 0,
      carga_parcial_ok: 0,
      reembolso_ok: 0,
      carga_final_ok: 0,
      all_ok: 0,
    };

    for (const snap of snapshotRows) {
      const cpf = snap.cpf;
      const colaborador = snap.colaborador ?? '';
      const status_cartao = snap.status_cartao ?? '';
      const isPendente = status_cartao.toLowerCase().includes('pendente');

      // Snapshot values (ground truth) - use PAINEL saldo_final (can be negative)
      const sp_snap = toNum(snap.saldo_prestacao);
      const sc_snap = toNum(snap.saldo_cartao);
      const sf_snap = toNum(snap.saldo_final);  // PAINEL saldo_final (allows negative)
      // saldo_reembolsar: derive from PAINEL saldo_final (CARGA formula: max(-sf, 0))
      // DB saldo_reembolsar may be stale; PAINEL is source of truth
      const sr_snap = Math.max(-sf_snap, 0);
      const col_qz_snap = snap.col_qz !== null ? toNum(snap.col_qz) : 0;

      const manual = manualByCpf.get(cpf);
      const adiant_manual = manual?.adiantamento !== null && manual?.adiantamento !== undefined
        ? toNum(manual.adiantamento) : 0;
      const col_qz_manual = manual?.col_1qz !== null && manual?.col_1qz !== undefined
        ? toNum(manual.col_1qz) : null;
      const col_qz_efetivo = col_qz_manual !== null ? col_qz_manual : col_qz_snap;

      // Calculated values
      const ext = extratoByCpf.get(cpf) ?? { carga: 0, transferencia: 0, tarifa: 0 };
      const sc_calc = saldoCartaoByCpf.get(cpf) ?? toNum(snap.saldo_cartao);

      // Ancora: saldo_prestacao do cadastro base (snapshot anterior)
      const ancora = ancoraByCpf.get(cpf);
      if (!ancora) stats.sem_ancora++;
      const sp_ancora = ancora?.saldo_prestacao ?? toNum(snap.saldo_prestacao);
      const sc_ancora = ancora?.saldo_cartao ?? toNum(snap.saldo_cartao);
      const delta_carga = ext.carga + ext.transferencia - ext.tarifa;

      // Delta prestacao: diferenca entre somase atual e anterior
      // Missing somase = 0 (no approved expenses recorded for that quinzena)
      const somase_atual = somaseByCpf.get(cpf) ?? 0;
      const somase_prev = somasePrevByCpf.get(cpf) ?? 0;
      if (somaseByCpf.has(cpf)) stats.com_somase++;
      if (somasePrevByCpf.has(cpf)) stats.com_somase_prev++;
      const delta_prestacao = r2(somase_atual - somase_prev);

      // sp_calc = ancora + delta_carga - delta_prestacao
      const sp_calc = r2(sp_ancora + delta_carga - delta_prestacao);
      const sf_calc = r2(sp_calc - sc_calc);  // Allow negative (match planilha)
      const sr_calc = Math.max(-sf_calc, 0);

      // Carga fields - CARGA formula uses max(sf, 0) for SALDO FINAL
      const sf_carga_calc = Math.max(sf_calc, 0);
      let cp_calc: number, re_calc: number, cf_calc: number;
      if (isPendente) {
        cp_calc = 0; re_calc = 0; cf_calc = 0;
      } else {
        cp_calc = r2(col_qz_efetivo - sf_carga_calc - sc_calc - adiant_manual);
        re_calc = quinzena === 1 ? r2(Math.max(0, sr_calc) * 0.5) : 0;
        cf_calc = r2(Math.max(0, cp_calc) + re_calc);
      }

      // Compare fields
      const cmp = (label: string, snapV: number, calcV: number) => {
        if (Math.abs(snapV - calcV) > 0.015) {
          diffs.push({ cpf, colaborador, campo: label, snapshot: snapV, calculado: calcV, delta: r2(snapV - calcV) });
          return false;
        }
        return true;
      };

      const ok_sf = cmp('saldo_final', sf_snap, sf_calc);
      const ok_sc = cmp('saldo_cartao', sc_snap, sc_calc);
      const ok_sp = cmp('saldo_prestacao', sp_snap, sp_calc);
      const ok_sr = cmp('saldo_reembolsar', sr_snap, sr_calc);

      // Carga snapshot (ground truth) - CARGA formula uses max(sf, 0) and max(-sf, 0)
      const sf_carga_snap = Math.max(sf_snap, 0);
      const cp_snap = r2(col_qz_efetivo - sf_carga_snap - sc_snap - adiant_manual);
      const re_snap = quinzena === 1 ? r2(Math.max(0, sr_snap) * 0.5) : 0;
      const cf_snap = isPendente ? 0 : r2(Math.max(0, cp_snap) + re_snap);

      const ok_cp = cmp('carga_parcial', cp_snap, cp_calc);
      const ok_re = cmp('reembolso', re_snap, re_calc);
      const ok_cf = cmp('carga_final', cf_snap, cf_calc);

      if (ok_sf) stats.saldo_final_ok++;
      if (ok_sc) stats.saldo_cartao_ok++;
      if (ok_sp) stats.saldo_prestacao_ok++;
      if (ok_sr) stats.saldo_reembolsar_ok++;
      if (ok_cp) stats.carga_parcial_ok++;
      if (ok_re) stats.reembolso_ok++;
      if (ok_cf) stats.carga_final_ok++;
      if (ok_sf && ok_sc && ok_sp && ok_sr && ok_cp && ok_re && ok_cf) stats.all_ok++;
    }

    return NextResponse.json({
      period: { year, month, quinzena, start_date, end_date, month_name: MONTH_NAMES[month] },
      stats,
      diffs,
      summary: {
        total: stats.total,
        all_ok: stats.all_ok,
        pct: stats.total > 0 ? r2((stats.all_ok / stats.total) * 100) : 0,
        diffs_count: diffs.length,
      },
    });
  } catch (e) {
    console.error('Validate calc error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro desconhecido' }, { status: 500 });
  }
}
