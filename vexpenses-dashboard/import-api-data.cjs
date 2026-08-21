/**
 * Import V3 extrato files and web export data into the Neon DB.
 * Reads from: investigacao/api_responses/
 * - V3 extrato .xlsx files → extrato_movimentacao
 * - web export .xls files → prestacao_reports + prestacao_expenses
 * - reports_all.json → prestacao_reports (metadata)
 * - team_members_all.json → quinzena_cadastro (update with cost center info)
 */
const { Client } = require('pg');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const NEON_URL = 'postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require';
const API_RESPONSES_DIR = 'C:\\Users\\italo.medrado\\Desktop\\Projects\\planilha de carga\\investigacao\\api_responses';

function cleanCpf(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') raw = Math.floor(raw).toString();
  let s = String(raw).trim().replace(/\./g, '').replace(/-/g, '').replace(/ /g, '').replace(/\//g, '');
  if (s === '' || s === '0') return null;
  if (/^\d+$/.test(s) && s.length < 11) s = s.padStart(11, '0');
  return s;
}

function normalizeName(s) {
  if (!s) return '';
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function parseDate(raw) {
  if (!raw || raw === '') return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  // Excel serial date number (e.g., 46170 = 28/05/2026)
  if (typeof raw === 'number' && raw > 25569) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const converted = new Date(excelEpoch.getTime() + Math.floor(raw) * 86400000);
    return converted.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

async function importExtrato(client) {
  console.log('\n=== Importing V3 extrato files ===');
  
  // Check if extrato already has data
  const { rows: countRows } = await client.query('SELECT COUNT(*) as cnt FROM extrato_movimentacao');
  if (Number(countRows[0].cnt) > 0) {
    console.log(`extrato_movimentacao already has ${countRows[0].cnt} rows, skipping import`);
    return;
  }
  
  const extratoFiles = fs.readdirSync(API_RESPONSES_DIR)
    .filter(f => f.startsWith('v3_extrato_') && f.endsWith('.xlsx'))
    .sort();
  
  console.log(`Found ${extratoFiles.length} extrato files`);
  let totalRows = 0;
  
  for (const file of extratoFiles) {
    const filePath = path.join(API_RESPONSES_DIR, file);
    console.log(`  Reading ${file}...`);
    
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    
    // Find header row (contains "Data" or "DATA")
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (row && row.some(c => String(c || '').toUpperCase().includes('DATA'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      console.log(`    No header found, skipping`);
      continue;
    }
    
    const headers = rows[headerIdx].map(h => String(h || '').toUpperCase().trim());
    const colMap = {};
    headers.forEach((h, i) => {
      if (h === 'DATA') colMap.data = i;
      else if (h === 'HORA') colMap.hora = i;
      else if (h === 'CODIGO TRANSACAO' || h === 'CÓDIGO TRANSAÇÃO') colMap.codigo = i;
      else if (h === 'NUMERO CARTAO' || h === 'NÚMERO CARTÃO') colMap.cartao = i;
      else if (h === 'GRUPO') colMap.grupo = i;
      else if (h === 'USUARIO' || h === 'USUÁRIO') colMap.usuario = i;
      else if (h === 'TIPO') colMap.tipo = i;
      else if (h === 'DESCRICAO' || h === 'DESCRIÇÃO') colMap.descricao = i;
      else if (h === 'VALOR') colMap.valor = i;
      else if (h === 'STATUS') colMap.status = i;
      else if (h === 'ID DESPESA' || h === 'ID_DESPESA') colMap.id_despesa = i;
      else if (h === 'ID RELATORIO' || h === 'ID_RELATORIO') colMap.id_relatorio = i;
      else if (h === 'TIPO DESPESA' || h === 'TIPO_DESPESA') colMap.tipo_despesa = i;
      else if (h === 'CENTRO CUSTO' || h === 'CENTRO DE CUSTO') colMap.centro_custo = i;
      else if (h === 'PROJETO') colMap.projeto = i;
      else if (h === 'PERCENTUAL PROJETO' || h === 'PERCENTUAL_PROJETO') colMap.percentual = i;
    });
    
    let fileRows = 0;
    const batch = [];
    
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const data = colMap.data !== undefined ? row[colMap.data] : null;
      const hora = colMap.hora !== undefined ? String(row[colMap.hora] || '') : null;
      const tipo = colMap.tipo !== undefined ? String(row[colMap.tipo] || '') : null;
      const valor = colMap.valor !== undefined ? row[colMap.valor] : null;
      
      if (!data && !valor) continue;
      
      // Determine is_snapshot: NULL hora or '-' means snapshot
      const isSnapshot = !hora || hora === '-' || hora === '';
      
      // Format date (handle Excel serial, Brazilian dd/MM/yyyy, and Date objects)
      let dataStr = parseDate(data);
      
      batch.push([
        dataStr,
        hora || null,
        colMap.codigo !== undefined ? String(row[colMap.codigo] || '') : null,
        colMap.cartao !== undefined ? String(row[colMap.cartao] || '') : null,
        colMap.grupo !== undefined ? String(row[colMap.grupo] || '') : null,
        colMap.usuario !== undefined ? String(row[colMap.usuario] || '') : null,
        tipo,
        colMap.descricao !== undefined ? String(row[colMap.descricao] || '') : null,
        valor !== undefined && valor !== null ? Number(valor) : null,
        colMap.status !== undefined ? String(row[colMap.status] || '') : null,
        colMap.id_despesa !== undefined && row[colMap.id_despesa] ? Number(row[colMap.id_despesa]) : null,
        colMap.id_relatorio !== undefined && row[colMap.id_relatorio] ? Number(row[colMap.id_relatorio]) : null,
        colMap.tipo_despesa !== undefined ? String(row[colMap.tipo_despesa] || '') : null,
        colMap.centro_custo !== undefined ? String(row[colMap.centro_custo] || '') : null,
        colMap.projeto !== undefined ? String(row[colMap.projeto] || '') : null,
        colMap.percentual !== undefined ? String(row[colMap.percentual] || '') : null,
        isSnapshot,
      ]);
      fileRows++;
    }
    
    // Insert in batches of 1000
    for (let i = 0; i < batch.length; i += 1000) {
      const chunk = batch.slice(i, i + 1000);
      const values = chunk.map((_, idx) => {
        const base = idx * 17;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17})`;
      }).join(', ');
      const params = chunk.flat();
      
      await client.query(`
        INSERT INTO extrato_movimentacao 
        (data, hora, codigo_transacao, numero_cartao, grupo, usuario, tipo, descricao, valor, status, id_despesa, id_relatorio, tipo_despesa, centro_custo, projeto, percentual_projeto, is_snapshot)
        VALUES ${values}
      `, params);
    }
    
    totalRows += fileRows;
    console.log(`    Inserted ${fileRows} rows`);
  }
  
  console.log(`Total extrato rows imported: ${totalRows}`);
}

async function importWebExports(client) {
  console.log('\n=== Importing web export files ===');
  
  // Clear existing data (in case of partial import)
  await client.query('DELETE FROM prestacao_expenses');
  await client.query('DELETE FROM prestacao_reports');
  console.log('Cleared prestacao_reports and prestacao_expenses');
  
  const webExportFiles = fs.readdirSync(API_RESPONSES_DIR)
    .filter(f => f.startsWith('web_export_') && f.endsWith('.xls') && f !== 'vexpenses_export_test.xls')
    .sort();
  
  console.log(`Found ${webExportFiles.length} web export files`);
  
  // Also import reports_all.json for report metadata
  const reportsJsonPath = path.join(API_RESPONSES_DIR, 'reports_all.json');
  let reportsMeta = new Map();
  if (fs.existsSync(reportsJsonPath)) {
    console.log('Loading reports_all.json...');
    const reportsData = JSON.parse(fs.readFileSync(reportsJsonPath, 'utf8'));
    const reportsList = reportsData.data || reportsData;
    for (const r of reportsList) {
      reportsMeta.set(r.id, r);
    }
    console.log(`Loaded ${reportsMeta.size} report metadata entries`);
  }
  
  let totalReports = 0;
  let totalExpenses = 0;
  const seenExpenseIds = new Set(); // dedup
  
  for (const file of webExportFiles) {
    const filePath = path.join(API_RESPONSES_DIR, file);
    console.log(`  Reading ${file}...`);
    
    let workbook;
    try {
      workbook = XLSX.readFile(filePath, { cellDates: true });
    } catch (e) {
      console.log(`    Error reading: ${e.message}`);
      continue;
    }
    
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    
    // Find header row
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      if (row && row.some(c => String(c || '').includes('ID da Despesa'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      console.log(`    No header found, skipping`);
      continue;
    }
    
    const headers = rows[headerIdx].map(h => String(h || '').trim());
    const colMap = {};
    headers.forEach((h, i) => {
      const hu = h.toUpperCase();
      if (h === 'ID da Despesa') colMap.expense_id = i;
      else if (h === 'ID do Relatório') colMap.report_id = i;
      else if (hu === 'NOME DO RELATÓRIO' || hu === 'NOME DO RELATORIO') colMap.report_name = i;
      else if (hu === 'NOME DO MEMBRO DE EQUIPE') colMap.user_name = i;
      else if (h === 'CPF/CNPJ') colMap.cpf = i;
      else if (hu === 'STATUS') colMap.status = i;
      else if (hu === 'DATA') colMap.date = i;
      else if (hu === 'VALOR') colMap.value = i;
      else if (hu === 'DESCRIÇÃO DA DESPESA' || hu === 'DESCRICAO DA DESPESA') colMap.description = i;
      else if (hu === 'TIPO DE DESPESA') colMap.expense_type = i;
      else if (hu === 'REEMBOLSÁVEL' || hu === 'REEMBOLSAVEL') colMap.reimbursable = i;
      else if (hu === 'CENTRO DE CUSTOS') colMap.cost_center = i;
      else if (hu === 'FORMA DE PAGAMENTO') colMap.payment_method = i;
      else if (hu === 'DATA DE PAGAMENTO') colMap.payment_date = i;
    });
    
    // Collect unique reports and expenses
    const reportsMap = new Map(); // report_id → report data
    const expenses = [];
    
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const expenseId = colMap.expense_id !== undefined ? row[colMap.expense_id] : null;
      const reportId = colMap.report_id !== undefined ? row[colMap.report_id] : null;
      
      if (!expenseId && !reportId) continue;
      
      // Dedup by expense ID
      if (expenseId && seenExpenseIds.has(expenseId)) continue;
      if (expenseId) seenExpenseIds.add(expenseId);
      
      const reportName = colMap.report_name !== undefined ? String(row[colMap.report_name] || '') : '';
      const userName = colMap.user_name !== undefined ? String(row[colMap.user_name] || '') : '';
      const cpf = cleanCpf(colMap.cpf !== undefined ? row[colMap.cpf] : null);
      const status = colMap.status !== undefined ? String(row[colMap.status] || '') : '';
      const value = colMap.value !== undefined ? Number(row[colMap.value] || 0) : 0;
      const date = colMap.date !== undefined ? row[colMap.date] : null;
      const description = colMap.description !== undefined ? String(row[colMap.description] || '') : '';
      const paymentMethod = colMap.payment_method !== undefined ? String(row[colMap.payment_method] || '') : '';
      
      // Track reports
      if (reportId && !reportsMap.has(reportId)) {
        const meta = reportsMeta.get(reportId) || {};
        reportsMap.set(reportId, {
          id: reportId,
          name: reportName,
          status,
          user_name: userName,
          user_cpf: cpf,
          created_at: parseDate(meta.created_at) || null,
          total_value: meta.total_value || null,
        });
      }
      
      // Format date
      const dateStr = parseDate(date);
      
      expenses.push({
        id: expenseId ? Number(expenseId) : null,
        report_id: reportId ? Number(reportId) : null,
        value,
        date: dateStr,
        description,
        status,
        payment_method: paymentMethod,
      });
    }
    
    // Insert reports
    for (const [id, r] of reportsMap) {
      await client.query(`
        INSERT INTO prestacao_reports (id, name, status, user_name, user_cpf, created_at, total_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          user_name = EXCLUDED.user_name,
          user_cpf = EXCLUDED.user_cpf,
          created_at = COALESCE(EXCLUDED.created_at, prestacao_reports.created_at),
          total_value = COALESCE(EXCLUDED.total_value, prestacao_reports.total_value)
      `, [r.id, r.name, r.status, r.user_name, r.user_cpf, r.created_at, r.total_value]);
    }
    totalReports += reportsMap.size;
    
    // Insert expenses
    let expenseInserted = 0;
    for (let i = 0; i < expenses.length; i += 1000) {
      const chunk = expenses.slice(i, i + 1000);
      const values = chunk.map((_, idx) => {
        const base = idx * 6;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
      }).join(', ');
      const params = chunk.flatMap(e => [e.id, e.report_id, e.value, e.date, e.description, e.status]);
      
      await client.query(`
        INSERT INTO prestacao_expenses (id, report_id, value, date, description, status)
        VALUES ${values}
        ON CONFLICT (id) DO UPDATE SET
          report_id = EXCLUDED.report_id,
          value = EXCLUDED.value,
          date = EXCLUDED.date,
          description = EXCLUDED.description,
          status = EXCLUDED.status
      `, params);
      expenseInserted += chunk.length;
    }
    totalExpenses += expenseInserted;
    
    console.log(`    Reports: ${reportsMap.size}, Expenses: ${expenseInserted} (deduped: ${seenExpenseIds.size} total)`);
  }
  
  console.log(`Total reports imported: ${totalReports}`);
  console.log(`Total expenses imported: ${totalExpenses} (unique: ${seenExpenseIds.size})`);
}

async function updateCadastroFromTeamMembers(client) {
  console.log('\n=== Updating cadastro from team_members_all.json ===');
  const tmPath = path.join(API_RESPONSES_DIR, 'team_members_all.json');
  if (!fs.existsSync(tmPath)) {
    console.log('team_members_all.json not found, skipping');
    return;
  }
  
  const tmData = JSON.parse(fs.readFileSync(tmPath, 'utf8'));
  const members = tmData.data || tmData;
  console.log(`Found ${members.length} team members`);
  
  // Load cost centers for mapping
  const ccPath = path.join(API_RESPONSES_DIR, 'costs_centers.json');
  let ccMap = new Map();
  if (fs.existsSync(ccPath)) {
    const ccData = JSON.parse(fs.readFileSync(ccPath, 'utf8'));
    const centers = ccData.data || ccData;
    for (const cc of centers) {
      ccMap.set(cc.id, cc.name);
    }
  }
  
  let updated = 0;
  for (const m of members) {
    const cpf = cleanCpf(m.cpf);
    if (!cpf) continue;
    
    const costCenter = m.costs_center?.data?.name || ccMap.get(m.costs_center_id) || null;
    
    await client.query(`
      INSERT INTO quinzena_cadastro (cpf, colaborador, centro_custo)
      VALUES ($1, $2, $3)
      ON CONFLICT (cpf) DO UPDATE SET
        colaborador = COALESCE(EXCLUDED.colaborador, quinzena_cadastro.colaborador),
        centro_custo = COALESCE(EXCLUDED.centro_custo, quinzena_cadastro.centro_custo),
        updated_at = NOW()
    `, [cpf, m.name, costCenter]);
    updated++;
  }
  console.log(`Updated ${updated} cadastro records from team members`);
}

async function main() {
  const client = new Client({
    connectionString: NEON_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected to Neon');
  console.log('API responses dir:', API_RESPONSES_DIR);
  
  if (!fs.existsSync(API_RESPONSES_DIR)) {
    console.error('API responses directory not found!');
    process.exit(1);
  }
  
  await importExtrato(client);
  await importWebExports(client);
  await updateCadastroFromTeamMembers(client);
  
  // Verify
  console.log('\n=== Verification ===');
  for (const table of ['extrato_movimentacao', 'prestacao_reports', 'prestacao_expenses', 'quinzena_cadastro']) {
    const { rows } = await client.query(`SELECT COUNT(*) as cnt FROM ${table}`);
    console.log(`  ${table}: ${rows[0].cnt} rows`);
  }
  
  await client.end();
  console.log('\nDone! Data imported successfully.');
}

main().catch(e => { console.error(e); process.exit(1); });
