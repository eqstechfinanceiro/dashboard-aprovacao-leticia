import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { sql } from '@/lib/db/neon';
import { ensureTesRegrasTable, normCnpj, normProd } from '@/lib/fiscal/tes-regras';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST multipart — arquivo .xlsx/.csv/.txt com colunas de fornecedor + produto + tes.
 * Headers aceitos (case-insensitive, com ou sem acento):
 *   fornecedor: cnpj|fornecedor_cnpj|cnpj_fornecedor|emitente|codigo_fornecedor
 *   produto:    produto|item|codigo|cod_produto|produto_codigo|material
 *   tes:        tes|tes_nova|nova_tes|tipo_entrada
 *   opcionais:  nome|fornecedor_nome|razao ; desc|descricao|produto_desc ;
 *               empresa ; loja (ignorada por ora)
 * Linhas sem tes/cnpj/produto válidos são reportadas como erro e puladas.
 */

const H_FORN = ['cnpj', 'fornecedor_cnpj', 'cnpj_fornecedor', 'emitente', 'codigo_fornecedor', 'cpf', 'cnpjcpf'];
const H_PROD = ['produto', 'item', 'codigo', 'cod_produto', 'produto_codigo', 'material', 'codigo_produto', 'cod_item'];
const H_TES = ['tes', 'tes_nova', 'nova_tes', 'tipo_entrada', 'tip_entrada', 'tes_destino'];
const H_NOME = ['nome', 'fornecedor_nome', 'razao', 'razao_social', 'fornecedor', 'nome_fornecedor'];
const H_DESC = ['desc', 'descricao', 'produto_desc', 'descricao_produto', 'item_desc'];
const H_EMP = ['empresa', 'emp'];

const normHeader = (h: string) =>
  h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function mapCols(headerRow: string[]): Record<string, number> {
  const find = (keys: string[]) =>
    headerRow.findIndex((h) => keys.includes(normHeader(h)));
  return {
    cnpj: find(H_FORN),
    produto: find(H_PROD),
    tes: find(H_TES),
    nome: find(H_NOME),
    desc: find(H_DESC),
    empresa: find(H_EMP),
  };
}

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g)?.length || 0) >= (first.match(/,/g)?.length || 0) ? ';' : ',';
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
}

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;
  const user = (session as any)?.email || (session as any)?.name || null;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let rows: string[][];
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false })
      .map((r) => r.map((c) => String(c ?? '').trim()));
  } else {
    rows = parseCsv(buf.toString('utf8'));
  }
  if (rows.length < 2) return NextResponse.json({ error: 'arquivo vazio ou sem linhas' }, { status: 400 });

  const cols = mapCols(rows[0]);
  if (cols.cnpj < 0 || cols.produto < 0 || cols.tes < 0) {
    return NextResponse.json(
      { error: 'colunas obrigatórias não encontradas (cnpj, produto, tes)', header: rows[0] },
      { status: 400 },
    );
  }

  let inseridos = 0, atualizados = 0;
  const erros: { linha: number; motivo: string; raw: string }[] = [];
  const empresaDef = String(form!.get('empresa') || '*').toUpperCase();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const cnpj = normCnpj(r[cols.cnpj] || '');
    const produto = normProd(r[cols.produto] || '');
    const tes = String(r[cols.tes] || '').trim().toUpperCase();
    const empresa = cols.empresa >= 0 && r[cols.empresa]
      ? String(r[cols.empresa]).trim().toUpperCase() : empresaDef;
    if (!cnpj || cnpj.length < 11 || !produto || !tes) {
      if (r.some((c) => c)) erros.push({ linha: i + 1, motivo: 'cnpj/produto/tes inválido', raw: r.join(' | ').slice(0, 120) });
      continue;
    }
    try {
      const res = await sql.query(
        `INSERT INTO lince_tes_regras
           (empresa, fornecedor_cnpj, fornecedor_nome, produto, produto_desc, tes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (empresa, fornecedor_cnpj, produto)
         DO UPDATE SET tes = EXCLUDED.tes,
                       fornecedor_nome = COALESCE(EXCLUDED.fornecedor_nome, lince_tes_regras.fornecedor_nome),
                       produto_desc = COALESCE(EXCLUDED.produto_desc, lince_tes_regras.produto_desc),
                       ativo = TRUE, updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [empresa, cnpj,
         cols.nome >= 0 ? r[cols.nome] || null : null,
         produto,
         cols.desc >= 0 ? r[cols.desc] || null : null,
         tes, user]);
      res.rows[0]?.inserted ? inseridos++ : atualizados++;
    } catch (e: any) {
      erros.push({ linha: i + 1, motivo: String(e?.message || e).slice(0, 120), raw: r.join(' | ').slice(0, 120) });
    }
  }

  return NextResponse.json({
    ok: true, inseridos, atualizados,
    erros: erros.slice(0, 50), totalErros: erros.length,
    linhasProcessadas: rows.length - 1,
  });
}
