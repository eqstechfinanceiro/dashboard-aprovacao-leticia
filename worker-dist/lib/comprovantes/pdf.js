"use strict";
// Port fiel de docHudson.py / utils.py — extração de CHAVE, classificação de tipo,
// nome de beneficiário, split de PDF e construção do caminho de destino.
Object.defineProperty(exports, "__esModule", { value: true });
exports.extrairTipoPorNomeArquivo = extrairTipoPorNomeArquivo;
exports.extrairNomeBeneficiario = extrairNomeBeneficiario;
exports.pareceEmpresa = pareceEmpresa;
exports.analisarPdf = analisarPdf;
exports.sanitizeFileName = sanitizeFileName;
exports.loadPdfDoc = loadPdfDoc;
exports.splitPdfPage = splitPdfPage;
exports.retornarMes = retornarMes;
exports.specPorTipo = specPorTipo;
exports.buildDestinoPath = buildDestinoPath;
exports.destinoFileName = destinoFileName;
exports.retornarBanco = retornarBanco;
exports.competenciaFolha = competenciaFolha;
const pdf_lib_1 = require("pdf-lib");
// --- Classificação por nome de arquivo (docHudson._extrair_tipo_por_nome_arquivo) ---
function extrairTipoPorNomeArquivo(fileName) {
    // docHudson remove os espaços antes de checar keywords ('13 SALARIO', 'REMESSA 2', ...)
    const nome = fileName.toUpperCase().replace(/ /g, '');
    if (['REMESSA', 'SALARIO', 'FOLHA', 'PAGAMENTO'].some((kw) => nome.includes(kw)))
        return 'FOL';
    if (nome.includes('RESCIS'))
        return 'RES';
    if (nome.includes('FERIA'))
        return 'FER';
    if (nome.includes('13SALARIO') || nome.includes('13SAL'))
        return '13A';
    if (['BOLETO', 'GUIA', 'TED', 'FORNECEDOR'].some((kw) => nome.includes(kw)))
        return 'VENDOR';
    return null;
}
// --- Nome do beneficiário (docHudson._extrair_nome_beneficiario) ---
const NOME_PATTERNS = [
    /nome do recebedor:\s*(.+)/gi,
    /Nome do favorecido:\s*(.+)/gi,
    // Bradesco: valor vem ANTES do rótulo (e o rótulo pode quebrar em 2 itens)
    /([^\n]+)\n\s*Nome Fantasia\s*\n?\s*Beneficiário\s*:/gi,
    /([^\n]+)\n\s*Raz[aã]o Social\s*\n?\s*Beneficiário\s*:/gi,
    /([^\n]+)\n\s*Nome do favorecido\s*:/gi,
    /([^\n]+)\n\s*nome do recebedor\s*:/gi,
    /Nome Fantasia Beneficiário:\s*(.+)/gi,
    /Raz[aã]o Social Beneficiário:\s*(.+)/gi,
    /Valor(.+?)\s+Nome do favorecido:/gi,
    /CPF\/CNPJ:\s*(.+?)\s*Nome:/gi,
    /Nome:\s+(.+)/gi,
    /CLIENTE:\s+(.+)/gi,
    /Beneficiário:\s+(.+?)\s+CPF\/CNPJ/gi,
    /concessionárias\s*(.+)/gi,
];
/** Remove prefixo numérico que alguns bancos colam no nome (ex.: '50 359 044 MARLETE...'). */
function limparNome(nome) {
    return nome.replace(/^[\d][\d ./-]{2,}(?=[A-Za-zÀ-ÿ])/, '').trim();
}
function nomeValido(nome) {
    if (!nome)
        return false;
    const up = nome.toUpperCase();
    // ignora: pagador EQS, capturas que são só documento, placeholders do banco
    if (up.includes('EQS ENGENHARIA'))
        return false;
    if (/^[\d ./-]+$/.test(nome))
        return false;
    if (/^N[ÃA]O INFORMAD/.test(up))
        return false;
    // captura caiu em linha de agência/conta/documento (ex.: valor depois do rótulo no Bradesco)
    if (/AG[ÊE]NCIA\s*:|CONTA\s*:|CNPJ\s*:|CPF\s*:/.test(up))
        return false;
    // captura caiu em outro rótulo/cabeçalho de seção
    if (/\b(DADOS|RECEBEDOR|FAVORECIDO|BENEFICI[AÁ]RIO|PAGADOR|TRANSFER[ÊE]NCIA|CONTA)\b/.test(up))
        return false;
    return true;
}
function extrairNomeBeneficiario(textoOriginal) {
    for (const pattern of NOME_PATTERNS) {
        // o mesmo rótulo pode aparecer 2x (conta debitada x creditada) — tenta todos os matches
        for (const m of textoOriginal.matchAll(pattern)) {
            const nome = limparNome(m[1]);
            if (nomeValido(nome))
                return nome;
        }
    }
    return null;
}
function pareceEmpresa(nome) {
    if (!nome)
        return false;
    const upper = nome.toUpperCase();
    const indicadores = ['LTDA', 'S A', 'S/A', 'S.A', 'ME', 'EPP', 'SA ', 'ADVOGADOS', 'CONSTRUTORA',
        'ENGENHARIA', 'REFRIGERACAO', 'AUTOMAC', 'TELECOM', 'SERVICOS', 'HOLDING', 'INSTITUICAO', 'INDUSTRIA'];
    return indicadores.some((kw) => upper.includes(kw));
}
const RE_CHAVE = /CHAVE\d{11}[A-Z0-9]{3}/;
const RE_CHAVE_EXT = /CHAVE\d{11}[A-Z0-9]{3}[A-Za-z0-9]{6}/;
// CIFRA com corpo de documento (4-12 alnum) + sufixo de pasta oficial
// (tabela PASTA/SIGLA/CHAVE — sufixos de tamanho variável 3-6)
const RE_CIFRA_ADM = /CIFRA([0-9A-Z]{4,12}?)(ADM|CMP|JUR|BNFUMD|BNTK|BNFS|CONT|CRA|SMS|DPPNS)/;
// CIFRA com CPF (11 dígitos) + sufixo de tipo (3 chars)
const RE_CIFRA_CPF = /CIFRA(\d{11})([A-Z0-9]{3})/;
const RE_CIFRA_CPF_EXT = /CIFRA\d{11}[A-Z0-9]{3}[A-Za-z0-9]{6}/;
// qualquer outro token CIFRA digitado (tipo desconhecido, ex.: BNTK)
const RE_CIFRA_GENERICO = /CIFRA[0-9A-Z]{5,18}/;
const CNPJ_EQS = '80.464.753/0001-97';
function extrairDocRecebedor(textoOriginal) {
    const m = /CPF\s*\/\s*CNPJ\s*do\s*recebedor\s*:\s*([\d*./-]{5,25})/i.exec(textoOriginal)
        // Bradesco: valor vem ANTES do rótulo ('006.272.793/0001-84\nCPF/CNPJ Beneficiário:')
        || /([\d*./-]{11,25})\s*\n\s*CPF\/CNPJ Beneficiário\s*:/i.exec(textoOriginal)
        || /CPF\/CNPJ Beneficiário\s*:\s*([\d*./-]{5,25})/i.exec(textoOriginal)
        || /CPF\/CNPJ\s*:\s*([\d*./-]{5,25})/i.exec(textoOriginal);
    return m ? m[1].trim() : null;
}
function extrairPixChave(textoOriginal) {
    const m = /(?:^|\n)\s*chave\s*:\s*\n?\s*([0-9A-Za-z@.\-]{5,45})/i.exec(textoOriginal);
    return m ? m[1].trim() : null;
}
/**
 * Confere se o CPF da chave digitada bate com o documento do recebedor
 * impresso no comprovante (pode vir mascarado: ***.986.907-**).
 * Retorna mensagem de divergência ou null se compatível/indisponível.
 */
