// Parser de PDFs de remessa de folha — fragmenta comprovantes dentro da página.
// Formatos conhecidos:
//  - itau_folha: Itaú SISPAG "Comprovante de Operação", 2 por página, separados
//    pela linha "Cortar aqui" (sem CPF — resolve por conta/nome; 'Informações
//    fornecidas pelo pagador' casa com o 'seu número' do CNAB).
//  - bradesco_rt: Bradesco "Comprovante de Pagamento / Crédito em Conta Real
//    Time", 1 por página, CPF do favorecido embutido.
//  - bradesco_multipag: Bradesco Multipag "Comprovante de Pagamento / Crédito
//    em Conta Salário", 1 por página, 'Funcionário: NOME CPF: …' embutido.
//  - bb_pag: Banco do Brasil "PAG SALARIO C/CTA" (1/página, CPF/CNPJ explícito)
//    e "COMPROVANTE DE TRANSFERENCIA" (BB→BB, sem CPF — casa por nome/conta).
//  - desconhecido: qualquer outro — vira warning, não é enviado.

import { PDFDocument } from 'pdf-lib';

export type FolhaFormato = 'itau_folha' | 'bradesco_rt' | 'bradesco_multipag' | 'bb_pag' | 'desconhecido';

export interface ComprovanteFolha {
  pageNum: number;          // 1-based
  /** Índice do comprovante dentro da página (0 = topo). */
  slot: number;
  /** Região vertical do comprovante em pontos PDF (y0 < y1, origem embaixo). */
  crop: { y0: number; y1: number } | null; // null = página inteira
  nome: string | null;
  agencia: string | null;
  conta: string | null;      // número + dv normalizados ('13923-8')
  contaNumero: string | null;
  contaDv: string | null;
  valor: number | null;      // reais
  cpf: string | null;
  pagadorRef: string | null; // 'Informações fornecidas pelo pagador' / seu número
  dataPagamento: string | null; // 'YYYY-MM-DD'
}

export interface FolhaAnalise {
  formato: FolhaFormato;
  totalPages: number;
  comprovantes: ComprovanteFolha[];
  warnings: string[];
}

