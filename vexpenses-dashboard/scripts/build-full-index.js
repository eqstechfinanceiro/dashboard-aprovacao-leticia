/**
 * Constrói um índice completo de todos os dados das planilhas (todos os períodos).
 * Resultado: planilha-full-index.json
 * 
 * Estrutura do índice:
 * {
 *   quinzenas:  { "CPF": { "YYYY-MM-1": valor, "YYYY-MM-2": valor } },
 *   saldoCartao:{ "CPF": [{ data, valor }] },
 *   adicionais: { "CPF": { "YYYY-MM": valor } },
 *   extrato:    { "CPF": { "YYYY-MM-1": {carga,descarga,tarifa}, ... } },
 *   statusCartao:{ "EMAIL": status, "NAME": status },
 * }
 */
const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readXlsx(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  return XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true, raw: true });
}

function sheetToRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

function normCPF(v) {
  if (!v) return '';
  return String(v).replace(/\D/g, '').padStart(11, '0');
}

function normName(v) {
  if (!v) return '';
  return String(v).toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function dateToStr(d) {
  if (!d) return '';
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return String(d);
}

const MONTH_MAP = {
  JANEIRO:1, FEVEREIRO:2, MARCO:3, ABRIL:4, MAIO:5, JUNHO:6,
  JULHO:7, AGOSTO:8, SETEMBRO:9, OUTUBRO:10, NOVEMBRO:11, DEZEMBRO:12
};

function monthNum(s) {
  if (!s) return null;
  const k = String(s).toUpperCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return MONTH_MAP[k] || null;
}

// ============================================================
console.log('Lendo planilha 1 (1QZ ABRIL 2026)...');
const wb1 = readXlsx('1QZ ABRIL 2026 - VEXPENSES (1).xlsx');

// STATUS DO CARTAO - Planilha3
const statusCartao = {};
['Planilha3','Planilha2','Planilha1'].forEach(tabName => {
  const ws = wb1.Sheets[tabName];
  if (!ws) return;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const header = rows[0] || [];
  const nameIdx  = header.findIndex(h => String(h||'').includes('Nome'));
  const emailIdx = header.findIndex(h => String(h||'').includes('E-mail') || String(h||'').includes('Email'));
  const statusIdx= header.findIndex(h => String(h||'').includes('Status'));
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name   = nameIdx  >= 0 ? normName(row[nameIdx])  : '';
    const email  = emailIdx >= 0 ? String(row[emailIdx]||'').toLowerCase().trim() : '';
    const status = statusIdx >= 0 ? String(row[statusIdx]||'') : '';
    if (name)  statusCartao[name]  = status;
    if (email) statusCartao[email] = status;
  }
});
console.log(`  Status cartão: ${Object.keys(statusCartao).length} entradas`);

// ============================================================
console.log('Lendo CONTROLE VEXPENSES ABRIL 2026...');
const wb2 = readXlsx('CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb');

// ── QUINZENAS ────────────────────────────────────────────────
console.log('  Processando QUINZENAS...');
const quinzenas = {};
{
  const rows = sheetToRows(wb2.Sheets['QUINZENAS']);
  // Header na linha 2 (idx 1)
  const h = rows[1] || [];
  const cpfIdx   = h.findIndex(x => String(x||'').includes('CPF'));
  const valorIdx = h.findIndex(x => String(x||'').includes('VALOR') || String(x||'').includes('Valor'));
  const qzIdx    = h.findIndex(x => String(x||'').includes('QUINZENA'));
  const mesIdx   = h.findIndex(x => String(x||'').includes('M'));
  const anoIdx   = h.findIndex(x => String(x||'').toUpperCase() === 'ANO');

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cpf    = normCPF(row[cpfIdx]);
    const valor  = parseFloat(row[valorIdx]) || 0;
    const qzStr  = String(row[qzIdx]||'').trim();
    // Apenas 1ª QZ e 2ª QZ — ignorar ITAU, ADICIONAIS, etc.
    const is1QZ  = qzStr.startsWith('1');
    const is2QZ  = qzStr.startsWith('2');
    if (!is1QZ && !is2QZ) continue;
    const qz     = is2QZ ? 2 : 1;
    const mes    = monthNum(row[mesIdx]);
    const ano    = parseInt(row[anoIdx]) || 0;
    if (!cpf || !mes || !ano) continue;
    const key = `${ano}-${String(mes).padStart(2,'0')}-${qz}`;
    if (!quinzenas[cpf]) quinzenas[cpf] = {};
    quinzenas[cpf][key] = valor;
  }
}
console.log(`  Quinzenas: ${Object.keys(quinzenas).length} usuários`);

