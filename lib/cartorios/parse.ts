// Extração de campos de avisos/intimações de cartório (protesto).
// Dois layouts conhecidos:
//   A) Tabelionato de Notas e Protesto de São José/SC (boleto + intimação)
//   B) Cartório 1º Ofício 2ª Zona da Serra/ES (intimação + ficha compensação)
// O parser é tolerante: tenta os dois layouts e devolve null no que não achar —
// o usuário revisa e completa no formulário antes de salvar.

export interface CartorioParsed {
  protocolo: string | null;
  data_protocolo: string | null; // dd/mm/aaaa → recebimento
  empresa: 'EQS' | 'BRATEC' | null;
  devedor_nome: string | null;
  devedor_cnpj: string | null;
  fornecedor: string | null;
  fornecedor_cnpj: string | null;
  titulo: string | null;
  venc_titulo: string | null;
  venc_cartorio: string | null;
  valor_orig: number | null;
  emolumentos: number | null;
  tarifa: number | null; // boleto bancário do cartório (default 2,50 quando não discrimina)
  valor_doc: number | null; // valor total impresso no documento (boleto/valor a pagar)
  apresentante: string | null;
  layout: 'saojose' | 'serra' | 'desconhecido';
}

const CNPJ_EMPRESA: Record<string, 'EQS' | 'BRATEC'> = {
  '80464753000197': 'EQS',
  '27462720000125': 'BRATEC',
};

function brl(v: string | null): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

function first(re: RegExp, text: string, group = 1): string | null {
  const m = re.exec(text);
  return m ? m[group]?.trim() || null : null;
}

function digits(s: string | null): string {
  return (s || '').replace(/\D/g, '');
}

function empresaDe(cnpj: string | null): 'EQS' | 'BRATEC' | null {
  return CNPJ_EMPRESA[digits(cnpj)] ?? null;
}

const BANK_RE = /BANCO|BANESTES|BRADESCO|ITAU|ITAÚ|UNIBANCO|SANTANDER|CAIXA|SICOOB|SICREDI/i;

