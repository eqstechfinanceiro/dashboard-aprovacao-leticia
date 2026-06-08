const fs = require('fs');

console.log("=".repeat(80));
console.log("ANÁLISE EXAUSTIVA DA PLANILHA ABRIL 1QZ");
console.log("=".repeat(80));

// Carregar dados da planilha
const planilhaData = JSON.parse(fs.readFileSync('../vexpenses-dashboard/planilha-1qz-data.json', 'utf-8'));
console.log(`\nTotal de usuários na planilha: ${planilhaData.length}`);

// Selecionar alguns usuários para análise detalhada
const usuariosParaAnalise = planilhaData.slice(0, 20);

console.log("\n" + "=".repeat(80));
console.log("ANÁLISE DETALHADA POR USUÁRIO");
console.log("=".repeat(80));

const analiseDetalhada = [];

usuariosParaAnalise.forEach((usuario, index) => {
    console.log(`\n${index + 1}. ${usuario['PORTADOR']} (CPF: ${usuario['CPF']})`);
    console.log("-".repeat(80));
    
    const dadosUsuario = {
        indice: index + 1,
        portador: usuario['PORTADOR'],
        cpf: usuario['CPF'],
        statusColab: usuario['STATUS COLAB'],
        centroCusto: usuario['CENTRO CUSTO'],
        gestor: usuario['GESTOR'],
        direcao: usuario['DIREÇÃO'],
        statusCartao: usuario['STATUS DO CARTAO'],
        camposFinanceiros: {}
    };
    
    // Campos financeiros com valores exatos
    const campos = [
        '1QZ DE ABRIL 26',
        'SALDO FINAL', 
        'SALDO CARTAO',
        'ADIANTAMENTO',
        'CARGA PARCIAL',
        'REEMBOLSO',
        'CARGA FINAL',
        'SALDO REEMBOLSAR'
    ];
    
    campos.forEach(campo => {
        const valor = usuario[campo];
        dadosUsuario.camposFinanceiros[campo] = valor;
        
        if (valor !== null && valor !== undefined) {
            console.log(`  ${campo}: R$ ${valor.toFixed(2)}`);
        } else {
            console.log(`  ${campo}: NULO`);
        }
    });
    
    // Calcular relações entre campos
    if (usuario['1QZ DE ABRIL 26'] !== null) {
        const qz1 = usuario['1QZ DE ABRIL 26'];
        
        if (usuario['SALDO FINAL'] !== null) {
            dadosUsuario.camposFinanceiros['SALDO_FINAL_PCT_QZ1'] = usuario['SALDO FINAL'] / qz1;
            console.log(`  SALDO FINAL % do QZ1: ${(usuario['SALDO FINAL'] / qz1 * 100).toFixed(2)}%`);
        }
        
        if (usuario['SALDO CARTAO'] !== null) {
            dadosUsuario.camposFinanceiros['SALDO_CARTAO_PCT_QZ1'] = usuario['SALDO CARTAO'] / qz1;
            console.log(`  SALDO CARTAO % do QZ1: ${(usuario['SALDO CARTAO'] / qz1 * 100).toFixed(2)}%`);
        }
        
        if (usuario['REEMBOLSO'] !== null) {
            dadosUsuario.camposFinanceiros['REEMBOLSO_PCT_QZ1'] = usuario['REEMBOLSO'] / qz1;
            console.log(`  REEMBOLSO % do QZ1: ${(usuario['REEMBOLSO'] / qz1 * 100).toFixed(2)}%`);
        }
    }
    
    // Verificar se CARGA PARCIAL = QZ1 - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
    if (usuario['CARGA PARCIAL'] !== null && usuario['CARGA PARCIAL'] !== undefined) {
        const qz1 = usuario['1QZ DE ABRIL 26'] || 0;
        const saldoFinal = usuario['SALDO FINAL'] || 0;
        const saldoCartao = usuario['SALDO CARTAO'] || 0;
        const adiantamento = usuario['ADIANTAMENTO'] || 0;
        const esperado = qz1 - saldoFinal - saldoCartao - adiantamento;
        const diff = Math.abs(usuario['CARGA PARCIAL'] - esperado);
        dadosUsuario.camposFinanceiros['CARGA_PARCIAL_CALC'] = esperado;
        dadosUsuario.camposFinanceiros['CARGA_PARCIAL_DIFF'] = diff;
        dadosUsuario.camposFinanceiros['CARGA_PARCIAL_MATCH'] = diff < 0.01;
        
        console.log(`  CARGA PARCIAL (fórmula): R$ ${esperado.toFixed(2)}`);
        console.log(`  CARGA PARCIAL (planilha): R$ ${usuario['CARGA PARCIAL'].toFixed(2)}`);
        console.log(`  Diferença: R$ ${diff.toFixed(2)} ${diff < 0.01 ? '✅' : '❌'}`);
    }
    
    // Verificar se CARGA FINAL = MAX(0, CARGA PARCIAL) + REEMBOLSO
    if (usuario['CARGA FINAL'] !== null && usuario['CARGA FINAL'] !== undefined && usuario['CARGA PARCIAL'] !== null && usuario['CARGA PARCIAL'] !== undefined) {
        const reembolso = usuario['REEMBOLSO'] || 0;
        const esperado = Math.max(0, usuario['CARGA PARCIAL']) + reembolso;
        const diff = Math.abs(usuario['CARGA FINAL'] - esperado);
        dadosUsuario.camposFinanceiros['CARGA_FINAL_CALC'] = esperado;
        dadosUsuario.camposFinanceiros['CARGA_FINAL_DIFF'] = diff;
        dadosUsuario.camposFinanceiros['CARGA_FINAL_MATCH'] = diff < 0.01;
        
        console.log(`  CARGA FINAL (fórmula): R$ ${esperado.toFixed(2)}`);
        console.log(`  CARGA FINAL (planilha): R$ ${usuario['CARGA FINAL'].toFixed(2)}`);
        console.log(`  Diferença: R$ ${diff.toFixed(2)} ${diff < 0.01 ? '✅' : '❌'}`);
    }
    
    analiseDetalhada.push(dadosUsuario);
});

