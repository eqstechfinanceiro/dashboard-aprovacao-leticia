const fs = require('fs');

console.log("Analisando dados de abril...");

// Carregar dados
const data = JSON.parse(fs.readFileSync('../vexpenses-dashboard/planilha-1qz-data.json', 'utf-8'));

console.log(`Dados carregados! Tipo: ${Array.isArray(data) ? 'Array' : typeof data}`);
console.log(`Total de entradas: ${data.length}`);

if (data.length > 0) {
    console.log(`Primeiro usuário:`, JSON.stringify(data[0], null, 2));
    console.log(`Chaves: ${Object.keys(data[0]).join(', ')}`);
}

// Análise de saldos
const saldoFinalValues = [];
const saldoCartaoValues = [];
const saldoReembolsarValues = [];
const qz1Values = [];
const adiantamentoValues = [];

const usersWithSaldoFinal = [];
const usersWithSaldoCartao = [];
const usersWithSaldoReembolsar = [];

console.log("\nProcessando dados...");
for (let i = 0; i < Math.min(data.length, 50); i++) {
    const entry = data[i];
    
    const saldoFinal = entry['SALDO FINAL'];
    const saldoCartao = entry['SALDO CARTAO'];
    const saldoReembolsar = entry['SALDO REEMBOLSAR'];
    const qz1 = entry['1QZ DE ABRIL 26'];
    const adiantamento = entry['ADIANTAMENTO'];
    const portador = entry['PORTADOR'] || 'N/A';
    const cpf = entry['CPF'] || 'N/A';
    
    if (saldoFinal !== null && saldoFinal !== undefined) {
        saldoFinalValues.push(saldoFinal);
        usersWithSaldoFinal.push({
            cpf, portador, saldoFinal, saldoCartao, qz1, adiantamento
        });
    }
    
    if (saldoCartao !== null && saldoCartao !== undefined) {
        saldoCartaoValues.push(saldoCartao);
        usersWithSaldoCartao.push({
            cpf, portador, saldoCartao, qz1
        });
    }
    
    if (saldoReembolsar !== null && saldoReembolsar !== undefined) {
        saldoReembolsarValues.push(saldoReembolsar);
        usersWithSaldoReembolsar.push({
            cpf, portador, saldoReembolsar, saldoFinal, saldoCartao
        });
    }
    
    if (qz1 !== null && qz1 !== undefined) {
        qz1Values.push(qz1);
    }
    
    if (adiantamento !== null && adiantamento !== undefined) {
        adiantamentoValues.push(adiantamento);
    }
}

console.log("\n" + "=".repeat(80));
console.log("ESTATÍSTICAS DOS SALDOS");
console.log("=".repeat(80));

console.log(`\nSALDO FINAL:`);
console.log(`  Usuários com dado: ${saldoFinalValues.length}`);
if (saldoFinalValues.length > 0) {
    saldoFinalValues.sort((a, b) => a - b);
    console.log(`  Mínimo: R$ ${saldoFinalValues[0].toFixed(2)}`);
    console.log(`  Máximo: R$ ${saldoFinalValues[saldoFinalValues.length - 1].toFixed(2)}`);
    const mean = saldoFinalValues.reduce((a, b) => a + b, 0) / saldoFinalValues.length;
    console.log(`  Média: R$ ${mean.toFixed(2)}`);
    console.log(`  Mediana: R$ ${saldoFinalValues[Math.floor(saldoFinalValues.length / 2)].toFixed(2)}`);
}

console.log(`\nSALDO CARTÃO:`);
console.log(`  Usuários com dado: ${saldoCartaoValues.length}`);
if (saldoCartaoValues.length > 0) {
    saldoCartaoValues.sort((a, b) => a - b);
    console.log(`  Mínimo: R$ ${saldoCartaoValues[0].toFixed(2)}`);
    console.log(`  Máximo: R$ ${saldoCartaoValues[saldoCartaoValues.length - 1].toFixed(2)}`);
    const mean = saldoCartaoValues.reduce((a, b) => a + b, 0) / saldoCartaoValues.length;
    console.log(`  Média: R$ ${mean.toFixed(2)}`);
    console.log(`  Mediana: R$ ${saldoCartaoValues[Math.floor(saldoCartaoValues.length / 2)].toFixed(2)}`);
}

