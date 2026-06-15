const XLSX = require('xlsx');
const fs = require('fs');

console.log("=".repeat(80));
console.log("ANÁLISE DETALHADA DA ABA PAINEL");
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
    
    // Investigar especificamente a aba PAINEL
    console.log("\n" + "=".repeat(80));
    console.log("ABA PAINEL - ANÁLISE COMPLETA");
    console.log("=".repeat(80));
    
    const sheet = workbook.Sheets['PAINEL'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    
    console.log(`${rows.length} linhas na aba PAINEL`);
    
    if (rows.length > 0) {
        const header = rows[0] || [];
        console.log(`\nHeader (${header.length} colunas):`);
        header.forEach((h, idx) => {
            console.log(`  ${idx}: "${h}"`);
        });
        
        // Mostrar a linha do RAFAEL detalhadamente
        console.log("\n" + "=".repeat(80));
        console.log("LINHA DO RAFAEL AMORIM VELLO");
        console.log("=".repeat(80));
        
        const cpfAlvo = '01677920599';
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            
            // Verificar se é o RAFAEL (coluna 2 tem CPF, coluna 1 tem nome)
            const cpf = normCPF(row[2]);
            const nome = String(row[1] || '').toUpperCase();
            
            if (cpf === cpfAlvo || nome.includes('RAFAEL AMORIM VELLO')) {
                console.log(`\nLinha ${i + 1}:`);
                row.forEach((val, idx) => {
                    console.log(`  Coluna ${idx} (${header[idx] || 'SEM_NOME'}): ${val}`);
                });
            }
        }
        
        // Agora vou extrair todos os dados necessários de todos os usuários
        console.log("\n" + "=".repeat(80));
        console.log("EXTRAINDO DADOS DE TODOS OS USUÁRIOS");
        console.log("=".repeat(80));
        
        const usuarios = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            
            const nome = row[1];
            const cpf = normCPF(row[2]);
            
            if (nome && cpf) {
                usuarios.push({
                    linha: i + 1,
                    nome,
                    cpf,
                    dados: row
                });
            }
        }
        
        console.log(`${usuarios.length} usuários encontrados`);
        
        // Comparar com a planilha
        console.log("\n" + "=".repeat(80));
        console.log("COMPARANDO COM PLANILHA ABRIL 1QZ");
        console.log("=".repeat(80));
        
        const planilhaData = JSON.parse(fs.readFileSync(`${DATA_DIR}/../investigation-docs/analise_exaustiva_abril_1qz.json`, 'utf8'));
        
        let matches = 0;
        let erros = [];
        
        for (const usuarioPlanilha of planilhaData) {
            const cpfPlanilha = normCPF(usuarioPlanilha.cpf);
            const usuarioPainel = usuarios.find(u => u.cpf === cpfPlanilha);
            
            if (usuarioPainel) {
                // Verificar se os valores batem
                // Preciso descobrir quais colunas correspondem a quais campos
                const dadosPainel = usuarioPainel.dados;
                
                // Vou tentar encontrar o valor de 1QZ (coluna 20 tem 16000 para Rafael)
                const valorCol20 = dadosPainel[20];
                const qzPlanilha = usuarioPlanilha.camposFinanceiros['1QZ DE ABRIL 26'];
                
                const diff = Math.abs(valorCol20 - qzPlanilha);
                
                if (diff < 0.01) {
                    matches++;
                } else {
                    erros.push({
                        nome: usuarioPlanilha.portador,
                        planilha: qzPlanilha,
                        painel: valorCol20,
                        diff
                    });
                }
            }
        }
        
        console.log(`Matches: ${matches}/${planilhaData.length}`);
        
        if (erros.length > 0) {
            console.log("\nErros (primeiros 10):");
            erros.slice(0, 10).forEach(err => {
                console.log(`  ${err.nome}: planilha=${err.planilha}, painel=${err.painel}, diff=${err.diff}`);
            });
        }
        
        // Salvar dados extraídos
        const resultado = {
            header,
            usuarios,
            matches,
            erros: erros.slice(0, 20)
        };
        
        fs.writeFileSync(`${DATA_DIR}/../investigation-docs/painel_complete_analysis.json`, JSON.stringify(resultado, null, 2));
        console.log("\nDados salvos em investigation-docs/painel_complete_analysis.json");
    }
    
} catch (error) {
    console.error("Erro ao ler arquivo:", error.message);
}