import { sql, isDatabaseAvailable } from './neon';

// ---- FATURA/CARTAO filter (must match quinzena-complete route) --------------

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

// ---- Types -----------------------------------------------------------------

export type PipelineStep =
  | 'download_extrato'
  | 'refresh_cadastro'
  | 'refresh_reports'
  | 'download_expenses'
  | 'snapshot_somase';

export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface PipelineRun {
  id: number;
  quinzena_id: string;
  status: 'running' | 'success' | 'failed' | 'partial';
  started_at: string;
  finished_at: string | null;
  trigger: 'auto' | 'manual';
  steps: PipelineStepStatus[];
}

export interface PipelineStepStatus {
  step: PipelineStep;
  status: StepStatus;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  meta: Record<string, unknown> | null;
}

// ---- DB helpers ------------------------------------------------------------

export async function ensurePipelineTable() {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS pipeline_status (
      id SERIAL PRIMARY KEY,
      quinzena_id VARCHAR(20) NOT NULL,
      step VARCHAR(30) NOT NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'pending',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      error TEXT,
      meta JSONB,
      trigger VARCHAR(10) DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pipeline_quinzena
    ON pipeline_status (quinzena_id, step)
  `;
}

/** Returns the current quinzena ID based on today's date. */
export function getCurrentQuinzenaId(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based
  const day = date.getDate();

  // 1QZ: days 1-10, 2QZ: days 11-end
  // The quinzena ID follows the pattern: the CLOSING date determines the ID
  // 1QZ month M closes on 10/M → ID = YYYY-MM-1
  // 2QZ month M closes on 25/M → ID = YYYY-MM-2
  // BUT the snapshot for a quinzena is taken when the NEXT quinzena closes
  // (planilha is finalized when next quinzena closes)
  // So on day 10/M we snapshot the PREVIOUS quinzena (2QZ of M-1)
  // On day 25/M we snapshot 1QZ of M

  if (day <= 10) {
    // We're in 1QZ of this month → snapshot 2QZ of previous month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}-2`;
  } else {
    // We're in 2QZ of this month → snapshot 1QZ of this month
    return `${year}-${String(month).padStart(2, '0')}-1`;
  }
}

/** Returns the quinzena that is currently being calculated (the one that just closed). */
export function getCurrentClosingQuinzena(date = new Date()): string {
  return getCurrentQuinzenaId(date);
}

/** Returns the previous quinzena ID (the one before the given quinzena). */
export function getPreviousQuinzenaId(quinzenaId: string): string {
  const [yearStr, monthStr, qStr] = quinzenaId.split('-');
  let year = parseInt(yearStr);
  let month = parseInt(monthStr);
  const q = parseInt(qStr);

  if (q === 1) {
    // Previous of 1QZ month M = 2QZ of month M-1
    month = month === 1 ? 12 : month - 1;
    if (month === 12) year--;
    return `${year}-${String(month).padStart(2, '0')}-2`;
  } else {
    // Previous of 2QZ month M = 1QZ of same month
    return `${year}-${String(month).padStart(2, '0')}-1`;
  }
}

/** Returns the cutoff date for a quinzena (when its snapshot is finalized).
 *  The planilha of a quinzena is finalized when the NEXT quinzena closes.
 *  1QZ month M → cutoff = 25/M (2QZ same month closes)
 *  2QZ month M → cutoff = 10/(M+1) (1QZ next month closes) */
