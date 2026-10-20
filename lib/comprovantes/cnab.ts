// Parser CNAB 240 (FEBRABAN) — arquivos de remessa de folha (FO/PR/BB/BRADESCO).
// Extrai do segmento A: banco/agência/conta do favorecido, nome, data e valor;
// e do segmento B (quando presente) o CPF. Itaú também grava o CPF no tail do A.

export interface CnabEntry {
  banco: string;          // '341' | '001' | '237' | ...
  lote: string;
  seq: number;
  agencia: string;        // dígitos, sem zeros à esquerda ('' quando zerada)
  conta: string;          // dígitos sem dv, sem zeros à esquerda ('' quando zerada)
  contaDv: string;
  nome: string;
  valor: number;          // reais
  dataPagamento: string;  // 'YYYY-MM-DD' ('' se inválida)
  cpf: string | null;     // 11 dígitos
  seuNumero: string;      // 'seu número' do A — casa com o pagadorRef do PDF Itaú
  line: number;           // linha do registro A no arquivo
}

export interface CnabFile {
  banco: string;
  bancoNome: string;
  fileName: string;
  entries: CnabEntry[];
  warnings: string[];
}

export const BANCO_NOME: Record<string, string> = {
  '001': 'BB (BANCO DO BRASIL)',
  '237': 'BRADESCO',
  '341': 'ITAU',
  '033': 'SANTANDER',
  '104': 'CEF',
};

/** Valor do índice BANCO no e2doc — o dicionário é estrito e rejeita (400)
 *  qualquer rótulo fora da lista dele ('BB (BANCO DO BRASIL)' falha; 'BB' passa).
 *  Verificado em produção: 001→BB, 237→BRADESCO, 341→ITAU. */
export const BANCO_E2DOC: Record<string, string> = {
  '001': 'BB',
  '237': 'BRADESCO',
  '341': 'ITAU',
  '033': 'SANTANDER',
  '104': 'CEF',
};

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

function stripZeros(s: string): string {
  return onlyDigits(s).replace(/^0+/, '');
}

/** Validação mod-11 de CPF — evita aceitar qualquer sequência de 11 dígitos. */
export function cpfValido(cpf: string): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const dig = ((sum * 10) % 11) % 10;
    if (dig !== Number(d[len])) return false;
  }
  return true;
}

/** Extrai CPF do tail do segmento A (Itaú grava inscrição do favorecido ali). */
function cpfFromSegmentA(line: string): string | null {
  // campos no fim da linha: '0     30116167874   0100004' — procura um run de
  // 11 dígitos válido como CPF nas últimas ~50 posições.
  const tail = line.slice(-50);
  for (const m of tail.matchAll(/(\d{11})/g)) {
    if (cpfValido(m[1])) return m[1];
  }
  return null;
}

/** CPF do segmento B: 'B' + espaços + tipo inscrição (1=CPF/2=CNPJ) + número 14. */
function cpfFromSegmentB(line: string): string | null {
  const m = /^.{13}B\s{3}(\d)(\d{14})/.exec(line);
  if (!m || m[1] !== '1') return null;
  const cpf = m[2].slice(3); // últimos 11 dos 14
  return cpfValido(cpf) ? cpf : null;
}

function parseDataPagamento(s: string): string {
  // DDMMYYYY → YYYY-MM-DD
  if (!/^\d{8}$/.test(s)) return '';
  const [dd, mm, yyyy] = [s.slice(0, 2), s.slice(2, 4), s.slice(4, 8)];
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  return Number.isNaN(d.getTime()) ? '' : `${yyyy}-${mm}-${dd}`;
}

export function parseCnab(buffer: Buffer, fileName: string): CnabFile {
  const text = buffer.toString('latin1'); // CNAB é single-byte; preserva acentos
  const lines = text.split(/\r?\n/).filter((l) => l.length >= 200);
  const warnings: string[] = [];
  const entries: CnabEntry[] = [];
  const pendingB = new Map<number, CnabEntry>(); // seq → entry esperando o segmento B

  let banco = '';
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length < 30) continue;
    const bb = raw.slice(0, 3);
    if (/^\d{3}$/.test(bb)) { banco = bb; break; }
  }

  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    if (line.length < 240) { warnings.push(`linha ${lineNo} com ${line.length} chars (<240) ignorada`); continue; }
    const tipo = line[7];
    const seg = line[13];
    if (tipo !== '3') continue;

    if (seg === 'A') {
      const valor = Number(onlyDigits(line.slice(119, 134))) / 100;
      const entry: CnabEntry = {
        banco: line.slice(0, 3) || banco,
        lote: line.slice(3, 7),
        seq: Number(line.slice(8, 13)) || 0,
        agencia: stripZeros(line.slice(23, 28)),
        conta: stripZeros(line.slice(28, 41)),
        contaDv: line.slice(41, 43).trim(),
        nome: line.slice(43, 73).trim(),
        valor,
        dataPagamento: parseDataPagamento(line.slice(93, 101)),
        cpf: cpfFromSegmentA(line),
        seuNumero: line.slice(73, 93).trim(),
        line: lineNo,
      };
      entries.push(entry);
      if (!entry.cpf) pendingB.set(entry.seq, entry);
      continue;
    }

    if (seg === 'B') {
      const cpf = cpfFromSegmentB(line);
      if (!cpf) continue;
      const seq = Number(line.slice(8, 13)) || 0;
      // B segue o A do mesmo seq; pega pelo seq e, se falhar, pelo último A sem CPF
      const target = pendingB.get(seq) ?? [...pendingB.values()].pop();
      if (target) { target.cpf = cpf; pendingB.delete(target.seq); }
      continue;
    }
  }

  const semCpf = entries.filter((e) => !e.cpf).length;
  if (semCpf) warnings.push(`${semCpf} registro(s) sem CPF (B ausente ou inscrição inválida)`);
  return {
    banco,
    bancoNome: BANCO_NOME[banco] || `BANCO ${banco}`,
    fileName,
    entries,
    warnings,
  };
}

