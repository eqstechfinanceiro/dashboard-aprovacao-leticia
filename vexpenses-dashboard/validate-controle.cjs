const XLSX = require('xlsx');
const fs = require('fs');

const CONTROLE_FILE = 'C:\\Users\\italo.medrado\\Desktop\\Projects\\planilha de carga\\data\\CONTROLE - VEXPENSES - JULHO 2026.xlsx';
const API_URL = 'http://localhost:3000';

async function main() {
  // 1. Read CONTROLE PAINEL sheet
  console.log('Reading CONTROLE file...');
  const wb = XLSX.readFile(CONTROLE_FILE);
  console.log('Sheet names:', wb.SheetNames);

  // Find PAINEL sheet
  const painelSheet = wb.SheetNames.find(n => n.toUpperCase().includes('PAINEL'));
  if (!painelSheet) {
    console.log('No PAINEL sheet found. Available:', wb.SheetNames);
    process.exit(1);
  }
  console.log('Using sheet:', painelSheet);

  const ws = wb.Sheets[painelSheet];
  console.log('Range:', ws['!ref']);

  // Read as array of arrays
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  console.log('Total rows:', rows.length);

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    if (row && row.some(c => String(c || '').toUpperCase().includes('COLABORADOR'))) {
      headerIdx = i;
      break;
    }
  }
  console.log('Header at row', headerIdx);

  if (headerIdx === -1) {
    console.log('First 5 rows:');
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      console.log(`  Row ${i}:`, JSON.stringify(rows[i]?.slice(0, 8)));
    }
    process.exit(1);
  }

  const headers = rows[headerIdx].map(h => String(h || '').toUpperCase().trim());
  console.log('Headers:', headers);

  // Find key columns
  const colIdx = {
    colaborador: headers.findIndex(h => h.includes('COLABORADOR')),
    cpf: headers.findIndex(h => h === 'CPF' || h.includes('CPF')),
    carga: headers.findIndex(h => h === 'CARGA'),
    transferencia: headers.findIndex(h => h.includes('TRANSFER')),
    tarifa: headers.findIndex(h => h.includes('TARIFA')),
    prestacao: headers.findIndex(h => h.includes('PRESTA') && !h.includes('SALDO')),
    saldo_prestacao: headers.findIndex(h => h.includes('SALDO') && h.includes('PRESTA') && !h.includes('CARTAO')),
    saldo_cartao: headers.findIndex(h => h.includes('SALDO') && h.includes('CARTAO')),
    saldo_final: headers.findIndex(h => h.includes('SALDO') && h.includes('FINAL') && !h.includes('CARGA') && !h.includes('CARTAO')),
    carga_final: headers.findIndex(h => h.includes('CARGA') && h.includes('FINAL')),
    reembolso: headers.findIndex(h => h.includes('REEMBOLSO')),
    saldo_reembolsar: headers.findIndex(h => h.includes('REEMBOLSAR')),
  };

  console.log('Column indices:', colIdx);

  // Read CONTROLE data into map by CPF
  const controleMap = new Map();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cpf = String(row[colIdx.cpf] || '').replace(/\D/g, '').padStart(11, '0');
    if (!cpf || cpf === '00000000000') continue;
    const colaborador = String(row[colIdx.colaborador] || '').trim();
    if (!colaborador || colaborador.toUpperCase() === 'TOTAL') continue;

    const getNum = (idx) => {
      if (idx === -1) return 0;
      const v = row[idx];
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return v;
      // Brazilian format: 1.234,56
      const s = String(v).trim();
      // If it has comma as decimal separator
      if (s.includes(',') && s.includes('.')) {
        // Format: 1.234,56
        const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
      } else if (s.includes(',')) {
        // Format: 1234,56
        const n = parseFloat(s.replace(',', '.'));
        return isNaN(n) ? 0 : n;
      }
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    };

    controleMap.set(cpf, {
      colaborador,
      carga: getNum(colIdx.carga),
      transferencia: getNum(colIdx.transferencia),
      tarifa: getNum(colIdx.tarifa),
      prestacao: getNum(colIdx.prestacao),
      saldo_prestacao: getNum(colIdx.saldo_prestacao),
      saldo_cartao: getNum(colIdx.saldo_cartao),
      saldo_final: getNum(colIdx.saldo_final),
    });
  }
  console.log(`Controle rows: ${controleMap.size}`);

  // 2. Authenticate then fetch API data
  console.log('\nAuthenticating...');
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'leticia@eqsengenharia.com.br', password: 'EqS@2026!' }),
  });
  const setCookie = loginRes.headers.get('set-cookie') || '';
  const tokenMatch = setCookie.match(/vexp_auth_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;
  if (!token) {
    console.log('Login failed. Set-Cookie:', setCookie.substring(0, 200));
    process.exit(1);
  }
  console.log('Login OK, token received');

  console.log('Fetching API data for 2026-06 QZ2...');
  const res = await fetch(`${API_URL}/api/quinzena-complete?year=2026&month=6&quinzena=2`, {
    headers: { Cookie: `vexp_auth_token=${token}` },
  });
  const apiData = await res.json();
  if (!apiData.data) {
    console.log('API error:', JSON.stringify(apiData).substring(0, 500));
    process.exit(1);
  }
  console.log(`API rows: ${apiData.data.length}`);
  console.log(`API stats:`, apiData.statistics);

  // 3. Compare
  const fields = ['carga', 'transferencia', 'tarifa', 'prestacao', 'saldo_prestacao', 'saldo_cartao', 'saldo_final'];
  let matched = 0;
  let total = 0;
  let bigDiffs = [];
  let fieldMatches = {};
  for (const f of fields) fieldMatches[f] = { match: 0, total: 0 };

  for (const apiRow of apiData.data) {
    const cpf = apiRow.cpf.replace(/\D/g, '').padStart(11, '0');
    const ctrlRow = controleMap.get(cpf);
    if (!ctrlRow) continue;
    total++;

    let rowMatched = true;
    for (const f of fields) {
      const apiVal = Math.round((apiRow[f] || 0) * 100) / 100;
      // CONTROLE stores transferencia and tarifa as negative; API uses absolute values
      const rawCtrl = ctrlRow[f];
      const ctrlVal = Math.round((f === 'transferencia' || f === 'tarifa' ? Math.abs(rawCtrl) : rawCtrl) * 100) / 100;
      const diff = Math.abs(apiVal - ctrlVal);
      const tolerance = Math.max(1, Math.abs(ctrlVal) * 0.01); // 1% tolerance or 1 unit

      fieldMatches[f].total++;
      if (diff <= tolerance) {
        fieldMatches[f].match++;
      } else {
        rowMatched = false;
        if (bigDiffs.length < 20) {
          bigDiffs.push({
            cpf,
            colaborador: apiRow.colaborador,
            field: f,
            api: apiVal,
            controle: ctrlVal,
            diff,
          });
        }
      }
    }
    if (rowMatched) matched++;
  }

  console.log(`\n=== COMPARISON RESULTS ===`);
  console.log(`Rows compared: ${total}`);
  console.log(`Fully matched rows: ${matched} (${(matched/total*100).toFixed(1)}%)`);
  console.log(`\nField-level match rates:`);
  for (const f of fields) {
    const fm = fieldMatches[f];
    console.log(`  ${f}: ${fm.match}/${fm.total} (${(fm.match/fm.total*100).toFixed(1)}%)`);
  }

  if (bigDiffs.length > 0) {
    console.log(`\nTop ${bigDiffs.length} biggest differences:`);
    for (const d of bigDiffs) {
      console.log(`  ${d.colaborador} (${d.cpf}): ${d.field} API=${d.api} vs CONTROLE=${d.controle} diff=${d.diff}`);
    }
  }

  // 4. Also compare totals
  console.log(`\n=== TOTALS COMPARISON ===`);
  for (const f of fields) {
    const apiTotal = apiData.data.reduce((s, r) => s + (r[f] || 0), 0);
    const ctrlTotal = [...controleMap.values()].reduce((s, r) => s + (f === 'transferencia' || f === 'tarifa' ? Math.abs(r[f]) : r[f]), 0);
    const diff = apiTotal - ctrlTotal;
    const pct = ctrlTotal !== 0 ? (diff / ctrlTotal * 100).toFixed(1) : 'N/A';
    console.log(`  ${f}: API=${apiTotal.toFixed(2)} vs CONTROLE=${ctrlTotal.toFixed(2)} diff=${diff.toFixed(2)} (${pct}%)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
