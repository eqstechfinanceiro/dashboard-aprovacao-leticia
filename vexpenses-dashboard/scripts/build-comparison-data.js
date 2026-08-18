/**
 * Script para extrair todos os dados necessários das planilhas e gerar JSONs
 * para uso na comparação com a API VExpenses.
 * 
 * Extrai de:
 * 1. 1QZ ABRIL 2026: tab principal + Planilha3 (STATUS DO CARTAO)
 * 2. CONTROLE: QUINZENAS (1QZ valor), SALDO CARTAO, EXTRATO, ADICIONAIS
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_DIR = __dirname;

function readXlsx(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const buf = fs.readFileSync(filePath);
  return XLSX.read(buf, { type: 'buffer', cellDates: true, raw: true });
}

function sheetToRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

function sheetToObjects(ws, headerRowIndex) {
  const rows = sheetToRows(ws);
  const headers = rows[headerRowIndex];
  const result = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(v => v === null || v === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[String(h).trim()] = row[idx];
    });
    result.push(obj);
  }
  return result;
}

function normalizeName(name) {
  if (!name) return '';
  return String(name).toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeCPF(cpf) {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '').padStart(11, '0');
}

function dateToStr(d) {
  if (!d) return '';
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(d);
}

// ============================================================
// 1. Ler planilha 1 - tab principal (1 QZ VEXPENSES 04_2026)
// ============================================================
console.log('Lendo 1QZ ABRIL 2026...');
const wb1 = readXlsx('1QZ ABRIL 2026 - VEXPENSES (1).xlsx');
const ws1main = wb1.Sheets['1 QZ VEXPENSES 04_2026'];
const main1qz = sheetToObjects(ws1main, 4); // headers na linha 5 (idx 4)

console.log(`  Tab principal: ${main1qz.length} linhas de dados`);
console.log('  Primeiros campos:', main1qz[0] ? Object.keys(main1qz[0]).join(', ') : '(vazio)');

// ============================================================
// 2. Ler planilha 1 - Planilha3 (Status do Cartão por usuário)
// ============================================================
const wsP3 = wb1.Sheets['Planilha3'];
const statusCartao = sheetToObjects(wsP3, 0); // headers na linha 1 (idx 0)
console.log(`\nPlanilha3 (STATUS CARTAO): ${statusCartao.length} linhas`);
console.log('  Campos:', statusCartao[0] ? Object.keys(statusCartao[0]).join(', ') : '(vazio)');

// Criar mapa nome → status do cartão
const statusCartaoMap = {};
statusCartao.forEach(row => {
  const nome = normalizeName(row['Nome']);
  const status = row['Status do Cartão'] || row['Status do Cart\u00e3o'] || '';
  if (nome) {
    statusCartaoMap[nome] = status;
  }
});
console.log(`  Mapa criado: ${Object.keys(statusCartaoMap).length} usuários`);
console.log('  Exemplo:', Object.entries(statusCartaoMap).slice(0, 3).map(([k,v]) => `${k}=${v}`).join(', '));

// Adicionar STATUS DO CARTAO ao main1qz
main1qz.forEach(row => {
  const nome = normalizeName(row['PORTADOR']);
  row['STATUS DO CARTAO_API'] = statusCartaoMap[nome] || null;
});

// ============================================================
// 3. Ler planilha 2 (CONTROLE)
// ============================================================
console.log('\nLendo CONTROLE VEXPENSES ABRIL 2026...');
const wb2 = readXlsx('CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb');

// --- QUINZENAS: valor de 1QZ por usuário/mês ---
const wsQuinzenas = wb2.Sheets['QUINZENAS'];
const quinzenasRows = sheetToObjects(wsQuinzenas, 1); // header na linha 2 (idx 1)
console.log(`\nQUINZENAS: ${quinzenasRows.length} linhas`);
console.log('  Campos:', quinzenasRows[0] ? Object.keys(quinzenasRows[0]).join(', ') : '(vazio)');

// Filtrar para ABRIL 2026 e 1ª QZ
const quinzenas_abril_2026 = quinzenasRows.filter(row => {
  const mes = String(row['MÊS'] || row['M\u00cAS'] || '').toUpperCase();
  const ano = String(row['ANO'] || '');
  const qz = String(row['QUINZENA'] || '').includes('1');
  return mes === 'ABRIL' && ano === '2026' && qz;
});
console.log(`  Quinzenas Abril 2026 (1ª QZ): ${quinzenas_abril_2026.length} linhas`);
if (quinzenas_abril_2026.length > 0) {
  console.log('  Exemplo:', JSON.stringify(quinzenas_abril_2026[0]));
}

// Criar mapa CPF → valor 1QZ
const quinzenas1QZMap = {};
quinzenas_abril_2026.forEach(row => {
  const cpf = normalizeCPF(row['CPF']);
  const valor = parseFloat(row['VALOR']) || 0;
  if (cpf) quinzenas1QZMap[cpf] = valor;
});

// --- SALDO CARTAO: saldo por CPF em abril 2026 ---
const wsSaldoCartao = wb2.Sheets['SALDO CARTAO'];
const saldoCartaoRows = sheetToRows(wsSaldoCartao);
// Ler a parte DIREITA da tabela que tem dados de abril 2026
// Colunas L-P (índices 9-13): PORTADOR | CPF | VALOR | DATA
console.log(`\nSALDO CARTAO: ${saldoCartaoRows.length} linhas totais`);

const saldoCartaoMap = {};
for (let i = 4; i < saldoCartaoRows.length; i++) {
  const row = saldoCartaoRows[i];
  if (!row) continue;
  
  // Parte direita da tabela começa na coluna 9 (índice)
  const cpf = row[10] ? normalizeCPF(String(row[10])) : null;
  const valor = row[11] != null ? parseFloat(row[11]) : null;
  const data = row[12];
  
  if (cpf && valor !== null && data) {
    const dataStr = dateToStr(data);
    // Pegar apenas dados de abril 2026
    if (dataStr.startsWith('2026-04')) {
      if (!saldoCartaoMap[cpf]) {
        saldoCartaoMap[cpf] = { valor, data: dataStr };
      } else {
        // Usar data mais recente
        if (dataStr > saldoCartaoMap[cpf].data) {
          saldoCartaoMap[cpf] = { valor, data: dataStr };
        }
      }
    }
  }
}
console.log(`  Saldos de Cartão (Abril 2026): ${Object.keys(saldoCartaoMap).length} usuários`);
console.log('  Exemplos:', JSON.stringify(Object.entries(saldoCartaoMap).slice(0, 3)));

// --- ADICIONAIS: adiantamentos por CPF ---
const wsAdicionais = wb2.Sheets['ADICIONAIS'];
const adicionaisRows = sheetToObjects(wsAdicionais, 1); // header na linha 2 (idx 1)
console.log(`\nADICIONAIS: ${adicionaisRows.length} linhas`);

// Filtrar para abril 2026
const adicionais_abril_2026 = adicionaisRows.filter(row => {
  const mes = String(row['MÊS'] || row['M\u00cAS'] || '').toUpperCase();
  const ano = String(row['ANO'] || '');
  return mes === 'ABRIL' && ano === '2026';
});
console.log(`  Adicionais Abril 2026: ${adicionais_abril_2026.length} linhas`);

const adicionaisMap = {};
adicionais_abril_2026.forEach(row => {
  const cpf = normalizeCPF(row['CPF']);
  const valor = parseFloat(row['VALOR']) || 0;
  if (cpf) {
    adicionaisMap[cpf] = (adicionaisMap[cpf] || 0) + valor;
  }
});

// --- EXTRATO: transações do cartão para calcular saldo final ---
const wsExtrato = wb2.Sheets['EXTRATO'];
const extratoRows = sheetToRows(wsExtrato);
// Headers na linha 7 (idx 6): ANO | MÊS | Data | Hora | Código de Transação | Número do Cartão | Grupo | Usuário | Tipo | Descrição | Valor | CPF
console.log(`\nEXTRATO: ${extratoRows.length} linhas totais`);

// Encontrar header row
let extratoHeaderIdx = -1;
for (let i = 0; i < Math.min(15, extratoRows.length); i++) {
  if (extratoRows[i] && String(extratoRows[i][0] || '').includes('ANO')) {
    extratoHeaderIdx = i;
    break;
  }
}
console.log(`  Header encontrado na linha ${extratoHeaderIdx + 1}`);

const extratosByUser = {};
if (extratoHeaderIdx >= 0) {
  const headers = extratoRows[extratoHeaderIdx];
  console.log('  Campos:', headers.filter(h => h).join(' | '));
  
  for (let i = extratoHeaderIdx + 1; i < extratoRows.length; i++) {
    const row = extratoRows[i];
    if (!row || row.every(v => v === null)) continue;
    
    // Criar objeto com headers
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[String(h).trim()] = row[idx]; });
    
    // Filtrar abril 2026
    const ano = String(obj['ANO'] || '');
    const mes = String(obj['MÊS'] || obj['M\u00cAS'] || '').toUpperCase();
    if (ano !== '2026' || mes !== 'ABRIL') continue;
    
    // Verificar se é 1ª quinzena (dias 1-15)
    const data = obj['Data'];
    const dia = data instanceof Date ? data.getDate() : null;
    if (!dia || dia > 15) continue; // Apenas 1ª quinzena
    
    const cpf = normalizeCPF(String(obj['CPF'] || ''));
    if (!cpf) continue;
    
    const tipo = String(obj['Tipo'] || '').toUpperCase();
    const valor = parseFloat(obj['Valor'] || obj['VALOR'] || 0) || 0;
    
    if (!extratosByUser[cpf]) {
      extratosByUser[cpf] = { carga: 0, descarga: 0, tarifa: 0, entries: [] };
    }
    
    extratosByUser[cpf].entries.push({ tipo, valor, data: dateToStr(data) });
    
    if (tipo === 'CARGA') extratosByUser[cpf].carga += valor;
    else if (tipo === 'DESCARGA') extratosByUser[cpf].descarga += Math.abs(valor);
    else if (tipo === 'TARIFA') extratosByUser[cpf].tarifa += Math.abs(valor);
  }
}
console.log(`  Usuários com extrato (Abril 2026, 1ª QZ): ${Object.keys(extratosByUser).length}`);

// --- BASE PREST: despesas VExpenses para abril 1-15 2026 ---
const wsBasePrest = wb2.Sheets['BASE PREST '];
const basePrestRows = sheetToRows(wsBasePrest);
console.log(`\nBASE PREST: ${basePrestRows.length} linhas totais`);

let basePrestHeaderIdx = 2; // Header na linha 3 (idx 2)
const basePrestHeaders = basePrestRows[basePrestHeaderIdx];
console.log('  Campos relevantes:', basePrestHeaders ? basePrestHeaders.slice(0, 8).filter(h => h).join(' | ') : '');

const basePrestByUser = {};
for (let i = basePrestHeaderIdx + 1; i < basePrestRows.length; i++) {
  const row = basePrestRows[i];
  if (!row || row.every(v => v === null)) continue;
  
  const obj = {};
  basePrestHeaders.forEach((h, idx) => { if (h) obj[String(h).trim()] = row[idx]; });
  
  // Filtrar data: April 1-15, 2026
  const dataStr = String(obj['Data'] || '');
  // Formato: DD/MM/YYYY
  const parts = dataStr.split('/');
  if (parts.length !== 3) continue;
  const dia = parseInt(parts[0]);
  const mes = parseInt(parts[1]);
  const ano = parseInt(parts[2]);
  if (ano !== 2026 || mes !== 4 || dia > 15) continue;
  
  const cpf = normalizeCPF(String(obj['CPF/CNPJ'] || obj['CPF'] || ''));
  if (!cpf || cpf.length < 11) continue;
  
  const valor = parseFloat(String(obj['Valor'] || '').replace(',', '.')) || 0;
  const reembolsavel = String(obj['Reembolsável'] || '').toLowerCase() === 'sim';
  const formaPagamento = String(obj['Forma de pagamento'] || '').toLowerCase();
  
  if (!basePrestByUser[cpf]) {
    basePrestByUser[cpf] = { total: 0, reembolsavel: 0, cartao: 0, entries: [] };
  }
  
  basePrestByUser[cpf].total += valor;
  basePrestByUser[cpf].entries.push({ valor, reembolsavel, formaPagamento, data: dataStr });
  
  if (reembolsavel) basePrestByUser[cpf].reembolsavel += valor;
  if (formaPagamento.includes('cart') || formaPagamento.includes('card')) {
    basePrestByUser[cpf].cartao += valor;
  }
}
console.log(`  Usuários com despesas (Abril 1-15 2026): ${Object.keys(basePrestByUser).length}`);
if (Object.keys(basePrestByUser).length > 0) {
  const exCPF = Object.keys(basePrestByUser)[0];
  console.log('  Exemplo:', exCPF, JSON.stringify(basePrestByUser[exCPF]));
}

// ============================================================
// 4. Montar dados finais da planilha com todos os campos extras
// ============================================================
const planilha1QZFinal = main1qz.map(row => {
  const cpf = normalizeCPF(String(row['CPF'] || ''));
  
  // Dados da planilha principal
  const portador = String(row['PORTADOR'] || '').trim();
  const statusColab = String(row['STATUS COLAB'] || '').trim();
  const centroCusto = String(row['CENTRO CUSTO'] || '').trim();
  const saldoReembolsar = row['SALDO REEMBOLSAR'];
  const saldoFinal = row['SALDO FINAL'];
  const qz1 = row['1QZ DE ABRIL 26'];
  const saldoCartao = row['SALDO CARTAO'];
  const adiantamento = row['ADIANTAMENTO'];
  const cargaParcial = row['CARGA PARCIAL'];
  const reembolso = row['REEMBOLSO'];
  const cargaFinal = row['CARGA  FINAL '] || row['CARGA  FINAL'] || row['CARGA FINAL'];
  const statusCartaoSheet = row['STATUS DO CARTAO'];
  
  // Dados de fontes secundárias
  const quinzenaValor = cpf ? quinzenas1QZMap[cpf] : null;
  const saldoCartaoCtrl = cpf ? saldoCartaoMap[cpf]?.valor : null;
  const adiantamentoCtrl = cpf ? adicionaisMap[cpf] : null;
  const extratoData = cpf ? extratosByUser[cpf] : null;
  const basePrestData = cpf ? basePrestByUser[cpf] : null;
  const statusCartaoP3 = row['STATUS DO CARTAO_API'];
  
  return {
    cpf,
    portador,
    statusColab,
    centroCusto,
    sheet: {
      saldoReembolsar: saldoReembolsar ?? null,
      saldoFinal: saldoFinal ?? null,
      qz1: qz1 ?? null,
      saldoCartao: saldoCartao ?? null,
      adiantamento: adiantamento ?? null,
      cargaParcial: cargaParcial ?? null,
      reembolso: reembolso ?? null,
      cargaFinal: cargaFinal ?? null,
      statusCartao: statusCartaoSheet ?? null,
    },
    quinzenaData: quinzenaValor !== undefined ? quinzenaValor : null,
    saldoCartaoCtrl: saldoCartaoCtrl !== undefined ? saldoCartaoCtrl : null,
    adiantamentoCtrl: adiantamentoCtrl !== undefined ? adiantamentoCtrl : null,
    extratoData: extratoData || null,
    basePrestData: basePrestData || null,
    statusCartaoP3: statusCartaoP3 || null,
  };
});

console.log(`\nDados finais: ${planilha1QZFinal.length} usuários`);

// Verificar quantos têm dados de quinzena
const comQuinzena = planilha1QZFinal.filter(r => r.quinzenaData !== null).length;
const comSaldoCartao = planilha1QZFinal.filter(r => r.saldoCartaoCtrl !== null).length;
const comExtrato = planilha1QZFinal.filter(r => r.extratoData !== null).length;
const comBasePrest = planilha1QZFinal.filter(r => r.basePrestData !== null).length;
const comStatusCartao = planilha1QZFinal.filter(r => r.statusCartaoP3 !== null).length;

console.log(`  Com 1QZ da tab QUINZENAS: ${comQuinzena}`);
console.log(`  Com Saldo Cartão do CONTROLE: ${comSaldoCartao}`);
console.log(`  Com Extrato: ${comExtrato}`);
console.log(`  Com Despesas BASE PREST: ${comBasePrest}`);
console.log(`  Com Status Cartão (Planilha3): ${comStatusCartao}`);

// Salvar resultado
const output = {
  generatedAt: new Date().toISOString(),
  totalUsers: planilha1QZFinal.length,
  stats: {
    comQuinzena,
    comSaldoCartao,
    comExtrato,
    comBasePrest,
    comStatusCartao,
  },
  data: planilha1QZFinal
};

const outPath = path.join(OUT_DIR, 'planilha-1qz-enriched.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`\nSalvo em: ${outPath}`);
