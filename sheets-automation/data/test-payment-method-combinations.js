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

async function testPaymentMethodCombinations() {
    console.log("=".repeat(80));
    console.log("TESTANDO COMBINAÇÕES EXAUSTIVAS DE FILTROS POR PAYMENT_METHOD_ID");
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
    
    // Payment methods conhecidos
    const paymentMethods = {
        627401: 'Cartão Corporativo Itaú',
        627721: 'Saque VExpenses',
        627508: 'Cartão VExpenses',
        668240: 'Pix VExpenses',
        630113: 'Recurso Próprio'
    };
    
    // Status possíveis
    const statuses = ['APROVADO', 'ENVIADO', 'CANCELADO', 'EM ANALISE', 'REPROVADO'];
    
    // Testar combinações
    console.log("\nTestando combinações de filtros...");
    console.log("-".repeat(80));
    
    const resultados = [];
    
    // Para cada usuário na planilha
    for (const row of planilha) {
        const nome = row.portador;
        const userId = nomeParaId[nome.toUpperCase()];
        
        if (!userId) {
            console.log(`\n${nome}: Não encontrado na API`);
            continue;
        }
        
        console.log(`\n${nome} (ID: ${userId}):`);
        console.log("-".repeat(80));
        
        const saldoFinal = row.camposFinanceiros['SALDO FINAL'] || 0;
        const saldoCartao = row.camposFinanceiros['SALDO CARTAO'] || 0;
        const saldoReembolsar = row.camposFinanceiros['SALDO REEMBOLSAR'] || 0;
        
        console.log(`  SALDO FINAL: R$ ${saldoFinal.toFixed(2)}`);
        console.log(`  SALDO CARTÃO: R$ ${saldoCartao.toFixed(2)}`);
        console.log(`  SALDO REEMBOLSAR: R$ ${saldoReembolsar.toFixed(2)}`);
        
        // Testar diferentes combinações de filtros
        const combinacoes = [
            // Sem filtros de payment method
            { nome: 'Expenses todos', endpoint: '/expenses', params: { search: `user_id:${userId},created_at:2026-04-01,2026-04-15`, searchFields: 'user_id:equals,created_at:between', searchJoin: 'and', paginate: 'false', per_page: '500' } },
            { nome: 'Reports todos', endpoint: '/reports', params: { search: `user_id:${userId},created_at:2026-04-01,2026-04-15`, searchFields: 'user_id:equals,created_at:between', searchJoin: 'and', paginate: 'false', per_page: '500' } },
            
            // Por payment method individual
            ...Object.keys(paymentMethods).map(pmId => ({
                nome: `Expenses ${paymentMethods[pmId]}`,
                endpoint: '/expenses',
                params: { 
                    search: `user_id:${userId},created_at:2026-04-01,2026-04-15,payment_method_id:${pmId}`,
                    searchFields: 'user_id:equals,created_at:between,payment_method_id:equals',
                    searchJoin: 'and',
                    paginate: 'false',
                    per_page: '500'
                }
            })),
            ...Object.keys(paymentMethods).map(pmId => ({
                nome: `Reports ${paymentMethods[pmId]}`,
                endpoint: '/reports',
                params: { 
                    search: `user_id:${userId},created_at:2026-04-01,2026-04-15,payment_method_id:${pmId}`,
                    searchFields: 'user_id:equals,created_at:between,payment_method_id:equals',
                    searchJoin: 'and',
                    paginate: 'false',
                    per_page: '500'
                }
            })),
            
            // Combinações de payment methods
            {
                nome: 'Expenses Cartões (Itaú + VExpenses)',
                endpoint: '/expenses',
                params: {
                    search: `user_id:${userId},created_at:2026-04-01,2026-04-15,payment_method_id:627401,627508`,
                    searchFields: 'user_id:equals,created_at:between,payment_method_id:in',
                    searchJoin: 'and',
                    paginate: 'false',
                    per_page: '500'
                }
            },
            {
                nome: 'Reports Cartões (Itaú + VExpenses)',
                endpoint: '/reports',
                params: {
                    search: `user_id:${userId},created_at:2026-04-01,2026-04-15,payment_method_id:627401,627508`,
                    searchFields: 'user_id:equals,created_at:between,payment_method_id:in',
                    searchJoin: 'and',
                    paginate: 'false',
                    per_page: '500'
                }
            },
            
            // Por status
            ...statuses.map(status => ({
                nome: `Expenses Status ${status}`,
                endpoint: '/expenses',
                params: {
                    search: `user_id:${userId},created_at:2026-04-01,2026-04-15,status:${status}`,
                    searchFields: 'user_id:equals,created_at:between,status:equals',
                    searchJoin: 'and',
                    paginate: 'false',
                    per_page: '500'
                }
            })),
            ...statuses.map(status => ({
                nome: `Reports Status ${status}`,
                endpoint: '/reports',
                params: {
                    search: `user_id:${userId},created_at:2026-04-01,2026-04-15,status:${status}`,
                    searchFields: 'user_id:equals,created_at:between,status:equals',
                    searchJoin: 'and',
                    paginate: 'false',
                    per_page: '500'
                }
            })),
            
            // Combinações complexas
            ...Object.keys(paymentMethods).map(pmId => 
                statuses.map(status => ({
                    nome: `Expenses ${paymentMethods[pmId]} + Status ${status}`,
                    endpoint: '/expenses',
                    params: {
                        search: `user_id:${userId},created_at:2026-04-01,2026-04-15,payment_method_id:${pmId},status:${status}`,
                        searchFields: 'user_id:equals,created_at:between,payment_method_id:equals,status:equals',
                        searchJoin: 'and',
                        paginate: 'false',
                        per_page: '500'
                    }
                }))
            ).flat(),
        ];
        
        for (const combo of combinacoes) {
            try {
                const response = await makeRequest(combo.endpoint, combo.params);
                
                if (response.status === 200) {
                    const items = response.data.data || [];
                    const total = items.reduce((sum, item) => sum + (item.amount || item.total || 0), 0);
                    
                    const diffFinal = Math.abs(saldoFinal - total);
                    const diffCartao = Math.abs(saldoCartao - total);
                    const diffReembolsar = Math.abs(saldoReembolsar - total);
                    
                    const matchFinal = diffFinal < 0.01;
                    const matchCartao = diffCartao < 0.01;
                    const matchReembolsar = diffReembolsar < 0.01;
                    
                    if (matchFinal || matchCartao || matchReembolsar) {
                        console.log(`  ✓ ${combo.nome}: R$ ${total.toFixed(2)} (MATCH!)`);
                        
                        resultados.push({
                            usuario: nome,
                            userId,
                            combinacao: combo.nome,
                            endpoint: combo.endpoint,
                            total,
                            saldoFinal,
                            matchFinal,
                            saldoCartao,
                            matchCartao,
                            saldoReembolsar,
                            matchReembolsar
                        });
                    }
                }
            } catch (error) {
                // Ignorar erros
            }
        }
    }
    
    // Salvar resultados
    fs.writeFileSync('../investigation-docs/payment_method_combinations_test.json', JSON.stringify(resultados, null, 2));
    
    console.log("\nResultados salvos em investigation-docs/payment_method_combinations_test.json");
    
    if (resultados.length === 0) {
        console.log("\n⚠️ NENHUMA COMBINAÇÃO DE FILTROS ENCONTRADA QUE MATCH OS SALDOS!");
    } else {
        console.log(`\n✅ ${resultados.length} combinações encontradas que match os saldos!`);
    }
}

testPaymentMethodCombinations().catch(console.error);