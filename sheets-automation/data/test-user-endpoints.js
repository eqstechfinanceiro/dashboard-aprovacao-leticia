const https = require('https');
const fs = require('fs');

const API_KEY = process.env.VEXPENSES_API_KEY || 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';
const BASE_URL = 'https://api.vexpenses.com/v2';

function makeRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const url = `${BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
        
        console.log(`Testing: ${url}`);
        
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

async function testUserSpecificEndpoints() {
    console.log("=".repeat(80));
    console.log("TESTANDO ENDPOINTS ESPECÍFICOS POR USUÁRIO");
    console.log("=".repeat(80));
    
    // Buscar alguns usuários para teste
    console.log("\nBuscando team members...");
    const membersResponse = await makeRequest('/team-members', { 
        include: 'costsCenters',
        paginate: 'true',
        page: '1',
        per_page: '5'
    });
    
    const members = membersResponse.data.data || [];
    console.log(`${members.length} membros encontrados`);
    
    if (members.length === 0) {
        console.log("Nenhum membro encontrado para teste");
        return;
    }
    
    // Testar diferentes endpoints por usuário
    const endpointsTeste = [
        { nome: 'Detalhes do usuário', template: (id) => `/team-members/${id}` },
        { nome: 'Expenses do usuário', template: (id) => `/team-members/${id}/expenses` },
        { nome: 'Reports do usuário', template: (id) => `/team-members/${id}/reports` },
        { nome: 'Cards do usuário', template: (id) => `/team-members/${id}/cards` },
        { nome: 'Balance do usuário', template: (id) => `/team-members/${id}/balance` },
        { nome: 'Saldos do usuário', template: (id) => `/team-members/${id}/saldos` },
        { nome: 'Financial do usuário', template: (id) => `/team-members/${id}/financial` },
    ];
    
    const resultados = [];
    
    for (const member of members.slice(0, 3)) {
        const userId = member.id;
        const userName = member.name;
        
        console.log(`\n${userName} (ID: ${userId}):`);
        console.log("-".repeat(80));
        
        for (const endpointTest of endpointsTeste) {
            const url = endpointTest.template(userId);
            
            try {
                const response = await makeRequest(url, {});
                
                console.log(`  ${endpointTest.nome}: Status ${response.status}`);
                
                if (response.status === 200) {
                    const data = response.data.data || response.data;
                    
                    // Verificar se há campos de saldo
                    const temCamposSaldo = Object.keys(data).some(key => 
                        key.toLowerCase().includes('saldo') || 
                        key.toLowerCase().includes('balance') ||
                        key.toLowerCase().includes('financial') ||
                        key.toLowerCase().includes('cartao')
                    );
                    
                    console.log(`    Campos de saldo/financeiro: ${temCamposSaldo ? 'SIM' : 'NÃO'}`);
                    
                    if (temCamposSaldo) {
                        console.log(`    Campos relevantes:`, Object.keys(data).filter(k => 
                            k.toLowerCase().includes('saldo') || 
                            k.toLowerCase().includes('balance') ||
                            k.toLowerCase().includes('financial') ||
                            k.toLowerCase().includes('cartao')
                        ));
                    }
                    
                    resultados.push({
                        usuario: userName,
                        userId,
                        endpoint: endpointTest.nome,
                        url,
                        status: 'success',
                        temCamposSaldo,
                        camposRelevantes: temCamposSaldo ? Object.keys(data).filter(k => 
                            k.toLowerCase().includes('saldo') || 
                            k.toLowerCase().includes('balance') ||
                            k.toLowerCase().includes('financial') ||
                            k.toLowerCase().includes('cartao')
                        ) : []
                    });
                } else if (response.status === 404) {
                    console.log(`    Endpoint não existe (404)`);
                    resultados.push({
                        usuario: userName,
                        userId,
                        endpoint: endpointTest.nome,
                        url,
                        status: 'not_found'
                    });
                } else {
                    console.log(`    Status ${response.status}`);
                    resultados.push({
                        usuario: userName,
                        userId,
                        endpoint: endpointTest.nome,
                        url,
                        status: 'other',
                        code: response.status
                    });
                }
            } catch (error) {
                console.log(`    ERRO: ${error.message}`);
                resultados.push({
                    usuario: userName,
                    userId,
                    endpoint: endpointTest.nome,
                    url,
                    status: 'error',
                    error: error.message
                });
            }
        }
    }
    
    // Salvar resultados
    fs.writeFileSync('../investigation-docs/user_specific_endpoints_test.json', JSON.stringify(resultados, null, 2));
    
    console.log("\nResultados salvos em investigation-docs/user_specific_endpoints_test.json");
}

testUserSpecificEndpoints().catch(console.error);