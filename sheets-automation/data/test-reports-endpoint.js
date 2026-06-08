const https = require('https');

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

async function testReportsEndpoint() {
    console.log("=".repeat(80));
    console.log("TESTANDO ENDPOINT /reports COM DIFERENTES FILTROS");
    console.log("=".repeat(80));
    
    // Testar diferentes filtros para reports
    const filtros = [
        { nome: 'Reports abril 1QZ', params: { 
            search: 'created_at:2026-04-01,2026-04-15',
            searchFields: 'created_at:between',
            include: 'user,expenses',
            paginate: 'false',
            per_page: '500'
        }},
        { nome: 'Reports com CAIXA', params: { 
            search: 'description:CAIXA',
            searchFields: 'description:contains',
            paginate: 'false',
            per_page: '100'
        }},
        { nome: 'Reports abril 1QZ com CAIXA', params: { 
            search: 'created_at:2026-04-01,2026-04-15,description:CAIXA',
            searchFields: 'created_at:between,description:contains',
            searchJoin: 'and',
            include: 'user,expenses',
            paginate: 'false',
            per_page: '100'
        }},
        { nome: 'Reports aprovados abril', params: { 
            search: 'created_at:2026-04-01,2026-04-15,status:APROVADO',
            searchFields: 'created_at:between,status:equals',
            searchJoin: 'and',
            include: 'user,expenses',
            paginate: 'false',
            per_page: '500'
        }},
    ];
    
    const resultados = [];
    
    for (const filtro of filtros) {
        console.log(`\n${filtro.nome}:`);
        
        try {
            const response = await makeRequest('/reports', filtro.params);
            
            console.log(`Status: ${response.status}`);
            
            if (response.status === 200) {
                const reports = response.data.data || [];
                console.log(`Reports encontrados: ${reports.length}`);
                
                if (reports.length > 0) {
                    console.log(`Primeiro report:`, JSON.stringify(reports[0], null, 2).substring(0, 300));
                    
                    // Verificar se há campos de saldo
                    const temCamposSaldo = reports.some(r => 
                        Object.keys(r).some(key => key.toLowerCase().includes('saldo') || key.toLowerCase().includes('balance'))
                    );
                    
                    console.log(`Contém campos de saldo: ${temCamposSaldo ? 'SIM' : 'NÃO'}`);
                    
                    if (temCamposSaldo) {
                        console.log(`Campos de saldo encontrados:`);
                        reports.slice(0, 3).forEach(r => {
                            const camposSaldo = Object.keys(r).filter(key => 
                                key.toLowerCase().includes('saldo') || key.toLowerCase().includes('balance')
                            ));
                            console.log(`  Report ${r.id}: ${camposSaldo.join(', ')}`);
                        });
                    }
                }
                
                resultados.push({
                    filtro: filtro.nome,
                    status: 'success',
                    total: reports.length,
                    temCamposSaldo,
                    amostra: reports.slice(0, 2)
                });
            } else {
                console.log(`❌ STATUS ${response.status}`);
                resultados.push({
                    filtro: filtro.nome,
                    status: 'failed',
                    code: response.status
                });
            }
        } catch (error) {
            console.log(`❌ ERRO: ${error.message}`);
            resultados.push({
                filtro: filtro.nome,
                status: 'error',
                error: error.message
            });
        }
    }
    
    // Testar buscar um report específico para ver detalhes
    console.log("\n" + "=".repeat(80));
    console.log("TESTANDO DETALHES DE REPORT ESPECÍFICO");
    console.log("=".repeat(80));
    
    try {
        // Primeiro buscar um report de abril
        const reportsResponse = await makeRequest('/reports', {
            search: 'created_at:2026-04-01,2026-04-15',
            searchFields: 'created_at:between',
            paginate: 'true',
            page: '1',
            per_page: '5'
        });
        
        if (reportsResponse.status === 200 && reportsResponse.data.data && reportsResponse.data.data.length > 0) {
            const reportId = reportsResponse.data.data[0].id;
            console.log(`\nTestando detalhes do report ${reportId}`);
            
            const detailResponse = await makeRequest(`/reports/${reportId}`, {
                include: 'user,expenses,payment_methods'
            });
            
            console.log(`Status detalhes: ${detailResponse.status}`);
            
            if (detailResponse.status === 200) {
                console.log(`Dados do report:`, JSON.stringify(detailResponse.data, null, 2).substring(0, 500));
                
                // Verificar se há campos de saldo
                const campos = Object.keys(detailResponse.data);
                const camposSaldo = campos.filter(c => c.toLowerCase().includes('saldo') || c.toLowerCase().includes('balance'));
                
                if (camposSaldo.length > 0) {
                    console.log(`\n🎯 CAMPOS DE SALDO ENCONTRADOS: ${camposSaldo.join(', ')}`);
                } else {
                    console.log(`\n❌ Nenhum campo de saldo encontrado`);
                }
            }
        }
    } catch (error) {
        console.log(`❌ ERRO ao testar detalhes: ${error.message}`);
    }
    
    // Salvar resultados
    const fs = require('fs');
    fs.writeFileSync('../investigation-docs/reports_endpoint_test.json', JSON.stringify(resultados, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("Resultados salvos em investigation-docs/reports_endpoint_test.json");
    console.log("=".repeat(80));
}

testReportsEndpoint().catch(console.error);