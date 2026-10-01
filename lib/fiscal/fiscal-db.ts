// Fiscal verification queue — receives structured results from the local
// Python automations (mercadoria: TOTVS×SIEG-XML com regras Lince/TES;
// serviço: TOTVS×PDF do portal) e gerencia a revisão humana.
//
// Status de revisão (fiscal_notas.review_status):
//   auto_ok         → todos os checks bateram; conta como conferido sem revisão
//   pendente        → divergência ou falha técnica; aguarda o fiscal
//   confirmado_ok   → fiscal revisou e aceitou (ex.: divergência esperada de TES)
//   confirmado_erro → fiscal confirmou erro real; gera registro em
//                     resultados_conferencias (aba de erros existente)
//
// Importação é idempotente por (tipo, doc, serie, filial, emissao, fornecedor):
// re-rodar o mesmo dia atualiza a linha em vez de duplicar — mas NUNCA
// sobrescreve uma decisão humana (confirmado_*) nem derruba auto_ok→pendente
// quando o resultado automático continua ok.

import { unlinkSync } from 'fs';
import path from 'path';
import { sql } from '../db/neon';

let tableEnsured = false;

export const FISCAL_TIPOS = ['mercadoria', 'servico'] as const;
export type FiscalTipo = (typeof FISCAL_TIPOS)[number];

export const AUTO_STATUS = ['match', 'divergente', 'erro', 'pendente'] as const;
export type AutoStatus = (typeof AUTO_STATUS)[number];

export const REVIEW_STATUS = ['auto_ok', 'pendente', 'falha_tecnica', 'confirmado_ok', 'confirmado_erro', 'cancelado'] as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[number];

// Categorias de erro confirmado → coluna `erro` de resultados_conferencias.
// Mantém compatibilidade com os 3 tipos históricos.
export const ERRO_TIPOS = [
  'valor_errado',
  'tipo_errado',
  'fornecedor_errado',
  'tes_errado',
  'imposto_errado',
  'doc_invalido',
  'sem_documento',
  'outro',
] as const;
export type ErroTipo = (typeof ERRO_TIPOS)[number];

export async function ensureFiscalTables(): Promise<void> {
  if (tableEnsured || !sql) return;
  tableEnsured = true;
  await sql`
    CREATE TABLE IF NOT EXISTS fiscal_runs (
      id BIGSERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      hostname TEXT,
      total_notas INT NOT NULL DEFAULT 0,
      matches INT NOT NULL DEFAULT 0,
      divergentes INT NOT NULL DEFAULT 0,
      erros INT NOT NULL DEFAULT 0,
      pendentes INT NOT NULL DEFAULT 0,
      relatorio_nome TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fiscal_notas (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT REFERENCES fiscal_runs(id) ON DELETE SET NULL,
      tipo TEXT NOT NULL,
      doc TEXT NOT NULL,
      serie TEXT,
      filial TEXT,
      fornecedor TEXT,
      cnpj TEXT,
      valor NUMERIC(14,2),
      emissao DATE,
      chave_acesso TEXT,
      auto_status TEXT NOT NULL,
      auto_resumo TEXT,
      checks JSONB,
      extra JSONB,
      review_status TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      review_nota TEXT,
      erro_tipo TEXT,
      erro_descricao TEXT,
      resultados_id INT,
      doc_path TEXT,
      doc_nome TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Dedup com COALESCE: UNIQUE comum deixaria NULLs distintos e duplicaria
  // notas sem serie/emissao na reimportação.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_notas_dedup ON fiscal_notas(
      tipo, doc,
      COALESCE(serie, ''),
      COALESCE(filial, ''),
      COALESCE(emissao, '1900-01-01'::date),
      COALESCE(fornecedor, '')
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_fiscal_notas_review ON fiscal_notas(review_status, tipo, emissao DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_fiscal_notas_run ON fiscal_notas(run_id)`;
  // Colunas adicionadas depois da criação inicial da tabela.
  await sql`ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS doc_path TEXT`;
  await sql`ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS doc_nome TEXT`;
  await sql`ALTER TABLE fiscal_runs ADD COLUMN IF NOT EXISTS push_version TEXT`;
  // Cancelamento de nota com erro confirmado (decisão do outro setor —
  // ex.: NF cancelada no TOTVS). Guarda quem/quando/motivo.
  await sql`ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS cancelled_by TEXT`;
  await sql`ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`;
  await sql`ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS cancel_motivo TEXT`;
}

export function computeReviewStatus(autoStatus: AutoStatus): ReviewStatus {
  if (autoStatus === 'match') return 'auto_ok';
  if (autoStatus === 'erro') return 'falha_tecnica'; // download/parse — não é erro fiscal
  return 'pendente';
}

export const FISCAL_DOCS_DIR = () =>
  path.join(process.cwd(), 'private-downloads', 'fiscal');

// Remove o documento anexado de uma nota (disco + referência). Falha nunca
// quebra o fluxo — arquivo órfão é limpo pelo sweep.
export async function deleteFiscalDoc(notaId: number): Promise<void> {
  if (!sql) return;
  try {
    const rows = await sql`SELECT doc_path FROM fiscal_notas WHERE id = ${notaId}`;
    const rel = String(rows[0]?.doc_path || '');
    if (rel.startsWith('fiscal/')) {
      try {
        unlinkSync(path.join(process.cwd(), 'private-downloads', rel));
      } catch {
        /* arquivo já não existe */
      }
    }
    await sql`UPDATE fiscal_notas SET doc_path = NULL, doc_nome = NULL WHERE id = ${notaId}`;
  } catch {
    /* noop */
  }
}

// Retenção de documentos na VPS:
//  - confirmado_erro → mantém (evidência da aba de erros)
//  - demais status → apaga após DOC_RETENTION_DAYS dias
// Chamado uma vez por importação; remove o arquivo físico e zera as colunas.
export async function sweepOldFiscalDocs(): Promise<number> {
  if (!sql) return 0;
  const dir = FISCAL_DOCS_DIR();
  const old = await sql`
    SELECT id, doc_path FROM fiscal_notas
    WHERE doc_path IS NOT NULL
      AND review_status <> 'confirmado_erro'
      AND created_at < NOW() - INTERVAL '90 days'
  `;
  let removed = 0;
  for (const r of old) {
    const rel = String(r.doc_path || '');
    if (!rel.startsWith('fiscal/')) continue;
    try {
      unlinkSync(path.join(process.cwd(), 'private-downloads', rel));
      removed++;
    } catch {
      /* arquivo já não existe — limpa referência mesmo assim */
    }
    await sql`UPDATE fiscal_notas SET doc_path = NULL, doc_nome = NULL WHERE id = ${r.id}`;
  }
  return removed;
}
