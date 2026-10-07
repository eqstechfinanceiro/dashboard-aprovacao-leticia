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
