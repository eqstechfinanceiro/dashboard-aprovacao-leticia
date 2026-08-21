const https = require('https');
const XLSX = require('xlsx');
const fs = require('fs');

const API_KEY = process.env.VEXPENSES_API_KEY || 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';
const BASE_URL = 'https://api.vexpenses.com/v2';

function makeRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const url = `${BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
        
        const options = {
            headers: {
                'Authorization': API_KEY,
                'Accept': 'application/json'
            }
        };
        
        https.get(url, options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({
                        status: res.statusCode,
                        data: json
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

async function testAllCombinedFormulas() {
    console.log("=".repeat(80));
    console.log("TESTANDO TODAS AS FÓRMULAS COMBINADAS POSSÍVEIS");
    console.log("=".repeat(80));
    
    const DATA_DIR = 'C:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/data';
    
    function normCPF(v) {
        if (!v) return '';
        return String(v).replace(/\D/g, '').padStart(11, '0');
    }
    
    // Ler planilha de referência
    console.log("\nLendo planilha de referência...");
    const planilhaData = JSON.parse(fs.readFileSync(`${DATA_DIR}/../investigation-docs/analise_exaustiva_abril_1qz.json`, 'utf8'));
    
    // Ler Excel
    console.log("\nLendo Excel...");
    const workbook = XLSX.readFile(`${DATA_DIR}/CONTROLE - VEXPENSES - ABRIL- 2026.xlsb`, { type: 'file', cellDates: true });
    const painelSheet = workbook.Sheets['PAINEL'];
    const painelRows = XLSX.utils.sheet_to_json(painelSheet, { header: 1, defval: null, raw: true });
    
    const saldoCartaoSheet = workbook.Sheets['SALDO CARTAO'];
    const saldoCartaoRows = XLSX.utils.sheet_to_json(saldoCartaoSheet, { header: 1, defval: null, raw: true });
    
    // Criar mapas
    const painelMap = {};
    for (let i = 1; i < painelRows.length; i++) {
        const row = painelRows[i];
        if (!row) continue;
        const cpf = normCPF(row[2]);
        if (cpf) painelMap[cpf] = row;
    }
    
    const saldoCartaoMap = {};
    for (let i = 4; i < saldoCartaoRows.length; i++) {
        const row = saldoCartaoRows[i];
        if (!row) continue;
        
        // Lado esquerdo
        const cpfL = normCPF(row[2]);
        const valL = row[3] != null ? parseFloat(row[3]) : null;
        const datL = row[4];
        if (cpfL && valL !== null && datL) {
            const d = new Date(datL);
            const dataStr = d.toISOString().split('T')[0];
            if (!saldoCartaoMap[cpfL]) saldoCartaoMap[cpfL] = [];
            saldoCartaoMap[cpfL].push({ data: dataStr, valor: valL });
        }
        
        // Lado direito
        const cpfR = normCPF(row[10]);
        const valR = row[11] != null ? parseFloat(row[11]) : null;
        const datR = row[12];
        if (cpfR && valR !== null && datR) {
            const d = new Date(datR);
            const dataStr = d.toISOString().split('T')[0];
            if (!saldoCartaoMap[cpfR]) saldoCartaoMap[cpfR] = [];
            saldoCartaoMap[cpfR].push({ data: dataStr, valor: valR });
        }
    }
    
    Object.keys(saldoCartaoMap).forEach(cpf => {
        saldoCartaoMap[cpf].sort((a, b) => a.data.localeCompare(b.data));
    });
    
    // Buscar membros da API
    console.log("\nBuscando membros da API...");
    const membersResponse = await makeRequest('/team-members', { 
        include: 'costsCenters',
        paginate: 'false',
        per_page: '500'
    });
    
    const members = membersResponse.data.data || [];
    const memberMap = {};
    members.forEach(m => {
        const cpf = normCPF(m.cpf);
        if (cpf) memberMap[cpf] = m;
    });
    
    // Buscar expenses de abril 1QZ
    console.log("\nBuscando expenses de abril 1QZ...");
    const expensesResponse = await makeRequest('/expenses', {
        search: 'created_at:2026-04-01,2026-04-15',
        searchFields: 'created_at:between',
        include: 'paymentMethod',
        paginate: 'false',
        per_page: '5000'
    });
    
    const expenses = expensesResponse.data.data || [];
    
    // Agrupar expenses por user_id
    const expensesByUser = {};
    expenses.forEach(exp => {
        const uid = exp.user_id;
        if (!expensesByUser[uid]) expensesByUser[uid] = 0;
        expensesByUser[uid] += (exp.amount || exp.value || 0);
    });
    
    // Testar TODAS as fórmulas possíveis
    console.log("\n" + "=".repeat(80));
    console.log("TESTANDO FÓRMULAS EM TODOS OS USUÁRIOS");
    console.log("=".repeat(80));
    
    const formulas = [
        { nome: 'col18', calc: (p, api, sc) => p[18] },
        { nome: 'col19', calc: (p, api, sc) => p[19] },
        { nome: 'col18 + api', calc: (p, api, sc) => p[18] + api },
        { nome: 'col19 + api', calc: (p, api, sc) => p[19] + api },
        { nome: 'col20 - api', calc: (p, api, sc) => p[20] - api },
        { nome: 'col21 - api', calc: (p, api, sc) => p[21] - api },
        { nome: 'col20 - api - sc', calc: (p, api, sc) => p[20] - api - sc },
        { nome: 'col21 - api - sc', calc: (p, api, sc) => p[21] - api - sc },
        { nome: 'col18 + sc', calc: (p, api, sc) => p[18] + sc },
        { nome: 'col19 + sc', calc: (p, api, sc) => p[19] + sc },
        { nome: 'col18 - sc', calc: (p, api, sc) => p[18] - sc },
        { nome: 'col19 - sc', calc: (p, api, sc) => p[19] - sc },
        { nome: 'api - sc', calc: (p, api, sc) => api - sc },
        { nome: 'sc - api', calc: (p, api, sc) => sc - api },
        { nome: 'col20 - sc', calc: (p, api, sc) => p[20] - sc },
        { nome: 'col21 - sc', calc: (p, api, sc) => p[21] - sc },
        { nome: '(col20 - api) - sc', calc: (p, api, sc) => (p[20] - api) - sc },
        { nome: '(col21 - api) - sc', calc: (p, api, sc) => (p[21] - api) - sc },
        { nome: 'col20 - (api + sc)', calc: (p, api, sc) => p[20] - (api + sc) },
        { nome: 'col21 - (api + sc)', calc: (p, api, sc) => p[21] - (api + sc) },
        { nome: 'col18 + (col20 - api)', calc: (p, api, sc) => p[18] + (p[20] - api) },
        { nome: 'col19 + (col20 - api)', calc: (p, api, sc) => p[19] + (p[20] - api) },
        { nome: 'col18 + (col20 - api - sc)', calc: (p, api, sc) => p[18] + (p[20] - api - sc) },
        { nome: 'col19 + (col20 - api - sc)', calc: (p, api, sc) => p[19] + (p[20] - api - sc) },
    ];
    
    const resultados = [];
    
    formulas.forEach(f => {
        let matches = 0;
        let total = 0;
        
        for (const usuarioPlanilha of planilhaData) {
            const cpf = normCPF(usuarioPlanilha.cpf);
            const painel = painelMap[cpf];
            const member = memberMap[cpf];
            
            if (painel && member) {
                total++;
                try {
                    const saldoFinalAlvo = usuarioPlanilha.camposFinanceiros['SALDO FINAL'];
                    const expensesAPI = expensesByUser[member.id] || 0;
                    
                    // Buscar saldo cartão mais próximo
                    let saldoCartao = 0;
                    const saldos = saldoCartaoMap[cpf] || [];
                    const dataAlvo = '2026-04-15';
                    for (let i = saldos.length - 1; i >= 0; i--) {
                        if (saldos[i].data <= dataAlvo) {
                            saldoCartao = saldos[i].valor;
                            break;
                        }
                    }
                    if (saldoCartao === 0 && saldos.length > 0) {
                        saldoCartao = saldos[0].valor;
                    }
                    
                    const valorCalculado = f.calc(painel, expensesAPI, saldoCartao);
                    const diff = Math.abs(valorCalculado - saldoFinalAlvo);
                    
                    if (diff < 0.01) {
                        matches++;
                    }
                } catch (e) {
                    // Ignorar erros
                }
            }
        }
        
        if (total > 0) {
            const precisao = (matches / total * 100).toFixed(2);
            resultados.push({
                formula: f.nome,
                matches,
                total,
                precisao: parseFloat(precisao)
            });
        }
    });
    
    // Ordenar por precisão
    resultados.sort((a, b) => b.precisao - a.precisao);
    
    console.log("\nResultados (fórmulas com melhor precisão):");
    resultados.slice(0, 10).forEach(r => {
        console.log(`  ${r.formula}: ${r.matches}/${r.total} (${r.precisao}%)`);
    });
    
    if (resultados.length > 0) {
        const melhor = resultados[0];
        console.log(`\nMelhor fórmula: ${melhor.formula} (${melhor.precisao}%)`);
    }
}

testAllCombinedFormulas().catch(console.error);