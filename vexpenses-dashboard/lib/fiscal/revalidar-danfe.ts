// Revalidação de notas que entraram como falha técnica (sem XML na época) e
// depois ganharam documento (DANFE do Protheus, PDF anexado, etc.).
//
// Extrai os campos do documento e compara com o que está lançado em
// fiscal_notas — o resultado vira `checks` + `auto_resumo` pra o fiscal ver a
// comparação na página em vez de um "Falha no download SIEG" congelado.
// O review_status NÃO muda: a nota continua 'pendente' pra revisão humana.

import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { sql } from '@/lib/db/neon';
import { extractPdfText } from '@/lib/cartorios/parse';

interface Check {
  field: string;
  expected: string;
  actual: string;
  match: boolean;
  missing_xml?: boolean;
}

const onlyDigits = (s: string | null | undefined) => String(s || '').replace(/\D/g, '');

function parseMoneyBR(s: string | null | undefined): number | null {
  if (!s) return null;
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Extrai campos do texto de um DANFE (layout padrão, gerado pelo Protheus).
function parseDanfe(text: string) {
  const flat = text.replace(/\s+/g, ' ');
  const grab = (re: RegExp) => re.exec(flat)?.[1]?.trim() || null;

  return {
    // "VALOR TOTAL DA NOTA 585,00" (seção de cálculo do imposto)
    valor: parseMoneyBR(grab(/VALOR TOTAL DA NOTA[^0-9]{0,40}([\d.]+,\d{2})/i)
      || grab(/TOTAL DA NOTA[^0-9]{0,40}([\d.]+,\d{2})/i)),
    // "Nº 000.265.300" ou "NÚMERO 265300"
    numero: (grab(/N[ºoO°]\s*\.?\s*([\d.]+)/i) || grab(/N[ÚU]MERO[:\s]*([\d.]+)/i))?.replace(/\D/g, '') || null,
    serie: grab(/S[ÉE]RIE[:\s]*(\d{1,4})/i),
    // Primeiro CNPJ do DANFE é o do emitente (vem antes do destinatário)
    cnpj: (() => {
      const m = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/.exec(flat);
      return m ? onlyDigits(m[1]) : null;
    })(),
    emissao: (() => {
      const d = grab(/DATA\s+D[AE]?\s*EMISS[ÃA]O[\s:/]*(\d{2}\/\d{2}\/\d{4})/i);
      if (!d) return null;
      const [dd, mm, yy] = d.split('/');
      return `${yy}-${mm}-${dd}`;
    })(),
    // "RECEBEMOS DE <emitente> OS PRODUTOS" — convenção de todo DANFE
    emitente: grab(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i),
  };
}

function buildChecks(nota: any, danfe: ReturnType<typeof parseDanfe>): Check[] {
  const checks: Check[] = [];
  const cmp = (field: string, expected: string, actual: string | null, eq: (a: string, b: string) => boolean) => {
    if (actual === null) {
      checks.push({ field, expected, actual: '—', match: false, missing_xml: true });
    } else {
      checks.push({ field, expected, actual, match: eq(expected, actual) });
    }
  };

  cmp('doc', String(nota.doc || '').replace(/^0+/, '') || '0', danfe.numero ? String(Number(danfe.numero)) : null,
    (a, b) => a === b);
  cmp('série', String(Number(nota.serie) || nota.serie || ''), danfe.serie ? String(Number(danfe.serie)) : null,
    (a, b) => a === b);
  cmp('CNPJ emitente', onlyDigits(nota.cnpj), danfe.cnpj, (a, b) => a === b);
  cmp('valor', nota.valor != null ? Number(nota.valor).toFixed(2) : '—',
    danfe.valor != null ? danfe.valor.toFixed(2) : null,
    (a, b) => Math.abs(Number(a) - Number(b)) < 0.011);
  cmp('emissão', String(nota.emissao || '').slice(0, 10), danfe.emissao, (a, b) => a === b);
  if (danfe.emitente && nota.fornecedor) {
    const ne = norm(danfe.emitente);
    const nf = norm(nota.fornecedor);
    const match = ne.slice(0, 15) === nf.slice(0, 15) || ne.includes(nf.slice(0, 20)) || nf.includes(ne.slice(0, 20));
    checks.push({ field: 'emitente', expected: nota.fornecedor, actual: danfe.emitente, match });
  }
  return checks;
}

// Revalida uma nota que tem documento local. Retorna resumo ou null quando
// não há o que revalidar (sem doc, doc não-PDF, texto não extraível).
export async function revalidateNotaComDoc(notaId: number): Promise<{ ok: number; falhas: number } | null> {
  if (!sql) return null;
  const rows = await sql`
    SELECT id, doc, serie, filial, fornecedor, cnpj, valor, emissao::text AS emissao,
           doc_path, review_status
    FROM fiscal_notas WHERE id = ${notaId}
  `;
  const nota = rows[0];
  if (!nota) return null;

  const rel = String(nota.doc_path || '');
  if (!rel.startsWith('fiscal/') || !/\.pdf$/i.test(rel)) return null;
  const file = path.join(process.cwd(), 'private-downloads', rel);
  if (!existsSync(file)) return null;

  let text: string;
  try {
    text = await extractPdfText(readFileSync(file));
  } catch {
    return null;
  }
  if (!text || text.trim().length < 50) return null;

  const danfe = parseDanfe(text);
  const checks = buildChecks(nota, danfe);
  const extraidos = checks.filter((c) => !c.missing_xml);
  const falhas = checks.filter((c) => !c.match && !c.missing_xml).length;
  const ausentes = checks.filter((c) => c.missing_xml).length;

  const autoResumo = falhas > 0
    ? `Revalidado via DANFE: ${falhas} divergência(s), ${extraidos.length - falhas} campo(s) OK${ausentes ? `, ${ausentes} não extraídos` : ''}`
    : ausentes === checks.length
      ? 'Revalidado via DANFE: nenhum campo extraível do documento — confira manualmente'
      : `Revalidado via DANFE: ${extraidos.length} campo(s) conferem${ausentes ? ` (${ausentes} não extraídos)` : ''}`;

  await sql`
    UPDATE fiscal_notas SET
      checks = ${JSON.stringify(checks)}::jsonb,
      auto_resumo = ${autoResumo},
      auto_status = ${falhas > 0 ? 'divergente' : 'pendente'},
      updated_at = NOW()
    WHERE id = ${notaId}
      AND review_status IN ('pendente', 'falha_tecnica')
  `;
  return { ok: extraidos.length - falhas, falhas };
}
