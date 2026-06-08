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

async function testQZ1Formula() {
    console.log("=".repeat(80));
    console.log("TESTANDO FÓRMULA QZ1 = SOMA DE EXPENSES DO PERÍODO");
    console.log("=".repeat(80));
    
    // Carregar dados da planilha
    const planilhaData = JSON.parse(fs.readFileSync('../vexpenses-dashboard/planilha-1qz-data.json', 'utf-8'));
    
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
        include: 'user',
        paginate: 'false'
    });
    
    const expenses = expensesResponse.data.data || [];
    console.log(`${expenses.length} expenses encontradas`);
    
    // Agrupar expenses por user_id
    const expensesByUser = new Map();
    
    expenses.forEach(exp => {
        const userId = exp.user_id;
        const value = exp.value || 0;
        
        if (!expensesByUser.has(userId)) {
            expensesByUser.set(userId, []);
        }
        
        expensesByUser.get(userId).push({
            value,
            date: exp.date
        });
    });
    
    console.log(`Expenses agrupadas para ${expensesByUser.size} usuários`);
    
    // Testar a fórmula para todos os usuários da planilha
    const resultados = [];
    let matchesPerfeitos = 0;
    let matchesProximos = 0;
    let totalTestados = 0;
    
    for (const usuario of planilhaData) {
        const cpf = usuario['CPF'];
        const userId = cpfToUserId.get(cpf);
        
        if (!userId) continue;
        
        const userExpenses = expensesByUser.get(userId) || [];
        const somaExpenses = userExpenses.reduce((sum, exp) => sum + exp.value, 0);
        const qz1Planilha = usuario['1QZ DE ABRIL 26'];
        
        if (qz1Planilha === null || qz1Planilha === undefined) continue;
        
        totalTestados++;
        
        const diff = Math.abs(somaExpenses - qz1Planilha);
        const diffPct = (diff / qz1Planilha) * 100;
        
        const isMatchPerfeito = diff < 0.01;
        const isMatchProximo = diffPct < 1; // menos de 1% de diferença
        
        if (isMatchPerfeito) matchesPerfeitos++;
        if (isMatchProximo) matchesProximos++;
        
        resultados.push({
            portador: usuario['PORTADOR'],
            cpf,
            userId,
            qz1Planilha,
            somaExpenses,
            diff,
            diffPct,
            isMatchPerfeito,
            isMatchProximo
        });
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("RESULTADOS DO TESTE QZ1 = SOMA EXPENSES");
    console.log("=".repeat(80));
    console.log(`Total testados: ${totalTestados}`);
    console.log(`Matches perfeitos (diff < R$ 0.01): ${matchesPerfeitos} (${(matchesPerfeitos/totalTestados*100).toFixed(1)}%)`);
    console.log(`Matches próximos (diff < 1%): ${matchesProximos} (${(matchesProximos/totalTestados*100).toFixed(1)}%)`);
    
    // Mostrar exemplos de matches e não-matches
    console.log("\nExemplos de MATCHES PERFEITOS:");
    resultados.filter(r => r.isMatchPerfeito).slice(0, 5).forEach(r => {
        console.log(`  ${r.portador}: QZ1=R$ ${r.qz1Planilha.toFixed(2)}, Soma=R$ ${r.somaExpenses.toFixed(2)}, Diff=R$ ${r.diff.toFixed(2)} ✅`);
    });
    
    console.log("\nExemplos de NÃO MATCHES:");
    resultados.filter(r => !r.isMatchProximo).slice(0, 5).forEach(r => {
        console.log(`  ${r.portador}: QZ1=R$ ${r.qz1Planilha.toFixed(2)}, Soma=R$ ${r.somaExpenses.toFixed(2)}, Diff=R$ ${r.diff.toFixed(2)} (${r.diffPct.toFixed(1)}%) ❌`);
    });
    
    // Análise dos não-matches para entender padrões
    const naoMatches = resultados.filter(r => !r.isMatchProximo);
    
    if (naoMatches.length > 0) {
        console.log("\n" + "=".repeat(80));
        console.log("ANÁLISE DOS NÃO MATCHES");
        console.log("=".repeat(80));
        
        const diffs = naoMatches.map(r => r.diff);
        const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const maxDiff = Math.max(...diffs);
        const minDiff = Math.min(...diffs);
        
        console.log(`Diferença média: R$ ${avgDiff.toFixed(2)}`);
        console.log(`Diferença máxima: R$ ${maxDiff.toFixed(2)}`);
        console.log(`Diferença mínima: R$ ${minDiff.toFixed(2)}`);
        
        // Verificar se há padrão por tipo de usuário
        console.log("\nVerificando se não-matches têm algum padrão específico...");
    }
    
    // Salvar resultados
    fs.writeFileSync('../investigation-docs/qz1_formula_test.json', JSON.stringify({
        testDate: new Date().toISOString(),
        totalTestados,
        matchesPerfeitos,
        matchesProximos,
        pctPerfeitos: (matchesPerfeitos/totalTestados*100).toFixed(1),
        pctProximos: (matchesProximos/totalTestados*100).toFixed(1),
        resultados: resultados.slice(0, 50), // Primeiros 50 para amostra
        naoMatches: naoMatches.slice(0, 20) // Primeiros 20 não-matches
    }, null, 2));
    
    console.log("\nResultados salvos em investigation-docs/qz1_formula_test.json");
    
    return { matchesPerfeitos, matchesProximos, totalTestados };
}

testQZ1Formula().catch(console.error);