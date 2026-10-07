import { sql } from '../db/neon';

/**
 * Regras de TES por (fornecedor × produto) consumidas pelo Lince ao lançar
 * a NF de entrada. O bot consulta esta tabela com cache curto (~60s) —
 * edições aqui passam a valer quase em tempo real.
 *
 * Match do produto: o Lince normaliza ambos os lados (trim + upper) e testa
 * o código SB1 (grid SIGA) e o cProd do XML — então o código pode ser o
 * interno (SB1) ou o do fornecedor (cProd).
 */
let ensured = false;
export async function ensureTesRegrasTable() {
  if (ensured || !sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS lince_tes_regras (
      id SERIAL PRIMARY KEY,
      empresa TEXT NOT NULL DEFAULT '*',
      fornecedor_cnpj TEXT NOT NULL,
      fornecedor_nome TEXT,
      produto TEXT NOT NULL,
      produto_desc TEXT,
      tes TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS lince_tes_regras_uk
    ON lince_tes_regras (empresa, fornecedor_cnpj, produto)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS lince_tes_regras_lookup
    ON lince_tes_regras (fornecedor_cnpj, produto) WHERE ativo
  `;
  ensured = true;
}

export const normCnpj = (s: string) => (s || '').replace(/\D/g, '');
export const normProd = (s: string) => (s || '').trim().toUpperCase();

export interface TesRegra {
  id: number;
  empresa: string;
  fornecedor_cnpj: string;
  fornecedor_nome: string | null;
  produto: string;
  produto_desc: string | null;
  tes: string;
  ativo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