function validarCpfContraRecebedor(cpf, docRecebedor) {
    if (!docRecebedor)
        return null;
    const digits = docRecebedor.replace(/\D/g, '');
    const masked = docRecebedor.includes('*');
    if (!masked) {
        if (digits.length === 11)
            return digits === cpf ? null : `CPF da chave ${cpf} difere do recebedor ${docRecebedor}`;
        if (digits.length === 14)
            return `recebedor é CNPJ ${docRecebedor}, mas a chave aponta CPF ${cpf}`;
        return null;
    }
    // mascarado: os dígitos visíveis precisam aparecer no CPF da chave
    if (digits.length >= 2 && !cpf.includes(digits)) {
        return `CPF da chave ${cpf} não confere com recebedor mascarado ${docRecebedor}`;
    }
    return null;
}
function classificarPagina(textoOriginal, tipoArquivo, pageNum) {
    const texto = textoOriginal.replace(/ /g, '').toUpperCase();
    const info = {
        pageNum, categoria: 'sem_chave', chave: null, tipoPagamento: null, cpf: null,
        pedido: null, nomeBeneficiario: null, nomesCreditados: [],
        pixChave: extrairPixChave(textoOriginal), docRecebedor: extrairDocRecebedor(textoOriginal),
        divergencia: null, semChave: true,
    };
    info.nomeBeneficiario = extrairNomeBeneficiario(textoOriginal);
    // 1. CHAVE<cpf><tipo>[+pedido]
    const chaveMatch = RE_CHAVE.exec(texto);
    if (chaveMatch) {
        let chave = chaveMatch[0];
        info.tipoPagamento = chave.slice(-3);
        if (info.tipoPagamento === 'VAR' || info.tipoPagamento === 'VAT') {
            const ext = RE_CHAVE_EXT.exec(texto);
            if (ext) {
                chave = ext[0];
                info.pedido = chave.slice(-6);
            }
        }
        info.chave = chave;
        info.cpf = chave.substring(5, 16);
        info.categoria = 'chave';
        info.semChave = false;
        info.divergencia = validarCpfContraRecebedor(info.cpf, info.docRecebedor);
        return info;
    }
    // 2. CIFRA<doc><sufixo oficial> — chave de documento de empresa (sem CPF)
    const cifraAdm = RE_CIFRA_ADM.exec(texto);
    if (cifraAdm) {
        info.chave = `CIFRA${cifraAdm[1]}${cifraAdm[2]}`;
        info.tipoPagamento = cifraAdm[2]; // sufixo real digitado (ADM/CMP/BNFUMD/...)
        info.categoria = 'cifra_adm';
        info.semChave = false;
        return info;
    }
    // 3. CIFRA<cpf11><tipo3> — mesma convenção da CHAVE no campo CIFRA
    const cifraCpf = RE_CIFRA_CPF.exec(texto);
    if (cifraCpf) {
        let chave = cifraCpf[0];
        info.tipoPagamento = cifraCpf[2];
        if (info.tipoPagamento === 'VAR' || info.tipoPagamento === 'VAT') {
            const ext = RE_CIFRA_CPF_EXT.exec(texto);
            if (ext) {
                chave = ext[0];
                info.pedido = chave.slice(-6);
            }
        }
        info.chave = chave;
        info.cpf = cifraCpf[1];
        info.categoria = 'cifra_cpf';
        info.semChave = false;
        info.divergencia = validarCpfContraRecebedor(info.cpf, info.docRecebedor);
        return info;
    }
    // 4. CIFRA<doc><sufixo desconhecido> — registra para revisão (ex.: BNTK)
    const cifraGen = RE_CIFRA_GENERICO.exec(texto);
    if (cifraGen) {
        info.chave = cifraGen[0];
        info.tipoPagamento = (/([A-Z]{3,5})$/.exec(cifraGen[0]) || [])[1] || null;
        info.categoria = 'cifra_outro';
        info.semChave = false;
        return info;
    }
    // 5. SISPAG SALARIOS — nomes creditados na página
    if (texto.includes('SISPAGSALARIOS')) {
        const nomes = [...textoOriginal.matchAll(/creditada:\s*\n[\s\S]*?Nome:\s+(.+?)\n/gi)]
            .map((m) => limparNome(m[1]).trim())
            .filter((n) => n && !n.toUpperCase().includes('EQS'));
        if (!nomes.length) {
            const fb = /Nome:\s+(.+?)\n/i.exec(textoOriginal);
            if (fb && !fb[1].toUpperCase().includes('EQS'))
                nomes.push(limparNome(fb[1]).trim());
        }
        if (nomes.length) {
            info.categoria = 'sispag_sal';
            info.nomesCreditados = nomes;
            info.tipoPagamento = 'FOL';
            info.semChave = false;
            return info;
        }
        // sem nome extraível → cai para sem_chave
    }
    // 6. SISPAG FORNECEDORES — não processa
    if (texto.includes('SISPAGFORNECEDORES')) {
        info.categoria = 'sispag_forn';
        return info;
    }
    // 7. Arquivo de fornecedor (BOLETO/GUIA/TED/FORNECEDOR) sem chave própria
    if (tipoArquivo === 'VENDOR') {
        info.categoria = 'vendor';
        return info;
    }
    // 8. Transferência interna EQS→EQS
    if (texto.includes('EQSENGENHARIA') && textoOriginal.replace(/ /g, '').includes(CNPJ_EQS)) {
        const rec = /nome do recebedor:\s*(.+?)\n/i.exec(textoOriginal);
        if (rec && rec[1].toUpperCase().includes('EQS')) {
            info.categoria = 'interna';
            return info;
        }
    }
    // 9. Beneficiário pessoa física + tipo pelo nome do arquivo
    if (info.nomeBeneficiario && !pareceEmpresa(info.nomeBeneficiario) && tipoArquivo) {
        info.categoria = 'name_lookup';
        info.tipoPagamento = tipoArquivo;
        // chave PIX de 11 dígitos é o CPF do recebedor — match exato antes do nome
        if (info.pixChave && /^\d{11}$/.test(info.pixChave))
            info.cpf = info.pixChave;
        info.semChave = false;
        return info;
    }
    // 10. sem padrão — registra nome/cpf do recebedor quando houver, para auditoria
    if (info.pixChave && /^\d{11}$/.test(info.pixChave))
        info.cpf = info.pixChave;
    return info;
}
async function analisarPdf(buffer, fileName, onPageDone) {
    const tipoArquivo = extrairTipoPorNomeArquivo(fileName);
    // Import dinâmico real (o worker compila p/ CommonJS; require() não carrega .mjs)
    const dynamicImport = new Function('s', 'return import(s)');
    const pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const textoOriginal = content.items.map((it) => it.str ?? '').join('\n');
        paginas.push(classificarPagina(textoOriginal, tipoArquivo, i));
        onPageDone?.(i, doc.numPages);
    }
    const totalPages = doc.numPages;
    await doc.destroy();
    return { totalPages, tipoArquivo, paginas };
}
/** Remove caracteres inválidos em nome de arquivo (test_split._sanitize_filename). */
function sanitizeFileName(nome) {
    return nome.replace(/[<>:"/\\|?*]/g, '').trim();
}
// --- Split: 1 página por arquivo (pdf-lib) ---
/** Carrega o documento uma vez — o caller reusa para todas as páginas do arquivo. */
async function loadPdfDoc(buffer) {
    return pdf_lib_1.PDFDocument.load(buffer, { ignoreEncryption: true });
}
async function splitPdfPage(srcOrBuffer, pageIndex0) {
    const src = srcOrBuffer instanceof pdf_lib_1.PDFDocument
        ? srcOrBuffer
        : await loadPdfDoc(srcOrBuffer);
    const out = await pdf_lib_1.PDFDocument.create();
    const [copied] = await out.copyPages(src, [pageIndex0]);
    out.addPage(copied);
    return Buffer.from(await out.save());
}
// --- Destino (utils.criar_arvore_diretorios + match de docHudson) ---
const MESES_NOME = {
    '01': 'JANEIRO', '02': 'FEVEREIRO', '03': 'MARÇO', '04': 'ABRIL',
    '05': 'MAIO', '06': 'JUNHO', '07': 'JULHO', '08': 'AGOSTO',
    '09': 'SETEMBRO', '10': 'OUTUBRO', '11': 'NOVEMBRO', '12': 'DEZEMBRO',
};
/** '07' → '07 - JULHO' (utils.retornar_mes) */
function retornarMes(mes) {
    return `${mes} - ${MESES_NOME[mes] ?? mes}`;
}
/** Mapeamento tipo_pagamento → destino/modelo (docHudson._salvar_e_enviar, match). */
function specPorTipo(tipoPagamento, mesVigente) {
    // Reclassificação de parcelas de 13º fora do mês correto
    let tipo = tipoPagamento;
    if (tipo === '131' && mesVigente !== '11 - NOVEMBRO')
        tipo = '13A';
    if (tipo === '132' && mesVigente !== '12 - DEZEMBRO')
        tipo = '13A';
    switch (tipo) {
        case 'LOC':
            return { base: 'Comprovante Frota/LOCAÇÃO VEICULO/MANUAL', tipo: 'Simples', modeloDocumento: 'LOCAÇÃO', modeloPasta: 'FINANCEIRO - FROTA', label: 'Diferente', enviaE2Doc: true };
        case 'VAT':
            return { base: 'Comprovante Beneficios/VALE TRANSPORTES', tipo: 'VT', modeloDocumento: 'VT', modeloPasta: 'FINANCEIRO - BENEFICIOS', label: 'Diferente', enviaE2Doc: true };
        case 'VAR':
            return { base: 'Comprovante Beneficios/VALE ALIMENTACAO', tipo: 'VA', modeloDocumento: 'VA', modeloPasta: 'FINANCEIRO - BENEFICIOS', label: 'Diferente', enviaE2Doc: true };
        case 'FOL':
            return { base: 'Comprovante DP/PROVENTOS/PAGTOS MANUAIS', tipo: 'FOLHA GERAL', modeloDocumento: 'PROVENTOS', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case 'ARV':
            return { base: 'Comprovante DP/PROVENTOS/PAGTOS MANUAIS', tipo: 'ADTO REVAP', modeloDocumento: 'PROVENTOS', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case 'ARP':
            return { base: 'Comprovante DP/PROVENTOS/PAGTOS MANUAIS', tipo: 'ADTO REPAR', modeloDocumento: 'PROVENTOS', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case '13A':
            return { base: 'Comprovante DP/13 SALARIO', tipo: '13 SALARIO', modeloDocumento: '13 SALARIO', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case '131':
            return { base: 'Comprovante DP/13 SALARIO', tipo: '1ª 13 SALARIO', modeloDocumento: '13 SALARIO', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case '132':
            return { base: 'Comprovante DP/13 SALARIO', tipo: '2ª 13 SALARIO', modeloDocumento: '13 SALARIO', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case '13T':
            return { base: 'Comprovante DP/13 SALARIO', tipo: 'TJ 13 SALARIO', modeloDocumento: '13 SALARIO', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case 'RES':
            return { base: 'Comprovante DP/RESCISOES', tipo: 'Simples', modeloDocumento: 'RESCISÕES', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case 'FER':
            return { base: 'Comprovante DP/FERIAS', tipo: 'Simples', modeloDocumento: 'FÉRIAS', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        case 'FGT':
            return { base: 'Comprovante DP/MULTA FGTS', tipo: 'Simples', modeloDocumento: 'MULTAS DE FGTS RESCISÓRIA', modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: true };
        // --- Chaves CIFRA<doc> — comprovantes de empresa/departamento (sem CPF, sem E2DOC) ---
        // Tabela oficial PASTA/SUB-PASTA/SIGLA: ADM, BNFUMD, BNTK, BNFS, CMP, CONT, CRA, SMS, DPPNS
        case 'ADM':
            return { base: 'Comprovante ADM', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: false };
        case 'CMP':
            return { base: 'Comprovantes Compras', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: false };
        case 'JUR':
            return { base: 'Comprovante ADM', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: false };
        case 'BNFUMD':
            return { base: 'Comprovante Beneficios/UNIMED', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - BENEFICIOS', label: 'Diferente', enviaE2Doc: false };
        case 'BNTK':
            return { base: 'Comprovante Beneficios/TICKET', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - BENEFICIOS', label: 'Diferente', enviaE2Doc: false };
        case 'BNFS':
            return { base: 'Comprovante Beneficios/SEGUROS', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - BENEFICIOS', label: 'Diferente', enviaE2Doc: false };
        case 'CONT':
            return { base: 'Comprovantes Contabilidade', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: false };
        case 'CRA':
            return { base: 'Comprovante CREA', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: false };
        case 'SMS':
            return { base: 'Comprovante SMS', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: false };
        case 'DPPNS':
            return { base: 'Comprovante DP/PENSOES ALIMENTICIAS', tipo: 'Simples', modeloDocumento: null, modeloPasta: 'FINANCEIRO - DP', label: 'Comum', enviaE2Doc: false };
        default:
            return null;
    }
}
/**
 * Port de utils.criar_arvore_diretorios — retorna o caminho relativo completo
 * (incluindo a base do tipo) para salvar o PDF no SharePoint destino.
 *
 * mesVigente no formato 'MM - NOME' (ex.: '07 - JULHO');
 * dataPagamento é o nome da pasta de data (ex.: '07' — dia do pagamento).
 */
function buildDestinoPath(spec, anoVigente, mesVigente, dataPagamento, pedido) {
    let ano = anoVigente;
    let mes = mesVigente;
    let tipo = spec.tipo;
    if (tipo === 'FOLHA GERAL') {
        const mesNum = mesVigente.substring(0, 2);
        if (mesNum === '01') {
            mes = retornarMes('12');
            ano = String(parseInt(anoVigente) - 1);
        }
        else {
            mes = retornarMes(String(parseInt(mesNum) - 1).padStart(2, '0'));
        }
    }
    if (spec.base.includes('RESCISOES')) {
        ano = `RESCISAO ${ano}`;
    }
    const parts = [spec.base, ano, mes];
    if (!tipo.includes('13 SALARIO')) {
        parts.push(dataPagamento);
    }
    if (tipo !== 'Simples') {
        if (pedido) {
            parts.push(`${tipo} - ${pedido}`);
        }
        else if (['1ª 13 SALARIO', '2ª 13 SALARIO', 'TJ 13 SALARIO'].includes(tipo)) {
            if (tipo.includes('TJ'))
                tipo = 'TRIBUNAL DE JUSTIÇA';
            else
                tipo = `${tipo.substring(0, 2)} PARCELA ${dataPagamento}`;
            parts.push(tipo);
        }
        else if (tipo !== '13 SALARIO') {
            parts.push(tipo);
        }
        // '13 SALARIO' → sem pasta extra
    }
    return parts.join('/');
}
/** Nome do arquivo no destino (docHudson: nome + '.pdf'; SANTANDER: ' - OP DISPONIVEL'). */
function destinoFileName(nome, banco) {
    if (banco === 'SANTANDER')
        return `${nome.trim()} - OP DISPONIVEL.pdf`;
    return `${nome.trim()}.pdf`;
}
/** utils.retornar_banco — detecta banco pelo caminho/pasta. */
function retornarBanco(caminho) {
    const c = caminho.toUpperCase();
    if (c.includes('ITAU'))
        return 'ITAU';
    if (c.includes('SANTANDER'))
        return 'SANTANDER';
    if (c.includes('BRADESCO'))
        return 'BRADESCO';
    if (c.includes('CEF'))
        return 'CEF';
    if (c.includes('BB'))
        return 'BB (BANCO DO BRASIL)';
    return null;
}
/** Competência E2DOC 'MM/YYYY'; para FOL, mês anterior (competencia_folha). */
function competenciaFolha(mesNum, ano) {
    const m = parseInt(mesNum);
    if (m === 1)
        return `12/${parseInt(ano) - 1}`;
    return `${String(m - 1).padStart(2, '0')}/${ano}`;
}
