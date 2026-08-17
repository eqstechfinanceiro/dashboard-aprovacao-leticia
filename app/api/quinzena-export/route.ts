import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function toNum(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Normalize name for matching */
function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s.toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function isFaturaOrCartao(name: string): boolean {
  const n = name.trim().toUpperCase();
  if (n.includes('CAIXA ITAU') || n.includes('CAIXA ITAÚ')) return true;
  if (n.startsWith('CAIXA')) return false;
  if (/^(FATURA|CARTAO|CARTÃO|FATUAR|FARTUR|FATUT|FARUR|FATUTR)/.test(n)) return true;
  if (n.includes('CARTÃO DE CRÉDITO') || n.includes('CARTAO DE CREDITO') || n.includes('CARTÃO DE CREDITO')) return true;
  if (n.includes('CARTÃO CORPORATIVO')) return true;
  if ((n.includes('ITAU') || n.includes('ITAÚ')) && !n.includes('CAIXA')) return true;
  if (n.includes('DOLAR') || n.includes('DÓLAR')) return true;
  if (n.startsWith('DESPESA') && n.includes('FATURA')) return true;
  if (n.startsWith('COMPLEMENTAR') && n.includes('FATURA')) return true;
  if (n.includes('CARTÃO') && n.includes('CRÉDITO')) return true;
  if (n.includes('CARTAO') && n.includes('CREDITO')) return true;
  if (n.startsWith('CARTÃO VEXPENSES')) return true;
  return false;
}

function getQuinzenaDates(year: number, month: number, quinzena: number) {
  const mm = String(month).padStart(2, '0');
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const pmm = String(prevMonth).padStart(2, '0');

  const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const financial_cutoff = `${prevYear}-${pmm}-${String(prevMonthLastDay).padStart(2, '0')}`;
  const saldo_cartao_controle_date = `${year}-${mm}-01`;

  if (quinzena === 1) {
    return {
      start_date: `${prevYear}-${pmm}-26`,
      end_date: `${year}-${mm}-10`,
      fechamento: `${year}-${mm}-11`,
      financial_cutoff,
      saldo_cartao_controle_date,
      saldo_cartao_carga_date: `${year}-${mm}-11`,
    };
  }
  return {
    start_date: `${year}-${mm}-11`,
    end_date: `${year}-${mm}-25`,
    fechamento: `${year}-${mm}-25`,
    financial_cutoff,
    saldo_cartao_controle_date,
    saldo_cartao_carga_date: `${year}-${mm}-25`,
  };
}

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '0');
  const month = parseInt(searchParams.get('month') ?? '0');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '0');

  if (!year || !month || ![1, 2].includes(quinzena)) {
    return NextResponse.json({ error: 'Parametros invalidos: year, month, quinzena' }, { status: 400 });
  }

  const dates = getQuinzenaDates(year, month, quinzena);

  try {
    // 1. Load cadastro
    const cadastroRows = await sql`
      SELECT cpf, colaborador, situacao, status_cartao, regional, centro_custo, gestor, diretor
      FROM quinzena_cadastro
      ORDER BY colaborador ASC NULLS LAST
    `;

    // 2. Load frozen data (or calculate)
    const frozenRows = await sql`
      SELECT cpf, colaborador, situacao, status_cartao, regional, centro_custo, gestor, diretor,
             carga::text, transferencia::text, tarifa::text, prestacao::text,
             saldo_prestacao::text, saldo_cartao::text, saldo_final::text,
             saldo_reembolsar::text, col_qz::text, adiantamento::text, obs,
             carga_parcial::text, reembolso::text, carga_final::text,
             reembolso_multiplier::text, frozen_at
      FROM quinzena_frozen_snapshots
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      ORDER BY colaborador ASC NULLS LAST
    `;

    const isFrozen = frozenRows.length > 0;

    // 3. Load extrato data (all transactions up to financial_cutoff + snapshots)
    const extratoRows = await sql`
      SELECT data, hora, codigo_transacao, numero_cartao, grupo, usuario, tipo,
             descricao, valor::text, status, id_despesa, id_relatorio, tipo_despesa,
             centro_custo, projeto, percentual_projeto, is_snapshot
      FROM extrato_movimentacao
      WHERE data <= ${dates.saldo_cartao_carga_date}
      ORDER BY data ASC, hora ASC
    `;

    // 4. Load base prest (reports + expenses)
    const reportRows = await sql`
      SELECT r.id, r.name, r.status, r.user_cpf, r.user_name, r.total_value::text,
             r.created_at, r.updated_at
      FROM prestacao_reports r
      WHERE r.user_cpf IS NOT NULL
      ORDER BY r.user_name ASC, r.id ASC
    `;

    // Get expenses for all reports
    const reportIds = reportRows.map((r: any) => r.id);
    let expenseRows: any[] = [];
    if (reportIds.length > 0) {
      // Batch in chunks of 1000 to avoid query param limits
      for (let i = 0; i < reportIds.length; i += 1000) {
        const chunk = reportIds.slice(i, i + 1000);
        const rows = await sql`
          SELECT e.id, e.report_id, e.value::text, e.date, e.description, e.status, e.raw_data
          FROM prestacao_expenses e
          WHERE e.report_id = ANY(${chunk})
          ORDER BY e.report_id ASC, e.id ASC
        `;
        expenseRows = expenseRows.concat(rows as any[]);
      }
    }

    // 5. Build name→cpf map (prefer CPF with non-null situacao for duplicate names)
    const nomeToCpf = new Map<string, string>();
    const nomeHasSituacao = new Set<string>();
    for (const c of cadastroRows as any[]) {
      const normalized = normalizeName(c.colaborador);
      if (!normalized) continue;
      const hasSituacao = c.situacao !== null && c.situacao !== undefined && c.situacao !== '';
      if (!nomeToCpf.has(normalized)) {
        nomeToCpf.set(normalized, c.cpf);
        if (hasSituacao) nomeHasSituacao.add(normalized);
      } else {
        if (hasSituacao && !nomeHasSituacao.has(normalized)) {
          nomeToCpf.set(normalized, c.cpf);
          nomeHasSituacao.add(normalized);
        }
      }
    }
    const fuzzyCache = new Map<string, string>();

    // ---- Build XLSX ----

    const wb = XLSX.utils.book_new();

    // Tab 1: CARGA (main summary)
    const cargaData: any[][] = [];
    cargaData.push([
      'CPF', 'Colaborador', 'Situação', 'Status Cartão', 'Regional', 'Centro de Custo',
      'Gestor', 'Diretor',
      'CARGA', 'TRANSFERÊNCIA', '(-)TARIFA', '(-)PRESTAÇÃO DE CONTAS',
      'SALDO PRESTAÇÃO', '(-)SALDO CARTÃO', 'SALDO FINAL', 'SALDO REEMBOLSAR',
      '1ª QZ', 'ADIANTAMENTO', 'OBS',
      'CARGA PARCIAL', 'REEMBOLSO', 'CARGA FINAL',
    ]);

    if (isFrozen) {
      for (const row of frozenRows as any[]) {
        cargaData.push([
          row.cpf, row.colaborador, row.situacao, row.status_cartao,
          row.regional, row.centro_custo, row.gestor, row.diretor,
          toNum(row.carga), toNum(row.transferencia), toNum(row.tarifa), toNum(row.prestacao),
          toNum(row.saldo_prestacao), toNum(row.saldo_cartao), toNum(row.saldo_final), toNum(row.saldo_reembolsar),
          row.col_qz ? toNum(row.col_qz) : null, toNum(row.adiantamento), row.obs,
          toNum(row.carga_parcial), toNum(row.reembolso), toNum(row.carga_final),
        ]);
      }
    } else {
      // Calculate from API data (same logic as quinzena-complete)
      const extratoAgg = await sql`
        WITH deduped AS (
          SELECT DISTINCT ON (
            UPPER(usuario), data, tipo, valor,
            COALESCE(NULLIF(codigo_transacao, ''), hora::text)
          )
            UPPER(usuario) AS usuario_up,
            data, tipo, valor, codigo_transacao
          FROM extrato_movimentacao
          WHERE is_snapshot = FALSE
            AND data <= ${dates.financial_cutoff}
          ORDER BY UPPER(usuario), data, tipo, valor,
            COALESCE(NULLIF(codigo_transacao, ''), hora::text)
        )
        SELECT
          usuario_up,
          COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor > 0), 0) AS carga_raw,
          COALESCE(SUM(valor) FILTER(WHERE tipo = 'Transferência' AND valor < 0), 0) AS transf_raw,
          COALESCE(SUM(valor) FILTER(WHERE tipo IN ('Taxa', 'Estorno de taxa', 'Pendência de taxa')), 0) AS tarifa_raw
        FROM deduped
        GROUP BY usuario_up
      `;

      const validReportIds = reportRows
        .filter((r: any) => !isFaturaOrCartao(r.name || ''))
        .map((r: any) => r.id);

      let somaseRows: { user_cpf: string; total: string }[] = [];
      if (validReportIds.length > 0) {
        somaseRows = await sql`
          SELECT r.user_cpf, COALESCE(SUM(e.value), 0)::text AS total
          FROM prestacao_reports r
          JOIN prestacao_expenses e ON e.report_id = r.id
          WHERE r.id = ANY(${validReportIds})
            AND COALESCE(e.raw_data->>'payment_method_id', '') != '627401'
          GROUP BY r.user_cpf
        `;
      }
      const somaseByCpf = new Map<string, number>();
      for (const r of somaseRows as any[]) {
        if (r.user_cpf) somaseByCpf.set(r.user_cpf, toNum(r.total));
      }

      const saldoControleRows = await sql`
        WITH deduped AS (
          SELECT DISTINCT ON (UPPER(usuario), data, tipo, valor, codigo_transacao)
            UPPER(usuario) AS usuario_up, data, tipo, valor, codigo_transacao
          FROM extrato_movimentacao
          WHERE is_snapshot = FALSE AND data <= ${dates.saldo_cartao_controle_date}
          ORDER BY UPPER(usuario), data, tipo, valor, codigo_transacao
        ),
        latest_snap AS (
          SELECT DISTINCT ON (UPPER(usuario))
            UPPER(usuario) AS usuario_up, valor AS saldo, data AS snapshot_date
          FROM extrato_movimentacao
          WHERE is_snapshot = TRUE AND valor IS NOT NULL
            AND data <= ${dates.saldo_cartao_controle_date}
          ORDER BY UPPER(usuario), data DESC
        ),
        post_snap_txns AS (
          SELECT d.usuario_up, SUM(d.valor) AS adjustment
          FROM deduped d JOIN latest_snap s ON d.usuario_up = s.usuario_up
          WHERE d.data > s.snapshot_date GROUP BY d.usuario_up
        ),
        computed_balance AS (
          SELECT usuario_up, COALESCE(SUM(valor), 0) AS saldo FROM deduped GROUP BY usuario_up
        )
        SELECT COALESCE(s.usuario_up, c.usuario_up) AS usuario_up,
               COALESCE(s.saldo, 0) + COALESCE(p.adjustment, 0) AS snap_saldo,
               COALESCE(c.saldo, 0) AS computed_saldo,
               (s.usuario_up IS NOT NULL) AS has_snapshot
        FROM latest_snap s
        FULL OUTER JOIN post_snap_txns p ON p.usuario_up = s.usuario_up
        FULL OUTER JOIN computed_balance c ON c.usuario_up = COALESCE(s.usuario_up, p.usuario_up)
      `;

      const saldoCargaRows = await sql`
        WITH deduped AS (
          SELECT DISTINCT ON (UPPER(usuario), data, tipo, valor, codigo_transacao)
            UPPER(usuario) AS usuario_up, data, tipo, valor, codigo_transacao
          FROM extrato_movimentacao
          WHERE is_snapshot = FALSE AND data <= ${dates.saldo_cartao_carga_date}
          ORDER BY UPPER(usuario), data, tipo, valor, codigo_transacao
        ),
        latest_snap AS (
          SELECT DISTINCT ON (UPPER(usuario))
            UPPER(usuario) AS usuario_up, valor AS saldo, data AS snapshot_date
          FROM extrato_movimentacao
          WHERE is_snapshot = TRUE AND valor IS NOT NULL
            AND data <= ${dates.saldo_cartao_carga_date}
          ORDER BY UPPER(usuario), data DESC
        ),
        post_snap_txns AS (
          SELECT d.usuario_up, SUM(d.valor) AS adjustment
          FROM deduped d JOIN latest_snap s ON d.usuario_up = s.usuario_up
          WHERE d.data > s.snapshot_date GROUP BY d.usuario_up
        ),
        computed_balance AS (
          SELECT usuario_up, COALESCE(SUM(valor), 0) AS saldo FROM deduped GROUP BY usuario_up
        )
        SELECT COALESCE(s.usuario_up, c.usuario_up) AS usuario_up,
               COALESCE(s.saldo, 0) + COALESCE(p.adjustment, 0) AS snap_saldo,
               COALESCE(c.saldo, 0) AS computed_saldo,
               (s.usuario_up IS NOT NULL) AS has_snapshot
        FROM latest_snap s
        FULL OUTER JOIN post_snap_txns p ON p.usuario_up = s.usuario_up
        FULL OUTER JOIN computed_balance c ON c.usuario_up = COALESCE(s.usuario_up, p.usuario_up)
      `;

      const saldoControleByCpf = new Map<string, number>();
      for (const r of saldoControleRows as any[]) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        if (cpf) {
          const hasSnap = r.has_snapshot;
          const snapSaldo = toNum(r.snap_saldo);
          const computedSaldo = toNum(r.computed_saldo);
          saldoControleByCpf.set(cpf, r2(hasSnap ? snapSaldo : computedSaldo));
        }
      }

      const saldoCargaByCpf = new Map<string, number>();
      for (const r of saldoCargaRows as any[]) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        if (cpf) {
          const hasSnap = r.has_snapshot;
          const snapSaldo = toNum(r.snap_saldo);
          const computedSaldo = toNum(r.computed_saldo);
          saldoCargaByCpf.set(cpf, r2(hasSnap ? snapSaldo : computedSaldo));
        }
      }

      const cargaByCpf = new Map<string, number>();
      const transfByCpf = new Map<string, number>();
      const tarifaByCpf = new Map<string, number>();
      const saldoPrestByCpf = new Map<string, number>();

      for (const r of extratoAgg as any[]) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        if (cpf) {
          const carga = Number(r.carga_raw || 0);
          const transf = Math.abs(Number(r.transf_raw || 0));
          const tarifa = Math.abs(Number(r.tarifa_raw || 0));
          const somase = somaseByCpf.get(cpf) ?? 0;
          const sp = r2(carga - transf - tarifa - somase);
          saldoPrestByCpf.set(cpf, sp);
          cargaByCpf.set(cpf, carga);
          transfByCpf.set(cpf, transf);
          tarifaByCpf.set(cpf, tarifa);
        }
      }

      // Load manual inputs
      const manualRows = await sql`
        SELECT col_1qz::text, adiantamento::text, obs, cpf
        FROM quinzena_manual_inputs
        WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      `;
      const manualByCpf = new Map<string, any>();
      for (const m of manualRows as any[]) {
        if (m.cpf) manualByCpf.set(m.cpf, m);
      }

      // Load reembolso multiplier
      const configRows = await sql`
        SELECT reembolso_multiplier::text FROM quinzena_config
        WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      `;
      const reembolsoMultiplier = configRows[0] ? parseFloat(configRows[0].reembolso_multiplier as string) : 0.5;

      for (const snap of cadastroRows as any[]) {
        const manual = manualByCpf.get(snap.cpf);
        const sp = saldoPrestByCpf.get(snap.cpf) ?? 0;
        const sc_controle = saldoControleByCpf.get(snap.cpf) ?? 0;
        const sc_carga = saldoCargaByCpf.get(snap.cpf) ?? 0;
        const carga = cargaByCpf.get(snap.cpf) ?? 0;
        const transf = transfByCpf.get(snap.cpf) ?? 0;
        const tarifa = tarifaByCpf.get(snap.cpf) ?? 0;
        const prestacao = somaseByCpf.get(snap.cpf) ?? 0;
        const sf = r2(sp - sc_controle);
        const sr = Math.max(-sf, 0);
        const isPendente = (snap.status_cartao || '').toLowerCase().includes('pendente');
        const col_qz_manual = manual?.col_1qz !== null && manual?.col_1qz !== undefined ? toNum(manual.col_1qz) : null;
        const adiantamento = manual?.adiantamento !== null && manual?.adiantamento !== undefined ? toNum(manual.adiantamento) : 0;
        const col_qz_efetivo = col_qz_manual !== null ? col_qz_manual : 0;

        let carga_parcial = 0, reembolso = 0, carga_final = 0;
        if (!isPendente) {
          carga_parcial = r2(col_qz_efetivo - Math.max(sf, 0) - sc_carga - adiantamento);
          reembolso = quinzena === 1 ? r2(Math.max(0, sr) * reembolsoMultiplier) : 0;
          carga_final = r2(Math.max(0, carga_parcial) + reembolso);
        }

        cargaData.push([
          snap.cpf, snap.colaborador, snap.situacao, snap.status_cartao,
          snap.regional, snap.centro_custo, snap.gestor, snap.diretor,
          carga, transf, tarifa, prestacao,
          sp, sc_controle, sf, sr,
          col_qz_manual, adiantamento, manual?.obs ?? null,
          carga_parcial, reembolso, carga_final,
        ]);
      }
    }

    const wsCarga = XLSX.utils.aoa_to_sheet(cargaData);
    XLSX.utils.book_append_sheet(wb, wsCarga, 'CARGA');

    // Tab 2: EXTRATO (all transactions)
    const extratoData: any[][] = [];
    extratoData.push([
      'Data', 'Hora', 'Código de Transação', 'Número do Cartão', 'Grupo', 'Usuário',
      'Tipo', 'Descrição', 'Valor', 'Status', 'ID da Despesa', 'ID do Relatório',
      'Tipo de Despesa', 'Centro de Custo', 'Projeto', 'Percentual de projeto', 'is_snapshot'
    ]);
    for (const r of extratoRows as any[]) {
      extratoData.push([
        r.data, r.hora, r.codigo_transacao, r.numero_cartao, r.grupo, r.usuario,
        r.tipo, r.descricao, toNum(r.valor), r.status, r.id_despesa, r.id_relatorio,
        r.tipo_despesa, r.centro_custo, r.projeto, r.percentual_projeto, r.is_snapshot,
      ]);
    }
    const wsExtrato = XLSX.utils.aoa_to_sheet(extratoData);
    XLSX.utils.book_append_sheet(wb, wsExtrato, 'EXTRATO');

    // Tab 3: BASE PREST (reports)
    const prestData: any[][] = [];
    prestData.push([
      'Report ID', 'Nome', 'Status', 'User CPF', 'User Name', 'Total Value',
      'Created At', 'Updated At',
      'Is Fatura/Cartão',
    ]);
    for (const r of reportRows as any[]) {
      prestData.push([
        r.id, r.name, r.status, r.user_cpf, r.user_name, toNum(r.total_value),
        r.created_at, r.updated_at,
        isFaturaOrCartao(r.name || '') ? 'SIM' : 'NÃO',
      ]);
    }
    const wsPrest = XLSX.utils.aoa_to_sheet(prestData);
    XLSX.utils.book_append_sheet(wb, wsPrest, 'BASE PREST');

    // Tab 4: DESPESAS (expenses detail)
    const expData: any[][] = [];
    expData.push([
      'Expense ID', 'Report ID', 'Value', 'Date', 'Description', 'Status',
    ]);
    for (const e of expenseRows) {
      expData.push([
        e.id, e.report_id, toNum(e.value),
        e.date, e.description, e.status,
      ]);
    }
    const wsExp = XLSX.utils.aoa_to_sheet(expData);
    XLSX.utils.book_append_sheet(wb, wsExp, 'DESPESAS');

    // Tab 5: SALDO CARTÃO (snapshots only)
    const snapData: any[][] = [];
    snapData.push(['Data', 'Usuário', 'Valor (Saldo)', 'Número do Cartão']);
    for (const r of extratoRows as any[]) {
      if (r.is_snapshot) {
        snapData.push([r.data, r.usuario, toNum(r.valor), r.numero_cartao]);
      }
    }
    const wsSnap = XLSX.utils.aoa_to_sheet(snapData);
    XLSX.utils.book_append_sheet(wb, wsSnap, 'SALDO CARTAO');

    // Tab 6: CADASTRO (user metadata)
    const cadData: any[][] = [];
    cadData.push(['CPF', 'Colaborador', 'Situação', 'Status Cartão', 'Regional', 'Centro de Custo', 'Gestor', 'Diretor']);
    for (const c of cadastroRows as any[]) {
      cadData.push([c.cpf, c.colaborador, c.situacao, c.status_cartao, c.regional, c.centro_custo, c.gestor, c.diretor]);
    }
    const wsCad = XLSX.utils.aoa_to_sheet(cadData);
    XLSX.utils.book_append_sheet(wb, wsCad, 'CADASTRO');

    // Tab 7: INFO (metadata)
    const infoData: any[][] = [];
    infoData.push(['Quinzena Export']);
    infoData.push(['Year', year]);
    infoData.push(['Month', month]);
    infoData.push(['Quinzena', quinzena]);
    infoData.push(['Periodo', `${dates.start_date} a ${dates.end_date}`]);
    infoData.push(['Fechamento', dates.fechamento]);
    infoData.push(['Cutoff Financeiro', dates.financial_cutoff]);
    infoData.push(['Saldo Cartao Controle', dates.saldo_cartao_controle_date]);
    infoData.push(['Saldo Cartao Carga', dates.saldo_cartao_carga_date]);
    infoData.push(['Congelado', isFrozen ? 'SIM' : 'NAO']);
    if (isFrozen && (frozenRows[0] as any)?.frozen_at) {
      infoData.push(['Frozen At', (frozenRows[0] as any).frozen_at]);
    }
    infoData.push(['Total Rows (Carga)', cargaData.length - 1]);
    infoData.push(['Total Extrato Rows', extratoData.length - 1]);
    infoData.push(['Total Reports (Base Prest)', prestData.length - 1]);
    infoData.push(['Total Expenses (Despesas)', expData.length - 1]);
    infoData.push(['']);
    infoData.push(['Regras (rulebook.md)']);
    infoData.push(['Carga/Transf/Tarifa/Prestacao', `Dados ate ${dates.financial_cutoff} (ultimo dia do mes anterior)`]);
    infoData.push(['Saldo Cartao (Controle)', `Ate ${dates.saldo_cartao_controle_date} (dia 1 mes atual)`]);
    infoData.push(['Saldo Cartao (Carga)', `Ate ${dates.saldo_cartao_carga_date} (data de fechamento)`]);
    infoData.push(['Prestacao de Contas', `Snapshot na data e ate a data, desde criacao do cartao`]);
    const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'INFO');

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `controle_${year}_${String(month).padStart(2, '0')}_Q${quinzena}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[quinzena-export] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar XLSX', detail: String(error) },
      { status: 500 }
    );
  }
}
