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

async function testPaymentMethodSums() {
    console.log("=".repeat(80));
    console.log("TESTANDO SOMATÓRIAS POR PAYMENT METHOD");
    console.log("=".repeat(80));
    
    // Carregar dados da planilha
    const planilhaData = JSON.parse(fs.readFileSync('../vexpenses-dashboard/planilha-1qz-data.json', 'utf-8'));
    
    // Selecionar alguns usuários para teste detalhado
    const usuariosParaTeste = planilhaData.slice(0, 10);
    
    // Payment methods encontrados
    const paymentMethods = {
        itau: 627401,      // Cartão Corporativo Itaú
        saque: 627721,     // Saque VExpenses
        cartao: 627508,    // Cartão VExpenses
        pix: 668240,       // Pix VExpenses
        proprio: 630113    // Recurso Próprio
    };
    
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
    
    // Buscar expenses de abril 1QZ
    console.log("\nBuscando expenses de abril 1QZ...");
    const expensesResponse = await makeRequest('/expenses', {
        search: 'date:2026-04-01,2026-04-15',
        searchFields: 'date:between',
        include: 'user,payment_method',
        paginate: 'false'
    });
    
    const expenses = expensesResponse.data.data || [];
    console.log(`${expenses.length} expenses encontradas`);
    
    // Agrupar expenses por user_id e payment_method
    const expensesByUserAndPayment = new Map();
    
    expenses.forEach(exp => {
        const userId = exp.user_id;
        const paymentMethodId = exp.payment_method_id;
        const value = exp.value || 0;
        
        if (!expensesByUserAndPayment.has(userId)) {
            expensesByUserAndPayment.set(userId, {});
        }
        
        const userPayments = expensesByUserAndPayment.get(userId);
        if (!userPayments[paymentMethodId]) {
            userPayments[paymentMethodId] = [];
        }
        
        userPayments[paymentMethodId].push({
            value,
            date: exp.date,
            payment_method_id: paymentMethodId
        });
    });
    
    console.log(`Expenses agrupadas para ${expensesByUserAndPayment.size} usuários`);
    
    // Analisar cada usuário da planilha
    const resultados = [];
    
    for (const usuario of usuariosParaTeste) {
        const cpf = usuario['CPF'];
        const userId = cpfToUserId.get(cpf);
        
        console.log(`\n${usuario['PORTADOR']} (CPF: ${cpf})`);
        console.log("-".repeat(80));
        console.log(`User ID: ${userId || 'NÃO ENCONTRADO'}`);
        console.log(`QZ1 (planilha): R$ ${usuario['1QZ DE ABRIL 26']?.toFixed(2) || 'N/A'}`);
        console.log(`SALDO FINAL (planilha): R$ ${usuario['SALDO FINAL']?.toFixed(2) || 'N/A'}`);
        console.log(`SALDO CARTÃO (planilha): R$ ${usuario['SALDO CARTAO']?.toFixed(2) || 'N/A'}`);
        console.log(`REEMBOLSO (planilha): R$ ${usuario['REEMBOLSO']?.toFixed(2) || 'N/A'}`);
        
        if (!userId) {
            console.log(`⚠️  Usuário não encontrado na API`);
            continue;
        }
        
        const userExpenses = expensesByUserAndPayment.get(userId) || {};
        
        // Somar por payment method
        const somasPorPayment = {};
        let totalGeral = 0;
        
        Object.entries(paymentMethods).forEach(([nome, id]) => {
            const expenses = userExpenses[id] || [];
            const soma = expenses.reduce((sum, exp) => sum + exp.value, 0);
            somasPorPayment[nome] = {
                payment_method_id: id,
                soma,
                quantidade: expenses.length
            };
            totalGeral += soma;
            
            console.log(`${nome}: R$ ${soma.toFixed(2)} (${expenses.length} expenses)`);
        });
        
        console.log(`TOTAL GERAL: R$ ${totalGeral.toFixed(2)}`);
        
        // Testar diferentes hipóteses de cálculo
        const hipoteses = {
            qz1_vs_total_geral: usuario['1QZ DE ABRIL 26'] / totalGeral,
            saldo_final_vs_saque: usuario['SALDO FINAL'] / (somasPorPayment.saque?.soma || 1),
            saldo_final_vs_cartao: usuario['SALDO FINAL'] / (somasPorPayment.cartao?.soma || 1),
            saldo_final_vs_itau: usuario['SALDO FINAL'] / (somasPorPayment.itau?.soma || 1),
            saldo_cartao_vs_itau: usuario['SALDO CARTAO'] / (somasPorPayment.itau?.soma || 1),
            saldo_cartao_vs_cartao: usuario['SALDO CARTAO'] / (somasPorPayment.cartao?.soma || 1),
            reembolso_vs_saque: usuario['REEMBOLSO'] / (somasPorPayment.saque?.soma || 1),
            reembolso_vs_cartao: usuario['REEMBOLSO'] / (somasPorPayment.cartao?.soma || 1),
        };
        
        console.log(`\nHIPÓTESES DE CÁLCULO:`);
        Object.entries(hipoteses).forEach(([nome, valor]) => {
            if (isFinite(valor)) {
                console.log(`  ${nome}: ${valor.toFixed(4)}`);
            }
        });
        
        resultados.push({
            portador: usuario['PORTADOR'],
            cpf,
            userId,
            dadosPlanilha: {
                qz1: usuario['1QZ DE ABRIL 26'],
                saldoFinal: usuario['SALDO FINAL'],
                saldoCartao: usuario['SALDO CARTAO'],
                reembolso: usuario['REEMBOLSO']
            },
            somasPorPayment,
            totalGeral,
            hipoteses
        });
    }
    
    // Salvar resultados
    fs.writeFileSync('../investigation-docs/payment_method_sums_test.json', JSON.stringify(resultados, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("Resultados salvos em investigation-docs/payment_method_sums_test.json");
    console.log("=".repeat(80));
}

testPaymentMethodSums().catch(console.error);