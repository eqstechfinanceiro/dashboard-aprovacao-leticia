const https = require('https');
const fs = require('fs');

const API_KEY = process.env.VEXPENSES_API_KEY || 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';
const BASE_URL = 'https://api.vexpenses.com/v2';

function makeRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const url = `${BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
        
        console.log(`\nTesting: ${url}`);
        
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

async function investigatePaymentMethods() {
    console.log("=".repeat(80));
    console.log("INVESTIGANDO PAYMENT METHODS DA API VEXPENSES");
    console.log("=".repeat(80));
    
    // Tentar diferentes endpoints para payment methods
    const endpoints = [
        { path: '/payment-methods', params: { paginate: 'false', per_page: '500' } },
        { path: '/payment_methods', params: { paginate: 'false', per_page: '500' } },
        { path: '/payment-method', params: { paginate: 'false', per_page: '500' } },
    ];
    
    const results = [];
    
    for (const endpoint of endpoints) {
        try {
            const response = await makeRequest(endpoint.path, endpoint.params);
            
            console.log(`Status: ${response.status}`);
            
            if (response.status === 200) {
                console.log(`✅ SUCESSO - Dados recebidos`);
                
                if (response.data.data && Array.isArray(response.data.data)) {
                    console.log(`   Registros: ${response.data.data.length}`);
                    
                    if (response.data.data.length > 0) {
                        console.log(`   Exemplos de payment methods:`);
                        response.data.data.slice(0, 5).forEach((pm, index) => {
                            console.log(`     ${index + 1}. ID: ${pm.id}, Nome: ${pm.name || pm.description || 'N/A'}`);
                        });
                        
                        // Procurar por cartão itaú e vexpenses
                        const itauMethods = response.data.data.filter(pm => 
                            pm.name?.toLowerCase().includes('itau') ||
                            pm.description?.toLowerCase().includes('itau')
                        );
                        
                        const vexpensesMethods = response.data.data.filter(pm => 
                            pm.name?.toLowerCase().includes('vexpenses') ||
                            pm.description?.toLowerCase().includes('vexpenses') ||
                            pm.name?.toLowerCase().includes('saque')
                        );
                        
                        console.log(`\n   Cartões Itaú encontrados: ${itauMethods.length}`);
                        itauMethods.slice(0, 3).forEach(pm => {
                            console.log(`     - ID: ${pm.id}, Nome: ${pm.name || pm.description}`);
                        });
                        
                        console.log(`   Cartões VExpenses/Saque encontrados: ${vexpensesMethods.length}`);
                        vexpensesMethods.slice(0, 3).forEach(pm => {
                            console.log(`     - ID: ${pm.id}, Nome: ${pm.name || pm.description}`);
                        });
                    }
                }
                
                results.push({
                    endpoint: endpoint.path,
                    status: 'success',
                    data: response.data
                });
            } else {
                console.log(`❌ STATUS ${response.status}`);
                results.push({
                    endpoint: endpoint.path,
                    status: 'failed',
                    code: response.status
                });
            }
        } catch (error) {
            console.log(`❌ ERRO: ${error.message}`);
            results.push({
                endpoint: endpoint.path,
                status: 'error',
                error: error.message
            });
        }
    }
    
    // Também tentar buscar payment methods via expenses
    console.log("\n" + "=".repeat(80));
    console.log("BUSCANDO PAYMENT METHODS VIA EXPENSES");
    console.log("=".repeat(80));
    
    try {
        const expensesResponse = await makeRequest('/expenses', {
            search: 'date:2026-04-01,2026-04-15',
            searchFields: 'date:between',
            include: 'payment_method',
            paginate: 'true',
            page: '1',
            per_page: '100'
        });
        
        if (expensesResponse.status === 200) {
            const expenses = expensesResponse.data.data || [];
            console.log(`Expenses encontradas: ${expenses.length}`);
            
            // Extrair payment methods únicos
            const paymentMethods = new Map();
            expenses.forEach(exp => {
                if (exp.payment_method?.data) {
                    const pm = exp.payment_method.data;
                    paymentMethods.set(pm.id, pm);
                }
            });
            
            console.log(`Payment methods únicos: ${paymentMethods.size}`);
            
            const methodsArray = Array.from(paymentMethods.values());
            console.log(`\nTodos os payment methods encontrados:`);
            methodsArray.forEach((pm, index) => {
                console.log(`  ${index + 1}. ID: ${pm.id}, Nome: ${pm.name || pm.description}`);
            });
            
            // Filtrar por cartão itaú
            const itauMethods = methodsArray.filter(pm => 
                pm.name?.toLowerCase().includes('itau') ||
                pm.description?.toLowerCase().includes('itau')
            );
            
            console.log(`\nCartões Itaú encontrados: ${itauMethods.length}`);
            itauMethods.forEach(pm => {
                console.log(`  ID: ${pm.id}, Nome: ${pm.name || pm.description}`);
            });
            
            // Filtrar por vexpenses/saque
            const vexpensesMethods = methodsArray.filter(pm => 
                pm.name?.toLowerCase().includes('vexpenses') ||
                pm.description?.toLowerCase().includes('vexpenses') ||
                pm.name?.toLowerCase().includes('saque')
            );
            
            console.log(`\nCartões VExpenses/Saque encontrados: ${vexpensesMethods.length}`);
            vexpensesMethods.forEach(pm => {
                console.log(`  ID: ${pm.id}, Nome: ${pm.name || pm.description}`);
            });
            
            results.push({
                endpoint: 'expenses_payment_methods',
                status: 'success',
                paymentMethods: methodsArray,
                itauMethods,
                vexpensesMethods
            });
        }
    } catch (error) {
        console.log(`❌ ERRO ao buscar payment methods via expenses: ${error.message}`);
    }
    
    // Salvar resultados
    fs.writeFileSync('../investigation-docs/payment_methods_investigation.json', JSON.stringify(results, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("Investigação salva em investigation-docs/payment_methods_investigation.json");
    console.log("=".repeat(80));
}

investigatePaymentMethods().catch(console.error);