function parseSaoJose(text: string, out: CartorioParsed): void {
  out.devedor_nome = out.devedor_nome ?? first(/Devedor \/ Endereço\s*\n([^\n]+)/, text);
  out.devedor_cnpj = out.devedor_cnpj ?? first(/CPF \/ CNPJ:\s*([\d./-]+)/, text);
  out.empresa = out.empresa ?? empresaDe(out.devedor_cnpj);

  // "1740217 / 15/09/2026" logo após o rótulo
  const prot = /Nº \/ Data do Protocolo\s*\n(\d+)\s*\/\s*(\d{2}\/\d{2}\/\d{4})/.exec(text)
    ?? /RECIBO DA INTIMAÇÃO[\s\S]{0,200}?(\d{6,})\s*\/\s*(\d{2}\/\d{2}\/\d{4})/.exec(text);
  if (prot) {
    out.protocolo = out.protocolo ?? prot[1];
    out.data_protocolo = out.data_protocolo ?? prot[2];
  }

  out.venc_cartorio = out.venc_cartorio
    ?? first(/Último dia p\/ pagamento\s*\n(\d{2}\/\d{2}\/\d{4})/, text)
    ?? first(/Intimação\s*\n(\d{2}\/\d{2}\/\d{4})/, text);

  // "DMI - 4923 (Vcto: 02/09/2026)" — número do título + vencimento juntos
  const dmi = /DMI -\s*(\d+)\s*\(Vcto:\s*(\d{2}\/\d{2}\/\d{4})\)/.exec(text);
  if (dmi) {
    out.titulo = out.titulo ?? dmi[1];
    out.venc_titulo = out.venc_titulo ?? dmi[2];
  }
  out.venc_titulo = out.venc_titulo
    ?? first(/Venc(?:imento)?\.?\/Especie\/nº do Título\/Motivo\/Tipo\s*\n(\d{2}\/\d{2}\/\d{4})/, text);
  out.titulo = out.titulo
    ?? first(/Por Indica[çc][ãa]o\s*\n(\S+)/, text);

  // Credor original (o PDF tem o typo "Orginal") — o nome pode vir na mesma
  // linha (alguns extractores) ou na linha seguinte
  const credorBloco = /Credor Org[io]nal[ \t]+([^\n]+?)[ \t]*\n([^\n]+)/.exec(text)
    ?? /Credor Org[io]nal\s*\n([^\n]+)(?:\n([^\n]+))?/.exec(text)
    ?? /Credor Org[io]nal[ \t]+([^\n]+)/.exec(text);
  if (credorBloco) {
    // duas linhas: nome fantasia + razão social — prefere a mais completa (2ª)
    out.fornecedor = out.fornecedor ?? (credorBloco[2]?.trim() || credorBloco[1]?.trim() || null);
  }

  out.apresentante = out.apresentante
    ?? first(/Apresentante\s*\n([^\n]+)/, text);
  const apHeader = first(/Apresentante \/ Credor \/ Cedente\s*\n([^\n]+)/, text);
  if (!out.apresentante && apHeader && !/vencimento|esp[ée]cie|t[íi]tulo|motivo/i.test(apHeader)) {
    out.apresentante = apHeader;
  }

  // "Apresentante / Credor / Cedente" aparece mais de uma vez no doc (boleto +
  // recibo) — varre TODAS as ocorrências por linhas "NOME - CNPJ":
  //   1ª linha não-banco = credor → fornecedor + CNPJ
  //   1ª linha de banco = apresentante (fallback)
  const blocoRe = /Apresentante \/ Credor \/ Cedente([\s\S]{0,400})/g;
  const seenCnpj = new Set<string>();
  let blocoM: RegExpExecArray | null;
  while ((blocoM = blocoRe.exec(text))) {
    for (const line of blocoM[1].split('\n')) {
      const m = /^\s*([^\n-]+?)\s*-\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*$/.exec(line);
      if (!m) continue;
      if (/^0+$/.test(digits(m[2]))) continue;
      if (out.devedor_cnpj && digits(m[2]) === digits(out.devedor_cnpj)) continue;
      if (seenCnpj.has(m[2])) continue;
      seenCnpj.add(m[2]);
      if (BANK_RE.test(m[1])) {
        out.apresentante = out.apresentante ?? m[1].trim();
        continue;
      }
      out.fornecedor_cnpj = out.fornecedor_cnpj ?? m[2];
      if (!out.fornecedor) out.fornecedor = m[1].trim();
      break;
    }
  }

  // "Valores a pagar:" discrimina as taxas — emolumentos = soma das taxas
  // (apontamento, FRJ, intimação, ISSQN...), boleto bancário = tarifa
  const vp = /Valores a pagar:([\s\S]{0,600})/.exec(text);
  if (vp) {
    let fees = 0;
    let hasFee = false;
    for (const line of vp[1].split('\n')) {
      const m = /^\s*([^:\n]+?):\s*(?:[A-Za-zÀ-ÿ ]+:\s*)?R\$\s*([\d.,]+)/.exec(line);
      if (!m) continue;
      if (/valor d[íi]vida|valor total/i.test(m[1])) continue;
      if (/boleto banc[áa]rio/i.test(m[1])) {
        out.tarifa = out.tarifa ?? brl(m[2]);
        continue;
      }
      const v = brl(m[2]);
      if (v !== null) { fees += v; hasFee = true; }
    }
    if (hasFee) out.emolumentos = out.emolumentos ?? Math.round(fees * 100) / 100;
  }

  // "Vlr Orig./Vlr Decl./Emol." → 3 valores; o 3º é o total do boleto
  const vlr = /Vlr Orig\.\/Vlr Decl\.\/Emol\.\s*\nR\$ ([\d.,]+)\s*\nR\$ ([\d.,]+)\s*\n([\d.,]+)/.exec(text);
  if (vlr) {
    out.valor_orig = out.valor_orig ?? brl(vlr[1]);
    out.valor_doc = out.valor_doc ?? brl(vlr[3]);
  }

  // Fallbacks do bloco "Valores a pagar" / "Valor do documento"
  out.valor_orig = out.valor_orig
    ?? brl(first(/Valor d[íi]vida:\s*R\$\s*([\d.,]+)/, text));
  out.valor_doc = out.valor_doc
    ?? brl(first(/Valor total:\s*R\$\s*([\d.,]+)/, text))
    ?? brl(first(/Valor do documento\s*\n\s*([\d.,]+)/, text));
}

