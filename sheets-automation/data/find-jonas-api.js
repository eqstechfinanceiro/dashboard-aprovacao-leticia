const https = require('https');
const fs = require('fs');

const API_KEY = process.env.VEXPENSES_API_KEY || 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';
const BASE_URL = 'https://api.vexpenses.com/v2';

function makeRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
        const queryString = new URLSearchParams(params).toString();
        const url = `${BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
        
        console.log(`🔍 Testing: ${url}`);
        
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

async function findJonasInAPI() {
    console.log("=".repeat(80));
    console.log("🔍 PROCURANDO JONAS CAVALCANTI DE OLIVEIRA NA API VEXPENSES");
    console.log("=".repeat(80));
    
    const jonasCPF = "01696239478";
    const jonasNome = "JONAS CAVALCANTI DE OLIVEIRA";
    
    console.log(`\n📋 DADOS DA PLANILHA:`);
    console.log(`   Nome: ${jonasNome}`);
    console.log(`   CPF: ${jonasCPF}`);
    
    // Estratégia 1: Buscar por CPF nos team-members
    console.log(`\n🎯 ESTRATÉGIA 1: Buscar team-members com filtro por CPF`);
    try {
        const response = await makeRequest('/team-members', { 
            cpf: jonasCPF,
            paginate: 'false'
        });
        
        console.log(`   Status: ${response.status}`);
        if (response.status === 200 && response.data.data) {
            const encontrados = response.data.data.filter(member => 
                member.cpf === jonasCPF || member.name && member.name.includes('JONAS')
            );
            
            if (encontrados.length > 0) {
                console.log(`   ✅ ENCONTRADO! ${encontrados.length} resultado(s)`);
                encontrados.forEach((member, index) => {
                    console.log(`   ${index + 1}. ID: ${member.id}`);
                    console.log(`      Nome: ${member.name}`);
                    console.log(`      CPF: ${member.cpf}`);
                    console.log(`      Email: ${member.email}`);
                    console.log(`      Ativo: ${member.active ? 'SIM' : 'NÃO'}`);
                    console.log(`      Empresa ID: ${member.company_id}`);
                });
            } else {
                console.log(`   ❌ Não encontrado por CPF`);
            }
        }
    } catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
    
    // Estratégia 2: Buscar todos os membros e filtrar localmente
    console.log(`\n🎯 ESTRATÉGIA 2: Buscar todos os team-members e filtrar`);
    try {
        let allMembers = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
            const response = await makeRequest('/team-members', { 
                include: 'costsCenters,projects',
                paginate: 'true',
                page: page.toString(),
                per_page: '100'
            });
            
            if (response.status === 200 && response.data.data) {
                const members = response.data.data;
                allMembers = allMembers.concat(members);
                
                // Procurar JONAS nesta página
                const jonasFound = members.filter(member => 
                    member.cpf === jonasCPF || 
                    (member.name && (
                        member.name.includes('JONAS') || 
                        member.name.includes('CAVALCANTI') ||
                        member.name.toUpperCase().includes('JONAS CAVALCANTI')
                    ))
                );
                
                if (jonasFound.length > 0) {
                    console.log(`   ✅ ENCONTRADO na página ${page}!`);
                    jonasFound.forEach((member, index) => {
                        console.log(`   ${index + 1}. ID: ${member.id}`);
                        console.log(`      Nome: ${member.name}`);
                        console.log(`      CPF: ${member.cpf}`);
                        console.log(`      Email: ${member.email}`);
                        console.log(`      Telefone: ${member.phone1 || member.phone2}`);
                        console.log(`      Banco: ${member.bank}`);
                        console.log(`      Agência: ${member.bank}`);
                        console.log(`      Conta: ${member.account}`);
                        console.log(`      Ativo: ${member.active ? 'SIM' : 'NÃO'}`);
                        console.log(`      Empresa ID: ${member.company_id}`);
                        console.log(`      Cargo ID: ${member.role_id}`);
                        
                        if (member.costsCenters && member.costsCenters.length > 0) {
                            console.log(`      Centros de Custo:`);
                            member.costsCenters.forEach(cc => {
                                console.log(`         - ${cc.name} (${cc.external_code})`);
                            });
                        }
                        
                        if (member.projects && member.projects.length > 0) {
                            console.log(`      Projetos:`);
                            member.projects.forEach(proj => {
                                console.log(`         - ${proj.name} (${proj.external_code})`);
                            });
                        }
                    });
                    
                    // Salvar resultado
                    const resultado = {
                        encontrado: true,
                        estrategia: 'busca_todos_membros',
                        dados_planilha: {
                            nome: jonasNome,
                            cpf: jonasCPF
                        },
                        dados_api: jonasFound,
                        endpoint: '/v2/team-members',
                        metodo_busca: 'filtro_local_nome_cpf'
                    };
                    
                    fs.writeFileSync('jonas_api_result.json', JSON.stringify(resultado, null, 2));
                    console.log(`\n💾 Resultado salvo em jonas_api_result.json`);
                    return;
                }
                
                // Verificar se há mais páginas
                hasMore = response.data.data && response.data.data.length === 100;
                page++;
            } else {
                hasMore = false;
            }
        }
        
        console.log(`   ❌ Não encontrado em ${allMembers.length} membros totais`);
        
    } catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
    
    // Estratégia 3: Buscar por nome (se houver endpoint de busca)
    console.log(`\n🎯 ESTRATÉGIA 3: Buscar por nome nos endpoints disponíveis`);
    try {
        // Tentar diferentes variações do nome
        const nomeVariacoes = [
            'JONAS CAVALCANTI DE OLIVEIRA',
            'JONAS CAVALCANTI',
            'JONAS',
            'CAVALCANTI'
        ];
        
        for (const nome of nomeVariacoes) {
            console.log(`   Testando com: "${nome}"`);
            const response = await makeRequest('/team-members', { 
                search: nome,
                paginate: 'false'
            });
            
            if (response.status === 200 && response.data.data) {
                const encontrados = response.data.data.filter(member => 
                    member.name && member.name.toUpperCase().includes(nome.toUpperCase())
                );
                
                if (encontrados.length > 0) {
                    console.log(`   ✅ ENCONTRADO! ${encontrados.length} resultado(s)`);
                    encontrados.forEach((member, index) => {
                        console.log(`   ${index + 1}. ID: ${member.id}`);
                        console.log(`      Nome: ${member.name}`);
                        console.log(`      CPF: ${member.cpf}`);
                    });
                }
            }
        }
    } catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
    
    // Salvar resultado negativo
    const resultado = {
        encontrado: false,
        dados_planilha: {
            nome: jonasNome,
            cpf: jonasCPF
        },
        estrategias_testadas: ['cpf_filter', 'busca_todos_membros', 'nome_search'],
        mensagem: 'JONAS CAVALCANTI não encontrado na API VExpenses'
    };
    
    fs.writeFileSync('jonas_api_result.json', JSON.stringify(resultado, null, 2));
    console.log(`\n💾 Resultado negativo salvo em jonas_api_result.json`);
}

findJonasInAPI().catch(console.error);
