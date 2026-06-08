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

async function testAdvancedMathematicalFormulas() {
    console.log("=".repeat(80));
    console.log("TESTANDO FÓRMULAS MATEMÁTICAS AVANÇADAS");
    console.log("=".repeat(80));
    
    // Ler planilha de abril 1QZ
    console.log("\nLendo planilha de abril 1QZ...");
    const rawData = fs.readFileSync('../investigation-docs/analise_exaustiva_abril_1qz.json', 'utf8');
    const planilha = JSON.parse(rawData);
    
    console.log(`${planilha.length} linhas na planilha`);
    
    // Buscar todos os team members
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
    
    // Buscar expenses de TODO o ano de 2026 (para cálculos acumulados)
    console.log("\nBuscando expenses de todo 2026...");
    const expensesYearResponse = await makeRequest('/expenses', {
        search: 'created_at:2026-01-01,2026-12-31',
        searchFields: 'created_at:between',
        include: 'paymentMethod',
        paginate: 'false',
        per_page: '10000'
    });
    
    const expensesYear = expensesYearResponse.data.data || [];
    console.log(`${expensesYear.length} expenses em todo 2026`);
    
    // Agrupar dados por usuário
    const dadosPorUsuario = {};
    
    // Expenses abril 1QZ
    expenses.forEach(exp => {
        const userId = exp.user_id;
        if (!dadosPorUsuario[userId]) {
            dadosPorUsuario[userId] = {
                expensesQZ: 0,
                expensesYear: 0,
                reportsQZ: 0,
                porPaymentMethodQZ: {},
                porPaymentMethodYear: {},
                porStatusQZ: {},
                countExpensesQZ: 0,
                countReportsQZ: 0
            };
        }
        dadosPorUsuario[userId].expensesQZ += exp.amount;
        dadosPorUsuario[userId].countExpensesQZ++;
        
        const pmId = exp.payment_method_id;
        if (!dadosPorUsuario[userId].porPaymentMethodQZ[pmId]) {
            dadosPorUsuario[userId].porPaymentMethodQZ[pmId] = 0;
        }
        dadosPorUsuario[userId].porPaymentMethodQZ[pmId] += exp.amount;
        
        const status = exp.status;
        if (!dadosPorUsuario[userId].porStatusQZ[status]) {
            dadosPorUsuario[userId].porStatusQZ[status] = 0;
        }
        dadosPorUsuario[userId].porStatusQZ[status] += exp.amount;
    });
    
    // Expenses ano todo
    expensesYear.forEach(exp => {
        const userId = exp.user_id;
        if (!dadosPorUsuario[userId]) {
            dadosPorUsuario[userId] = {
                expensesQZ: 0,
                expensesYear: 0,
                reportsQZ: 0,
                porPaymentMethodQZ: {},
                porPaymentMethodYear: {},
                porStatusQZ: {},
                countExpensesQZ: 0,
                countReportsQZ: 0
            };
        }
        dadosPorUsuario[userId].expensesYear += exp.amount;
        
        const pmId = exp.payment_method_id;
        if (!dadosPorUsuario[userId].porPaymentMethodYear[pmId]) {
            dadosPorUsuario[userId].porPaymentMethodYear[pmId] = 0;
        }
        dadosPorUsuario[userId].porPaymentMethodYear[pmId] += exp.amount;
    });
    
    // Reports abril 1QZ
    reports.forEach(rep => {
        const userId = rep.user_id;
        if (!dadosPorUsuario[userId]) {
            dadosPorUsuario[userId] = {
                expensesQZ: 0,
                expensesYear: 0,
                reportsQZ: 0,
                porPaymentMethodQZ: {},
                porPaymentMethodYear: {},
                porStatusQZ: {},
                countExpensesQZ: 0,
                countReportsQZ: 0
            };
        }
        dadosPorUsuario[userId].reportsQZ += rep.total || 0;
        dadosPorUsuario[userId].countReportsQZ++;
    });
    
    // Fórmulas avançadas para testar
    const formulas = [
        {
            nome: 'SALDO FINAL = 1QZ - ExpensesQZ',
            calcular: (dados, planilha) => {
                const qz1 = planilha['1QZ DE ABRIL 26'] || 0;
                return qz1 - dados.expensesQZ;
            }
        },
        {
            nome: 'SALDO FINAL = ExpensesYear - ExpensesQZ',
            calcular: (dados, planilha) => {
                return dados.expensesYear - dados.expensesQZ;
            }
        },
        {
            nome: 'SALDO FINAL = (ExpensesYear - ExpensesQZ) * 0.5',
            calcular: (dados, planilha) => {
                return (dados.expensesYear - dados.expensesQZ) * 0.5;
            }
        },
        {
            nome: 'SALDO FINAL = 1QZ - ReportsQZ',
            calcular: (dados, planilha) => {
                const qz1 = planilha['1QZ DE ABRIL 26'] || 0;
                return qz1 - dados.reportsQZ;
            }
        },
        {
            nome: 'SALDO FINAL = ExpensesYear porPaymentMethodQZ[627401]',
            calcular: (dados, planilha) => {
                return dados.porPaymentMethodYear[627401] || 0;
            }
        },
        {
            nome: 'SALDO FINAL = ExpensesYear porPaymentMethodQZ[627508]',
            calcular: (dados, planilha) => {
                return dados.porPaymentMethodYear[627508] || 0;
            }
        },
        {
            nome: 'SALDO CARTÃO = porPaymentMethodQZ[627401]',
            calcular: (dados, planilha) => {
                return dados.porPaymentMethodQZ[627401] || 0;
            }
        },
        {
            nome: 'SALDO CARTÃO = porPaymentMethodQZ[627508]',
            calcular: (dados, planilha) => {
                return dados.porPaymentMethodQZ[627508] || 0;
            }
        },
        {
            nome: 'SALDO CARTÃO = porPaymentMethodQZ[627401] + porPaymentMethodQZ[627508]',
            calcular: (dados, planilha) => {
                const itau = dados.porPaymentMethodQZ[627401] || 0;
                const vexpenses = dados.porPaymentMethodQZ[627508] || 0;
                return itau + vexpenses;
            }
        },
        {
            nome: 'SALDO CARTÃO = porPaymentMethodYear[627401] - porPaymentMethodQZ[627401]',
            calcular: (dados, planilha) => {
                const yearItau = dados.porPaymentMethodYear[627401] || 0;
                const qzItau = dados.porPaymentMethodQZ[627401] || 0;
                return yearItau - qzItau;
            }
        },
        {
            nome: 'SALDO REEMBOLSAR = porPaymentMethodQZ[630113]',
            calcular: (dados, planilha) => {
                return dados.porPaymentMethodQZ[630113] || 0;
            }
        },
        {
            nome: 'SALDO REEMBOLSAR = porPaymentMethodQZ[668240]',
            calcular: (dados, planilha) => {
                return dados.porPaymentMethodQZ[668240] || 0;
            }
        },
        {
            nome: 'SALDO REEMBOLSAR = porPaymentMethodYear[630113] - porPaymentMethodQZ[630113]',
            calcular: (dados, planilha) => {
                const yearRp = dados.porPaymentMethodYear[630113] || 0;
                const qzRp = dados.porPaymentMethodQZ[630113] || 0;
                return yearRp - qzRp;
            }
        },
        {
            nome: 'SALDO FINAL = porStatusQZ[APROVADO]',
            calcular: (dados, planilha) => {
                return dados.porStatusQZ['APROVADO'] || 0;
            }
        },
        {
            nome: 'SALDO FINAL = porStatusQZ[ENVIADO]',
            calcular: (dados, planilha) => {
                return dados.porStatusQZ['ENVIADO'] || 0;
            }
        },
        {
            nome: 'SALDO FINAL = 1QZ * 0.1',
            calcular: (dados, planilha) => {
                const qz1 = planilha['1QZ DE ABRIL 26'] || 0;
                return qz1 * 0.1;
            }
        },
        {
            nome: 'SALDO FINAL = 1QZ * 0.2',
            calcular: (dados, planilha) => {
                const qz1 = planilha['1QZ DE ABRIL 26'] || 0;
                return qz1 * 0.2;
            }
        },
    ];
    
    console.log("\nTestando fórmulas matemáticas avançadas...");
    console.log("-".repeat(80));
    
    const resultados = [];
    
    for (const formula of formulas) {
        let matchesFinal = 0;
        let matchesCartao = 0;
        let matchesReembolsar = 0;
        let total = 0;
        let erros = [];
        
        for (const row of planilha) {
            const nome = row.portador;
            const userId = nomeParaId[nome.toUpperCase()];
            
            if (!userId) continue;
            
            const dados = dadosPorUsuario[userId];
            if (!dados) continue;
            
            total++;
            
            const saldoFinal = row.camposFinanceiros['SALDO FINAL'] || 0;
            const saldoCartao = row.camposFinanceiros['SALDO CARTAO'] || 0;
            const saldoReembolsar = row.camposFinanceiros['SALDO REEMBOLSAR'] || 0;
            
            const valorCalculado = formula.calcular(dados, row.camposFinanceiros);
            
            const diffFinal = Math.abs(saldoFinal - valorCalculado);
            const diffCartao = Math.abs(saldoCartao - valorCalculado);
            const diffReembolsar = Math.abs(saldoReembolsar - valorCalculado);
            
            if (diffFinal < 0.01) matchesFinal++;
            if (diffCartao < 0.01) matchesCartao++;
            if (diffReembolsar < 0.01) matchesReembolsar++;
            
            if (diffFinal > 100) {
                erros.push({
                    nome,
                    saldoFinal,
                    saldoCartao,
                    saldoReembolsar,
                    calculado: valorCalculado,
                    diffFinal,
                    diffCartao,
                    diffReembolsar
                });
            }
        }
        
        const precisaoFinal = total > 0 ? (matchesFinal / total * 100).toFixed(2) : 0;
        const precisaoCartao = total > 0 ? (matchesCartao / total * 100).toFixed(2) : 0;
        const precisaoReembolsar = total > 0 ? (matchesReembolsar / total * 100).toFixed(2) : 0;
        
        console.log(`\n${formula.nome}:`);
        console.log(`  SALDO FINAL: ${matchesFinal}/${total} (${precisaoFinal}%)`);
        console.log(`  SALDO CARTÃO: ${matchesCartao}/${total} (${precisaoCartao}%)`);
        console.log(`  SALDO REEMBOLSAR: ${matchesReembolsar}/${total} (${precisaoReembolsar}%)`);
        
        if (matchesFinal > 0 || matchesCartao > 0 || matchesReembolsar > 0) {
            console.log(`  Exemplos de erros:`);
            erros.slice(0, 3).forEach(e => {
                console.log(`    ${e.nome}: SF=R$ ${e.saldoFinal.toFixed(2)}, SC=R$ ${e.saldoCartao.toFixed(2)}, SR=R$ ${e.saldoReembolsar.toFixed(2)}, calc=R$ ${e.calculado.toFixed(2)}`);
            });
        }
        
        resultados.push({
            formula: formula.nome,
            matchesFinal,
            matchesCartao,
            matchesReembolsar,
            total,
            precisaoFinal: parseFloat(precisaoFinal),
            precisaoCartao: parseFloat(precisaoCartao),
            precisaoReembolsar: parseFloat(precisaoReembolsar),
            erros: erros.slice(0, 5)
        });
    }
    
    // Salvar resultados
    fs.writeFileSync('../investigation-docs/advanced_formulas_test.json', JSON.stringify(resultados, null, 2));
    
    console.log("\nResultados salvos em investigation-docs/advanced_formulas_test.json");
    
    // Encontrar melhor fórmula para cada campo
    const melhorFinal = resultados.reduce((best, current) => 
        current.precisaoFinal > best.precisaoFinal ? current : best
    );
    
    const melhorCartao = resultados.reduce((best, current) => 
        current.precisaoCartao > best.precisaoCartao ? current : best
    );
    
    const melhorReembolsar = resultados.reduce((best, current) => 
        current.precisaoReembolsar > best.precisaoReembolsar ? current : best
    );
    
    console.log("\nMelhores fórmulas encontradas:");
    console.log(`  SALDO FINAL: ${melhorFinal.formula} (${melhorFinal.matchesFinal}/${melhorFinal.total} = ${melhorFinal.precisaoFinal}%)`);
    console.log(`  SALDO CARTÃO: ${melhorCartao.formula} (${melhorCartao.matchesCartao}/${melhorCartao.total} = ${melhorCartao.precisaoCartao}%)`);
    console.log(`  SALDO REEMBOLSAR: ${melhorReembolsar.formula} (${melhorReembolsar.matchesReembolsar}/${melhorReembolsar.total} = ${melhorReembolsar.precisaoReembolsar}%)`);
}

testAdvancedMathematicalFormulas().catch(console.error);