function parseSerra(text: string, out: CartorioParsed): void {
  out.protocolo = out.protocolo ?? first(/PROTOCOLO\s*\n(\d{6,})/, text);
  out.data_protocolo = out.data_protocolo ?? first(/Apontamento:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/, text);

  // A data do "último dia" vem ANTES do rótulo no topo do aviso
  out.venc_cartorio = out.venc_cartorio
    ?? first(/(\d{2}\/\d{2}\/\d{4})\s*\nApontamento/, text)
    ?? first(/pagamento:\s*\n?(\d{2}\/\d{2}\/\d{4})/, text);

  const sacado = /SACADO:\s*([^\n]+?)\s*\nCNPJ:\s*([\d./-]+)/.exec(text)
    ?? /([\wÀ-ÿ .&/-]+?)\s+CNPJ\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*\n/.exec(text);
  if (sacado) {
    out.devedor_nome = out.devedor_nome ?? sacado[1].trim();
    out.devedor_cnpj = out.devedor_cnpj ?? sacado[2];
    out.empresa = out.empresa ?? empresaDe(out.devedor_cnpj);
  }

  out.titulo = out.titulo ?? first(/Número do Título\s*\n([^\n]+)/, text);
  out.venc_titulo = out.venc_titulo
    ?? first(/Vencimento\s*\n(\d{2}\/\d{2}\/\d{4})\s*\nEspécie/, text);

  out.valor_orig = out.valor_orig
    ?? brl(first(/Valor do Título\s*\nR\$ ([\d.,]+)/, text))
    ?? brl(first(/Valor a Protestar\s*\nR\$ ([\d.,]+)/, text));
  out.emolumentos = out.emolumentos
    ?? brl(first(/Emolumentos\s*\nR\$ ([\d.,]+)/, text));
  out.valor_doc = out.valor_doc
    ?? brl(first(/Valor a Pagar\s*\nR\$ ([\d.,]+)/, text))
    ?? brl(first(/\(\s*=\s*\)\s*Valor Cobrado\s*\nR\$ ([\d.,]+)/, text));

  out.apresentante = out.apresentante ?? first(/APRESENTANTE:\s*([^\n]+)/, text);
}

export function parseAvisoText(text: string, fileName?: string): CartorioParsed {
  const out: CartorioParsed = {
    protocolo: null, data_protocolo: null, empresa: null,
    devedor_nome: null, devedor_cnpj: null,
    fornecedor: null, fornecedor_cnpj: null,
    titulo: null, venc_titulo: null, venc_cartorio: null,
    valor_orig: null, emolumentos: null, tarifa: null, valor_doc: null,
    apresentante: null, layout: 'desconhecido',
  };

  const isSaoJose = /TABELIONATO DE NOTAS E PROTESTO|Nº \/ Data do Protocolo|Devedor \/ Endereço/i.test(text);
  const isSerra = /OF[ÍI]CIO.*SERRA|Apontamento:|cartorioserra/i.test(text);

  if (isSaoJose) { out.layout = 'saojose'; parseSaoJose(text, out); }
  if (isSerra) { if (out.layout === 'desconhecido') out.layout = 'serra'; parseSerra(text, out); }
  if (out.layout === 'desconhecido') { parseSaoJose(text, out); parseSerra(text, out); }

  // Fallbacks genéricos
  if (!out.protocolo) {
    const m = /(\d{6,})/.exec(fileName || '') ?? /PROTOCOLO[^\d]{0,20}(\d{6,})/i.exec(text);
    if (m) out.protocolo = m[1];
  }
  if (!out.venc_cartorio) {
    out.venc_cartorio = first(/[Úú]ltimo dia[^\n]{0,30}\n?\s*(\d{2}\/\d{2}\/\d{4})/, text);
  }
  out.empresa = out.empresa ?? 'EQS';
  return out;
}

/** Extrai texto de todas as páginas via pdfjs (mesmo setup do comprovantes). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;
  const pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it: any) => it.str ?? '').join('\n'));
  }
  await doc.destroy();
  return parts.join('\n');
}

/** dd/mm/aaaa → aaaa-mm-dd (ISO) ou null */
export function brDateToIso(d: string | null): string | null {
  if (!d) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
