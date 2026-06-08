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

function parseCurrency(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    const cleaned = value.replace(/[R$\s]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

function formatCurrency(value) {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

async function testFormulasExaustivas() {
    console.log("=".repeat(80));
    console.log("TESTANDO FÓRMULAS MATEMÁTICAS EXAUSTIVAS");
    console.log("=".repeat(80));
    
    // Ler planilha de abril 1QZ (formato JSON)
    console.log("\nLendo planilha de abril 1QZ...");
    const rawData = fs.readFileSync('../investigation-docs/analise_exaustiva_abril_1qz.json', 'utf8');
    const data = JSON.parse(rawData);
    
    console.log(`${data.length} linhas na planilha`);
    
    // Buscar todos os usuários da API
    console.log("\nBuscando todos os team members...");
    const membersResponse = await makeRequest('/team-members', { 
        include: 'costsCenters',
        paginate: 'false',
        per_page: '500'
    });
    
    const members = membersResponse.data.data || [];
    console.log(`${members.length} membros na API`);
    
    // Criar mapa nome -> id
    const nomeParaId = {};
    members.forEach(m => {
        nomeParaId[m.name.toUpperCase()] = m.id;
    });
    
    // Buscar expenses de abril 1QZ
    console.log("\nBuscando expenses de abril 1QZ...");
    const expensesResponse = await makeRequest('/expenses', {
        search: 'created_at:2026-04-01,2026-04-15',
        searchFields: 'created_at:between',
        include: 'paymentMethod,report',
        paginate: 'false',
        per_page: '5000'
    });
    
    const expenses = expensesResponse.data.data || [];
    console.log(`${expenses.length} expenses encontrados`);
    
    // Buscar reports de abril 1QZ
    console.log("\nBuscando reports de abril 1QZ...");
    const reportsResponse = await makeRequest('/reports', {
        search: 'created_at:2026-04-01,2026-04-15',
        searchFields: 'created_at:between',
        include: 'expenses',
        paginate: 'false',
        per_page: '500'
    });
    
    const reports = reportsResponse.data.data || [];
    console.log(`${reports.length} reports encontrados`);
    
    // Agrupar expenses por usuário e payment method
    const expensesPorUsuario = {};
    expenses.forEach(exp => {
        const userId = exp.user_id;
        const paymentMethodId = exp.payment_method_id;
        
        if (!expensesPorUsuario[userId]) {
            expensesPorUsuario[userId] = {
                total: 0,
                porPaymentMethod: {}
            };
        }
        
        expensesPorUsuario[userId].total += exp.amount;
        
        if (!expensesPorUsuario[userId].porPaymentMethod[paymentMethodId]) {
            expensesPorUsuario[userId].porPaymentMethod[paymentMethodId] = 0;
        }
        expensesPorUsuario[userId].porPaymentMethod[paymentMethodId] += exp.amount;
    });
    
    // Agrupar reports por usuário
    const reportsPorUsuario = {};
    reports.forEach(rep => {
        const userId = rep.user_id;
        
        if (!reportsPorUsuario[userId]) {
            reportsPorUsuario[userId] = {
                total: 0,
                count: 0,
                porPaymentMethod: {}
            };
        }
        
        reportsPorUsuario[userId].total += rep.total || 0;
        reportsPorUsuario[userId].count += 1;
        
        if (rep.payment_method_id && !reportsPorUsuario[userId].porPaymentMethod[rep.payment_method_id]) {
            reportsPorUsuario[userId].porPaymentMethod[rep.payment_method_id] = 0;
        }
        if (rep.payment_method_id) {
            reportsPorUsuario[userId].porPaymentMethod[rep.payment_method_id] += rep.total || 0;
        }
    });
    
    // Payment methods conhecidos
    const paymentMethods = {
        627401: 'Cartão Corporativo Itaú',
        627721: 'Saque VExpenses',
        627508: 'Cartão VExpenses',
        668240: 'Pix VExpenses',
        630113: 'Recurso Próprio'
    };
    
    // Testar fórmulas
    console.log("\nTestando fórmulas matemáticas...");
    console.log("-".repeat(80));
    
    const formulas = [
        {
            nome: 'SALDO FINAL = Total Expenses',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.total || 0
        },
        {
            nome: 'SALDO FINAL = Total Reports',
            calcular: (userId, planilha) => reportsPorUsuario[userId]?.total || 0
        },
        {
            nome: 'SALDO FINAL = Expenses Cartão Itaú',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[627401] || 0
        },
        {
            nome: 'SALDO FINAL = Expenses Cartão VExpenses',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[627508] || 0
        },
        {
            nome: 'SALDO FINAL = Expenses Saque VExpenses',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[627721] || 0
        },
        {
            nome: 'SALDO FINAL = Expenses Pix VExpenses',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[668240] || 0
        },
        {
            nome: 'SALDO FINAL = Expenses Recurso Próprio',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[630113] || 0
        },
        {
            nome: 'SALDO FINAL = Reports Cartão Itaú',
            calcular: (userId, planilha) => reportsPorUsuario[userId]?.porPaymentMethod[627401] || 0
        },
        {
            nome: 'SALDO FINAL = Reports Cartão VExpenses',
            calcular: (userId, planilha) => reportsPorUsuario[userId]?.porPaymentMethod[627508] || 0
        },
        {
            nome: 'SALDO FINAL = Reports Saque VExpenses',
            calcular: (userId, planilha) => reportsPorUsuario[userId]?.porPaymentMethod[627721] || 0
        },
        {
            nome: 'SALDO CARTÃO = Expenses Cartão Itaú',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[627401] || 0
        },
        {
            nome: 'SALDO CARTÃO = Expenses Cartão VExpenses',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[627508] || 0
        },
        {
            nome: 'SALDO CARTÃO = Expenses Cartão Itaú + VExpenses',
            calcular: (userId, planilha) => {
                const itau = expensesPorUsuario[userId]?.porPaymentMethod[627401] || 0;
                const vexpenses = expensesPorUsuario[userId]?.porPaymentMethod[627508] || 0;
                return itau + vexpenses;
            }
        },
        {
            nome: 'SALDO CARTÃO = Reports Cartão Itaú',
            calcular: (userId, planilha) => reportsPorUsuario[userId]?.porPaymentMethod[627401] || 0
        },
        {
            nome: 'SALDO CARTÃO = Reports Cartão VExpenses',
            calcular: (userId, planilha) => reportsPorUsuario[userId]?.porPaymentMethod[627508] || 0
        },
        {
            nome: 'SALDO CARTÃO = Reports Cartão Itaú + VExpenses',
            calcular: (userId, planilha) => {
                const itau = reportsPorUsuario[userId]?.porPaymentMethod[627401] || 0;
                const vexpenses = reportsPorUsuario[userId]?.porPaymentMethod[627508] || 0;
                return itau + vexpenses;
            }
        },
        {
            nome: 'SALDO REEMBOLSAR = Expenses Recurso Próprio',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[630113] || 0
        },
        {
            nome: 'SALDO REEMBOLSAR = Reports Recurso Próprio',
            calcular: (userId, planilha) => reportsPorUsuario[userId]?.porPaymentMethod[630113] || 0
        },
        {
            nome: 'SALDO REEMBOLSAR = Expenses Pix VExpenses',
            calcular: (userId, planilha) => expensesPorUsuario[userId]?.porPaymentMethod[668240] || 0
        },
        {
            nome: 'SALDO REEMBOLSAR = Reports Pix VExpenses',
            calcular: (userId, planilha) => reportsPorUsuario[userId]?.porPaymentMethod[668240] || 0
        },
        {
            nome: 'SALDO FINAL = SALDO CARTÃO + SALDO REEMBOLSAR',
            calcular: (userId, planilha) => {
                const saldoCartao = planilha['SALDO CARTAO'] || 0;
                const saldoReembolsar = planilha['SALDO REEMBOLSAR'] || 0;
                return saldoCartao + saldoReembolsar;
            }
        },
        {
            nome: 'SALDO FINAL = QZ1 (1QZ DE ABRIL 26)',
            calcular: (userId, planilha) => {
                const qz1 = planilha['1QZ DE ABRIL 26'] || 0;
                return qz1;
            }
        },
    ];
    
    const resultados = [];
    
    for (const formula of formulas) {
        let matches = 0;
        let total = 0;
        let erros = [];
        
        for (const row of data) {
            const nome = row.portador;
            const userId = nomeParaId[nome.toUpperCase()];
            
            if (!userId) continue;
            
            total++;
            
            const valorPlanilha = row.camposFinanceiros['SALDO FINAL'] || 0;
            const valorCalculado = formula.calcular(userId, row.camposFinanceiros);
            
            const diff = Math.abs(valorPlanilha - valorCalculado);
            
            if (diff < 0.01) {
                matches++;
            } else {
                erros.push({
                    nome,
                    planilha: valorPlanilha,
                    calculado: valorCalculado,
                    diff
                });
            }
        }
        
        const precisao = total > 0 ? (matches / total * 100).toFixed(2) : 0;
        
        console.log(`\n${formula.nome}:`);
        console.log(`  Matches: ${matches}/${total} (${precisao}%)`);
        
        if (matches > 0) {
            console.log(`  Exemplos de erros:`);
            erros.slice(0, 3).forEach(e => {
                console.log(`    ${e.nome}: planilha=${formatCurrency(e.planilha)}, calculado=${formatCurrency(e.calculado)}, diff=${formatCurrency(e.diff)}`);
            });
        }
        
        resultados.push({
            formula: formula.nome,
            matches,
            total,
            precisao: parseFloat(precisao),
            erros: erros.slice(0, 5)
        });
    }
    
    // Salvar resultados
    fs.writeFileSync('../investigation-docs/formulas_exaustivas_test.json', JSON.stringify(resultados, null, 2));
    
    console.log("\nResultados salvos em investigation-docs/formulas_exaustivas_test.json");
    
    // Encontrar melhor fórmula
    const melhor = resultados.reduce((best, current) => 
        current.precisao > best.precisao ? current : best
    );
    
    console.log("\nMelhor fórmula encontrada:");
    console.log(`  ${melhor.formula}: ${melhor.matches}/${melhor.total} (${melhor.precisao}%)`);
}

testFormulasExaustivas().catch(console.error);