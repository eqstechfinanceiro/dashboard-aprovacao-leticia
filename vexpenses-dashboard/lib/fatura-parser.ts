export interface FaturaRow {
  data: string;
  nomePortador: string;
  numFuncional: string;
  numCartao: string;
  contaMae: string;
  tipoTransacao: string;
  descricao: string;
  credDeb: string;
  nomeMoeda: string;
  codMoeda: string;
  ramoEstab: string;
  local: string;
  valorTransacao: number;
  valorDolares: number;
  valorReais: number;
  nomeCiaAerea: string;
  nomePassageiro: string;
  bilhete1: string;
  bilhete2: string;
  bilhete3: string;
  bilhete4: string;
  codigoIata: string;
  centroCusto: string;
  numAutorizacao: string;
  cnpj: string;
  cotacaoDolar: number;
}

export function parseFaturaCsv(csvText: string): FaturaRow[] {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(';');
  const rows: FaturaRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(';');
    if (cols.length < 25) continue;

    const parseNum = (s: string): number => {
      const cleaned = (s || '').replace(/\./g, '').replace(',', '.').trim();
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    };

    rows.push({
      data: cols[0]?.trim() || '',
      nomePortador: cols[1]?.trim() || '',
      numFuncional: cols[2]?.trim() || '',
      numCartao: cols[3]?.trim() || '',
      contaMae: cols[4]?.trim() || '',
      tipoTransacao: cols[5]?.trim() || '',
      descricao: cols[6]?.trim() || '',
      credDeb: cols[7]?.trim() || '',
      nomeMoeda: cols[8]?.trim() || '',
      codMoeda: cols[9]?.trim() || '',
      ramoEstab: cols[10]?.trim() || '',
      local: cols[11]?.trim() || '',
      valorTransacao: parseNum(cols[12]),
      valorDolares: parseNum(cols[13]),
      valorReais: parseNum(cols[14]),
      nomeCiaAerea: cols[15]?.trim() || '',
      nomePassageiro: cols[16]?.trim() || '',
      bilhete1: cols[17]?.trim() || '',
      bilhete2: cols[18]?.trim() || '',
      bilhete3: cols[19]?.trim() || '',
      bilhete4: cols[20]?.trim() || '',
      codigoIata: cols[21]?.trim() || '',
      centroCusto: cols[22]?.trim() || '',
      numAutorizacao: cols[23]?.trim() || '',
      cnpj: cols[24]?.trim() || '',
      cotacaoDolar: parseNum(cols[25] || '0'),
    });
  }

  return rows;
}

function parseDateBr(dateStr: string): Date | null {
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function datesMatch(faturaDate: string, expenseDate: string, toleranceDays: number = 3): boolean {
  const fd = parseDateBr(faturaDate);
  if (!fd) return false;

  let ed: Date | null = null;
  if (expenseDate) {
    ed = new Date(expenseDate);
    if (isNaN(ed.getTime())) {
      ed = parseDateBr(expenseDate);
    }
  }
  if (!ed || isNaN(ed.getTime())) return false;

  const diffMs = Math.abs(fd.getTime() - ed.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= toleranceDays;
}

function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const wordsA = na.split(' ');
  const wordsB = nb.split(' ');
  const setB = new Set(wordsB);
  let matches = 0;
  for (const w of wordsA) {
    if (w.length >= 3 && setB.has(w)) matches++;
  }
  return Math.min(matches / Math.max(wordsA.length, 1), 1);
}

export interface MatchResult {
  matched: boolean;
  faturaRow: FaturaRow | null;
  status: 'VALIDATED' | 'MISMATCH' | 'NOT_FOUND';
  difference: number;
  score: number;
}

export function matchExpenseToFatura(
  expense: { value: number; date: string; title: string; observation?: string },
  faturaRows: FaturaRow[],
  toleranceDays: number = 3,
  valueTolerance: number = 5.00
): MatchResult {
  let bestMatch: FaturaRow | null = null;
  let bestScore = 0;
  let bestDiff = Infinity;

  for (const row of faturaRows) {
    if (row.credDeb !== 'D') continue;

    const valueDiff = Math.abs(row.valorReais - expense.value);
    const dateOk = datesMatch(row.data, expense.date, toleranceDays);
    const textScore = textSimilarity(expense.title, row.descricao);

    let score = 0;
    if (valueDiff <= valueTolerance) score += 0.5;
    else if (valueDiff <= Math.max(expense.value * 0.05, 5)) score += 0.3;
    if (dateOk) score += 0.3;
    score += textScore * 0.2;

    if (score > bestScore || (score === bestScore && valueDiff < bestDiff)) {
      bestScore = score;
      bestMatch = row;
      bestDiff = valueDiff;
    }
  }

  if (!bestMatch || bestScore < 0.3) {
    return { matched: false, faturaRow: null, status: 'NOT_FOUND', difference: 0, score: bestScore };
  }

  const difference = Math.abs(bestMatch.valorReais - expense.value);
  const status = difference <= valueTolerance ? 'VALIDATED' : 'MISMATCH';

  return {
    matched: true,
    faturaRow: bestMatch,
    status,
    difference,
    score: bestScore,
  };
}