// ---------- CNAB240 segmento J — remessa a pagar PIX QR (FGTS Caixa) ----------

export interface RemessaJEntry {
  banco: string;
  lote: string;
  seq: number;
  nome: string;             // favorecido no J principal (30c, pode truncar)
  valor: number;            // reais
  dataPagamento: string;    // 'YYYY-MM-DD' ('' se inválida)
  nossoNumero: string;
  // do J52 (quando presente):
  cpf: string | null;       // inscrição recebedor tipo 1 — últimos 11 dos 15 dígitos
  nomeRecebedor: string | null;
  urlQr: string | null;     // ex.: pix-qrcode.caixa.gov.br/api/v2/cobv/...
  isFgtsQr: boolean;        // urlQr contém 'pix-qrcode.caixa.gov.br'
  line: number;
}

export interface RemessaJFile {
  banco: string;
  bancoNome: string;
  fileName: string;
  entries: RemessaJEntry[];
  warnings: string[];
}

/** Extrai nome/data/valor do J principal. Offsets medidos no layout Itaú
 *  "Remessa a Pagar" (out/2026); se a leitura fixa falhar, cai no regex
 *  DDMMYYYY+valor15d logo após o nome — tolera variação de versão de layout. */
function parseSegJ(line: string, warnings: string[]): Pick<RemessaJEntry, 'nome' | 'valor' | 'dataPagamento'> | null {
  let nome = line.slice(61, 91).trim();
  let resto = line.slice(91);
  let m = /^(\d{8})(\d{15})/.exec(resto);
  if (!m) {
    // Fallback: procura o par data+valor em qualquer janela após o nome.
    m = /(\d{8})(\d{15})/.exec(line.slice(60));
    if (m) {
      const nomeEnd = line.indexOf(m[0]);
      nome = line.slice(61, nomeEnd).trim();
    }
  }
  if (!m) { warnings.push(`seg J sem par data+valor reconhecível: ${line.slice(0, 30)}…`); return null; }
  const dataPagamento = parseDataPagamento(m[1]);
  const valor = Number(m[2]) / 100;
  return { nome, valor, dataPagamento };
}

/** J52: 'J' + '052' no campo movimento, traz pagador + recebedor + URL do QR.
 *  Medido no arquivo real: tipo inscr. recebedor @75, número @76-90 (15d),
 *  nome recebedor @91-130 (40c), URL @131+. */
function parseSegJ52(line: string): { cpf: string | null; nomeRecebedor: string | null; urlQr: string | null } {
  const tipoInsc = line[75];
  const inscricao = onlyDigits(line.slice(76, 91));
  let cpf: string | null = null;
  if (tipoInsc === '1' && inscricao.length === 15) {
    const cand = inscricao.slice(-11);
    if (cpfValido(cand)) cpf = cand;
  }
  const nomeRecebedor = line.slice(91, 131).trim() || null;
  const urlQr = (line.slice(131).match(/\S+/) || [null])[0];
  return { cpf, nomeRecebedor, urlQr };
}

export function parseRemessaJ(buffer: Buffer, fileName: string): RemessaJFile {
  const text = buffer.toString('latin1');
  const warnings: string[] = [];
  const entries: RemessaJEntry[] = [];

  let banco = '';
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length < 30) continue;
    const bb = raw.slice(0, 3);
    if (/^\d{3}$/.test(bb)) { banco = bb; break; }
  }

  let lastJ: RemessaJEntry | null = null;
  let lineNo = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length < 240) continue;
    lineNo++;
    if (raw[7] !== '3' || raw[13] !== 'J') continue;

    // J52 = registro de dados complementares (movimento '052' no campo
    // 15-19 do layout). A checagem por URL falha quando o recebedor não é
    // Caixa (ex.: apipix.tesouro.gov.br) — o layout é o discriminador certo.
    if (raw.slice(14, 19) === '00052' || /pix-qrcode/i.test(raw)) {
      // J52 — complemento do J principal imediatamente anterior
      const j52 = parseSegJ52(raw);
      if (lastJ) {
        lastJ.cpf = j52.cpf;
        lastJ.nomeRecebedor = j52.nomeRecebedor;
        lastJ.urlQr = j52.urlQr;
        lastJ.isFgtsQr = /pix-qrcode\.caixa\.gov\.br/i.test(j52.urlQr || '');
      } else {
        warnings.push(`linha ${lineNo}: J52 sem J principal anterior — ignorado`);
      }
      continue;
    }

    const parsed = parseSegJ(raw, warnings);
    if (!parsed) continue;
    lastJ = {
      banco: raw.slice(0, 3) || banco,
      lote: raw.slice(3, 7),
      seq: Number(raw.slice(8, 13)) || 0,
      ...parsed,
      nossoNumero: raw.slice(182, 202).trim(),
      cpf: null,
      nomeRecebedor: null,
      urlQr: null,
      isFgtsQr: false,
      line: lineNo,
    };
    entries.push(lastJ);
  }

  const fgts = entries.filter((e) => e.isFgtsQr).length;
  if (entries.length && !fgts) {
    warnings.push('nenhuma entrada PIX QR Caixa (J52 pix-qrcode.caixa.gov.br) — remessa não parece ser de FGTS');
  }
  return {
    banco,
    bancoNome: BANCO_NOME[banco] || `BANCO ${banco}`,
    fileName,
    entries,
    warnings,
  };
}