// ── SALDO CARTAO ─────────────────────────────────────────────
console.log('  Processando SALDO CARTAO...');
const saldoCartaoIdx = {};
{
  const rows = sheetToRows(wb2.Sheets['SALDO CARTAO']);
  // Lado esquerdo: cols B-F (idx 1-5): CPF, VALOR, DATA, MÊS, EMPRESA
  // Lado direito: cols J-M (idx 9-12): CPF, VALOR, DATA
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Esquerdo
    const cpfL = normCPF(row[2]);
    const valL = row[3] != null ? parseFloat(row[3]) : null;
    const datL = row[4];
    if (cpfL && valL !== null && datL) {
      const d = dateToStr(datL);
      if (d) {
        if (!saldoCartaoIdx[cpfL]) saldoCartaoIdx[cpfL] = [];
        saldoCartaoIdx[cpfL].push({ data: d, valor: valL });
      }
    }

    // Direito
    const cpfR = normCPF(row[10]);
    const valR = row[11] != null ? parseFloat(row[11]) : null;
    const datR = row[12];
    if (cpfR && valR !== null && datR) {
      const d = dateToStr(datR);
      if (d) {
        if (!saldoCartaoIdx[cpfR]) saldoCartaoIdx[cpfR] = [];
        saldoCartaoIdx[cpfR].push({ data: d, valor: valR });
      }
    }
  }
  // Deduplicate per CPF+data (keep latest entry)
  for (const cpf of Object.keys(saldoCartaoIdx)) {
    const seen = new Map();
    saldoCartaoIdx[cpf].forEach(e => {
      if (!seen.has(e.data) || e.valor !== seen.get(e.data)) {
        seen.set(e.data, e.valor);
      }
    });
    saldoCartaoIdx[cpf] = Array.from(seen.entries()).map(([data, valor]) => ({ data, valor }));
    saldoCartaoIdx[cpf].sort((a, b) => a.data.localeCompare(b.data));
  }
}
console.log(`  Saldo Cartão: ${Object.keys(saldoCartaoIdx).length} usuários`);

// ── ADICIONAIS ───────────────────────────────────────────────
console.log('  Processando ADICIONAIS...');
const adicionaisIdx = {};
{
  const rows = sheetToRows(wb2.Sheets['ADICIONAIS']);
  const h = rows[1] || [];
  const cpfIdx   = h.findIndex(x => String(x||'').includes('CPF'));
  const valorIdx = h.findIndex(x => String(x||'').toUpperCase().includes('VALOR'));
  const mesIdx   = h.findIndex(x => String(x||'').includes('M'));
  const anoIdx   = h.findIndex(x => String(x||'').toUpperCase() === 'ANO');

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cpf   = normCPF(row[cpfIdx]);
    const valor = parseFloat(row[valorIdx]) || 0;
    const mes   = monthNum(row[mesIdx]);
    const ano   = parseInt(row[anoIdx]) || 0;
    if (!cpf || !mes || !ano) continue;
    const key = `${ano}-${String(mes).padStart(2,'0')}`;
    if (!adicionaisIdx[cpf]) adicionaisIdx[cpf] = {};
    adicionaisIdx[cpf][key] = (adicionaisIdx[cpf][key] || 0) + valor;
  }
}
console.log(`  Adicionais: ${Object.keys(adicionaisIdx).length} usuários`);

// ── EXTRATO ──────────────────────────────────────────────────
console.log('  Processando EXTRATO (pode demorar)...');
const extratoIdx = {};
{
  const rows = sheetToRows(wb2.Sheets['EXTRATO']);
  // Find header
  let hIdx = -1;
  for (let i = 0; i < 15; i++) {
    if (rows[i] && String(rows[i][0]||'').toUpperCase().includes('ANO')) { hIdx = i; break; }
  }
  if (hIdx >= 0) {
    const h = rows[hIdx];
    const anoIdx  = h.findIndex(x => String(x||'').toUpperCase() === 'ANO');
    const mesIdx  = h.findIndex(x => String(x||'').toUpperCase().includes('M'));
    const dataIdx = h.findIndex(x => String(x||'').toUpperCase() === 'DATA');
    const tipoIdx = h.findIndex(x => String(x||'').toUpperCase() === 'TIPO');
    const valIdx  = h.findIndex(x => String(x||'').toUpperCase() === 'VALOR');
    const cpfIdx  = h.findIndex(x => String(x||'').toUpperCase() === 'CPF');

    for (let i = hIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(v => v === null)) continue;
      const cpf  = normCPF(row[cpfIdx]);
      const tipo = String(row[tipoIdx]||'').toUpperCase();
      const val  = parseFloat(row[valIdx]) || 0;
      const data = row[dataIdx];
      const ano  = parseInt(row[anoIdx]) || 0;
      const mes  = monthNum(row[mesIdx]);
      if (!cpf || !tipo || !mes || !ano) continue;

      // Determine quinzena from date
      const dia = data instanceof Date ? data.getDate() : (data ? parseInt(String(data).split('-')[2]) : null);
      const qz  = (dia && dia > 15) ? 2 : 1;
      const key = `${ano}-${String(mes).padStart(2,'0')}-${qz}`;

      if (!extratoIdx[cpf]) extratoIdx[cpf] = {};
      if (!extratoIdx[cpf][key]) extratoIdx[cpf][key] = { carga: 0, descarga: 0, tarifa: 0 };

      if      (tipo === 'CARGA')    extratoIdx[cpf][key].carga    += Math.abs(val);
      else if (tipo === 'DESCARGA') extratoIdx[cpf][key].descarga += Math.abs(val);
      else if (tipo === 'TARIFA')   extratoIdx[cpf][key].tarifa   += Math.abs(val);
    }
  }
}
console.log(`  Extrato: ${Object.keys(extratoIdx).length} usuários`);

