"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFaturaOrCartao = isFaturaOrCartao;
// Canonical report-name filter — determines if a report is a FATURA/CARTAO
// (credit-card statement) rather than a CAIXA/prestacao report.
// Used by: pipeline snapshots, quinzena-complete, quinzena-export, nf-validator.
function isFaturaOrCartao(name) {
    const n = name.trim().toUpperCase();
    if (n.includes('CAIXA ITAU') || n.includes('CAIXA ITAÚ'))
        return true;
    if (n.startsWith('CAIXA'))
        return false;
    if (/^(FATURA|CARTAO|CARTÃO|FATUAR|FARTUR|FATUT|FARUR|FATUTR)/.test(n))
        return true;
    if (n.includes('CARTÃO DE CRÉDITO') || n.includes('CARTAO DE CREDITO') || n.includes('CARTÃO DE CREDITO'))
        return true;
    if (n.includes('CARTÃO CORPORATIVO'))
        return true;
    if ((n.includes('ITAU') || n.includes('ITAÚ')) && !n.includes('CAIXA'))
        return true;
    if (n.includes('DOLAR') || n.includes('DÓLAR'))
        return true;
    if (n.startsWith('DESPESA') && n.includes('FATURA'))
        return true;
    if (n.startsWith('COMPLEMENTAR') && n.includes('FATURA'))
        return true;
    if (n.includes('CARTÃO') && n.includes('CRÉDITO'))
        return true;
    if (n.includes('CARTAO') && n.includes('CREDITO'))
        return true;
    if (n.startsWith('CARTÃO VEXPENSES'))
        return true;
    return false;
}
