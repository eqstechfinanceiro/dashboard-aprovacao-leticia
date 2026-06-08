const https = require('https');
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

async function testCorrelations() {
    console.log("=".repeat(80));
    console.log("TESTANDO CORRELAÇÕES ENTRE API E SALDOS DA PLANILHA");
    console.log("=".repeat(80));
    
    // Carregar dados da planilha
    const planilhaData = JSON.parse(fs.readFileSync('../vexpenses-dashboard/planilha-1qz-data.json', 'utf-8'));
    console.log(`\nPlanilha carregada: ${planilhaData.length} usuários`);
    
    // Selecionar alguns usuários para teste (com dados de saldo)
    const testUsers = planilhaData
        .filter(u => u['SALDO FINAL'] !== null && u['SALDO FINAL'] !== undefined && u['SALDO FINAL'] > 0)
        .slice(0, 10);
    
    console.log(`\nSelecionados ${testUsers.length} usuários para teste:`);
    testUsers.forEach(u => {
        console.log(`  - ${u['PORTADOR']}: SALDO FINAL=R$ ${u['SALDO FINAL']?.toFixed(2)}, QZ1=R$ ${u['1QZ DE ABRIL 26']?.toFixed(2)}`);
    });
    
    // Buscar team members para mapear CPF -> user_id
    console.log("\nBuscando team members...");
    const membersResponse = await makeRequest('/team-members', { 
        include: 'costsCenters',
        paginate: 'false',
        per_page: '500'
    });
    
    const members = membersResponse.data.data || [];
    console.log(`${members.length} membros encontrados`);
    
    // Criar mapa CPF -> user_id
    const cpfToUserId = new Map();
    members.forEach(m => {
        if (m.cpf) {
            const cpf = m.cpf.replace(/\D/g, '');
            cpfToUserId.set(cpf, m.id);
        }
    });
    
    // Buscar expenses de abril 2026
    console.log("\nBuscando expenses de abril 2026...");
    const expensesResponse = await makeRequest('/expenses', {
        search: 'date:2026-04-01,2026-04-30',
        searchFields: 'date:between',
        include: 'user,costs_center,payment_method',
        paginate: 'false'
    });
    
    const expenses = expensesResponse.data.data || [];
    console.log(`${expenses.length} expenses encontradas`);
    
    // Agrupar expenses por user_id
    const expensesByUser = new Map();
    expenses.forEach(exp => {
        const uid = exp.user_id;
        if (!expensesByUser.has(uid)) {
            expensesByUser.set(uid, []);
        }
        expensesByUser.get(uid).push(exp);
    });
    
    // Buscar reports de abril 2026
    console.log("\nBuscando reports de abril 2026...");
    const reportsResponse = await makeRequest('/reports', {
        paginate: 'false',
        per_page: '500'
    });
    
    const reports = reportsResponse.data.data || [];
    console.log(`${reports.length} reports encontrados`);
    
    // Filtrar reports de abril 2026
    const aprilReports = reports.filter(r => {
        if (!r.created_at) return false;
        const date = new Date(r.created_at);
        return date.getMonth() === 3 && date.getFullYear() === 2026; // Abril = mês 3
    });
    console.log(`${aprilReports.length} reports de abril 2026`);
    
    // Agrupar reports por user_id
    const reportsByUser = new Map();
    aprilReports.forEach(r => {
        const uid = r.user_id;
        if (!reportsByUser.has(uid)) {
            reportsByUser.set(uid, []);
        }
        reportsByUser.get(uid).push(r);
    });
    
    // Analisar correlações para cada usuário de teste
    console.log("\n" + "=".repeat(80));
    console.log("ANÁLISE DE CORRELAÇÕES POR USUÁRIO");
    console.log("=".repeat(80));
    
    const correlationResults = [];
    
    for (const user of testUsers) {
        const cpf = user['CPF']?.replace(/\D/g, '');
        const userId = cpfToUserId.get(cpf);
        
        console.log(`\n${user['PORTADOR']}:`);
        console.log(`  CPF: ${cpf}`);
        console.log(`  User ID: ${userId || 'NÃO ENCONTRADO'}`);
        console.log(`  SALDO FINAL (planilha): R$ ${user['SALDO FINAL']?.toFixed(2)}`);
        console.log(`  QZ1 (planilha): R$ ${user['1QZ DE ABRIL 26']?.toFixed(2)}`);
        console.log(`  SALDO CARTÃO (planilha): R$ ${user['SALDO CARTAO']?.toFixed(2)}`);
        
        if (!userId) {
            console.log(`  ⚠️  Usuário não encontrado na API`);
            correlationResults.push({
                portador: user['PORTADOR'],
                cpf: cpf,
                userId: null,
                saldoFinal: user['SALDO FINAL'],
                qz1: user['1QZ DE ABRIL 26'],
                saldoCartao: user['SALDO CARTAO'],
                found: false
            });
            continue;
        }
        
        // Dados da API
        const userExpenses = expensesByUser.get(userId) || [];
        const userReports = reportsByUser.get(userId) || [];
        
        const totalExpensesApril = userExpenses.reduce((sum, exp) => sum + (exp.value || 0), 0);
        const totalReportsApril = userReports.length;
        
        // Expenses por tipo
        const saqueExpenses = userExpenses.filter(e => 
            e.payment_method?.data?.description?.toLowerCase().includes('saque') ||
            e.title?.toLowerCase().includes('saque')
        );
        const totalSaque = saqueExpenses.reduce((sum, e) => sum + (e.value || 0), 0);
        
        const reembolsavelExpenses = userExpenses.filter(e => e.reimbursable);
        const totalReembolsavel = reembolsavelExpenses.reduce((sum, e) => sum + (e.value || 0), 0);
        
        console.log(`  Expenses abril: ${userExpenses.length} (total: R$ ${totalExpensesApril.toFixed(2)})`);
        console.log(`  Reports abril: ${totalReportsApril}`);
        console.log(`  Saques: ${saqueExpenses.length} (total: R$ ${totalSaque.toFixed(2)})`);
        console.log(`  Reembolsável: ${reembolsavelExpenses.length} (total: R$ ${totalReembolsavel.toFixed(2)})`);
        
        // Testar diferentes fórmulas
        const formulas = {
            'saldo_final_vs_total_expenses': totalExpensesApril > 0 ? user['SALDO FINAL'] / totalExpensesApril : null,
            'saldo_final_vs_qz1': user['1QZ DE ABRIL 26'] > 0 ? user['SALDO FINAL'] / user['1QZ DE ABRIL 26'] : null,
            'saldo_final_vs_saque': totalSaque > 0 ? user['SALDO FINAL'] / totalSaque : null,
            'saldo_cartao_vs_qz1': user['1QZ DE ABRIL 26'] > 0 ? user['SALDO CARTAO'] / user['1QZ DE ABRIL 26'] : null,
            'saldo_cartao_vs_saque': totalSaque > 0 ? user['SALDO CARTAO'] / totalSaque : null,
        };
        
        console.log(`  Fórmulas testadas:`);
        Object.entries(formulas).forEach(([name, value]) => {
            if (value !== null) {
                console.log(`    ${name}: ${value.toFixed(4)}`);
            }
        });
        
        correlationResults.push({
            portador: user['PORTADOR'],
            cpf: cpf,
            userId: userId,
            saldoFinal: user['SALDO FINAL'],
            qz1: user['1QZ DE ABRIL 26'],
            saldoCartao: user['SALDO CARTAO'],
            found: true,
            apiData: {
                totalExpensesApril,
                totalReportsApril,
                totalSaque,
                totalReembolsavel
            },
            formulas
        });
    }
    
    // Salvar resultados
    fs.writeFileSync('../investigation-docs/api_correlations_test.json', JSON.stringify(correlationResults, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("Resultados salvos em investigation-docs/api_correlations_test.json");
    console.log("=".repeat(80));
    
    // Análise geral das fórmulas
    console.log("\n" + "=".repeat(80));
    console.log("ANÁLISE GERAL DAS FÓRMULAS");
    console.log("=".repeat(80));
    
    const formulaAnalysis = {};
    const validResults = correlationResults.filter(r => r.formulas && Object.keys(r.formulas).length > 0);
    const firstResult = validResults[0];
    
    if (firstResult && firstResult.formulas) {
        Object.keys(firstResult.formulas).forEach(formulaName => {
            const values = validResults
                .map(r => r.formulas[formulaName])
                .filter(v => v !== null);
        
        if (values.length > 0) {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            
            console.log(`\n${formulaName}:`);
            console.log(`  Média: ${mean.toFixed(4)}`);
            console.log(`  Mínimo: ${min.toFixed(4)}`);
            console.log(`  Máximo: ${max.toFixed(4)}`);
            console.log(`  Amplitude: ${(max - min).toFixed(4)}`);
            
            formulaAnalysis[formulaName] = { mean, min, max, values };
        }
        });
    } else {
        console.log("Nenhum dado válido para análise de fórmulas");
    }
}

testCorrelations().catch(console.error);