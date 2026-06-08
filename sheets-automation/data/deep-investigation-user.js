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

async function deepInvestigateUser() {
    console.log("=".repeat(80));
    console.log("INVESTIGAÇÃO PROFUNDA POR USUÁRIO ESPECÍFICO");
    console.log("=".repeat(80));
    
    // Ler planilha
    const rawData = fs.readFileSync('../investigation-docs/analise_exaustiva_abril_1qz.json', 'utf8');
    const planilha = JSON.parse(rawData);
    
    // Pegar RAFAEL AMORIM VELLO como exemplo
    const usuarioAlvo = planilha.find(u => u.portador === 'RAFAEL AMORIM VELLO');
    
    console.log("\nUSUÁRIO ALVO:");
    console.log(`  Nome: ${usuarioAlvo.portador}`);
    console.log(`  CPF: ${usuarioAlvo.cpf}`);
    console.log(`  1QZ DE ABRIL 26: R$ ${usuarioAlvo.camposFinanceiros['1QZ DE ABRIL 26']}`);
    console.log(`  SALDO FINAL: R$ ${usuarioAlvo.camposFinanceiros['SALDO FINAL']}`);
    console.log(`  SALDO CARTAO: R$ ${usuarioAlvo.camposFinanceiros['SALDO CARTAO']}`);
    console.log(`  CARGA PARCIAL: R$ ${usuarioAlvo.camposFinanceiros['CARGA PARCIAL']}`);
    console.log(`  REEMBOLSO: R$ ${usuarioAlvo.camposFinanceiros['REEMBOLSO']}`);
    
    // Buscar usuário na API
    console.log("\nBuscando usuário na API...");
    const membersResponse = await makeRequest('/team-members', { 
        include: 'costsCenters',
        search: 'name:RAFAEL AMORIM VELLO',
        searchFields: 'name:equals',
        paginate: 'false',
        per_page: '500'
    });
    
    const members = membersResponse.data.data || [];
    console.log(`${members.length} membros encontrados`);
    
    if (members.length === 0) {
        console.log("Usuário não encontrado por nome, tentando por CPF...");
        const cpfSearch = usuarioAlvo.cpf.replace(/\D/g, '');
        const membersCpfResponse = await makeRequest('/team-members', { 
            include: 'costsCenters',
            search: `cpf:${cpfSearch}`,
            searchFields: 'cpf:equals',
            paginate: 'false',
            per_page: '500'
        });
        
        const membersCpf = membersCpfResponse.data.data || [];
        console.log(`${membersCpf.length} membros encontrados por CPF`);
        
        if (membersCpf.length > 0) {
            members.push(...membersCpf);
        }
    }
    
    if (members.length === 0) {
        console.log("Usuário não encontrado na API");
        return;
    }
    
    const user = members[0];
    const userId = user.id;
    
    console.log(`\nUsuário encontrado:`);
    console.log(`  ID: ${userId}`);
    console.log(`  Nome: ${user.name}`);
    console.log(`  CPF: ${user.cpf}`);
    console.log(`  Ativo: ${user.active}`);
    
    // Buscar TODOS os dados possíveis deste usuário
    console.log("\n" + "=".repeat(80));
    console.log("BUSCANDO TODOS OS DADOS DO USUÁRIO");
    console.log("=".repeat(80));
    
    // 1. Expenses do usuário em abril 1QZ
    console.log("\n1. Expenses abril 1QZ:");
    const expensesQZ = await makeRequest('/expenses', {
        search: `user_id:${userId},created_at:2026-04-01,2026-04-15`,
        searchFields: 'user_id:equals,created_at:between',
        searchJoin: 'and',
        include: 'paymentMethod,report,costCenter',
        paginate: 'false',
        per_page: '500'
    });
    
    const expensesQZData = expensesQZ.data.data || [];
    console.log(`   ${expensesQZData.length} expenses encontrados`);
    
    const totalExpensesQZ = expensesQZData.reduce((sum, e) => sum + (e.amount || e.value || 0), 0);
    console.log(`   Total: R$ ${totalExpensesQZ.toFixed(2)}`);
    
    // Detalhar cada expense
    console.log("\n   Detalhes dos expenses:");
    expensesQZData.forEach((exp, idx) => {
        console.log(`   ${idx + 1}. ID: ${exp.id}, Valor: R$ ${(exp.amount || exp.value || 0).toFixed(2)}, Payment Method: ${exp.payment_method_id}, Status: ${exp.status}`);
        console.log(`      Descrição: ${exp.description || 'N/A'}`);
        console.log(`      Report ID: ${exp.report_id}`);
    });
    
    // 2. Reports do usuário em abril 1QZ
    console.log("\n2. Reports abril 1QZ:");
    const reportsQZ = await makeRequest('/reports', {
        search: `user_id:${userId},created_at:2026-04-01,2026-04-15`,
        searchFields: 'user_id:equals,created_at:between',
        searchJoin: 'and',
        include: 'expenses',
        paginate: 'false',
        per_page: '500'
    });
    
    const reportsQZData = reportsQZ.data.data || [];
    console.log(`   ${reportsQZData.length} reports encontrados`);
    
    reportsQZData.forEach((rep, idx) => {
        console.log(`   ${idx + 1}. ID: ${rep.id}, Descrição: ${rep.description}, Total: R$ ${(rep.total || 0).toFixed(2)}, Status: ${rep.status}`);
        console.log(`      Payment Method: ${rep.payment_method_id}`);
        console.log(`      Expenses count: ${rep.expenses?.length || 0}`);
    });
    
    // 3. Expenses do usuário em TODO abril 2026
    console.log("\n3. Expenses todo abril 2026:");
    const expensesMonth = await makeRequest('/expenses', {
        search: `user_id:${userId},created_at:2026-04-01,2026-04-30`,
        searchFields: 'user_id:equals,created_at:between',
        searchJoin: 'and',
        include: 'paymentMethod',
        paginate: 'false',
        per_page: '500'
    });
    
    const expensesMonthData = expensesMonth.data.data || [];
    console.log(`   ${expensesMonthData.length} expenses encontrados`);
    
    const totalExpensesMonth = expensesMonthData.reduce((sum, e) => sum + (e.amount || e.value || 0), 0);
    console.log(`   Total: R$ ${totalExpensesMonth.toFixed(2)}`);
    
    // 4. Reports do usuário em TODO abril 2026
    console.log("\n4. Reports todo abril 2026:");
    const reportsMonth = await makeRequest('/reports', {
        search: `user_id:${userId},created_at:2026-04-01,2026-04-30`,
        searchFields: 'user_id:equals,created_at:between',
        searchJoin: 'and',
        paginate: 'false',
        per_page: '500'
    });
    
    const reportsMonthData = reportsMonth.data.data || [];
    console.log(`   ${reportsMonthData.length} reports encontrados`);
    
    const totalReportsMonth = reportsMonthData.reduce((sum, r) => sum + (r.total || 0), 0);
    console.log(`   Total: R$ ${totalReportsMonth.toFixed(2)}`);
    
    // 5. Expenses do usuário em TODO 2026
    console.log("\n5. Expenses todo 2026:");
    const expensesYear = await makeRequest('/expenses', {
        search: `user_id:${userId},created_at:2026-01-01,2026-12-31`,
        searchFields: 'user_id:equals,created_at:between',
        searchJoin: 'and',
        include: 'paymentMethod',
        paginate: 'false',
        per_page: '5000'
    });
    
    const expensesYearData = expensesYear.data.data || [];
    console.log(`   ${expensesYearData.length} expenses encontrados`);
    
    const totalExpensesYear = expensesYearData.reduce((sum, e) => sum + (e.amount || e.value || 0), 0);
    console.log(`   Total: R$ ${totalExpensesYear.toFixed(2)}`);
    
    // 6. Agrupar expenses por payment method
    console.log("\n6. Expenses por payment method (abril 1QZ):");
    const porPaymentMethod = {};
    expensesQZData.forEach(exp => {
        const pmId = exp.payment_method_id;
        if (!porPaymentMethod[pmId]) {
            porPaymentMethod[pmId] = 0;
        }
        porPaymentMethod[pmId] += (exp.amount || exp.value || 0);
    });
    
    Object.keys(porPaymentMethod).forEach(pmId => {
        console.log(`   Payment Method ${pmId}: R$ ${porPaymentMethod[pmId].toFixed(2)}`);
    });
    
    // 7. Agrupar expenses por status
    console.log("\n7. Expenses por status (abril 1QZ):");
    const porStatus = {};
    expensesQZData.forEach(exp => {
        const status = exp.status;
        if (!porStatus[status]) {
            porStatus[status] = 0;
        }
        porStatus[status] += (exp.amount || exp.value || 0);
    });
    
    Object.keys(porStatus).forEach(status => {
        console.log(`   Status ${status}: R$ ${porStatus[status].toFixed(2)}`);
    });
    
    // 8. Buscar dados completos do usuário
    console.log("\n8. Dados completos do usuário:");
    const userDetail = await makeRequest(`/team-members/${userId}`, {
        include: 'costsCenters,company,role'
    });
    
    console.log("   Campos disponíveis:");
    console.log("   ", Object.keys(userDetail.data));
    
    // Salvar tudo para análise
    const resultado = {
        usuarioPlanilha: usuarioAlvo,
        usuarioAPI: user,
        expensesQZ: expensesQZData,
        reportsQZ: reportsQZData,
        expensesMonth: expensesMonthData,
        reportsMonth: reportsMonthData,
        expensesYear: expensesYearData,
        totais: {
            expensesQZ: totalExpensesQZ,
            expensesMonth: totalExpensesMonth,
            expensesYear: totalExpensesYear,
            reportsMonth: totalReportsMonth
        },
        porPaymentMethod,
        porStatus,
        userDetail: userDetail.data
    };
    
    fs.writeFileSync('../investigation-docs/deep_investigation_rafael.json', JSON.stringify(resultado, null, 2));
    console.log("\nDados salvos em investigation-docs/deep_investigation_rafael.json");
}

deepInvestigateUser().catch(console.error);