console.log(`\nSALDO REEMBOLSAR:`);
console.log(`  Usuários com dado: ${saldoReembolsarValues.length}`);
if (saldoReembolsarValues.length > 0) {
    saldoReembolsarValues.sort((a, b) => a - b);
    console.log(`  Mínimo: R$ ${saldoReembolsarValues[0].toFixed(2)}`);
    console.log(`  Máximo: R$ ${saldoReembolsarValues[saldoReembolsarValues.length - 1].toFixed(2)}`);
    const mean = saldoReembolsarValues.reduce((a, b) => a + b, 0) / saldoReembolsarValues.length;
    console.log(`  Média: R$ ${mean.toFixed(2)}`);
    console.log(`  Mediana: R$ ${saldoReembolsarValues[Math.floor(saldoReembolsarValues.length / 2)].toFixed(2)}`);
}

console.log(`\n1QZ (QUINZENA):`);
console.log(`  Usuários com dado: ${qz1Values.length}`);
if (qz1Values.length > 0) {
    qz1Values.sort((a, b) => a - b);
    console.log(`  Mínimo: R$ ${qz1Values[0].toFixed(2)}`);
    console.log(`  Máximo: R$ ${qz1Values[qz1Values.length - 1].toFixed(2)}`);
    const mean = qz1Values.reduce((a, b) => a + b, 0) / qz1Values.length;
    console.log(`  Média: R$ ${mean.toFixed(2)}`);
    console.log(`  Mediana: R$ ${qz1Values[Math.floor(qz1Values.length / 2)].toFixed(2)}`);
}

console.log(`\nADIANTAMENTO:`);
console.log(`  Usuários com dado: ${adiantamentoValues.length}`);
if (adiantamentoValues.length > 0) {
    adiantamentoValues.sort((a, b) => a - b);
    console.log(`  Mínimo: R$ ${adiantamentoValues[0].toFixed(2)}`);
    console.log(`  Máximo: R$ ${adiantamentoValues[adiantamentoValues.length - 1].toFixed(2)}`);
    const mean = adiantamentoValues.reduce((a, b) => a + b, 0) / adiantamentoValues.length;
    console.log(`  Média: R$ ${mean.toFixed(2)}`);
}

// Mostrar exemplos
console.log("\n" + "=".repeat(80));
console.log("EXEMPLOS DE USUÁRIOS COM SALDO FINAL");
console.log("=".repeat(80));
usersWithSaldoFinal.slice(0, 10).forEach(user => {
    const ratio = user.qz1 > 0 ? user.saldoFinal / user.qz1 : 0;
    console.log(`  ${user.portador}: SALDO FINAL=R$ ${user.saldoFinal.toFixed(2)}, QZ1=R$ ${user.qz1?.toFixed(2) || 'N/A'}, Ratio=${ratio.toFixed(4)}`);
});

console.log("\n" + "=".repeat(80));
console.log("EXEMPLOS DE USUÁRIOS COM SALDO CARTÃO");
console.log("=".repeat(80));
usersWithSaldoCartao.slice(0, 10).forEach(user => {
    const ratio = user.qz1 > 0 ? user.saldoCartao / user.qz1 : 0;
    console.log(`  ${user.portador}: SALDO CARTÃO=R$ ${user.saldoCartao.toFixed(2)}, QZ1=R$ ${user.qz1?.toFixed(2) || 'N/A'}, Ratio=${ratio.toFixed(4)}`);
});

// Salvar análise
const output = {
    analysis_date: new Date().toISOString(),
    sample_size: 50,
    statistics: {
        total_users: data.length,
        users_with_saldo_final: saldoFinalValues.length,
        users_with_saldo_cartao: saldoCartaoValues.length,
        users_with_saldo_reembolsar: saldoReembolsarValues.length,
        users_with_qz1: qz1Values.length,
        users_with_adiantamento: adiantamentoValues.length
    },
    saldo_final_stats: {
        count: saldoFinalValues.length,
        min: saldoFinalValues.length > 0 ? Math.min(...saldoFinalValues) : null,
        max: saldoFinalValues.length > 0 ? Math.max(...saldoFinalValues) : null,
        mean: saldoFinalValues.length > 0 ? saldoFinalValues.reduce((a, b) => a + b, 0) / saldoFinalValues.length : null
    },
    saldo_cartao_stats: {
        count: saldoCartaoValues.length,
        min: saldoCartaoValues.length > 0 ? Math.min(...saldoCartaoValues) : null,
        max: saldoCartaoValues.length > 0 ? Math.max(...saldoCartaoValues) : null,
        mean: saldoCartaoValues.length > 0 ? saldoCartaoValues.reduce((a, b) => a + b, 0) / saldoCartaoValues.length : null
    },
    sample_users_with_saldo_final: usersWithSaldoFinal.slice(0, 20)
};

fs.writeFileSync('../investigation-docs/april_saldo_patterns_analysis.json', JSON.stringify(output, null, 2));
console.log("\n" + "=".repeat(80));
console.log("Análise salva em investigation-docs/april_saldo_patterns_analysis.json");
console.log("=".repeat(80));