function parseValorBR(s: string): number | null {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseDataBR(s: string): string | null {
  const m = /^(\d{2})[\/.](\d{2})[\/.](\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Texto de uma faixa vertical da página (y0..y1, origem embaixo). */
function textoFaixa(items: any[], y0: number, y1: number): string {
  return items
    .filter((it) => {
      const y = it.transform?.[5];
      return typeof y === 'number' && y > y0 && y <= y1;
    })
    .map((it) => it.str ?? '')
    .join('\n');
}

/** Campos do comprovante Itaú SISPAG dentro de um bloco de texto. */
function extrairItau(bloco: string): Partial<ComprovanteFolha> {
  const idx = bloco.search(/creditada\s*:/i);
  if (idx < 0) return {};
  const t = bloco.slice(idx);
  const g = (re: RegExp) => re.exec(t)?.[1]?.trim() || null;
  const agencia = g(/Ag[êe]ncia:\s*\n?\s*(\d+)/i);
  const contaM = /Conta:\s*\n?\s*([\d]+)\s*-\s*([\dXx]+)/i.exec(t);
  const nome = g(/Nome:\s*\n?\s*([^\n]+)/i);
  const valor = g(/Valor:\s*\n?\s*R\$\s*([\d.,]+)/i);
  const ref = g(/pagador:\s*\n?\s*([A-Za-z0-9]+)/i);
  const dt = /realizada em\s*\n?\s*(\d{2}[./]\d{2}[./]\d{4})/i.exec(t);
  return {
    dataPagamento: dt ? parseDataBR(dt[1]) : null,
    agencia: agencia?.replace(/^0+/, '') || null,
    contaNumero: contaM ? contaM[1].replace(/^0+/, '') : null,
    contaDv: contaM ? contaM[2].toUpperCase() : null,
    conta: contaM ? `${contaM[1].replace(/^0+/, '')}-${contaM[2].toUpperCase()}` : null,
    nome: nome?.replace(/\s+/g, ' ') || null,
    valor: valor ? parseValorBR(valor) : null,
    pagadorRef: ref,
  };
}

/**
 * Reconstrói linhas visuais agrupando items do pdfjs por coordenada Y.
 * O texto do BB vem fragmentado palavra a palavra — join('\n') quebra os
 * campos. Tolerância ~3pt de variação de baseline.
 */
function linhasVisuais(items: any[]): string[] {
  const groups: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    const y = it.transform?.[5];
    const x = it.transform?.[4];
    if (typeof y !== 'number' || typeof x !== 'number' || !it.str) continue;
    let g = groups.find((g) => Math.abs(g.y - y) < 3);
    if (!g) { g = { y, parts: [] }; groups.push(g); }
    g.parts.push({ x, s: it.str });
  }
  return groups
    .sort((a, b) => b.y - a.y)
    .map((g) => g.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Campos do comprovante BB — "PAG SALARIO C/CTA" ou "COMPROVANTE DE TRANSFERENCIA". */
function extrairBb(linhas: string[]): Partial<ComprovanteFolha> {
  const txt = linhas.join('\n');
  const isTransf = /COMPROVANTE\s+DE\s+TRANSFERENCIA/i.test(txt);
  const line = (re: RegExp) => { const l = linhas.find((l) => re.test(l)); return l ? re.exec(l)?.[1]?.trim() || null : null; };

  // Beneficiário: PAG → linha 'BENEFICIARIO: X'; TRANSF → 'CLIENTE: X' após 'TRANSFERIDO PARA:'
  let nome = line(/^BENEFICIARIO:\s*(.+)$/i);
  if (!nome && isTransf) {
    const idx = linhas.findIndex((l) => /TRANSFERIDO PARA/i.test(l));
    const cli = idx >= 0 ? linhas.slice(idx + 1).find((l) => /^CLIENTE:\s*(.+)$/i.test(l)) : null;
    nome = cli ? /^CLIENTE:\s*(.+)$/i.exec(cli)![1].trim() : null;
  }

  // Agência+conta do beneficiário: última linha 'AGENCIA: x CONTA: y' do bloco
  // (a primeira é do pagador). TRANSF: dentro do bloco 'TRANSFERIDO PARA'.
  const agLinhas = linhas.filter((l) => /AGENCIA:/i.test(l));
  const agBenef = agLinhas[agLinhas.length - 1] || '';
  const ag = /AGENCIA:\s*([\d\-Xx]+)/i.exec(agBenef);
  const cta = /CONTA:\s*([\d.]+)\s*-\s*([\dXx]+)/i.exec(agBenef);

  const cpfRaw = line(/^CPF\/CNPJ:\s*([\d.\-\/]+)/i);
  const cpf = cpfRaw ? cpfRaw.replace(/\D/g, '') : null;
  const valorRaw = line(/VALOR\s*TOTAL\s*:?\s*([\d.,]+)/i) || line(/\bVALOR\s*:?\s*([\d.,]+)/i);
  const dataRaw = line(/DATA D[OA] (?:PAGAMENTO|TRANSFERENCIA)\s*:?\s*(\d{2}[\/.]\d{2}[\/.]\d{4})/i);
  const ref = line(/NR\.?\s*DOCUMENTO\s*:?\s*([\d.]+)/i);

  return {
    nome: nome?.replace(/\s+/g, ' ') || null,
    cpf: cpf && cpf.length === 11 ? cpf : null,
    agencia: ag ? onlyDigitsLocal(ag[1]) || null : null,
    contaNumero: cta ? onlyDigitsLocal(cta[1]) || null : null,
    contaDv: cta ? cta[2].toUpperCase() : null,
    conta: cta ? `${onlyDigitsLocal(cta[1])}-${cta[2].toUpperCase()}` : null,
    valor: valorRaw ? parseValorBR(valorRaw) : null,
    dataPagamento: dataRaw ? parseDataBR(dataRaw) : null,
    pagadorRef: ref,
  };
}

function onlyDigitsLocal(s: string): string {
  return s.replace(/\D/g, '').replace(/^0+/, '');
}

/** Campos do comprovante Bradesco Real Time. */
function extrairBradesco(bloco: string): Partial<ComprovanteFolha> {
  const fav = /Favorecido:\s*\n?\s*([\s\S]+?)\s*(?:\||CPF:)/i.exec(bloco);
  const cpf = /CPF:\s*\n?\s*([\d.\-*]+)/i.exec(bloco);
  const ag = /Ag[êe]ncia:\s*\n?\s*([\d]+(?:-\w)?)/i.exec(bloco);
  const cta = /Conta:\s*\n?\s*([\d]+)\s*-\s*(\w)/i.exec(bloco);
  const val = /Valor \(R\$\):\s*\n?\s*([\d.,]+)/i.exec(bloco);
  const dt = /Data de Pagamento:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(bloco);
  const ref = /N[úu]mero de Pagamento:\s*\n?\s*(\w+)/i.exec(bloco);
  return {
    nome: fav ? fav[1].replace(/\s+/g, ' ').trim() : null,
    cpf: cpf ? cpf[1].replace(/\D/g, '') : null,
    agencia: ag ? ag[1].replace(/^0+/, '') : null,
    contaNumero: cta ? cta[1].replace(/^0+/, '') : null,
    contaDv: cta ? cta[2].toUpperCase() : null,
    conta: cta ? `${cta[1].replace(/^0+/, '')}-${cta[2].toUpperCase()}` : null,
    valor: val ? parseValorBR(val[1]) : null,
    dataPagamento: dt ? parseDataBR(dt[1]) : null,
    pagadorRef: ref ? ref[1] : null,
  };
}

/** Campos do comprovante Bradesco Multipag ("Crédito em Conta Salário", 1/pág). */
function extrairBradescoMultipag(linhas: string[]): Partial<ComprovanteFolha> {
  const line = (re: RegExp) => { const l = linhas.find((l) => re.test(l)); return l ? re.exec(l)?.[1]?.trim() || null : null; };

  // 'Funcionário: NOME CPF: 138.162.236-48' — nome e CPF na mesma linha
  const funcLine = linhas.find((l) => /Funcion[aá]rio\s*:/i.test(l)) || '';
  let nome: string | null = null;
  let cpf: string | null = null;
  const fn = /Funcion[aá]rio\s*:\s*(.+?)\s*CPF\s*:\s*([\d.\-]+)/i.exec(funcLine);
  if (fn) {
    nome = fn[1]; cpf = fn[2].replace(/\D/g, '');
  } else {
    nome = /Funcion[aá]rio\s*:\s*(.+)$/i.exec(funcLine)?.[1]?.trim() || null;
    const c = /CPF\s*:\s*([\d.\-]+)/i.exec(funcLine) || /CPF\s*:\s*([\d.\-]+)/i.exec(linhas.join('\n'));
    if (c) cpf = c[1].replace(/\D/g, '');
  }

  // Agência/conta do FAVORECIDO — 'Conta de Débito Agência: …' é da empresa
  const agLinha = linhas.find((l) => /Ag[êe]ncia\s*:/i.test(l) && !/d[ée]bito/i.test(l)) || '';
  const ag = /Ag[êe]ncia\s*:\s*(\d+)/i.exec(agLinha);
  const cta = /Conta\s*:\s*(\d+)\s*-\s*(\w)/i.exec(agLinha);

  const val = line(/Valor \(R\$\)\s*:\s*([\d.,]+)/i);
  const dtLinha = linhas.find((l) => /Pagamento\s*:/i.test(l) && /\d{2}\/\d{2}\/\d{4}/.test(l));
  const dt = dtLinha ? /(\d{2}\/\d{2}\/\d{4})/.exec(dtLinha)?.[1] : null;
  const ref = line(/N[úu]mero de Pagamento\s*:\s*(\d+)/i);

  return {
    nome: nome?.replace(/\s+/g, ' ') || null,
    cpf: cpf && cpf.length === 11 ? cpf : null,
    agencia: ag ? onlyDigitsLocal(ag[1]) || null : null,
    contaNumero: cta ? onlyDigitsLocal(cta[1]) || null : null,
    contaDv: cta ? cta[2].toUpperCase() : null,
    conta: cta ? `${onlyDigitsLocal(cta[1])}-${cta[2].toUpperCase()}` : null,
    valor: val ? parseValorBR(val) : null,
    dataPagamento: dt ? parseDataBR(dt) : null,
    pagadorRef: ref,
  };
}

async function loadPdfJs(buffer: Buffer) {
  const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;
  const pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
}

export async function analisarFolhaPdf(
  buffer: Buffer,
  fileName: string,
  onPageDone?: (done: number, total: number) => void,
): Promise<FolhaAnalise> {
  const warnings: string[] = [];
  const doc = await loadPdfJs(buffer);
  const comprovantes: ComprovanteFolha[] = [];
  let formato: FolhaFormato = 'desconhecido';

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const items = (await page.getTextContent()).items as any[];
      const height = page.getViewport({ scale: 1 }).height;
      const fullText = items.map((it) => it.str ?? '').join('\n');
      onPageDone?.(i, doc.numPages);

      const cuts = items
        .filter((it) => /Cortar aqui/i.test(it.str || ''))
        .map((it) => it.transform?.[5] as number)
        .filter((y) => typeof y === 'number')
        .sort((a, b) => b - a);

      const isItau = /SISPAG\s+SALARIOS/i.test(fullText) || cuts.length > 0;
      const isBradesco = /Real Time/i.test(fullText) && /Favorecido:/i.test(fullText);
      const isMultipag = /Multipag\s+Bradesco/i.test(fullText)
        || (/Cr[ée]dito em Conta Sal[aá]rio/i.test(fullText) && /Funcion[aá]rio\s*:/i.test(fullText));
      const isBb = /PAG\s*SALARIO/i.test(fullText)
        || (/COMPROVANTE\s+DE\s+TRANSFERENCIA/i.test(fullText) && /BANCO\s+DO\s+BRASIL/i.test(fullText));

      if (isItau) {
        formato = formato === 'desconhecido' ? 'itau_folha' : formato;
        // N comprovantes na página — cada um termina na sua linha 'Cortar aqui'.
        // Sem marcador suficiente: último vai até o fim da página.
        const headerYs = items
          .filter((it) => /Comprovante de Opera[çc][ãa]o/i.test(it.str || ''))
          .map((it) => it.transform?.[5] as number)
          .sort((a, b) => b - a);
        const n = Math.max(headerYs.length, cuts.length);
        for (let s = 0; s < n; s++) {
          const y1 = s === 0 ? height : cuts[s - 1];
          const y0 = cuts[s] ?? 0;
          const bloco = textoFaixa(items, y0, y1);
          const extra = extrairItau(bloco);
          comprovantes.push({
            pageNum: i, slot: s, crop: { y0, y1 },
            dataPagamento: null, cpf: null,
            ...extra,
          } as ComprovanteFolha);
          if (!extra.nome && !extra.valor) {
            warnings.push(`${fileName} p${i} slot${s}: faixa sem campos reconhecidos`);
          }
        }
        continue;
      }

      if (isBradesco) {
        formato = formato === 'desconhecido' ? 'bradesco_rt' : formato;
        const extra = extrairBradesco(fullText);
        comprovantes.push({
          pageNum: i, slot: 0, crop: null,
          ...extra,
        } as ComprovanteFolha);
        if (!extra.nome || !extra.cpf) {
          warnings.push(`${fileName} p${i}: Bradesco sem favorecido/CPF extraído`);
        }
        continue;
      }

      if (isMultipag) {
        formato = formato === 'desconhecido' ? 'bradesco_multipag' : formato;
        const extra = extrairBradescoMultipag(linhasVisuais(items));
        comprovantes.push({
          pageNum: i, slot: 0, crop: null,
          ...extra,
        } as ComprovanteFolha);
        if (!extra.cpf && !extra.conta) {
          warnings.push(`${fileName} p${i}: Multipag sem CPF/conta extraído`);
        }
        continue;
      }

      if (isBb) {
        formato = formato === 'desconhecido' ? 'bb_pag' : formato;
        const extra = extrairBb(linhasVisuais(items));
        comprovantes.push({
          pageNum: i, slot: 0, crop: null,
          ...extra,
        } as ComprovanteFolha);
        // Transferência BB→BB não carrega CPF — nome é o mínimo aceitável
        if (!extra.nome) {
          warnings.push(`${fileName} p${i}: BB sem beneficiário extraído`);
        }
        continue;
      }

      warnings.push(`${fileName} p${i}: formato não reconhecido`);
    }
  } finally {
    await doc.destroy();
  }

  if (comprovantes.length === 0 && warnings.length === 0) {
    warnings.push(`${fileName}: nenhum comprovante reconhecido`);
  }
  return { formato, totalPages: doc.numPages, comprovantes, warnings };
}

/**
 * Fragmenta: retorna um PDF novo com a página cortada na região do comprovante
 * (CropBox — conteúdo original preservado, só a janela visível muda).
 */
export async function fragmentarComprovante(
  srcDoc: PDFDocument,
  comp: ComprovanteFolha,
): Promise<Buffer> {
  const out = await PDFDocument.create();
  const [copied] = await out.copyPages(srcDoc, [comp.pageNum - 1]);
  if (comp.crop) {
    const w = copied.getWidth();
    copied.setCropBox(0, comp.crop.y0, w, comp.crop.y1 - comp.crop.y0);
  }
  out.addPage(copied);
  return Buffer.from(await out.save());
}
