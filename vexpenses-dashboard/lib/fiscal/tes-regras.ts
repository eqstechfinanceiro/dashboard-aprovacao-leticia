import { sql } from '../db/neon';

/**
 * Parametrização do Lince — crédito de ICMS (matriz).
 *
 * A regra do Fiscal é:  SE fornecedor ∈ LISTA_FORNECEDORES (SA2)
 *                    E  produto    ∈ LISTA_PRODUTOS (SB1)
 *                    E  TES calculada ∈ MAPA (405/403/421)
 *                    ENTÃO substitui por 449/448/450.
 *
 * São duas listas independentes + um mapa de substituição — NÃO pares
 * fornecedor×produto. O bot conhece o fornecedor pelo CNPJ do XML (<emit>),
 * então fornecedores guardam a2_cod/a2_loja (cadastro) E o cnpj resolvido
 * via TOTVS SA2 (A2_CGC) na importação.
 */

let ensured = false;
export async function ensureTesRegrasTable() {
  if (ensured || !sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS lince_tes_fornecedores (
      id SERIAL PRIMARY KEY,
      empresa TEXT NOT NULL DEFAULT '*',
      a2_cod TEXT NOT NULL,
      a2_loja TEXT NOT NULL DEFAULT '01',
      cnpj TEXT,
      nome TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa, a2_cod, a2_loja)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS lince_tes_forn_cnpj ON lince_tes_fornecedores (cnpj) WHERE ativo AND cnpj IS NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS lince_tes_produtos (
      id SERIAL PRIMARY KEY,
      produto TEXT NOT NULL UNIQUE,
      descricao TEXT,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS lince_tes_mapa (
      id SERIAL PRIMARY KEY,
      empresa TEXT NOT NULL DEFAULT 'EQS',
      tes_origem TEXT NOT NULL,
      tes_destino TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (empresa, tes_origem)
    )
  `;
  await sql`
    INSERT INTO lince_tes_mapa (empresa, tes_origem, tes_destino) VALUES
      ('EQS', '405', '449'),
      ('EQS', '403', '448'),
      ('EQS', '421', '450')
    ON CONFLICT (empresa, tes_origem) DO NOTHING
  `;
  ensured = true;
}

export const normCnpj = (s: string) => (s || '').replace(/\D/g, '');
/** Código de produto canônico — casa SB1 e cProd independente de zeros/caso. */
export const canonProd = (s: string) => {
  const p = (s || '').trim().toUpperCase();
  return p.replace(/^0+/, '') || p;
};
export const normA2 = (s: string) => (s || '').trim().toUpperCase();
export const normLoja = (s: string) => {
  const l = String(s || '').trim();
  return /^\d+$/.test(l) ? l.padStart(2, '0') : l.toUpperCase();
};
