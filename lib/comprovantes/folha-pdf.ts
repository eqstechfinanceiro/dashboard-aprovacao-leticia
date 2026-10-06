// Parser de PDFs de remessa de folha — fragmenta comprovantes dentro da página.
// Formatos conhecidos:
//  - itau_folha: Itaú SISPAG "Comprovante de Operação", 2 por página, separados
//    pela linha "Cortar aqui" (sem CPF — resolve por conta/nome; 'Informações
//    fornecidas pelo pagador' casa com o 'seu número' do CNAB).
//  - bradesco_rt: Bradesco "Comprovante de Pagamento / Crédito em Conta Real
//    Time", 1 por página, CPF do favorecido embutido.
//  - desconhecido: qualquer outro — vira warning, não é enviado.

import { PDFDocument } from 'pdf-lib';

export type FolhaFormato = 'itau_folha' | 'bradesco_rt' | 'desconhecido';

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
