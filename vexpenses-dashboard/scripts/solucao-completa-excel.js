const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("SOLUÇÃO COMPLETA: EXTRAÇÃO AUTOMÁTICA DO ARQUIVO EXCEL");
console.log("=".repeat(80));

const DATA_DIR = 'C:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/data';

function normCPF(v) {
    if (!v) return '';
    return String(v).replace(/\D/g, '').padStart(11, '0');
}

// Ler o arquivo de CONTROLE
console.log("\nLendo arquivo CONTROLE - VEXPENSES - ABRIL- 2026.xlsb...");
try {
    const workbook = XLSX.readFile(`${DATA_DIR}/CONTROLE - VEXPENSES - ABRIL- 2026.xlsb`, { type: 'file', cellDates: true });
    
    // Ler aba PAINEL
    console.log("\nLendo aba PAINEL...");
    const painelSheet = workbook.Sheets['PAINEL'];
    const painelRows = XLSX.utils.sheet_to_json(painelSheet, { header: 1, defval: null, raw: true });
    
    // Criar mapa CPF -> dados PAINEL
    const painelMap = {};
    for (let i = 1; i < painelRows.length; i++) {
        const row = painelRows[i];
        if (!row) continue;
        
        const nome = row[1];
        const cpf = normCPF(row[2]);
        
        if (nome && cpf) {
            painelMap[cpf] = {
                nome,
                cpf,
                linha: i + 1,
                dados: row
            };
        }
    }
    
    console.log(`${Object.keys(painelMap).length} usuários no PAINEL`);
    
    // Ler aba SALDO CARTAO
    console.log("\nLendo aba SALDO CARTAO...");
    const saldoCartaoSheet = workbook.Sheets['SALDO CARTAO'];
    const saldoCartaoRows = XLSX.utils.sheet_to_json(saldoCartaoSheet, { header: 1, defval: null, raw: true });
    
    // Criar mapa CPF -> array de saldos com datas
    const saldoCartaoMap = {};
    for (let i = 4; i < saldoCartaoRows.length; i++) {
        const row = saldoCartaoRows[i];
        if (!row) continue;
        
        // Lado esquerdo
        const cpfL = normCPF(row[2]);
        const valL = row[3] != null ? parseFloat(row[3]) : null;
        const datL = row[4];
        
        if (cpfL && valL !== null && datL) {
            const d = new Date(datL);
            const dataStr = d.toISOString().split('T')[0];
            if (!saldoCartaoMap[cpfL]) saldoCartaoMap[cpfL] = [];
            saldoCartaoMap[cpfL].push({ data: dataStr, valor: valL });
        }
        
        // Lado direito
        const cpfR = normCPF(row[10]);
        const valR = row[11] != null ? parseFloat(row[11]) : null;
        const datR = row[12];
        
        if (cpfR && valR !== null && datR) {
            const d = new Date(datR);
            const dataStr = d.toISOString().split('T')[0];
            if (!saldoCartaoMap[cpfR]) saldoCartaoMap[cpfR] = [];
            saldoCartaoMap[cpfR].push({ data: dataStr, valor: valR });
        }
    }
    
    // Ordenar saldos por data
    Object.keys(saldoCartaoMap).forEach(cpf => {
        saldoCartaoMap[cpf].sort((a, b) => a.data.localeCompare(b.data));
    });
    
    console.log(`${Object.keys(saldoCartaoMap).length} usuários com dados de SALDO CARTAO`);
    
    // Ler aba QUINZENAS
    console.log("\nLendo aba QUINZENAS...");
    const quinzenasSheet = workbook.Sheets['QUINZENAS'];
    const quinzenasRows = XLSX.utils.sheet_to_json(quinzenasSheet, { header: 1, defval: null, raw: true });
    
    const headerQZ = quinzenasRows[1] || [];
    const cpfIdxQZ = headerQZ.findIndex(h => String(h || '').toUpperCase().includes('CPF'));
    const valorIdxQZ = headerQZ.findIndex(h => String(h || '').toUpperCase().includes('VALOR') || String(h || '').toUpperCase().includes('Valor'));
    const qzIdxQZ = headerQZ.findIndex(h => String(h || '').toUpperCase().includes('QUINZENA'));
    const mesIdxQZ = headerQZ.findIndex(h => String(h || '').toUpperCase().includes('M'));
    const anoIdxQZ = headerQZ.findIndex(h => String(h || '').toUpperCase() === 'ANO');
    
    // Criar mapa CPF -> quinzenas
    const quinzenasMap = {};
    for (let i = 2; i < quinzenasRows.length; i++) {
        const row = quinzenasRows[i];
        if (!row) continue;
        
        const cpf = normCPF(row[cpfIdxQZ]);
        const valor = parseFloat(row[valorIdxQZ]) || 0;
        const qzStr = String(row[qzIdxQZ] || '').trim();
        const is1QZ = qzStr.startsWith('1');
        const is2QZ = qzStr.startsWith('2');
        if (!is1QZ && !is2QZ) continue;
        const qz = is2QZ ? 2 : 1;
        const mes = row[mesIdxQZ];
        const ano = parseInt(row[anoIdxQZ]) || 0;
        
        if (cpf && mes && ano) {
            const key = `${ano}-${String(mes).padStart(2,'0')}-${qz}`;
            if (!quinzenasMap[cpf]) quinzenasMap[cpf] = {};
            quinzenasMap[cpf][key] = valor;
        }
    }
    
    console.log(`${Object.keys(quinzenasMap).length} usuários com dados de QUINZENAS`);
    
    // Ler planilha de referência
    console.log("\nLendo planilha de referência (ABRIL 2026 1QZ)...");
    const planilhaData = JSON.parse(fs.readFileSync(`${DATA_DIR}/../investigation-docs/analise_exaustiva_abril_1qz.json`, 'utf8'));
    
    // Gerar planilha completa automaticamente
    console.log("\nGerando planilha completa automaticamente...");
    
    const planilhaGerada = [];
    let matches = 0;
    let erros = [];
    
    for (const usuarioPlanilha of planilhaData) {
        const cpf = normCPF(usuarioPlanilha.cpf);
        const painel = painelMap[cpf];
        const quinzenas = quinzenasMap[cpf];
        
        if (painel && quinzenas) {
            const dadosPainel = painel.dados;
            
            // Extrair dados do PAINEL
            const qz1Gerado = dadosPainel[20]; // Coluna 20 = 1QZ
            const saldoFinalGerado = dadosPainel[18]; // Coluna 18 = SALDO FINAL (preciso verificar)
            const saldoCartaoGerado = dadosPainel[19]; // Coluna 19 = SALDO CARTAO (preciso verificar)
            
            // Buscar saldo cartão mais próximo de 15/04/2026
            let saldoCartaoExcel = null;
            const saldos = saldoCartaoMap[cpf] || [];
            const dataAlvo = '2026-04-15';
            
            for (let i = saldos.length - 1; i >= 0; i--) {
                if (saldos[i].data <= dataAlvo) {
                    saldoCartaoExcel = saldos[i].valor;
                    break;
                }
            }
            
            // Se não encontrou antes, usar o primeiro disponível
            if (saldoCartaoExcel === null && saldos.length > 0) {
                saldoCartaoExcel = saldos[0].valor;
            }
            
            // Extrair quinzena
            const quinzenaKey = '2026-04-1';
            const quinzenaValor = quinzenas[quinzenaKey] || 0;
            
            // Comparar com planilha
            const qzPlanilha = usuarioPlanilha.camposFinanceiros['1QZ DE ABRIL 26'];
            const saldoFinalPlanilha = usuarioPlanilha.camposFinanceiros['SALDO FINAL'];
            const saldoCartaoPlanilha = usuarioPlanilha.camposFinanceiros['SALDO CARTAO'];
            
            const diffQZ = Math.abs(qz1Gerado - qzPlanilha);
            const diffSaldoFinal = Math.abs(saldoFinalGerado - saldoFinalPlanilha);
            const diffSaldoCartao = Math.abs(saldoCartaoExcel - saldoCartaoPlanilha);
            
            const matchQZ = diffQZ < 0.01;
            const matchSaldoFinal = diffSaldoFinal < 0.01;
            const matchSaldoCartao = diffSaldoCartao < 0.01;
            
            if (matchQZ && matchSaldoFinal && matchSaldoCartao) {
                matches++;
            } else {
                erros.push({
                    nome: usuarioPlanilha.portador,
                    qz: { planilha: qzPlanilha, gerado: qz1Gerado, diff: diffQZ, match: matchQZ },
                    saldoFinal: { planilha: saldoFinalPlanilha, gerado: saldoFinalGerado, diff: diffSaldoFinal, match: matchSaldoFinal },
                    saldoCartao: { planilha: saldoCartaoPlanilha, gerado: saldoCartaoExcel, diff: diffSaldoCartao, match: matchSaldoCartao }
                });
            }
            
            planilhaGerada.push({
                nome: usuarioPlanilha.portador,
                cpf,
                qz1: qz1Gerado,
                saldoFinal: saldoFinalGerado,
                saldoCartao: saldoCartaoExcel,
                quinzena: quinzenaValor,
                match: matchQZ && matchSaldoFinal && matchSaldoCartao
            });
        }
    }
    
    console.log(`\nMatches: ${matches}/${planilhaData.length}`);
    console.log(`Precisão: ${(matches / planilhaData.length * 100).toFixed(2)}%`);
    
    if (erros.length > 0) {
        console.log("\nErros:");
        erros.forEach(err => {
            console.log(`  ${err.nome}:`);
            console.log(`    QZ: planilha=${err.qz.planilha}, gerado=${err.qz.gerado}, match=${err.qz.match}`);
            console.log(`    Saldo Final: planilha=${err.saldoFinal.planilha}, gerado=${err.saldoFinal.gerado}, match=${err.saldoFinal.match}`);
            console.log(`    Saldo Cartão: planilha=${err.saldoCartao.planilha}, gerado=${err.saldoCartao.gerado}, match=${err.saldoCartao.match}`);
        });
    }
    
    // Salvar resultado
    const resultado = {
        matches,
        total: planilhaData.length,
        precisao: matches / planilhaData.length * 100,
        erros,
        planilhaGerada
    };
    
    fs.writeFileSync(`${DATA_DIR}/../investigation-docs/solucao_completa_excel.json`, JSON.stringify(resultado, null, 2));
    console.log("\nDados salvos em investigation-docs/solucao_completa_excel.json");
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
    console.error(error.stack);
}