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

async function findUserManually() {
    console.log("=".repeat(80));
    console.log("BUSCA MANUAL DO USUÁRIO");
    console.log("=".repeat(80));
    
    // Ler planilha
    const rawData = fs.readFileSync('../investigation-docs/analise_exaustiva_abril_1qz.json', 'utf8');
    const planilha = JSON.parse(rawData);
    
    const usuarioAlvo = planilha.find(u => u.portador === 'RAFAEL AMORIM VELLO');
    
    console.log("\nUSUÁRIO ALVO:");
    console.log(`  Nome: ${usuarioAlvo.portador}`);
    console.log(`  CPF: ${usuarioAlvo.cpf}`);
    console.log(`  SALDO FINAL: R$ ${usuarioAlvo.camposFinanceiros['SALDO FINAL']}`);
    console.log(`  SALDO CARTAO: R$ ${usuarioAlvo.camposFinanceiros['SALDO CARTAO']}`);
    
    // Buscar TODOS os membros
    console.log("\nBuscando TODOS os membros...");
    const membersResponse = await makeRequest('/team-members', { 
        include: 'costsCenters',
        paginate: 'false',
        per_page: '500'
    });
    
    const members = membersResponse.data.data || [];
    console.log(`${members.length} membros totais`);
    
    // Procurar manualmente
    console.log("\nProcurando por RAFAEL AMORIM VELLO...");
    
    let encontrado = null;
    
    // Tentar correspondência exata de nome
    encontrado = members.find(m => {
        const nomeNormalizado = m.name.toUpperCase().trim();
        const alvoNormalizado = usuarioAlvo.portador.toUpperCase().trim();
        return nomeNormalizado === alvoNormalizado;
    });
    
    if (encontrado) {
        console.log("Encontrado por correspondência exata de nome!");
    } else {
        // Tentar correspondência parcial
        encontrado = members.find(m => {
            const nomeNormalizado = m.name.toUpperCase().trim();
            return nomeNormalizado.includes('RAFAEL') && nomeNormalizado.includes('VELLO');
        });
        
        if (encontrado) {
            console.log("Encontrado por correspondência parcial de nome!");
        } else {
            // Tentar por CPF
            const cpfAlvo = usuarioAlvo.cpf.replace(/\D/g, '');
            encontrado = members.find(m => {
                const cpfMembro = (m.cpf || '').replace(/\D/g, '');
                return cpfMembro === cpfAlvo;
            });
            
            if (encontrado) {
                console.log("Encontrado por CPF!");
            } else {
                console.log("NÃO encontrado na API");
                console.log("\nPrimeiros 20 membros da API para referência:");
                members.slice(0, 20).forEach((m, idx) => {
                    console.log(`  ${idx + 1}. ${m.name} (CPF: ${m.cpf})`);
                });
                
                // Procurar por nomes similares
                console.log("\nProcurando nomes que contenham 'RAFAEL':");
                const rafaels = members.filter(m => m.name.toUpperCase().includes('RAFAEL'));
                console.log(`${rafaels.length} membros com 'RAFAEL' no nome:`);
                rafaels.forEach((m, idx) => {
                    console.log(`  ${idx + 1}. ${m.name} (CPF: ${m.cpf}, ID: ${m.id})`);
                });
                
                return;
            }
        }
    }
    
    console.log(`\nUsuário encontrado:`);
    console.log(`  ID: ${encontrado.id}`);
    console.log(`  Nome: ${encontrado.name}`);
    console.log(`  CPF: ${encontrado.cpf}`);
    console.log(`  Email: ${encontrado.email}`);
    
    // Agora investigar este usuário profundamente
    const userId = encontrado.id;
    
    console.log("\n" + "=".repeat(80));
    console.log("INVESTIGANDO DADOS DO USUÁRIO");
    console.log("=".repeat(80));
    
    // Expenses abril 1QZ
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
    
    if (expensesQZData.length > 0) {
        console.log("\n   Detalhes dos expenses:");
        expensesQZData.forEach((exp, idx) => {
            console.log(`   ${idx + 1}. ID: ${exp.id}, Valor: R$ ${(exp.amount || exp.value || 0).toFixed(2)}, Payment Method: ${exp.payment_method_id}, Status: ${exp.status}`);
            console.log(`      Descrição: ${exp.description || 'N/A'}`);
        });
    }
    
    // Reports abril 1QZ
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
    
    if (reportsQZData.length > 0) {
        console.log("\n   Detalhes dos reports:");
        reportsQZData.forEach((rep, idx) => {
            console.log(`   ${idx + 1}. ID: ${rep.id}, Descrição: ${rep.description}, Total: R$ ${(rep.total || 0).toFixed(2)}, Status: ${rep.status}`);
            console.log(`      Payment Method: ${rep.payment_method_id}`);
        });
    }
    
    // Comparar valores
    console.log("\n" + "=".repeat(80));
    console.log("COMPARAÇÃO DE VALORES");
    console.log("=".repeat(80));
    
    console.log(`\nPlanilha:`);
    console.log(`  1QZ: R$ ${usuarioAlvo.camposFinanceiros['1QZ DE ABRIL 26']}`);
    console.log(`  SALDO FINAL: R$ ${usuarioAlvo.camposFinanceiros['SALDO FINAL']}`);
    console.log(`  SALDO CARTAO: R$ ${usuarioAlvo.camposFinanceiros['SALDO CARTAO']}`);
    
    console.log(`\nAPI (Expenses QZ):`);
    console.log(`  Total: R$ ${totalExpensesQZ.toFixed(2)}`);
    
    const reportsTotal = reportsQZData.reduce((sum, r) => sum + (r.total || 0), 0);
    console.log(`\nAPI (Reports QZ):`);
    console.log(`  Total: R$ ${reportsTotal.toFixed(2)}`);
    
    // Salvar resultado
    const resultado = {
        usuarioPlanilha: usuarioAlvo,
        usuarioAPI: encontrado,
        expensesQZ: expensesQZData,
        reportsQZ: reportsQZData,
        totaisAPI: {
            expensesQZ: totalExpensesQZ,
            reportsQZ: reportsTotal
        }
    };
    
    fs.writeFileSync('../investigation-docs/find_rafael_result.json', JSON.stringify(resultado, null, 2));
    console.log("\nDados salvos em investigation-docs/find_rafael_result.json");
}

findUserManually().catch(console.error);