const https = require('https');

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

async function investigateEndpoints() {
    console.log("=".repeat(80));
    console.log("INVESTIGANDO ENDPOINTS NÃO EXPLORADOS DA API VEXPENSES");
    console.log("=".repeat(80));
    
    const endpoints = [
        // Endpoints financeiros que podem ter dados de saldo
        { path: '/financials', params: { paginate: 'false', per_page: '100' } },
        { path: '/financial-summaries', params: { paginate: 'false', per_page: '100' } },
        { path: '/balances', params: { paginate: 'false', per_page: '100' } },
        { path: '/cards', params: { paginate: 'false', per_page: '100' } },
        { path: '/corporate-cards', params: { paginate: 'false', per_page: '100' } },
        { path: '/card-balances', params: { paginate: 'false', per_page: '100' } },
        { path: '/wallets', params: { paginate: 'false', per_page: '100' } },
        { path: '/wallet-balances', params: { paginate: 'false', per_page: '100' } },
        
        // Endpoints de usuários que podem ter dados financeiros
        { path: '/team-members/financials', params: { paginate: 'false', per_page: '100' } },
        { path: '/team-members/balances', params: { paginate: 'false', per_page: '100' } },
        { path: '/team-members/cards', params: { paginate: 'false', per_page: '100' } },
        
        // Endpoints de relatórios que podem ter dados de saldo
        { path: '/reports/financials', params: { paginate: 'false', per_page: '100' } },
        { path: '/reports/balances', params: { paginate: 'false', per_page: '100' } },
        { path: '/reports/summaries', params: { paginate: 'false', per_page: '100' } },
        
        // Endpoints de pagamento que podem ter dados de saldo
        { path: '/payments', params: { paginate: 'false', per_page: '100' } },
        { path: '/payments/balances', params: { paginate: 'false', per_page: '100' } },
        { path: '/payment-methods', params: { paginate: 'false', per_page: '100' } },
        
        // Endpoints de reembolso
        { path: '/reimbursements', params: { paginate: 'false', per_page: '100' } },
        { path: '/reimbursements/balances', params: { paginate: 'false', per_page: '100' } },
        
        // Endpoints de transações
        { path: '/transactions', params: { paginate: 'false', per_page: '100' } },
        { path: '/transactions/balances', params: { paginate: 'false', per_page: '100' } },
        
        // Endpoints de adiantamento
        { path: '/advances', params: { paginate: 'false', per_page: '100' } },
        { path: '/advances/balances', params: { paginate: 'false', per_page: '100' } },
    ];
    
    const results = [];
    
    for (const endpoint of endpoints) {
        try {
            const response = await makeRequest(endpoint.path, endpoint.params);
            
            console.log(`Status: ${response.status}`);
            
            if (response.status === 200) {
                console.log(`✅ SUCESSO - Dados recebidos`);
                
                // Analisar estrutura dos dados
                if (response.data.data && Array.isArray(response.data.data)) {
                    console.log(`   Registros: ${response.data.data.length}`);
                    if (response.data.data.length > 0) {
                        console.log(`   Primeiro registro:`, JSON.stringify(response.data.data[0], null, 2).substring(0, 200));
                    }
                } else if (response.data.data) {
                    console.log(`   Estrutura:`, Object.keys(response.data.data));
                } else {
                    console.log(`   Estrutura completa:`, Object.keys(response.data));
                }
                
                results.push({
                    endpoint: endpoint.path,
                    status: 'success',
                    data: response.data
                });
            } else if (response.status === 404) {
                console.log(`❌ NÃO ENCONTRADO (404)`);
                results.push({
                    endpoint: endpoint.path,
                    status: 'not_found'
                });
            } else if (response.status === 405) {
                console.log(`❌ MÉTODO NÃO SUPORTADO (405)`);
                results.push({
                    endpoint: endpoint.path,
                    status: 'method_not_allowed'
                });
            } else if (response.status === 422) {
                console.log(`❌ ERRO DE VALIDAÇÃO (422)`);
                console.log(`   Mensagem:`, response.data.message || response.data);
                results.push({
                    endpoint: endpoint.path,
                    status: 'validation_error',
                    message: response.data.message || response.data
                });
            } else {
                console.log(`⚠️  STATUS ${response.status}`);
                console.log(`   Resposta:`, JSON.stringify(response.data).substring(0, 200));
                results.push({
                    endpoint: endpoint.path,
                    status: 'other',
                    code: response.status,
                    data: response.data
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
        
        // Pequeno delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Salvar resultados
    const fs = require('fs');
    fs.writeFileSync('../investigation-docs/new_endpoints_investigation.json', JSON.stringify(results, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("RESUMO DA INVESTIGAÇÃO");
    console.log("=".repeat(80));
    
    const successful = results.filter(r => r.status === 'success');
    const notFound = results.filter(r => r.status === 'not_found');
    const methodNotAllowed = results.filter(r => r.status === 'method_not_allowed');
    const validationError = results.filter(r => r.status === 'validation_error');
    
    console.log(`\n✅ Endpoints funcionais: ${successful.length}`);
    console.log(`❌ Não encontrados (404): ${notFound.length}`);
    console.log(`❌ Método não suportado (405): ${methodNotAllowed.length}`);
    console.log(`⚠️  Erro de validação (422): ${validationError.length}`);
    
    if (successful.length > 0) {
        console.log(`\nEndpoints funcionais:`);
        successful.forEach(r => {
            console.log(`  - ${r.endpoint}`);
        });
    }
    
    console.log(`\nResultados salvos em investigation-docs/new_endpoints_investigation.json`);
}

investigateEndpoints().catch(console.error);