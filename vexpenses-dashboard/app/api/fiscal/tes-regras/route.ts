import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureTesRegrasTable, normCnpj, canonProd, normA2, normLoja } from '@/lib/fiscal/tes-regras';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';

const LISTAS = ['fornecedores', 'produtos', 'mapa'] as const;
type Lista = typeof LISTAS[number];

async function getUser(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const s = token ? await verifyToken(token) : null;
  return (s as any)?.email || (s as any)?.name || null;
}

/** GET /api/fiscal/tes-regras?lista=fornecedores|produtos|mapa&q=&ativo=&page=&limit= */
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const p = request.nextUrl.searchParams;
  const lista = (p.get('lista') || 'fornecedores') as Lista;
  if (!LISTAS.includes(lista)) return NextResponse.json({ error: 'lista inválida' }, { status: 400 });

  const q = (p.get('q') || '').trim();
  const ativo = p.get('ativo');
  const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1);
  const limit = Math.min(500, Math.max(10, parseInt(p.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;

  const tabela = `lince_tes_${lista}`;
  const conds: string[] = [];
  const vals: any[] = [];
  if (ativo === '1' || ativo === '0') { vals.push(ativo === '1'); conds.push(`ativo = $${vals.length}`); }
  if (q) {
    const like = `%${q}%`;
    vals.push(like, `%${normCnpj(q)}%`, `%${canonProd(q)}%`);
    if (lista === 'fornecedores')
      conds.push(`(nome ILIKE $${vals.length - 2} OR a2_cod ILIKE $${vals.length - 2} OR cnpj LIKE $${vals.length - 1})`);
    else if (lista === 'produtos')
      conds.push(`(descricao ILIKE $${vals.length - 2} OR produto ILIKE $${vals.length - 2})`);
    else
      conds.push(`(tes_origem ILIKE $${vals.length - 2} OR tes_destino ILIKE $${vals.length - 2})`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const order = lista === 'fornecedores' ? 'nome NULLS LAST, a2_cod, a2_loja'
    : lista === 'produtos' ? 'produto' : 'empresa, tes_origem';

  const [rows, total, stats] = await Promise.all([
    sql.query(`SELECT * FROM ${tabela} ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, vals),
    sql.query(`SELECT COUNT(*) c FROM ${tabela} ${where}`, vals),
    sql.query(`SELECT
        (SELECT COUNT(*) FROM lince_tes_fornecedores WHERE ativo) fornecedores,
        (SELECT COUNT(*) FROM lince_tes_fornecedores WHERE ativo AND cnpj IS NULL) forn_sem_cnpj,
        (SELECT COUNT(*) FROM lince_tes_produtos WHERE ativo) produtos,
        (SELECT COUNT(*) FROM lince_tes_mapa WHERE ativo) mapa`),
  ]);
  return NextResponse.json({ itens: rows.rows, total: Number(total.rows[0]?.c) || 0, page, limit, stats: stats.rows[0] || {} });
}

/** POST — upsert: {lista, ...campos} */
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const user = await getUser(request);
  const b = await request.json().catch(() => ({}));
  const lista = b.lista as Lista;
  const ativo = b.ativo !== false;
  let r;

  if (lista === 'fornecedores') {
    const a2 = normA2(String(b.a2_cod || ''));
    const loja = normLoja(String(b.a2_loja || '01'));
    const empresa = String(b.empresa || '*').toUpperCase();
    if (!a2) return NextResponse.json({ error: 'a2_cod obrigatório' }, { status: 400 });
    r = await sql.query(
      `INSERT INTO lince_tes_fornecedores (empresa,a2_cod,a2_loja,cnpj,nome,ativo,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (empresa,a2_cod,a2_loja) DO UPDATE SET
         cnpj=COALESCE(EXCLUDED.cnpj,lince_tes_fornecedores.cnpj),
         nome=COALESCE(EXCLUDED.nome,lince_tes_fornecedores.nome),
         ativo=EXCLUDED.ativo, updated_at=NOW() RETURNING *`,
      [empresa, a2, loja, normCnpj(String(b.cnpj || '')) || null, b.nome || null, ativo, user]);
  } else if (lista === 'produtos') {
    const prod = canonProd(String(b.produto || ''));
    if (!prod) return NextResponse.json({ error: 'produto obrigatório' }, { status: 400 });
    r = await sql.query(
      `INSERT INTO lince_tes_produtos (produto,descricao,ativo,created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (produto) DO UPDATE SET
         descricao=COALESCE(EXCLUDED.descricao,lince_tes_produtos.descricao),
         ativo=EXCLUDED.ativo, updated_at=NOW() RETURNING *`,
      [prod, b.descricao || null, ativo, user]);
  } else if (lista === 'mapa') {
    const empresa = String(b.empresa || 'EQS').toUpperCase();
    const origem = String(b.tes_origem || '').trim().toUpperCase();
    const destino = String(b.tes_destino || '').trim().toUpperCase();
    if (!origem || !destino) return NextResponse.json({ error: 'tes_origem e tes_destino obrigatórios' }, { status: 400 });
    r = await sql.query(
      `INSERT INTO lince_tes_mapa (empresa,tes_origem,tes_destino,ativo)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (empresa,tes_origem) DO UPDATE SET
         tes_destino=EXCLUDED.tes_destino, ativo=EXCLUDED.ativo, updated_at=NOW() RETURNING *`,
      [empresa, origem, destino, ativo]);
  } else {
    return NextResponse.json({ error: 'lista inválida (fornecedores|produtos|mapa)' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, item: r.rows[0] });
}

/** DELETE /api/fiscal/tes-regras?lista=&id= ou body {lista, ids:[]} */
export async function DELETE(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const p = request.nextUrl.searchParams;
  let lista = p.get('lista') as Lista | null;
  let ids: number[] = [];
  const idParam = p.get('id');
  if (idParam) ids = [parseInt(idParam, 10)].filter(Number.isFinite);
  const b = await request.json().catch(() => ({}));
  if (b.lista) lista = b.lista;
  if (Array.isArray(b.ids)) ids = b.ids.filter((n: any) => Number.isFinite(n)).map(Number);
  if (!lista || !LISTAS.includes(lista)) return NextResponse.json({ error: 'lista inválida' }, { status: 400 });
  if (!ids.length) return NextResponse.json({ error: 'informe id ou ids' }, { status: 400 });
  const r = await sql.query(`DELETE FROM lince_tes_${lista} WHERE id = ANY($1) RETURNING id`, [ids]);
  return NextResponse.json({ ok: true, deleted: r.rowCount });
}
