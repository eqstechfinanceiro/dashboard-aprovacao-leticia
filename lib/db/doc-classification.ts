import { sql } from './neon';

// Classificação fiscal do comprovante — persistida separada de expense_audit_results
// porque é consumida pela automação protheus-reports-vex (lançamento Z01).
// tipo_documento: 'nfe' (DANFE/NF-e mod.55 — lançável como nota), 'nfce', 'sat',
// 'recibo' ou 'desconhecido'. needs_review sinaliza os casos que o robô não
// resolveu e um humano precisa classificar/digitar a chave.

export type DocTipo = 'nfe' | 'nfce' | 'sat' | 'recibo' | 'desconhecido';

export interface DocClassification {
  expense_id: number;
  report_id: number;
  tipo_documento: DocTipo;
  chave_acesso: string | null;
  needs_review: boolean;
  source: 'bot' | 'humano';
  reviewed_by: string | null;
  updated_at?: string;
  created_at?: string;
}

let tableEnsured = false;

export async function ensureDocClassTable(): Promise<void> {
  if (tableEnsured || !sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS expense_doc_classification (
        expense_id INTEGER PRIMARY KEY,
        report_id INTEGER NOT NULL,
        tipo_documento VARCHAR(20) NOT NULL,
        chave_acesso VARCHAR(44),
        needs_review BOOLEAN NOT NULL DEFAULT false,
        source VARCHAR(10) NOT NULL DEFAULT 'bot',
        reviewed_by VARCHAR(100),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_docclass_report ON expense_doc_classification(report_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_docclass_review ON expense_doc_classification(needs_review) WHERE needs_review`;
    tableEnsured = true;
    console.log('[DocClass] Table ensured');
  } catch (error) {
    console.error('[DocClass] Error ensuring table:', error);
  }
}

const VALID_CUF = new Set([
  '12', '13', '15', '11', '16', '17', '21', '22', '23', '24', '25',
  '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43',
  '50', '51', '52', '53',
]);

export function normalizeChave(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length === 44 ? digits : null;
}

// DV módulo 11 (pesos 2-9 ciclando da direita) + cUF válido — mesmo algoritmo
// de validar_dv_chave() do protheus-reports-vex.
export function validarDvChave(chave: string | null | undefined): boolean {
  const digits = normalizeChave(chave);
  if (!digits) return false;
  if (!VALID_CUF.has(digits.slice(0, 2))) return false;
  let total = 0;
  for (let i = 0; i < 43; i++) {
    const w = ((42 - i) % 8) + 2;
    total += Number(digits[i]) * w;
  }
  const rest = total % 11;
  const dv = rest < 2 ? 0 : 11 - rest;
  return dv === Number(digits[43]);
}

// Modelo fiscal da chave: posições 20-21 ('55' = NF-e, '65' = NFC-e).
export function modeloChave(chave: string | null | undefined): string | null {
  const digits = normalizeChave(chave);
  return digits ? digits.slice(20, 22) : null;
}

const TIPO_MAP: Record<string, DocTipo> = {
  nfe: 'nfe', 'nf-e': 'nfe', danfe: 'nfe', nota: 'nfe', 'nota fiscal': 'nfe',
  'nota fiscal eletronica': 'nfe', 'nf e': 'nfe',
  nfce: 'nfce', 'nfc-e': 'nfce', cupom: 'nfce', 'cupom fiscal': 'nfce',
  'cupom fiscal eletronico': 'nfce',
  sat: 'sat', 'cfe-sat': 'sat', cfesat: 'sat',
  recibo: 'recibo', receipt: 'recibo', comprovante: 'recibo',
  fatura: 'recibo', boleto: 'recibo', 'nota de servico': 'recibo',
  'nota de serviço': 'recibo', 'nfs-e': 'recibo', nfse: 'recibo',
  outro: 'recibo', outros: 'recibo',
};

export function normalizeTipo(raw: string | null | undefined): DocTipo {
  if (!raw) return 'desconhecido';
  const t = String(raw).trim().toLowerCase().replace(/[_-]+/g, m => m === '-' ? '-' : ' ');
  return TIPO_MAP[t] || TIPO_MAP[t.replace(/-/g, ' ')] || 'desconhecido';
}

// Decide o que persistir a partir da saída bruta do OCR.
export function deriveBotClassification(
  rawTipo: string | null | undefined,
  rawChave: string | null | undefined,
): Pick<DocClassification, 'tipo_documento' | 'chave_acesso' | 'needs_review'> {
  const tipo = normalizeTipo(rawTipo);
  const chave = normalizeChave(rawChave);

  if (tipo === 'nfe') {
    if (!chave || !validarDvChave(chave)) {
      // NF-e sem chave válida — humano precisa digitar
      return { tipo_documento: 'nfe', chave_acesso: null, needs_review: true };
    }
    if (modeloChave(chave) === '65') {
      // OCR disse NF-e mas a chave é modelo 65 — é NFC-e, conta como recibo
      return { tipo_documento: 'nfce', chave_acesso: null, needs_review: false };
    }
    return { tipo_documento: 'nfe', chave_acesso: chave, needs_review: false };
  }

  if (tipo === 'desconhecido') {
    // Se achou uma chave 55 válida mesmo sem classificar, é NF-e
    if (chave && validarDvChave(chave) && modeloChave(chave) === '55') {
      return { tipo_documento: 'nfe', chave_acesso: chave, needs_review: false };
    }
    return { tipo_documento: 'desconhecido', chave_acesso: null, needs_review: true };
  }

  // nfce/sat/recibo são terminais — nunca sobem como nota
  return { tipo_documento: tipo, chave_acesso: null, needs_review: false };
}

export async function saveBotClassification(
  reportId: number,
  expenseId: number,
  rawTipo: string | null | undefined,
  rawChave: string | null | undefined,
): Promise<void> {
  if (!sql) return;
  await ensureDocClassTable();
  const c = deriveBotClassification(rawTipo, rawChave);
  try {
    // Correção humana nunca é sobrescrita pelo bot
    await sql`
      INSERT INTO expense_doc_classification
        (expense_id, report_id, tipo_documento, chave_acesso, needs_review, source)
      VALUES
        (${expenseId}, ${reportId}, ${c.tipo_documento}, ${c.chave_acesso}, ${c.needs_review}, 'bot')
      ON CONFLICT (expense_id) DO UPDATE SET
        report_id = EXCLUDED.report_id,
        tipo_documento = EXCLUDED.tipo_documento,
        chave_acesso = EXCLUDED.chave_acesso,
        needs_review = EXCLUDED.needs_review,
        updated_at = NOW()
      WHERE expense_doc_classification.source <> 'humano'
    `;
  } catch (error) {
    console.error(`[DocClass] Error saving bot classification for expense ${expenseId}:`, error);
  }
}

export async function saveHumanClassification(
  reportId: number,
  expenseId: number,
  tipo: DocTipo,
  chave: string | null,
  reviewer: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!sql) return { ok: false, error: 'Database not configured' };
  await ensureDocClassTable();

  const normChave = normalizeChave(chave);
  if (tipo === 'nfe') {
    if (!normChave) return { ok: false, error: 'NF-e exige chave de acesso de 44 dígitos' };
    if (!validarDvChave(normChave)) return { ok: false, error: 'Chave de acesso com dígito verificador inválido' };
    if (modeloChave(normChave) === '65') return { ok: false, error: 'Chave modelo 65 é NFC-e, não NF-e — classifique como nfce' };
  }

  const finalTipo: DocTipo = tipo === 'nfe' ? 'nfe' : (tipo === 'desconhecido' ? 'desconhecido' : tipo);
  const finalChave = finalTipo === 'nfe' ? normChave : null;
  const needsReview = finalTipo === 'desconhecido';

  await sql`
    INSERT INTO expense_doc_classification
      (expense_id, report_id, tipo_documento, chave_acesso, needs_review, source, reviewed_by)
    VALUES
      (${expenseId}, ${reportId}, ${finalTipo}, ${finalChave}, ${needsReview}, 'humano', ${reviewer})
    ON CONFLICT (expense_id) DO UPDATE SET
      report_id = EXCLUDED.report_id,
      tipo_documento = EXCLUDED.tipo_documento,
      chave_acesso = EXCLUDED.chave_acesso,
      needs_review = EXCLUDED.needs_review,
      source = 'humano',
      reviewed_by = EXCLUDED.reviewed_by,
      updated_at = NOW()
  `;
  return { ok: true };
}

export async function getClassificationsByReport(reportId: number): Promise<DocClassification[]> {
  if (!sql) return [];
  await ensureDocClassTable();
  try {
    const rows = await sql`
      SELECT expense_id, report_id, tipo_documento, chave_acesso, needs_review,
             source, reviewed_by, updated_at, created_at
      FROM expense_doc_classification
      WHERE report_id = ${reportId}
      ORDER BY expense_id
    `;
    return rows as DocClassification[];
  } catch (error) {
    console.error('[DocClass] Error fetching by report:', error);
    return [];
  }
}

export async function getClassificationsByExpenseIds(expenseIds: number[]): Promise<DocClassification[]> {
  if (!sql || expenseIds.length === 0) return [];
  await ensureDocClassTable();
  try {
    const rows = await sql`
      SELECT expense_id, report_id, tipo_documento, chave_acesso, needs_review,
             source, reviewed_by, updated_at, created_at
      FROM expense_doc_classification
      WHERE expense_id = ANY(${expenseIds}::int[])
      ORDER BY expense_id
    `;
    return rows as DocClassification[];
  } catch (error) {
    console.error('[DocClass] Error fetching by ids:', error);
    return [];
  }
}
