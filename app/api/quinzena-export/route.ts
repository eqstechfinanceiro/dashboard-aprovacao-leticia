import { NextRequest, NextResponse } from 'next/server';
import { PassThrough, Readable } from 'stream';
import ExcelJS from 'exceljs';
import { sql, getPool } from '@/lib/db/neon';
import { isFaturaOrCartao } from '@/lib/rules/report-filters';
import { getScopeForRequest, normalizeCpf } from '@/lib/auth/scope';
import { normalizeName, resolveCpfByName } from '@/lib/quinzena/name-resolve';
import { exportLimiter, heavyBusy } from '@/lib/util/heavy';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Página de leitura do extrato/despesas — o export inteiro é streamado
// (ExcelJS WorkbookWriter) para a heap ficar limitada ao chunk, não ao
// dataset completo (antes: dump integral + SheetJS = ~3× os dados na heap,
// picos de ~2GB e OOM do processo — ver ecosystem.config.js).
const CHUNK = 20000;

function toNum(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
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

  const scope = await getScopeForRequest(request);
  const inScope = (cpf: unknown) => scope!.cpfs.has(normalizeCpf(cpf) ?? '__none__');

  // Limite de concorrência — segurado até o stream terminar (produtor libera).
  const release = await exportLimiter.acquire();
  if (!release) return heavyBusy();

  try {
    // 1. Load cadastro
    let cadastroRows = await sql`
      SELECT cpf, colaborador, situacao, status_cartao, regional, centro_custo, gestor, diretor
      FROM quinzena_cadastro
      ORDER BY colaborador ASC NULLS LAST
    `;
    if (scope) cadastroRows = (cadastroRows as any[]).filter(c => inScope(c.cpf)) as any;

    // 2. Load frozen data (or calculate)
    let frozenRows = await sql`
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
    if (scope) frozenRows = (frozenRows as any[]).filter(r => inScope(r.cpf)) as any;

    const isFrozen = frozenRows.length > 0;

    // Status da auto-carga por CPF (último item de cada CPF no período)
    const cargaItemRows = await sql`
      SELECT DISTINCT ON (cpf) cpf, status, transaction_id, block_reason
      FROM quinzena_carga_items
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      ORDER BY cpf, id DESC
    `.catch(() => [] as any[]); // tabela pode não existir em bases antigas
    const cargaStatusByCpf = new Map<string, { status: string; tx: string | null; reason: string | null }>();
    for (const it of cargaItemRows as any[]) {
      cargaStatusByCpf.set(it.cpf, { status: it.status, tx: it.transaction_id, reason: it.block_reason });
    }
    const STATUS_LABEL: Record<string, string> = {
      ok: 'CARREGADO', forced_ok: 'CARREGADO (FORÇADO)', failed: 'FALHOU',
      forced_failed: 'FALHOU (FORÇADO)', blocked: 'BLOQUEADO', skipped: 'JÁ CARREGADO',
      estornado: 'ESTORNADO',
    };
    const cargaStatusOf = (cpf: string) => {
      const it = cargaStatusByCpf.get(cpf);
      if (!it) return { label: '', tx: '' };
      return { label: STATUS_LABEL[it.status] ?? it.status, tx: it.tx ?? '' };
    };

    // 4. Load base prest (reports) — lista para a aba BASE PREST e para o
    // cálculo da aba CARGA (quando não congelada).
    let reportRows = await sql`
      SELECT r.id, r.name, r.status, r.user_cpf, r.user_name, r.total_value::text,
             r.created_at, r.updated_at
      FROM prestacao_reports r
      WHERE r.user_cpf IS NOT NULL
        AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      ORDER BY r.user_name ASC, r.id ASC
    `;
    if (scope) reportRows = (reportRows as any[]).filter(r => inScope(r.user_cpf)) as any;
    const reportIds = (reportRows as any[]).map((r: any) => r.id);

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
    // Escopo (gestor): EXTRATO/SALDO CARTAO mostram só as linhas que resolvem
    // para CPFs in-scope — mesma resolução usada no cálculo do CARGA.
    const extratoInScope = (r: any) => {
      if (!scope) return true;
      const cpf = resolveCpfByName(String(r.usuario || ''), nomeToCpf, fuzzyCache);
      return cpf !== undefined && scope.cpfs.has(cpf);
    };

    // ---- Aba CARGA (montada em memória — ~mil linhas, barato) ----
    const cargaData: any[][] = [];
    cargaData.push([
      'CPF', 'Colaborador', 'Situação', 'Status Cartão', 'Regional', 'Centro de Custo',
      'Gestor', 'Diretor',
      'CARGA', 'TRANSFERÊNCIA', '(-)TARIFA', '(-)PRESTAÇÃO DE CONTAS',
      'SALDO PRESTAÇÃO', '(-)SALDO CARTÃO', 'SALDO FINAL', 'SALDO REEMBOLSAR',
      '1ª QZ', 'ADIANTAMENTO', 'OBS',
      '(-)SALDO CARTÃO CARGA', 'CARGA PARCIAL', 'REEMBOLSO', 'CARGA FINAL',
      'STATUS CARGA', 'TRANSACTION ID',
    ]);

    if (isFrozen) {
      // Situacao é cadastral: o valor atual do cadastro (com merge do RH)
      // sobrepõe o congelado — demissões recentes aparecem no export.
      const sitByCpf = new Map<string, string>();
      for (const c of cadastroRows as any[]) if (c.situacao) sitByCpf.set(c.cpf, c.situacao);
      for (const row of frozenRows as any[]) {
        const st = cargaStatusOf(row.cpf);
        cargaData.push([
          row.cpf, row.colaborador, sitByCpf.get(row.cpf) ?? row.situacao, row.status_cartao,
          row.regional, row.centro_custo, row.gestor, row.diretor,
          toNum(row.carga), toNum(row.transferencia), toNum(row.tarifa), toNum(row.prestacao),
          toNum(row.saldo_prestacao), toNum(row.saldo_cartao), toNum(row.saldo_final), toNum(row.saldo_reembolsar),
          row.col_qz ? toNum(row.col_qz) : null, toNum(row.adiantamento), row.obs,
          toNum(row.saldo_cartao_carga), toNum(row.carga_parcial), toNum(row.reembolso), toNum(row.carga_final),
          st.label, st.tx,
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
            data, tipo, valor, codigo_transacao, descricao
          FROM extrato_movimentacao
          WHERE is_snapshot = FALSE
            AND data <= ${dates.financial_cutoff}
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

      const validReportIds = (reportRows as any[])
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

      // Saldo cartão = latest fixed snapshot (NULL = 0, ex: cartão cancelado/inativo)
      // NÃO somar transações pós-snapshot — o saldo é um snapshot fixo do extrato
      const saldoControleRows = await sql`
        SELECT DISTINCT ON (UPPER(TRIM(usuario)))
          UPPER(TRIM(usuario)) AS usuario_up,
          COALESCE(valor, 0) AS saldo
        FROM extrato_movimentacao
        WHERE is_snapshot = TRUE
          AND data <= ${dates.saldo_cartao_controle_date}
        ORDER BY UPPER(TRIM(usuario)), data DESC
      `;

      const saldoCargaRows = await sql`
        SELECT DISTINCT ON (UPPER(TRIM(usuario)))
          UPPER(TRIM(usuario)) AS usuario_up,
          COALESCE(valor, 0) AS saldo
        FROM extrato_movimentacao
        WHERE is_snapshot = TRUE
          AND data <= ${dates.saldo_cartao_carga_date}
        ORDER BY UPPER(TRIM(usuario)), data DESC
      `;

      const saldoControleByCpf = new Map<string, number>();
      for (const r of saldoControleRows as any[]) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        if (cpf) {
          const saldo = toNum(r.saldo);
          saldoControleByCpf.set(cpf, r2((saldoControleByCpf.get(cpf) ?? 0) + saldo));
        }
      }

      const saldoCargaByCpf = new Map<string, number>();
      for (const r of saldoCargaRows as any[]) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        if (cpf) {
          const saldo = toNum(r.saldo);
          saldoCargaByCpf.set(cpf, r2((saldoCargaByCpf.get(cpf) ?? 0) + saldo));
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
          // Accumulate: multiple extrato names may resolve to same CPF
          cargaByCpf.set(cpf, (cargaByCpf.get(cpf) ?? 0) + carga);
          transfByCpf.set(cpf, (transfByCpf.get(cpf) ?? 0) + transf);
          tarifaByCpf.set(cpf, (tarifaByCpf.get(cpf) ?? 0) + tarifa);
        }
      }
      // Calculate saldo_prestacao after accumulating all extrato for each CPF
      for (const cpf of cargaByCpf.keys()) {
        const somase = somaseByCpf.get(cpf) ?? 0;
        const sp = r2(cargaByCpf.get(cpf)! - transfByCpf.get(cpf)! - tarifaByCpf.get(cpf)! - somase);
        saldoPrestByCpf.set(cpf, sp);
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
      const reembolsoMultiplier = configRows[0] ? parseFloat(configRows[0].reembolso_multiplier as string) : 0;

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

        const st = cargaStatusOf(snap.cpf);
        cargaData.push([
          snap.cpf, snap.colaborador, snap.situacao, snap.status_cartao,
          snap.regional, snap.centro_custo, snap.gestor, snap.diretor,
          carga, transf, tarifa, prestacao,
          sp, sc_controle, sf, sr,
          col_qz_manual, adiantamento, manual?.obs ?? null,
          sc_carga, carga_parcial, reembolso, carga_final,
          st.label, st.tx,
        ]);
      }
    }

    // ---- Stream do workbook (ExcelJS WorkbookWriter → PassThrough → Response) ----
    const pass = new PassThrough({ highWaterMark: 1024 * 1024 });
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: pass });
    const counters = { extrato: 0, despesas: 0 };

    const produce = async () => {
      // Conexão dedicada + REPEATABLE READ + cursores: leitura em chunks com
      // heap limitada E snapshot consistente (o sync-worker insere extrato
      // concorrentemente — paginar fora de tx duplicaria/pularia linhas).
      const client = await getPool()!.connect();
      // Watchdog de consumidor morto: cliente desconectou mas o producer
      // seguiria escrevendo num PassThrough sem leitor (ExcelJS ignora
      // backpressure e request.signal nem sempre propaga o disconnect).
      // Buffer > 8MB sem drenar = ninguém consumindo → aborta e libera o slot.
      const DEAD_BYTES = 8 * 1024 * 1024;
      const alive = () => {
        if (pass.destroyed || request.signal.aborted) return false;
        if (pass.writableLength > DEAD_BYTES) return false;
        return true;
      };
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

        const wsCarga = wb.addWorksheet('CARGA');
        for (const row of cargaData) wsCarga.addRow(row).commit();
        wsCarga.commit();

        // EXTRATO — cursor, filtro de escopo por chunk
        const wsExtrato = wb.addWorksheet('EXTRATO');
        wsExtrato.addRow([
          'Data', 'Hora', 'Código de Transação', 'Número do Cartão', 'Grupo', 'Usuário',
          'Tipo', 'Descrição', 'Valor', 'Status', 'ID da Despesa', 'ID do Relatório',
          'Tipo de Despesa', 'Centro de Custo', 'Projeto', 'Percentual de projeto', 'is_snapshot'
        ]).commit();
        await client.query(
          `DECLARE cur_ext NO SCROLL CURSOR FOR
            SELECT data, hora, codigo_transacao, numero_cartao, grupo, usuario, tipo,
                   descricao, valor::text, status, id_despesa, id_relatorio, tipo_despesa,
                   centro_custo, projeto, percentual_projeto, is_snapshot
            FROM extrato_movimentacao
            WHERE data <= $1
            ORDER BY data ASC, hora ASC`,
          [dates.saldo_cartao_carga_date],
        );
        for (;;) {
          if (!alive()) throw new Error('export abortado: cliente desconectou');
          const { rows } = await client.query(`FETCH ${CHUNK} FROM cur_ext`);
          for (const r of rows as any[]) {
            if (!extratoInScope(r)) continue;
            wsExtrato.addRow([
              r.data, r.hora, r.codigo_transacao, r.numero_cartao, r.grupo, r.usuario,
              r.tipo, r.descricao, toNum(r.valor), r.status, r.id_despesa, r.id_relatorio,
              r.tipo_despesa, r.centro_custo, r.projeto, r.percentual_projeto, r.is_snapshot,
            ]).commit();
            counters.extrato++;
          }
          if (rows.length < CHUNK) break;
        }
        wsExtrato.commit();

        // BASE PREST (reports)
        const wsPrest = wb.addWorksheet('BASE PREST');
        wsPrest.addRow([
          'Report ID', 'Nome', 'Status', 'User CPF', 'User Name', 'Total Value',
          'Created At', 'Updated At',
          'Is Fatura/Cartão',
        ]).commit();
        for (const r of reportRows as any[]) {
          wsPrest.addRow([
            r.id, r.name, r.status, r.user_cpf, r.user_name, toNum(r.total_value),
            r.created_at, r.updated_at,
            isFaturaOrCartao(r.name || '') ? 'SIM' : 'NÃO',
          ]).commit();
        }
        wsPrest.commit();

        // DESPESAS — chunks de report_id (mesmo fatiamento de antes, sem reter tudo)
        const wsExp = wb.addWorksheet('DESPESAS');
        wsExp.addRow(['Expense ID', 'Report ID', 'Value', 'Date', 'Description', 'Status']).commit();
        for (let i = 0; i < reportIds.length; i += 1000) {
          const chunk = reportIds.slice(i, i + 1000);
          const { rows } = await client.query(
            `SELECT e.id, e.report_id, e.value::text, e.date, e.description, e.status
             FROM prestacao_expenses e
             WHERE e.report_id = ANY($1)
             ORDER BY e.report_id ASC, e.id ASC`,
            [chunk],
          );
          for (const e of rows as any[]) {
            wsExp.addRow([e.id, e.report_id, toNum(e.value), e.date, e.description, e.status]).commit();
            counters.despesas++;
          }
        }
        wsExp.commit();

        // SALDO CARTÃO — snapshots, cursor
        const wsSnap = wb.addWorksheet('SALDO CARTAO');
        wsSnap.addRow(['Data', 'Usuário', 'Valor (Saldo)', 'Número do Cartão']).commit();
        await client.query(
          `DECLARE cur_snap NO SCROLL CURSOR FOR
            SELECT data, usuario, valor::text, numero_cartao
            FROM extrato_movimentacao
            WHERE is_snapshot = TRUE
              AND data <= $1
            ORDER BY data ASC`,
          [dates.saldo_cartao_carga_date],
        );
        for (;;) {
          if (!alive()) throw new Error('export abortado: cliente desconectou');
          const { rows } = await client.query(`FETCH ${CHUNK} FROM cur_snap`);
          for (const r of rows as any[]) {
            if (!extratoInScope(r)) continue;
            wsSnap.addRow([r.data, r.usuario, toNum(r.valor), r.numero_cartao]).commit();
          }
          if (rows.length < CHUNK) break;
        }
        wsSnap.commit();

        // CADASTRO
        const wsCad = wb.addWorksheet('CADASTRO');
        wsCad.addRow(['CPF', 'Colaborador', 'Situação', 'Status Cartão', 'Regional', 'Centro de Custo', 'Gestor', 'Diretor']).commit();
        for (const c of cadastroRows as any[]) {
          wsCad.addRow([c.cpf, c.colaborador, c.situacao, c.status_cartao, c.regional, c.centro_custo, c.gestor, c.diretor]).commit();
        }
        wsCad.commit();

        // INFO
        const wsInfo = wb.addWorksheet('INFO');
        const infoRows: any[][] = [
          ['Quinzena Export'],
          ['Year', year],
          ['Month', month],
          ['Quinzena', quinzena],
          ['Periodo', `${dates.start_date} a ${dates.end_date}`],
          ['Fechamento', dates.fechamento],
          ['Cutoff Financeiro', dates.financial_cutoff],
          ['Saldo Cartao Controle', dates.saldo_cartao_controle_date],
          ['Saldo Cartao Carga', dates.saldo_cartao_carga_date],
          ['Congelado', isFrozen ? 'SIM' : 'NAO'],
        ];
        if (isFrozen && (frozenRows[0] as any)?.frozen_at) {
          infoRows.push(['Frozen At', (frozenRows[0] as any).frozen_at]);
        }
        infoRows.push(
          ['Total Rows (Carga)', cargaData.length - 1],
          ['Total Extrato Rows', counters.extrato],
          ['Total Reports (Base Prest)', reportRows.length],
          ['Total Expenses (Despesas)', counters.despesas],
          [''],
          ['Regras (rulebook.md)'],
          ['Carga/Transf/Tarifa/Prestacao', `Dados ate ${dates.financial_cutoff} (ultimo dia do mes anterior)`],
          ['Saldo Cartao (Controle)', `Ate ${dates.saldo_cartao_controle_date} (dia 1 mes atual)`],
          ['Saldo Cartao (Carga)', `Ate ${dates.saldo_cartao_carga_date} (data de fechamento)`],
          ['Prestacao de Contas', `Snapshot na data e ate a data, desde criacao do cartao`],
        );
        for (const row of infoRows) wsInfo.addRow(row).commit();
        wsInfo.commit();

        await client.query('COMMIT');
        await wb.commit();
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        pass.destroy(e instanceof Error ? e : new Error(String(e)));
      } finally {
        client.release();
        release();
      }
    };

    void produce();

    request.signal.addEventListener('abort', () => pass.destroy(new Error('client aborted')));

    const filename = `controle_${year}_${String(month).padStart(2, '0')}_Q${quinzena}.xlsx`;
    return new Response(Readable.toWeb(pass) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    release();
    console.error('[quinzena-export] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao exportar', detail: String(error) },
      { status: 500 },
    );
  }
}