// Salvar análise completa
fs.writeFileSync('../investigation-docs/analise_exaustiva_abril_1qz.json', JSON.stringify(analiseDetalhada, null, 2));

// Estatísticas gerais
console.log("\n" + "=".repeat(80));
console.log("ESTATÍSTICAS GERAIS");
console.log("=".repeat(80));

const camposNulos = {};
campos.forEach(campo => {
    const nulos = planilhaData.filter(u => u[campo] === null || u[campo] === undefined).length;
    camposNulos[campo] = {
        total: planilhaData.length,
        nulos: nulos,
        preenchidos: planilhaData.length - nulos,
        pct_preenchidos: ((planilhaData.length - nulos) / planilhaData.length * 100).toFixed(1)
    };
    console.log(`${campo}: ${camposNulos[campo].preenchidos}/${planilhaData.length} (${camposNulos[campo].pct_preenchidos}%)`);
});

// Validação das fórmulas
const cargaParcialMatches = analiseDetalhada.filter(u => u.camposFinanceiros['CARGA_PARCIAL_MATCH']).length;
const cargaParcialTotal = analiseDetalhada.filter(u => u.camposFinanceiros['CARGA_PARCIAL_CALC'] !== undefined).length;
const cargaFinalMatches = analiseDetalhada.filter(u => u.camposFinanceiros['CARGA_FINAL_MATCH']).length;
const cargaFinalTotal = analiseDetalhada.filter(u => u.camposFinanceiros['CARGA_FINAL_CALC'] !== undefined).length;

console.log(`\nValidação de fórmulas:`);
console.log(`CARGA PARCIAL: ${cargaParcialMatches}/${cargaParcialTotal} match (${(cargaParcialMatches/cargaParcialTotal*100).toFixed(1)}%)`);
console.log(`CARGA FINAL: ${cargaFinalMatches}/${cargaFinalTotal} match (${(cargaFinalMatches/cargaFinalTotal*100).toFixed(1)}%)`);

fs.writeFileSync('../investigation-docs/estatisticas_gerais_abril.json', JSON.stringify({
    camposNulos,
    validacaoFormulas: {
        cargaParcial: { matches: cargaParcialMatches, total: cargaParcialTotal },
        cargaFinal: { matches: cargaFinalMatches, total: cargaFinalTotal }
    }
}, null, 2));

console.log("\nAnálise salva em investigation-docs/analise_exaustiva_abril_1qz.json");
console.log("Estatísticas salvas em investigation-docs/estatisticas_gerais_abril.json");