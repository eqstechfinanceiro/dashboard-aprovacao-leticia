const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("SOLUÇÃO COMPLETA: EXTRAÇÃO DO ARQUIVO 1QZ ABRIL 2026");
console.log("=".repeat(80));

const DATA_DIR = 'C:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/data';

function normCPF(v) {
    if (!v) return '';
    return String(v).replace(/\D/g, '').padStart(11, '0');
}

// Ler o arquivo 1QZ ABRIL 2026
console.log("\nLendo arquivo 1QZ ABRIL 2026 - VEXPENSES.xlsx...");
try {
    const workbook = XLSX.readFile(`${DATA_DIR}/1QZ ABRIL 2026 - VEXPENSES.xlsx`, { type: 'file', cellDates: true });
    
    // Ler aba principal
    console.log("\nLendo aba '1 QZ VEXPENSES 04_2026'...");
    const sheet = workbook.Sheets['1 QZ VEXPENSES 04_2026'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    
    console.log(`${rows.length} linhas`);
    
    // Criar mapa CPF -> dados
    const dadosMap = {};
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        
        const nome = row[1];
        const cpf = normCPF(row[2]);
        
        if (nome && cpf) {
            dadosMap[cpf] = {
                linha: i + 1,
                nome,
                cpf,
                saldoFinal: row[9] || 0,
                qz1: row[10] || 0,
                saldoCartao: row[11] || 0,
                cargaParcial: row[12] || 0,
                reembolso: row[13] || 0,
                cargaFinal: row[14] || 0
            };
        }
    }
    
    console.log(`${Object.keys(dadosMap).length} usuários extraídos`);
    
    // Ler planilha de referência
    console.log("\nLendo planilha de referência...");
    const planilhaData = JSON.parse(fs.readFileSync(`${DATA_DIR}/../investigation-docs/analise_exaustiva_abril_1qz.json`, 'utf8'));
    
    // Comparar com planilha de referência
    console.log("\nValidando contra planilha de referência...");
    let matches = 0;
    let total = 0;
    let erros = [];
    
    for (const usuarioPlanilha of planilhaData) {
        const cpf = normCPF(usuarioPlanilha.cpf);
        const dados = dadosMap[cpf];
        
        if (dados) {
            total++;
            const saldoFinalPlanilha = usuarioPlanilha.camposFinanceiros['SALDO FINAL'];
            const qz1Planilha = usuarioPlanilha.camposFinanceiros['1QZ DE ABRIL 26'];
            const saldoCartaoPlanilha = usuarioPlanilha.camposFinanceiros['SALDO CARTAO'];
            const cargaParcialPlanilha = usuarioPlanilha.camposFinanceiros['CARGA PARCIAL'];
            const reembolsoPlanilha = usuarioPlanilha.camposFinanceiros['REEMBOLSO'];
            const cargaFinalPlanilha = usuarioPlanilha.camposFinanceiros['CARGA FINAL'] || 0;
            
            const diffFinal = Math.abs(dados.saldoFinal - saldoFinalPlanilha);
            const diffQZ1 = Math.abs(dados.qz1 - qz1Planilha);
            const diffCartao = Math.abs(dados.saldoCartao - saldoCartaoPlanilha);
            const diffCargaParcial = Math.abs(dados.cargaParcial - cargaParcialPlanilha);
            const diffReembolso = Math.abs(dados.reembolso - reembolsoPlanilha);
            const diffCargaFinal = Math.abs(dados.cargaFinal - cargaFinalPlanilha);
            
            const matchFinal = diffFinal < 0.01;
            const matchQZ1 = diffQZ1 < 0.01;
            const matchCartao = diffCartao < 0.01;
            const matchCargaParcial = diffCargaParcial < 0.01;
            const matchReembolso = diffReembolso < 0.01;
            const matchCargaFinal = diffCargaFinal < 0.01;
            
            if (matchFinal && matchQZ1 && matchCartao && matchCargaParcial && matchReembolso && matchCargaFinal) {
                matches++;
            } else {
                erros.push({
                    nome: usuarioPlanilha.portador,
                    saldoFinal: { planilha: saldoFinalPlanilha, excel: dados.saldoFinal, match: matchFinal, diff: diffFinal },
                    qz1: { planilha: qz1Planilha, excel: dados.qz1, match: matchQZ1, diff: diffQZ1 },
                    saldoCartao: { planilha: saldoCartaoPlanilha, excel: dados.saldoCartao, match: matchCartao, diff: diffCartao },
                    cargaParcial: { planilha: cargaParcialPlanilha, excel: dados.cargaParcial, match: matchCargaParcial, diff: diffCargaParcial },
                    reembolso: { planilha: reembolsoPlanilha, excel: dados.reembolso, match: matchReembolso, diff: diffReembolso },
                    cargaFinal: { planilha: cargaFinalPlanilha, excel: dados.cargaFinal, match: matchCargaFinal, diff: diffCargaFinal }
                });
            }
        }
    }
    
    console.log(`\nMatches: ${matches}/${total} (${(matches/total*100).toFixed(2)}%)`);
    
    if (matches === total) {
        console.log("\n🎉🎉🎉 PERFEITO! 100% DE PRECISÃO! 🎉🎉🎉");
    } else {
        console.log(`\nErros (${erros.length}):`);
        erros.slice(0, 5).forEach(err => {
            console.log(`  ${err.nome}:`);
            console.log(`    SALDO FINAL: ${err.saldoFinal.match ? '✅' : '❌'} (diff: ${err.saldoFinal.diff.toFixed(2)})`);
            console.log(`    QZ1: ${err.qz1.match ? '✅' : '❌'} (diff: ${err.qz1.diff.toFixed(2)})`);
            console.log(`    SALDO CARTÃO: ${err.saldoCartao.match ? '✅' : '❌'} (diff: ${err.saldoCartao.diff.toFixed(2)})`);
        });
    }
    
    // Salvar resultado
    const resultado = {
        matches,
        total,
        precisao: matches / total * 100,
        erros,
        dadosExtraidos: dadosMap
    };
    
    fs.writeFileSync(`${DATA_DIR}/../investigation-docs/solucao_100_percent.json`, JSON.stringify(resultado, null, 2));
    console.log("\nDados salvos em investigation-docs/solucao_100_percent.json");
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}