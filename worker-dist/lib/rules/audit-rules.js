"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCaixaRefMonth = extractCaixaRefMonth;
exports.auditExpense = auditExpense;
exports.summarizeReportAudit = summarizeReportAudit;
const PROHIBITED_KEYWORDS = [
    'bebida alcoolica', 'cerveja', 'vinho', 'whisky', 'cachaca', 'vodka', 'champanhe',
    'cigarro', 'tabaco',
    'recarga celular', 'acessorio celular',
    'medicamento', 'farmacia', 'drogaria',
    'gasolina', 'diesel', 'etanol', 'gnv', 'combustivel',
    'abastecimento gerador', 'abastecimento caminhao', 'abastecimento veiculo', 'abastecimento equipamento',
    'hotel', 'hospedagem', 'pousada',
    'almoco',
    'premio', 'bonificacao', 'incentivo', 'premiacao',
    'agua', 'luz', 'energia', 'convenio',
    'crea',
    'brinde', 'confraternizacao', 'festa', 'evento interno',
    'uber', 'taxi', 'cabify', 'indrive',
    'mercado livre', 'shopee', 'amazon', 'magalu', 'compra online',
];
// Words that contain a prohibited keyword as substring but should NOT trigger a match.
// e.g. "amazonas" contains "amazon", "bomba de gasolina" contains "gasolina",
// "meta" is too short and matches "meta" in "metalurgico", "metadata", etc.
const PROHIBITED_FALSE_POSITIVES = {
    'amazon': ['amazonas', 'amazonense', 'amazonia'],
    'gasolina': ['bomba de gasolina', 'bomba dagua', 'bomba d\'agua'],
    'agua': ['bomba de agua', 'bomba dagua', 'bomba d\'agua', 'casas da agua', 'estacao de agua', 'agua branca', 'torneira de agua', 'filtro de agua', 'casa da agua', 'fossa septica agua', 'caixa dagua', 'reservatorio de agua', 'abastecimento de agua', 'tratamento de agua', 'estacao de tratamento de agua'],
    'luz': ['luminaria', 'iluminacao', 'luz led', 'painel led', 'refletor', 'luminaria led', 'lampada', 'embutido', 'luminaria hermetica', 'projetor led', 'painel de luz'],
    'energia': ['energia solar', 'energia eletrica', 'distribuidora de energia', 'concessionaria de energia', 'medidor de energia', 'empresa de energia'],
    'meta': ['metalurgico', 'metalurgica', 'metalmecanica', 'metadata', 'metal', 'metalico', 'metais', 'metalmecanico', 'embarcacao metalica', 'estrutura metalica'],
    'gnv': [],
    '99': [], // removed from keywords - too many false positives (prices, phone numbers)
    'hotel': ['hotelaria', 'hoteleiro'],
    'premio': ['premiacao', 'premiado'],
    'crea': ['creacao', 'criativo', 'cereal', 'area', 'creche'],
    'vinho': ['vinhaca', 'vinhedo'],
    'tabaco': ['tabacaria'],
};
const PROHIBITED_CATEGORIES = [
    'COMBUSTIVEL',
    'FARMACIA',
];
const PENDENCY_KEYWORDS = [
    'pedagio',
    'estacionamento',
    'recibo',
];
// Pedágio/estacionamento abaixo deste valor não precisa de relatório padrão
// nem revisão humana quando os dados conferem.
const TOLL_PARKING_AUTO_APPROVE_LIMIT = 20;
// Extrai o mês/ano de referência de nomes como "CAIXA 08/2026".
// Retorna null quando o nome não carrega competência — nesse caso a regra
// DESPESA_FORA_DO_MES simplesmente não se aplica.
function extractCaixaRefMonth(reportName) {
    const m = reportName.match(/(\d{1,2})\s*\/\s*(\d{2,4})/);
    if (!m)
        return null;
    const month = parseInt(m[1], 10);
    let year = parseInt(m[2], 10);
    if (year < 100)
        year += 2000;
    if (month < 1 || month > 12 || year < 2000 || year > 2100)
        return null;
    return { month, year };
}
function normalizeText(text) {
    if (!text)
        return '';
    return text.toLowerCase().trim();
}
function parseValue(valueStr) {
    if (!valueStr)
        return null;
    const cleaned = valueStr.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
}
function parseDate(dateStr) {
    if (!dateStr)
        return null;
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return dateStr;
}
function checkProhibitedItems(extracted, informedTitle, informedObs) {
    const results = [];
    const searchText = [
        normalizeText(extracted?.estabelecimento),
        normalizeText(extracted?.categoria),
        (extracted?.itens || []).map(normalizeText).join(' '),
        normalizeText(informedTitle),
        normalizeText(informedObs),
    ].join(' ');
    for (const keyword of PROHIBITED_KEYWORDS) {
        // Use word-boundary regex to avoid false positives like "amazonas" matching "amazon"
        // For multi-word keywords, escape spaces and match as a phrase
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^a-z])${escapedKeyword}([^a-z]|$)`, 'i');
        if (!regex.test(searchText))
            continue;
        // Check false positive exclusions
        const falsePositives = PROHIBITED_FALSE_POSITIVES[keyword];
        if (falsePositives && falsePositives.length > 0) {
            const hasFalsePositive = falsePositives.some(fp => {
                const fpEscaped = fp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const fpRegex = new RegExp(`(^|[^a-z])${fpEscaped}([^a-z]|$)`, 'i');
                return fpRegex.test(searchText);
            });
            // If the ONLY match is inside a false positive compound word, skip
            // We need to check if there's a match that's NOT part of a false positive
            if (hasFalsePositive) {
                // Remove all false positive occurrences and re-check
                let cleanedText = searchText;
                for (const fp of falsePositives) {
                    const fpEscaped = fp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    cleanedText = cleanedText.replace(new RegExp(fpEscaped, 'gi'), ' '.repeat(fp.length));
                }
                if (!regex.test(cleanedText))
                    continue;
            }
        }
        let confidence = 95;
        if (['agua', 'luz', 'energia', 'convenio'].includes(keyword))
            confidence = 85;
        if (['medicamento', 'farmacia', 'drogaria'].includes(keyword))
            confidence = 90;
        results.push({
            rule: 'ITEM_PROIBIDO',
            reason: `Item proibido detectado: "${keyword}"`,
            confidence,
        });
        break;
    }
    if (extracted?.categoria && PROHIBITED_CATEGORIES.includes(extracted.categoria.toUpperCase())) {
        results.push({
            rule: 'CATEGORIA_PROIBIDA',
            reason: `Categoria proibida: ${extracted.categoria}`,
            confidence: 95,
        });
    }
    return results;
}
function checkValueDivergence(extracted, informedValue) {
    const extractedValue = parseValue(extracted?.valor_total);
    if (extractedValue === null)
        return null;
    const diff = Math.abs(extractedValue - informedValue);
    if (diff > 1.00) {
        return `Valor divergente: informado R$ ${informedValue.toFixed(2)}, comprovante R$ ${extractedValue.toFixed(2)}`;
    }
    return null;
}
function checkDateDivergence(extracted, informedDate) {
    const extractedDate = parseDate(extracted?.data);
    if (!extractedDate || !informedDate)
        return null;
    const informedNorm = informedDate.split(/[T ]/)[0];
    // Compare day and month only - OCR often misreads the year
    const informedParts = informedNorm.split('-');
    const extractedParts = extractedDate.split('-');
    if (informedParts.length === 3 && extractedParts.length === 3) {
        const informedDayMonth = informedParts[2] + '-' + informedParts[1];
        const extractedDayMonth = extractedParts[2] + '-' + extractedParts[1];
        if (informedDayMonth !== extractedDayMonth) {
            return `Data divergente: informada ${informedNorm}, comprovante ${extractedDate}`;
        }
    }
    else if (extractedDate !== informedNorm) {
        return `Data divergente: informada ${informedNorm}, comprovante ${extractedDate}`;
    }
    return null;
}
function checkValueLimits(extracted, informedValue, informedTitle) {
    const results = [];
    const category = (extracted?.categoria || '').toUpperCase();
    const searchText = normalizeText(informedTitle);
    if (category === 'ALIMENTACAO' || searchText.includes('alimentacao') || searchText.includes('janta') || searchText.includes('cafe')) {
        if (informedValue > 50) {
            results.push({
                rule: 'ALIMENTACAO_ACIMA_LIMITE',
                reason: `Alimentação acima de R$ 50,00 (valor: R$ ${informedValue.toFixed(2)})`,
                confidence: 95,
            });
        }
    }
    if (searchText.includes('recibo') && informedValue > 100) {
        results.push({
            rule: 'RECIBO_ACIMA_LIMITE',
            reason: `Recibo acima de R$ 100,00 (valor: R$ ${informedValue.toFixed(2)})`,
            confidence: 95,
        });
    }
    const materialCategories = ['MATERIAIS_CONSTRUCAO', 'FERRAMENTA', 'ELETRONICO', 'OUTROS'];
    if (materialCategories.includes(category) && informedValue > 500) {
        results.push({
            rule: 'MATERIAL_ACIMA_LIMITE',
            reason: `Material/serviço acima de R$ 500,00 (valor: R$ ${informedValue.toFixed(2)}). Requer autorização da diretoria.`,
            confidence: 90,
        });
    }
    return results;
}
function checkPendencyItems(extracted, informedTitle, informedObs, informedValue) {
    const results = [];
    const searchText = [
        normalizeText(extracted?.estabelecimento),
        normalizeText(extracted?.categoria),
        (extracted?.itens || []).map(normalizeText).join(' '),
        normalizeText(informedTitle),
        normalizeText(informedObs),
    ].join(' ');
    // Pedágio/estacionamento < R$20 aprovam direto quando os dados conferem —
    // as demais regras (divergência, campos faltantes, legibilidade) seguem
    // valendo e ainda derrubam pra PENDENTE se algo estiver errado.
    const isTollOrParking = /(^|[^a-z])(pedagio|estacionamento)([^a-z]|$)/i.test(searchText);
    const skipDocPendency = isTollOrParking && informedValue < TOLL_PARKING_AUTO_APPROVE_LIMIT;
    if (!skipDocPendency) {
        for (const keyword of PENDENCY_KEYWORDS) {
            if (searchText.includes(keyword)) {
                results.push({
                    rule: 'PENDENCIA_DOCUMENTAL',
                    reason: `Item com pendência documental detectado: "${keyword}". Requer relatório padrão e assinatura de gestor.`,
                    confidence: 90,
                });
                break;
            }
        }
    }
    if (extracted) {
        const fieldsFilled = [
            extracted.valor_total,
            extracted.data,
            extracted.estabelecimento,
            extracted.categoria,
        ].filter(v => v !== null && v !== undefined && v !== '').length;
        if (fieldsFilled < 2) {
            results.push({
                rule: 'LEGIBILIDADE_INSUFICIENTE',
                reason: 'Comprovante com legibilidade insuficiente - poucos dados extraídos',
                confidence: 70,
            });
        }
    }
    return results;
}
function checkMissingFields(extracted) {
    const results = [];
    if (!extracted) {
        results.push({
            rule: 'FALTA_DADOS_EXTRAIDOS',
            reason: 'Não foi possível extrair dados do comprovante',
            confidence: 80,
        });
        return results;
    }
    if (!extracted.valor_total) {
        results.push({
            rule: 'CAMPO_OBRIGATORIO_FALTANTE',
            reason: 'Valor total não encontrado no comprovante',
            confidence: 85,
        });
    }
    if (!extracted.data) {
        results.push({
            rule: 'CAMPO_OBRIGATORIO_FALTANTE',
            reason: 'Data não encontrada no comprovante',
            confidence: 85,
        });
    }
    if (!extracted.estabelecimento) {
        results.push({
            rule: 'CAMPO_OBRIGATORIO_FALTANTE',
            reason: 'Estabelecimento/fornecedor não encontrado no comprovante',
            confidence: 80,
        });
    }
    return results;
}
// Caixa só pode ter despesas do próprio mês — despesa de outro mês vai pra
// revisão humana. Na data informada comparamos mês+ano; no comprovante só o
// mês, porque o OCR erra o ano com frequência.
function checkCaixaMonth(extracted, informedDate, caixaRef) {
    const results = [];
    if (!caixaRef)
        return results;
    const ref = `${String(caixaRef.month).padStart(2, '0')}/${caixaRef.year}`;
    const informed = informedDate?.split(/[T ]/)[0].match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (informed) {
        const y = +informed[1];
        const m = +informed[2];
        if (m !== caixaRef.month || y !== caixaRef.year) {
            results.push({
                rule: 'DESPESA_FORA_DO_MES',
                reason: `Despesa datada de ${informed[3]}/${String(m).padStart(2, '0')}/${y} fora do mês do caixa (${ref}). Requer revisão humana.`,
                confidence: 90,
            });
            return results;
        }
    }
    const ext = parseDate(extracted?.data)?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ext && +ext[2] !== caixaRef.month) {
        results.push({
            rule: 'DESPESA_FORA_DO_MES',
            reason: `Comprovante datado de ${ext[3]}/${ext[2]} fora do mês do caixa (${ref}). Requer revisão humana.`,
            confidence: 85,
        });
    }
    return results;
}
function auditExpense(expenseId, extracted, informed, opts) {
    const rules = [];
    const divergences = [];
    const prohibited = checkProhibitedItems(extracted, informed.title, informed.observation);
    rules.push(...prohibited);
    const valueDiv = checkValueDivergence(extracted, informed.value);
    if (valueDiv)
        divergences.push(valueDiv);
    const dateDiv = checkDateDivergence(extracted, informed.date);
    if (dateDiv)
        divergences.push(dateDiv);
    const limits = checkValueLimits(extracted, informed.value, informed.title);
    rules.push(...limits);
    const pendencies = checkPendencyItems(extracted, informed.title, informed.observation, informed.value);
    rules.push(...pendencies);
    const caixaMonth = checkCaixaMonth(extracted, informed.date, opts?.caixaRef);
    rules.push(...caixaMonth);
    const missing = checkMissingFields(extracted);
    rules.push(...missing);
    let status;
    let summary;
    const hasRejection = rules.some(r => r.rule === 'ITEM_PROIBIDO' ||
        r.rule === 'CATEGORIA_PROIBIDA' ||
        r.rule === 'ALIMENTACAO_ACIMA_LIMITE' ||
        r.rule === 'RECIBO_ACIMA_LIMITE' ||
        r.rule === 'MATERIAL_ACIMA_LIMITE');
    const hasPendency = rules.some(r => r.rule === 'PENDENCIA_DOCUMENTAL' ||
        r.rule === 'LEGIBILIDADE_INSUFICIENTE' ||
        r.rule === 'CAMPO_OBRIGATORIO_FALTANTE' ||
        r.rule === 'FALTA_DADOS_EXTRAIDOS' ||
        r.rule === 'DESPESA_FORA_DO_MES');
    if (hasRejection) {
        status = 'REPROVADO';
        summary = `Reprovado: ${rules.filter(r => r.rule === 'ITEM_PROIBIDO' || r.rule === 'CATEGORIA_PROIBIDA' || r.rule === 'ALIMENTACAO_ACIMA_LIMITE' || r.rule === 'RECIBO_ACIMA_LIMITE' || r.rule === 'MATERIAL_ACIMA_LIMITE').map(r => r.reason).join('; ')}`;
    }
    else if (hasPendency || divergences.length > 0) {
        status = 'PENDENTE';
        const reasons = [
            ...divergences,
            ...rules.filter(r => r.rule === 'PENDENCIA_DOCUMENTAL' || r.rule === 'LEGIBILIDADE_INSUFICIENTE' || r.rule === 'CAMPO_OBRIGATORIO_FALTANTE' || r.rule === 'FALTA_DADOS_EXTRAIDOS' || r.rule === 'DESPESA_FORA_DO_MES').map(r => r.reason),
        ];
        summary = `Pendente para análise humana: ${reasons.join('; ')}`;
    }
    else {
        status = 'APROVADO_BOT';
        summary = 'Despesa aprovada automaticamente pelo bot. Todos os campos conferem.';
    }
    return {
        expense_id: expenseId,
        status,
        rules_triggered: rules,
        extracted_data: extracted,
        informed_data: informed,
        divergences,
        summary,
    };
}
function summarizeReportAudit(reportId, expenseResults) {
    const approved = expenseResults.filter(e => e.status === 'APROVADO_BOT').length;
    const pending = expenseResults.filter(e => e.status === 'PENDENTE').length;
    const rejected = expenseResults.filter(e => e.status === 'REPROVADO').length;
    let overallStatus;
    let overallSummary;
    if (rejected > 0 && pending === 0 && approved === 0) {
        overallStatus = 'REPROVADO';
        overallSummary = `Report reprovado: ${rejected} despesa(s) reprovada(s) pelo bot.`;
    }
    else if (pending > 0) {
        overallStatus = 'PENDENTE';
        overallSummary = `Report pendente: ${pending} despesa(s) precisam de análise humana, ${approved} aprovada(s), ${rejected} reprovada(s).`;
    }
    else if (approved > 0 && pending === 0 && rejected === 0) {
        overallStatus = 'APROVADO_BOT';
        overallSummary = `Report aprovado automaticamente: ${approved} despesa(s) aprovada(s) pelo bot.`;
    }
    else if (rejected > 0 && approved > 0 && pending === 0) {
        overallStatus = 'PENDENTE';
        overallSummary = `Report com despesas mistas: ${approved} aprovada(s), ${rejected} reprovada(s). Requer revisão humana para confirmar reprovações.`;
    }
    else {
        overallStatus = 'PENDENTE';
        overallSummary = `Report com resultados mistos: ${approved} aprovada(s), ${pending} pendente(s), ${rejected} reprovada(s).`;
    }
    return {
        report_id: reportId,
        total_expenses: expenseResults.length,
        approved,
        pending,
        rejected,
        expenses: expenseResults,
        overall_status: overallStatus,
        overall_summary: overallSummary,
    };
}
