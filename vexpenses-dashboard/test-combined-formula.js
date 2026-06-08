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

async function testCombinedFormula() {
    console.log("=".repeat(80));
    console.log("TESTANDO FÓRMULAS COMBINADAS (API + EXCEL)");
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
    
    // Criar mapa CPF -> linha PAINEL
    const painelMap = {};
    for (let i = 1; i < painelRows.length; i++) {
        const row = painelRows[i];
        if (!row) continue;
        
        const cpf = normCPF(row[2]);
        if (cpf) {
            painelMap[cpf] = row;
        }
    }
    
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
    
    // Testar fórmulas combinadas para RAFAEL
    console.log("\n" + "=".repeat(80));
    console.log("TESTANDO FÓRMULAS PARA RAFAEL AMORIM VELLO");
    console.log("=".repeat(80));
    
    const rafaelPlanilha = planilhaData.find(u => u.portador === 'RAFAEL AMORIM VELLO');
    const rafaelPainel = painelMap[normCPF(rafaelPlanilha.cpf)];
    const rafaelMember = memberMap[normCPF(rafaelPlanilha.cpf)];
    
    console.log(`\nSALDO FINAL (planilha): ${rafaelPlanilha.camposFinanceiros['SALDO FINAL']}`);
    console.log(`SALDO CARTÃO (planilha): ${rafaelPlanilha.camposFinanceiros['SALDO CARTAO']}`);
    console.log(`1QZ (planilha): ${rafaelPlanilha.camposFinanceiros['1QZ DE ABRIL 26']}`);
    
    if (rafaelPainel) {
        console.log(`\nDados PAINEL:`);
        console.log(`  col16: ${rafaelPainel[16]}`);
        console.log(`  col17: ${rafaelPainel[17]}`);
        console.log(`  col18: ${rafaelPainel[18]}`);
        console.log(`  col19: ${rafaelPainel[19]}`);
        console.log(`  col20: ${rafaelPainel[20]}`);
        console.log(`  col21: ${rafaelPainel[21]}`);
        console.log(`  col22: ${rafaelPainel[22]}`);
        console.log(`  col25: ${rafaelPainel[25]}`);
    }
    
    if (rafaelMember) {
        const expensesAPI = expensesByUser[rafaelMember.id] || 0;
        console.log(`\nDados API:`);
        console.log(`  Expenses abril 1QZ: ${expensesAPI}`);
        console.log(`  User ID: ${rafaelMember.id}`);
    }
    
    // Testar fórmulas combinadas
    const formulas = [
        { nome: 'col18 + expensesAPI', calc: (p, api) => p[18] + api },
        { nome: 'col19 + expensesAPI', calc: (p, api) => p[19] + api },
        { nome: 'col20 - expensesAPI', calc: (p, api) => p[20] - api },
        { nome: 'col21 - expensesAPI', calc: (p, api) => p[21] - api },
        { nome: 'col18 - expensesAPI', calc: (p, api) => p[18] - api },
        { nome: 'col19 - expensesAPI', calc: (p, api) => p[19] - api },
        { nome: '(col20 - col25) + expensesAPI', calc: (p, api) => (p[20] - p[25]) + api },
        { nome: '(col21 - col25) + expensesAPI', calc: (p, api) => (p[21] - p[25]) + api },
        { nome: 'col18 + (col20 - expensesAPI)', calc: (p, api) => p[18] + (p[20] - api) },
        { nome: 'col19 + (col20 - expensesAPI)', calc: (p, api) => p[19] + (p[20] - api) },
    ];
    
    const saldoFinalAlvo = rafaelPlanilha.camposFinanceiros['SALDO FINAL'];
    const expensesAPI = rafaelMember ? expensesByUser[rafaelMember.id] || 0 : 0;
    
    console.log("\nTestando fórmulas combinadas:");
    formulas.forEach(f => {
        try {
            const resultado = f.calc(rafaelPainel, expensesAPI);
            const diff = Math.abs(resultado - saldoFinalAlvo);
            console.log(`  ${f.nome}: ${resultado.toFixed(2)} (diff: ${diff.toFixed(2)})`);
        } catch (e) {
            console.log(`  ${f.nome}: ERRO - ${e.message}`);
        }
    });
}

testCombinedFormula().catch(console.error);