export function getQuinzenaCutoff(quinzenaId: string): string {
  const [yearStr, monthStr, qStr] = quinzenaId.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const q = parseInt(qStr);

  if (q === 1) {
    // 1QZ month M → cutoff = 25/M
    return `${year}-${String(month).padStart(2, '0')}-25`;
  } else {
    // 2QZ month M → cutoff = 10/(M+1)
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-10`;
  }
}

/** Returns the date range [start, end] for a quinzena ID.
 *  1QZ: days 1-10, 2QZ: days 11-25 */
export function getQuinzenaDateRange(quinzenaId: string): { start: string; end: string } {
  const [yearStr, monthStr, qStr] = quinzenaId.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const q = parseInt(qStr);

  if (q === 1) {
    return {
      start: `${year}-${String(month).padStart(2, '0')}-01`,
      end: `${year}-${String(month).padStart(2, '0')}-10`,
    };
  } else {
    return {
      start: `${year}-${String(month).padStart(2, '0')}-11`,
      end: `${year}-${String(month).padStart(2, '0')}-25`,
    };
  }
}

/** Returns all pipeline runs for a given quinzena, most recent first. */
export async function getPipelineRuns(quinzenaId: string): Promise<PipelineRun[]> {
  if (!sql) return [];
  await ensurePipelineTable();

  const rows = await sql`
    SELECT * FROM pipeline_status
    WHERE quinzena_id = ${quinzenaId}
    ORDER BY created_at DESC
  `;

  // Group by run (we use created_at proximity or a run_id if we add one)
  // For simplicity, each row is a step; group by trigger+started_at window
  // Actually, let's group by the most recent set of steps
  const runs: PipelineRun[] = [];
  const grouped = new Map<string, PipelineStepStatus[]>();

  for (const row of rows) {
    const key = `${row.trigger}-${new Date(row.created_at).getTime()}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({
      step: row.step as PipelineStep,
      status: row.status as StepStatus,
      started_at: row.started_at,
      finished_at: row.finished_at,
      error: row.error,
      meta: row.meta as Record<string, unknown> | null,
    });
  }

  for (const [key, steps] of grouped) {
    const trigger = key.split('-')[0];
    const allSuccess = steps.every(s => s.status === 'success');
    const anyFailed = steps.some(s => s.status === 'failed');
    const anyRunning = steps.some(s => s.status === 'running');
    const status = anyRunning ? 'running' : allSuccess ? 'success' : anyFailed ? 'partial' : 'running';
    runs.push({
      id: 0,
      quinzena_id: quinzenaId,
      status: status as PipelineRun['status'],
      started_at: steps[0]?.started_at || new Date().toISOString(),
      finished_at: steps.find(s => s.finished_at)?.finished_at || null,
      trigger: trigger as 'auto' | 'manual',
      steps,
    });
  }

  return runs;
}

/** Returns the latest status of each step for a quinzena. */
export async function getLatestStepStatuses(quinzenaId: string): Promise<PipelineStepStatus[]> {
  if (!sql) return [];
  await ensurePipelineTable();

  const rows = await sql`
    SELECT DISTINCT ON (step) *
    FROM pipeline_status
    WHERE quinzena_id = ${quinzenaId}
    ORDER BY step, created_at DESC
  `;

  return rows.map((row: any) => ({
    step: row.step as PipelineStep,
    status: row.status as StepStatus,
    started_at: row.started_at,
    finished_at: row.finished_at,
    error: row.error,
    meta: row.meta as Record<string, unknown> | null,
  }));
}

/** Records a step start. Returns the row id. */
export async function recordStepStart(
  quinzenaId: string,
  step: PipelineStep,
  trigger: 'auto' | 'manual' = 'manual'
): Promise<number> {
  if (!sql) return 0;
  await ensurePipelineTable();

  const rows = await sql`
    INSERT INTO pipeline_status (quinzena_id, step, status, started_at, trigger)
    VALUES (${quinzenaId}, ${step}, 'running', NOW(), ${trigger})
    RETURNING id
  `;
  return rows[0]?.id || 0;
}

/** Records a step completion. */
export async function recordStepFinish(
  rowId: number,
  status: StepStatus,
  error?: string | null,
  meta?: Record<string, unknown> | null
) {
  if (!sql || rowId === 0) return;
  await sql`
    UPDATE pipeline_status
    SET status = ${status}, finished_at = NOW(),
        error = ${error || null}, meta = ${meta ? JSON.stringify(meta) : null}
    WHERE id = ${rowId}
  `;
}

/** Checks if a quinzena's pipeline has already been run successfully. */
export async function isPipelineComplete(quinzenaId: string): Promise<boolean> {
  const steps = await getLatestStepStatuses(quinzenaId);
  if (steps.length === 0) return false;
  return steps.every(s => s.status === 'success' || s.status === 'skipped');
}

// ---- Pipeline steps --------------------------------------------------------

import { getLaravelCookieString } from './laravel-token';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