// ── PAINEL: dados mestre por CPF (centro de custo, gestor, diretor, saldo, etc.) ─
console.log('  Processando PAINEL...');
const painelData = {};
{
  const ws = wb2.Sheets['PAINEL'];
  if (ws) {
    const rows = sheetToRows(ws);
    let hIdx = -1;
    for (let i = 0; i < 15; i++) {
      const row = rows[i];
      if (row && row.some(x => String(x||'').toUpperCase().includes('CPF'))) {
        hIdx = i; break;
      }
    }
    if (hIdx >= 0) {
      const h = rows[hIdx].map(x => String(x||'').trim());
      const idx = {};
      h.forEach((k, i) => { if (k) idx[k] = i; });

      // column aliases
      const get = (row, ...keys) => {
        for (const k of keys) {
          for (const hk of Object.keys(idx)) {
            if (hk.toUpperCase().includes(k.toUpperCase())) {
              const v = row[idx[hk]];
              if (v !== null && v !== undefined) return v;
            }
          }
        }
        return null;
      };

      for (let i = hIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[idx['CPF'] ?? 2]) continue;
        const cpf = normCPF(row[idx['CPF'] ?? 2]);
        if (!cpf) continue;

        painelData[cpf] = {
          nome:          String(get(row,'COLABORADOR','PORTADOR') || '').trim(),
          empresa:       String(get(row,'EMPRESA') || '').trim(),
          situacao:      String(get(row,'SITUAÇ') || '').trim(), // SITUAÇÃO
          statusCartao:  String(get(row,'STATUS DO CART') || '').trim(),
          cartaoItau:    get(row,'CARTÃO ITAU') ?? null,
          cartaoVexp:    String(get(row,'CARTÃO VEXPENSES','CARTAO VEXPENSES') || '').trim(),
          regional:      String(get(row,'REGIONAL') || '').trim(),
          centroCusto:   String(get(row,'CENTRO DE CUSTO') || '').trim(),
          gestor:        String(get(row,'GESTOR') || '').trim(),
          diretor:       String(get(row,'DIRETOR') || '').trim(),
          carga:         parseFloat(get(row,'CARGA') ?? 0) || 0,
          descarga:      parseFloat(get(row,'DESCARGA') ?? 0) || 0,
          tarifa:        parseFloat(get(row,'TARIFA') ?? 0) || 0,
          prestacao:     parseFloat(get(row,'PRESTAÇÃO DE CONTAS','PRESTA') ?? 0) || 0,
          saldoPrestacao:parseFloat(get(row,'SALDO PRESTAÇÃO','SALDO PRESTA') ?? 0) || 0,
          saldoCartao:   parseFloat(get(row,'SALDO CARTAO','(-) SALDO CART') ?? 0) || 0,
          saldoFinal:    parseFloat(get(row,'SALDO FINAL') ?? 0) || 0,
          qz1:           parseFloat(get(row,'1ª QZ') ?? 0) || 0,
          qz2:           parseFloat(get(row,'2ª QZ') ?? 0) || 0,
          adicionais:    parseFloat(get(row,'ADICIONAIS') ?? 0) || 0,
          reembolso:     parseFloat(get(row,'REEMBOLSO') ?? 0) || 0,
          itau:          parseFloat(get(row,'ITAU') ?? 0) || 0,
          adicionalItau: parseFloat(get(row,'ADICIONAL ITAU') ?? 0) || 0,
        };
      }
    }
  }
}
console.log(`  PAINEL: ${Object.keys(painelData).length} usuários`);

// ══════════════════════════════════════════════════════════════
// Salvar índice
// ══════════════════════════════════════════════════════════════
const index = {
  generatedAt: new Date().toISOString(),
  statusCartao,
  quinzenas,
  saldoCartaoIdx,
  adicionaisIdx,
  extratoIdx,
  painelData,
  stats: {
    statusCartaoEntries: Object.keys(statusCartao).length,
    quinzenasUsers: Object.keys(quinzenas).length,
    saldoCartaoUsers: Object.keys(saldoCartaoIdx).length,
    adicionaisUsers: Object.keys(adicionaisIdx).length,
    extratoUsers: Object.keys(extratoIdx).length,
    painelUsers: Object.keys(painelData).length,
  }
};

const outPath = path.join(__dirname, 'planilha-full-index.json');
fs.writeFileSync(outPath, JSON.stringify(index), 'utf-8');
console.log(`\nÍndice salvo em: ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
console.log('Stats:', JSON.stringify(index.stats));
