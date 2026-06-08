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

async function investigateAllPeriods() {
    console.log("=".repeat(80));
    console.log("INVESTIGANDO TODOS OS PERÍODOS PARA RAFAEL AMORIM VELLO");
    console.log("=".repeat(80));
    
    const userId = 896300; // RAFAEL AMORIM VELLO
    
    // Ler planilha
    const rawData = fs.readFileSync('../investigation-docs/analise_exaustiva_abril_1qz.json', 'utf8');
    const planilha = JSON.parse(rawData);
    
    const usuarioAlvo = planilha.find(u => u.portador === 'RAFAEL AMORIM VELLO');
    
    console.log("\nUSUÁRIO ALVO:");
    console.log(`  Nome: ${usuarioAlvo.portador}`);
    console.log(`  1QZ DE ABRIL 26: R$ ${usuarioAlvo.camposFinanceiros['1QZ DE ABRIL 26']}`);
    console.log(`  SALDO FINAL: R$ ${usuarioAlvo.camposFinanceiros['SALDO FINAL']}`);
    console.log(`  SALDO CARTAO: R$ ${usuarioAlvo.camposFinanceiros['SALDO CARTAO']}`);
    
    // Buscar expenses de TODO o ano
    console.log("\nBuscando expenses de todo 2026...");
    const expensesYear = await makeRequest('/expenses', {
        search: `user_id:${userId},created_at:2026-01-01,2026-12-31`,
        searchFields: 'user_id:equals,created_at:between',
        searchJoin: 'and',
        include: 'paymentMethod,report',
        paginate: 'false',
        per_page: '5000'
    });
    
    const expensesYearData = expensesYear.data.data || [];
    console.log(`${expensesYearData.length} expenses encontrados em todo 2026`);
    
    if (expensesYearData.length > 0) {
        const totalYear = expensesYearData.reduce((sum, e) => sum + (e.amount || e.value || 0), 0);
        console.log(`Total ano: R$ ${totalYear.toFixed(2)}`);
        
        // Agrupar por mês
        const porMes = {};
        expensesYearData.forEach(exp => {
            const data = new Date(exp.created_at || exp.date);
            const mes = data.getMonth() + 1;
            const chave = `${mes}`;
            if (!porMes[chave]) {
                porMes[chave] = 0;
            }
            porMes[chave] += (exp.amount || e.value || 0);
        });
        
        console.log("\nPor mês:");
        Object.keys(porMes).sort().forEach(mes => {
            console.log(`  Mês ${mes}: R$ ${porMes[mes].toFixed(2)}`);
        });
        
        // Agrupar por quinzena
        const porQuinzena = {};
        expensesYearData.forEach(exp => {
            const data = new Date(exp.created_at || exp.date);
            const mes = data.getMonth() + 1;
            const dia = data.getDate();
            const quinzena = dia <= 15 ? 1 : 2;
            const chave = `${mes}-${quinzena}`;
            if (!porQuinzena[chave]) {
                porQuinzena[chave] = 0;
            }
            porQuinzena[chave] += (exp.amount || e.value || 0);
        });
        
        console.log("\nPor quinzena:");
        Object.keys(porQuinzena).sort().forEach(chave => {
            console.log(`  QZ ${chave}: R$ ${porQuinzena[chave].toFixed(2)}`);
        });
        
        // Verificar abril 1QZ especificamente
        const abril1QZ = porQuinzena['4-1'] || 0;
        console.log(`\nAbril 1QZ: R$ ${abril1QZ.toFixed(2)}`);
        console.log(`Planilha: R$ ${usuarioAlvo.camposFinanceiros['1QZ DE ABRIL 26']}`);
        console.log(`Match: ${Math.abs(abril1QZ - usuarioAlvo.camposFinanceiros['1QZ DE ABRIL 26']) < 0.01 ? 'SIM' : 'NÃO'}`);
    }
    
    // Buscar reports de TODO o ano
    console.log("\nBuscando reports de todo 2026...");
    const reportsYear = await makeRequest('/reports', {
        search: `user_id:${userId},created_at:2026-01-01,2026-12-31`,
        searchFields: 'user_id:equals,created_at:between',
        searchJoin: 'and',
        include: 'expenses',
        paginate: 'false',
        per_page: '5000'
    });
    
    const reportsYearData = reportsYear.data.data || [];
    console.log(`${reportsYearData.length} reports encontrados em todo 2026`);
    
    if (reportsYearData.length > 0) {
        const totalYearReports = reportsYearData.reduce((sum, r) => sum + (r.total || 0), 0);
        console.log(`Total ano: R$ ${totalYearReports.toFixed(2)}`);
        
        // Agrupar por quinzena
        const porQuinzenaRep = {};
        reportsYearData.forEach(rep => {
            const data = new Date(rep.created_at);
            const mes = data.getMonth() + 1;
            const dia = data.getDate();
            const quinzena = dia <= 15 ? 1 : 2;
            const chave = `${mes}-${quinzena}`;
            if (!porQuinzenaRep[chave]) {
                porQuinzenaRep[chave] = 0;
            }
            porQuinzenaRep[chave] += (rep.total || 0);
        });
        
        console.log("\nReports por quinzena:");
        Object.keys(porQuinzenaRep).sort().forEach(chave => {
            console.log(`  QZ ${chave}: R$ ${porQuinzenaRep[chave].toFixed(2)}`);
        });
        
        // Verificar abril 1QZ especificamente
        const abril1QZRep = porQuinzenaRep['4-1'] || 0;
        console.log(`\nAbril 1QZ: R$ ${abril1QZRep.toFixed(2)}`);
        console.log(`Planilha: R$ ${usuarioAlvo.camposFinanceiros['1QZ DE ABRIL 26']}`);
        console.log(`Match: ${Math.abs(abril1QZRep - usuarioAlvo.camposFinanceiros['1QZ DE ABRIL 26']) < 0.01 ? 'SIM' : 'NÃO'}`);
    }
    
    // Buscar dados completos do usuário para ver se há algum campo com esse valor
    console.log("\nBuscando dados completos do usuário...");
    const userDetail = await makeRequest(`/team-members/${userId}`, {
        include: 'costsCenters,company,role,permissions'
    });
    
    console.log("Campos do usuário:");
    console.log(JSON.stringify(userDetail.data, null, 2));
    
    // Buscar cards do usuário
    console.log("\nBuscando cards do usuário...");
    try {
        const cards = await makeRequest(`/cards`, {
            search: `user_id:${userId}`,
            searchFields: 'user_id:equals',
            paginate: 'false',
            per_page: '500'
        });
        
        console.log(`Cards encontrados: ${cards.data.data?.length || 0}`);
        if (cards.data.data?.length > 0) {
            console.log("Detalhes dos cards:");
            cards.data.data.forEach((card, idx) => {
                console.log(`  ${idx + 1}. ${JSON.stringify(card)}`);
            });
        }
    } catch (e) {
        console.log("Erro ao buscar cards:", e.message);
    }
    
    // Salvar resultado
    const resultado = {
        usuarioPlanilha: usuarioAlvo,
        expensesYear: expensesYearData,
        reportsYear: reportsYearData,
        userDetail: userDetail.data
    };
    
    fs.writeFileSync('../investigation-docs/investigate_all_periods_rafael.json', JSON.stringify(resultado, null, 2));
    console.log("\nDados salvos em investigation-docs/investigate_all_periods_rafael.json");
}

investigateAllPeriods().catch(console.error);