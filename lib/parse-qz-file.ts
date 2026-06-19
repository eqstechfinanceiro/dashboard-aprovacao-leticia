/**
 * parse-qz-file.ts
 *
 * Lê um arquivo xlsx/xls/csv e extrai as triplas (cpf, nome, valor)
 * sem depender do nome do cabeçalho — detecta cada coluna pelo tipo do dado:
 *
 *   CPF   → string ou número de 11 dígitos (após remover . e -)
 *   VALOR → número float (pode vir como string "R$ 1.250,00" ou 1250.00)
 *   NOME  → texto livre que não seja CPF nem valor
 *
 * Estratégia:
 *   1. Converte o arquivo para array de arrays (usando xlsx)
 *   2. Varre cada linha procurando a primeira que contenha um CPF válido
 *   3. A partir dessa linha, classifica as colunas pelo conteúdo da maioria das linhas
 *   4. Retorna {cpf, nome, valor}[] filtrando linhas sem CPF válido
 */

import * as XLSX from 'xlsx';

export interface QzEntry {
  cpf: string;       // 11 dígitos, zero-padded
  nome: string;
  valor: number;
}

export interface ParseResult {
  entries: QzEntry[];
  warnings: string[];
  totalRows: number;
  skippedRows: number;
}

// ---- helpers ----------------------------------------------------------------

function normalizeCpf(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/\./g, '').replace(/-/g, '').replace(/\//g, '').replace(/\s/g, '');
  // vem como float do xlsx: "2027745203.0" → "2027745203"
  if (s.includes('.')) s = s.split('.')[0];
  if (!/^\d+$/.test(s)) return null;
  const padded = s.padStart(11, '0');
  return padded.length === 11 ? padded : null;
}

function normalizeValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;
  // string: "R$ 1.250,00" → 1250.00
  let s = String(raw).trim()
    .replace(/R\$\s*/gi, '')
    .replace(/\s/g, '');
  // BR format: "1.250,00" → "1250.00"
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // US format or plain: "1250.00"
    s = s.replace(',', '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function isLikelyCpf(raw: unknown): boolean {
  return normalizeCpf(raw) !== null;
}

function isLikelyValue(raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === '') return false;
  if (typeof raw === 'number') return !isNaN(raw) && raw >= 0;
  const s = String(raw).trim();
  if (/R\$/i.test(s)) return true;
  // matches numbers with optional BR/US formatting
  return /^-?[\d.,]+$/.test(s.replace(/R\$\s*/i, '').replace(/\s/g, ''));
}

function isLikelyName(raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === '') return false;
  const s = String(raw).trim();
  if (s.length < 2) return false;
  if (isLikelyCpf(raw)) return false;
  if (/^-?[\d.,]+$/.test(s.replace(/R\$\s*/i, ''))) return false;
  return /[a-zA-ZÀ-ÿ]/.test(s);
}

/**
 * Detecta os índices de coluna para cpf, nome e valor
 * analisando as primeiras `sampleSize` linhas de dados.
 */
function detectColumns(
  rows: unknown[][],
  dataStartRow: number,
  sampleSize = 20,
): { cpfCol: number; nomeCol: number; valorCol: number } | null {
  const sample = rows.slice(dataStartRow, dataStartRow + sampleSize);
  if (!sample.length) return null;

  const numCols = Math.max(...sample.map(r => r.length));
  const scores = Array.from({ length: numCols }, () => ({ cpf: 0, nome: 0, valor: 0 }));

  for (const row of sample) {
    for (let c = 0; c < numCols; c++) {
      const cell = row[c];
      if (isLikelyCpf(cell))   scores[c].cpf   += 2; // strong signal
      if (isLikelyValue(cell)) scores[c].valor  += 1;
      if (isLikelyName(cell))  scores[c].nome   += 1;
    }
  }

  // CPF column: highest cpf score
  const cpfCol = scores.reduce((best, s, i) => s.cpf > scores[best].cpf ? i : best, 0);
  if (scores[cpfCol].cpf === 0) return null;

  // Value column: highest valor score, excluding cpfCol
  const valorCol = scores.reduce((best, s, i) => {
    if (i === cpfCol) return best;
    return s.valor > scores[best].valor ? i : best;
  }, cpfCol === 0 ? 1 : 0);

  // Nome column: highest nome score, excluding cpfCol and valorCol
  const nomeCol = scores.reduce((best, s, i) => {
    if (i === cpfCol || i === valorCol) return best;
    return s.nome > scores[best].nome ? i : best;
  }, [cpfCol, valorCol].includes(0) ? ([cpfCol, valorCol].includes(1) ? 2 : 1) : 0);

  return { cpfCol, nomeCol, valorCol };
}

/**
 * Encontra a primeira linha que contém um CPF válido (início dos dados reais).
 */
function findDataStartRow(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(cell => isLikelyCpf(cell))) return i;
  }
  return 0;
}

// ---- main export ------------------------------------------------------------

export function parseQzFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellText: false, cellDates: false });

        // Use first sheet
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

        const warnings: string[] = [];

        // Find where data starts
        const dataStartRow = findDataStartRow(rows);

        // Detect columns
        const cols = detectColumns(rows, dataStartRow);
        if (!cols) {
          reject(new Error('Não foi possível detectar as colunas de CPF, nome e valor. Verifique o arquivo.'));
          return;
        }

        const entries: QzEntry[] = [];
        let skippedRows = 0;
        const totalDataRows = rows.length - dataStartRow;

        for (let i = dataStartRow; i < rows.length; i++) {
          const row = rows[i];
          const rawCpf   = row[cols.cpfCol];
          const rawNome  = row[cols.nomeCol];
          const rawValor = row[cols.valorCol];

          const cpf = normalizeCpf(rawCpf);
          if (!cpf) {
            skippedRows++;
            continue;
          }

          const valor = normalizeValue(rawValor);
          if (valor === null) {
            warnings.push(`Linha ${i + 1}: CPF ${cpf} sem valor reconhecível ("${rawValor}") — ignorado.`);
            skippedRows++;
            continue;
          }

          const nome = rawNome !== null && rawNome !== undefined ? String(rawNome).trim() : '';

          entries.push({ cpf, nome, valor });
        }

        resolve({ entries, warnings, totalRows: totalDataRows, skippedRows });
      } catch (err) {
        reject(new Error(`Erro ao ler arquivo: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
}