/** Step 0: Download extrato from API v3 (XLSX via S3 presigned URL) */
export async function downloadExtrato(
  onProgress?: (chunk: number, total: number) => void
): Promise<Record<string, unknown>> {
  if (!sql) throw new Error('Database not available');
  const cookieStr = await getLaravelCookieString();
  if (!cookieStr) throw new Error('Laravel token expirado. Acesse app.vexpenses.com para atualizar via extensão.');
  const db = sql;

  // Determine date range: from Jan 1 of previous year to today
  // (planilha CONTROLE has extrato data since May 2025, so we need at least that far back)
  const now = new Date();
  const year = now.getFullYear();
  const startDate = `${year - 1}-01-01`;
  const endDate = now.toISOString().slice(0, 10);

  // Split into 15-day chunks
  const chunks: [string, string][] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);
  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + 14);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push([
      current.toISOString().slice(0, 10),
      chunkEnd.toISOString().slice(0, 10),
    ]);
    current.setDate(current.getDate() + 15);
  }

  let totalRows = 0;

  for (let i = 0; i < chunks.length; i++) {
    const [chunkStart, chunkEnd] = chunks[i];
    onProgress?.(i + 1, chunks.length);

    try {
      // Step 1: Get S3 presigned URL
      const urlResp = await fetch(
        `${API_URL}/v3/pay/statement/excel-all?start_date=${chunkStart}&end_date=${chunkEnd}`,
        {
          headers: {
            Cookie: cookieStr,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(90000),
        }
      );
      if (!urlResp.ok) {
        console.error(`[Extrato] Chunk ${i+1}/${chunks.length}: API returned ${urlResp.status}`);
        continue;
      }
      const urlData = await urlResp.json();
      if (!urlData.success) {
        console.error(`[Extrato] Chunk ${i+1}: API error`);
        continue;
      }
      const s3Url = urlData?.data?.url;
      if (!s3Url) {
        console.error(`[Extrato] Chunk ${i+1}: No S3 URL`);
        continue;
      }

      // Step 2: Download XLSX
      const xlsxResp = await fetch(s3Url, {
        signal: AbortSignal.timeout(180000),
      });
      if (!xlsxResp.ok) {
        console.error(`[Extrato] Chunk ${i+1}: XLSX download failed ${xlsxResp.status}`);
        continue;
      }
      const xlsxBuffer = await xlsxResp.arrayBuffer();

      // Step 3: Parse XLSX
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(xlsxBuffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      if (rows.length === 0) continue;

      // Step 4: Transform and insert (REPLACE-BY-RANGE)
      const colMap: Record<string, string> = {
        'Data': 'data',
        'Hora': 'hora',
        'Código de Transação': 'codigo_transacao',
        'Número do Cartão': 'numero_cartao',
        'Grupo': 'grupo',
        'Usuário': 'usuario',
        'Tipo': 'tipo',
        'Descrição': 'descricao',
        'Valor': 'valor',
        'Status': 'status',
        'ID da Despesa': 'id_despesa',
        'ID do Relatório': 'id_relatorio',
        'Tipo de Despesa': 'tipo_despesa',
        'Centro de Custo': 'centro_custo',
        'Projeto': 'projeto',
        'Percentual de projeto': 'percentual_projeto',
      };

      // Delete existing range
      await db`DELETE FROM extrato_movimentacao WHERE data BETWEEN ${chunkStart} AND ${chunkEnd}`;

      // Transform all rows first, then batch insert
      const batch: any[][] = [];
      for (const row of rows) {
        const transformed: Record<string, any> = {};
        for (const [xlsxCol, dbCol] of Object.entries(colMap)) {
          if (row[xlsxCol] !== undefined && row[xlsxCol] !== null) {
            transformed[dbCol] = row[xlsxCol];
          }
        }
        // Convert date: can be JS Date (cellDates:true) or Excel serial number or string
        let dataValue = transformed.data;
        if (dataValue instanceof Date) {
          dataValue = dataValue.toISOString().slice(0, 10);
        } else if (typeof dataValue === 'number') {
          const date = new Date(Date.UTC(1899, 11, 30) + dataValue * 86400000);
          dataValue = date.toISOString().slice(0, 10);
        } else if (typeof dataValue === 'string' && /^\d+$/.test(dataValue)) {
          const serial = parseInt(dataValue, 10);
          const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
          dataValue = date.toISOString().slice(0, 10);
        }
        const isSnapshot = !transformed.tipo || transformed.tipo === '' || transformed.hora === '-';
        let valor = transformed.valor;
        if (typeof valor === 'string') {
          valor = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
        }

        batch.push([
          dataValue || null,
          transformed.hora || null,
          transformed.codigo_transacao || null,
          transformed.numero_cartao || null,
          transformed.grupo || null,
          transformed.usuario || null,
          transformed.tipo || null,
          transformed.descricao || null,
          valor || null,
          transformed.status || null,
          transformed.id_despesa || null,
          transformed.id_relatorio || null,
          transformed.tipo_despesa || null,
          transformed.centro_custo || null,
          transformed.projeto || null,
          transformed.percentual_projeto || null,
          isSnapshot,
        ]);
      }

      // Batch insert using multi-row VALUES in a single query
      // neon() tagged template supports parameterized queries with many values
      const SUB_BATCH = 100;
      for (let j = 0; j < batch.length; j += SUB_BATCH) {
        const sub = batch.slice(j, j + SUB_BATCH);
        // Build VALUES clause with parameterized placeholders
        const valueGroups: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;
        for (const row of sub) {
          const placeholders: string[] = [];
          for (const val of row) {
            placeholders.push(`$${paramIdx++}`);
            params.push(val);
          }
          valueGroups.push(`(${placeholders.join(', ')})`);
        }
        const query = `INSERT INTO extrato_movimentacao
            (data, hora, codigo_transacao, numero_cartao, grupo, usuario, tipo,
             descricao, valor, status, id_despesa, id_relatorio, tipo_despesa,
             centro_custo, projeto, percentual_projeto, is_snapshot)
           VALUES ${valueGroups.join(', ')}
           ON CONFLICT (data, hora, codigo_transacao, is_snapshot) WHERE codigo_transacao IS NOT NULL DO NOTHING`;
        await db.query(query, params);
      }
      totalRows += batch.length;

      console.log(`[Extrato] Chunk ${i+1}/${chunks.length}: ${rows.length} rows inserted`);
    } catch (err) {
      console.error(`[Extrato] Chunk ${i+1} error:`, err);
      // Continue to next chunk — partial download is OK
    }
  }

  return { chunks_processed: chunks.length, total_rows: totalRows, period: `${startDate} to ${endDate}` };
}

/** Step 0b: Refresh cadastro data — merge API team-members with last snapshot */
export async function refreshCadastro(): Promise<Record<string, unknown>> {
  if (!sql) throw new Error('Database not available');
  if (!API_KEY) throw new Error('VEXPENSES_API_KEY not configured');
  const db = sql;

  // Fetch all team members from API
  let allMembers: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const resp = await fetch(
      `${API_URL}/v2/team-members?paginate=true&page=${page}&per_page=${perPage}`,
      {
        headers: { Authorization: API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(120000),
      }
    );
    if (!resp.ok) throw new Error(`Team members API returned ${resp.status}`);
    const data = await resp.json();
    const members = data.data || [];
    allMembers = allMembers.concat(members);

    const lastPage = data.last_page || 1;
    if (page >= lastPage) break;
    page++;
  }

  // Build CPF → active map from API
  const apiCpfActive = new Map<string, boolean>();
  for (const m of allMembers) {
    if (m.cpf) apiCpfActive.set(m.cpf, m.active !== false);
  }

  // Get the most recent cadastral data from existing snapshots
  const lastSnapshots = await db`
    SELECT DISTINCT ON (cpf)
      cpf, colaborador, situacao, status_cartao,
      regional, centro_custo, gestor, diretor
    FROM quinzena_controle_snapshot
    WHERE cpf IS NOT NULL
    ORDER BY cpf, year DESC, month DESC, quinzena DESC
  `;

  // Determine target quinzena
  const quinzenaId = getCurrentQuinzenaId();
  const [qYear, qMonth, qQuinzena] = quinzenaId.split('-');
  const year = parseInt(qYear);
  const month = parseInt(qMonth);
  const quinzena = parseInt(qQuinzena);

  // Delete existing API-source snapshot for this quinzena
  await db`
    DELETE FROM quinzena_controle_snapshot
    WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      AND import_source = 'api'
  `;

  let upserted = 0;
  for (const snap of lastSnapshots) {
    // Update situacao based on API active status
    const apiActive = apiCpfActive.get(snap.cpf);
    const situacao = apiActive === false ? 'INATIVO' : (snap.situacao || 'ATIVO');

    await db`
      INSERT INTO quinzena_controle_snapshot
        (year, month, quinzena, cpf, colaborador, situacao, status_cartao,
         regional, centro_custo, gestor, diretor,
         saldo_prestacao, saldo_cartao, saldo_final,
         import_source, imported_at)
      VALUES (
        ${year}, ${month}, ${quinzena},
        ${snap.cpf},
        ${snap.colaborador},
        ${situacao},
        ${snap.status_cartao},
        ${snap.regional},
        ${snap.centro_custo},
        ${snap.gestor},
        ${snap.diretor},
        0, 0, 0,
        'api', NOW()
      )
      ON CONFLICT (year, month, quinzena, cpf) DO NOTHING
    `;
    upserted++;
  }

  return {
    team_members_api: allMembers.length,
    cadastro_from_last_snapshot: lastSnapshots.length,
    upserted,
    quinzena: quinzenaId,
  };
}

/** Step 1: Refresh all report statuses from VExpenses API
 *  Calls VExpenses API directly to avoid middleware auth issues.
 */
export async function refreshReports(): Promise<Record<string, unknown>> {
  if (!sql) throw new Error('Database not available');
  if (!API_KEY) throw new Error('VEXPENSES_API_KEY not configured');

  // Call VExpenses API directly (not through internal route which requires auth)
  const resp = await fetch(`${API_URL}/v2/reports?include=user`, {
    headers: {
      'Authorization': API_KEY,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(300000),
  });
  if (!resp.ok) throw new Error(`VExpenses reports API returned ${resp.status}`);
  const data = await resp.json();
  const allReports: any[] = data.data || [];

  // Upsert into prestacao_reports — batch insert for performance
  let upserted = 0;
  const REPORT_BATCH = 100;
  for (let i = 0; i < allReports.length; i += REPORT_BATCH) {
    const sub = allReports.slice(i, i + REPORT_BATCH);
    const valueGroups: string[] = [];
    const params: any[] = [];
    let pIdx = 1;
    for (const r of sub) {
      const user = r.user?.data || {};
      const placeholders = Array.from({ length: 10 }, () => `$${pIdx++}`);
      valueGroups.push(`(${placeholders.join(', ')})`);
      params.push(
        r.id,
        r.name || r.description || null,
        r.status,
        r.user_id || null,
        user.name || null,
        user.cpf || null,
        JSON.stringify(r),
        r.total_value || null,
        r.created_at || null,
        r.updated_at || null
      );
    }
    const query = `INSERT INTO prestacao_reports (id, name, status, user_id, user_name, user_cpf, raw_data, total_value, created_at, updated_at)
      VALUES ${valueGroups.join(', ')}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, status = EXCLUDED.status, user_id = EXCLUDED.user_id,
        user_name = EXCLUDED.user_name, user_cpf = EXCLUDED.user_cpf,
        raw_data = EXCLUDED.raw_data, total_value = EXCLUDED.total_value,
        updated_at = EXCLUDED.updated_at`;
    await sql.query(query, params);
    upserted += sub.length;
  }

  return { reports_downloaded: allReports.length, upserted };
}

/** Step 2: Download expenses for all reports (batch, limited concurrency) */
export async function downloadExpenses(
  onProgress?: (done: number, total: number) => void
): Promise<Record<string, unknown>> {
  if (!sql) throw new Error('Database not available');
  if (!API_KEY) throw new Error('VEXPENSES_API_KEY not configured');
  const db = sql; // non-null alias for closures

  // Get all report IDs
  const reportRows = await sql`SELECT id FROM prestacao_reports ORDER BY id`;
  const reportIds: number[] = reportRows.map((r: any) => r.id);
  const total = reportIds.length;

  let done = 0;
  let totalExpenses = 0;
  const BATCH_SIZE = 5; // concurrent requests

  for (let i = 0; i < reportIds.length; i += BATCH_SIZE) {
    const batch = reportIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (rid) => {
        try {
          let resp = await fetch(`${API_URL}/v2/reports/${rid}?include=expenses`, {
            headers: { Authorization: API_KEY, Accept: 'application/json' },
            signal: AbortSignal.timeout(30000),
          });
          if (!resp.ok) {
            // Retry once after 1s
            await new Promise(r => setTimeout(r, 1000));
            resp = await fetch(`${API_URL}/v2/reports/${rid}?include=expenses`, {
              headers: { Authorization: API_KEY, Accept: 'application/json' },
              signal: AbortSignal.timeout(30000),
            });
            if (!resp.ok) return 0;
          }
          const data = await resp.json();
          const expenses = data.data?.expenses?.data || [];
          if (expenses.length === 0) return 0;

          // Insert expenses in sub-batches of 50 to avoid param limits
          const SUB_BATCH = 50;
          for (let j = 0; j < expenses.length; j += SUB_BATCH) {
            const subBatch = expenses.slice(j, j + SUB_BATCH);
            const valueGroups: string[] = [];
            const params: any[] = [];
            let pIdx = 1;
            for (const e of subBatch) {
              const placeholders = Array.from({ length: 7 }, () => `$${pIdx++}`);
              valueGroups.push(`(${placeholders.join(', ')})`);
              params.push(e.id, rid, e.value, e.date || null, e.title || e.description || null, e.status || null, JSON.stringify(e));
            }
            const query = `INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
              VALUES ${valueGroups.join(', ')}
              ON CONFLICT (id) DO UPDATE SET
                report_id = EXCLUDED.report_id, value = EXCLUDED.value, date = EXCLUDED.date,
                description = EXCLUDED.description, status = EXCLUDED.status, raw_data = EXCLUDED.raw_data`;
            await db.query(query, params);
          }
          return expenses.length;
        } catch (err: any) {
          console.error(`[downloadExpenses] Report ${rid} failed:`, err?.message || err);
          return 0;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') totalExpenses += r.value;
    }
    done += batch.length;
    onProgress?.(done, total);
  }

  return { reports_processed: done, total_expenses: totalExpenses };
}

/** Step 3: Create somase snapshot from current API data.
 *  Also snapshots the previous quinzena if it doesn't have one yet,
 *  so the delta calculation (somase_atual - somase_prev) is temporally consistent. */
export async function snapshotSomase(quinzenaId: string): Promise<Record<string, unknown>> {
  if (!sql) throw new Error('Database not available');

  // Check if previous quinzena has a snapshot — if not, create it too
  const prevQuinzenaId = getPreviousQuinzenaId(quinzenaId);
  const prevCheck = await sql`SELECT COUNT(*) as cnt FROM somase_snapshots WHERE quinzena = ${prevQuinzenaId}`;
  const prevExists = prevCheck[0]?.cnt > 0;
  const prevSnapshotted = !prevExists ? await snapshotSingleQuinzena(prevQuinzenaId) : 0;

  // Also create expense_snapshots for previous quinzena if missing
  let prevExpenseSnaps = 0;
  if (!prevExists || !((await sql`SELECT COUNT(*) as cnt FROM prestacao_expense_snapshots WHERE quinzena = ${prevQuinzenaId}`)[0]?.cnt > 0)) {
    prevExpenseSnaps = await snapshotExpenseSnapshots(prevQuinzenaId);
  }

  // Snapshot the current quinzena
  const inserted = await snapshotSingleQuinzena(quinzenaId);

  // Snapshot prestacao_expense_snapshots for current quinzena
  const snapInserted = await snapshotExpenseSnapshots(quinzenaId);

  return {
    somase_cpfs: inserted,
    somase_total: (await sql`SELECT SUM(total) as t FROM somase_snapshots WHERE quinzena = ${quinzenaId}`)[0]?.t || 0,
    expense_snapshots: snapInserted,
    prev_quinzena: prevQuinzenaId,
    prev_quinzena_snapshotted: prevSnapshotted > 0,
    prev_quinzena_expense_snapshots: prevExpenseSnaps,
  };
}

/** Helper: snapshot a single quinzena's somase from current APROVADO+ENVIADO data (cumulative, filtered by cutoff) */
async function snapshotSingleQuinzena(quinzenaId: string): Promise<number> {
  if (!sql) throw new Error('Database not available');

  const cutoff = getQuinzenaCutoff(quinzenaId);

  // Fetch valid report IDs (exclude FATURA/CARTAO by name, same as quinzena-complete route)
  const reportRows = await sql`
    SELECT r.id, r.name
    FROM prestacao_reports r
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND COALESCE((r.raw_data->>'approval_date')::timestamp, r.updated_at, '1970-01-01'::timestamp) <= ${cutoff + ' 23:59:59'}
  `;
  const validReportIds = reportRows
    .filter((r: { id: number; name: string }) => !isFaturaOrCartao(r.name || ''))
    .map((r: { id: number }) => r.id);

  if (validReportIds.length === 0) return 0;

  await sql`DELETE FROM somase_snapshots WHERE quinzena = ${quinzenaId}`;
  const insertResult = await sql`
    INSERT INTO somase_snapshots (quinzena, user_cpf, total)
    SELECT ${quinzenaId}, pr.user_cpf, SUM(pe.value) as total
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pr.id = ANY(${validReportIds})
      AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
    GROUP BY pr.user_cpf
    ON CONFLICT (quinzena, user_cpf) DO UPDATE SET total = EXCLUDED.total
    RETURNING 1
  `;
  return insertResult.length;
}

/** Helper: snapshot expense_snapshots for a single quinzena using INSERT...SELECT (cumulative, filtered by cutoff) */
async function snapshotExpenseSnapshots(quinzenaId: string): Promise<number> {
  if (!sql) throw new Error('Database not available');

  const cutoff = getQuinzenaCutoff(quinzenaId);

  // Fetch valid report IDs (exclude FATURA/CARTAO by name, same as quinzena-complete route)
  const reportRows = await sql`
    SELECT r.id, r.name
    FROM prestacao_reports r
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND COALESCE((r.raw_data->>'approval_date')::timestamp, r.updated_at, '1970-01-01'::timestamp) <= ${cutoff + ' 23:59:59'}
  `;
  const validReportIds = reportRows
    .filter((r: { id: number; name: string }) => !isFaturaOrCartao(r.name || ''))
    .map((r: { id: number }) => r.id);

  if (validReportIds.length === 0) return 0;

  await sql`DELETE FROM prestacao_expense_snapshots WHERE quinzena = ${quinzenaId}`;
  const snapResult = await sql`
    INSERT INTO prestacao_expense_snapshots (id, quinzena, value, user_cpf)
    SELECT pe.id, ${quinzenaId}, pe.value, pr.user_cpf
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE pr.id = ANY(${validReportIds})
      AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
    ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value, user_cpf = EXCLUDED.user_cpf
    RETURNING 1
  `;
  return snapResult.length;
}

/** Run the full pipeline for a quinzena */
export async function runPipeline(
  quinzenaId: string,
  trigger: 'auto' | 'manual' = 'manual',
  onProgress?: (step: PipelineStep, message: string) => void
): Promise<{ success: boolean; results: Record<string, unknown> }> {
  const results: Record<string, unknown> = {};
  const steps: PipelineStep[] = ['download_extrato', 'refresh_cadastro', 'refresh_reports', 'download_expenses', 'snapshot_somase'];

  for (const step of steps) {
    onProgress?.(step, 'Iniciando...');
    const rowId = await recordStepStart(quinzenaId, step, trigger);

    try {
      let meta: Record<string, unknown> = {};
      switch (step) {
        case 'download_extrato':
          meta = await downloadExtrato((chunk, total) => {
            onProgress?.(step, `Chunk ${chunk}/${total}`);
          });
          break;
        case 'refresh_cadastro':
          meta = await refreshCadastro();
          break;
        case 'refresh_reports':
          meta = await refreshReports();
          break;
        case 'download_expenses':
          meta = await downloadExpenses((done, total) => {
            onProgress?.(step, `${done}/${total} reports processados`);
          });
          break;
        case 'snapshot_somase':
          meta = await snapshotSomase(quinzenaId);
          break;
      }
      results[step] = meta;
      await recordStepFinish(rowId, 'success', null, meta);
      onProgress?.(step, 'Concluído');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results[step] = { error: errorMsg };
      await recordStepFinish(rowId, 'failed', errorMsg);
      onProgress?.(step, `Erro: ${errorMsg}`);
      // Continue to next step instead of stopping
    }
  }

  return { success: true, results };
}
