import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureTesRegrasTable, normCnpj, normProd } from '@/lib/fiscal/tes-regras';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';

async function getUser(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const s = token ? await verifyToken(token) : null;
  return (s as any)?.email || (s as any)?.name || null;
}

/** GET /api/fiscal/tes-regras?q=&empresa=&ativo=&page=&limit= */
export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const p = request.nextUrl.searchParams;
  const q = (p.get('q') || '').trim();
  const empresa = (p.get('empresa') || '').trim().toUpperCase();
  const ativo = p.get('ativo'); // '1' | '0' | null
  const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(p.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;

  const conds: string[] = [];
  const vals: any[] = [];
  if (empresa && empresa !== '*') { vals.push(empresa); conds.push(`(empresa = $${vals.length} OR empresa = '*')`); }
  if (ativo === '1' || ativo === '0') { vals.push(ativo === '1'); conds.push(`ativo = $${vals.length}`); }
  if (q) {
    vals.push(`%${q}%`, `%${normCnpj(q)}%`, normProd(q) + '%');
    conds.push(`(fornecedor_nome ILIKE $${vals.length - 2} OR fornecedor_cnpj LIKE $${vals.length - 1} OR produto LIKE $${vals.length} OR produto_desc ILIKE $${vals.length - 2})`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const [rows, total, stats] = await Promise.all([
    sql.query(
      `SELECT * FROM lince_tes_regras ${where}
       ORDER BY fornecedor_nome NULLS LAST, fornecedor_cnpj, produto
       LIMIT ${limit} OFFSET ${offset}`, vals),
    sql.query(`SELECT COUNT(*) c FROM lince_tes_regras ${where}`, vals),
    sql.query(`SELECT COUNT(*) total,
                      COUNT(*) FILTER (WHERE ativo) ativos,
                      COUNT(DISTINCT fornecedor_cnpj) FILTER (WHERE ativo) fornecedores,
                      COUNT(DISTINCT produto) FILTER (WHERE ativo) produtos
               FROM lince_tes_regras`),
  ]);
  return NextResponse.json({
    regras: rows.rows,
    total: Number(total.rows[0]?.c) || 0,
    page, limit,
    stats: stats.rows[0] || {},
  });
}

/** POST — upsert de UMA regra: {fornecedor_cnpj, produto, tes, ...} */
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const user = await getUser(request);
  const b = await request.json().catch(() => ({}));

  const cnpj = normCnpj(String(b.fornecedor_cnpj || ''));
  const produto = normProd(String(b.produto || ''));
  const tes = String(b.tes || '').trim().toUpperCase();
  const empresa = String(b.empresa || '*').trim().toUpperCase() || '*';
  if (!cnpj || !produto || !tes) {
    return NextResponse.json({ error: 'fornecedor_cnpj, produto e tes são obrigatórios' }, { status: 400 });
  }
  if (!['EQS', 'BRATEC', '*'].includes(empresa)) {
    return NextResponse.json({ error: 'empresa deve ser EQS, BRATEC ou *' }, { status: 400 });
  }
  const ativo = b.ativo !== false;

  const r = await sql.query(
    `INSERT INTO lince_tes_regras
       (empresa, fornecedor_cnpj, fornecedor_nome, produto, produto_desc, tes, ativo, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (empresa, fornecedor_cnpj, produto)
     DO UPDATE SET tes = EXCLUDED.tes,
                   fornecedor_nome = COALESCE(EXCLUDED.fornecedor_nome, lince_tes_regras.fornecedor_nome),
                   produto_desc = COALESCE(EXCLUDED.produto_desc, lince_tes_regras.produto_desc),
                   ativo = EXCLUDED.ativo, updated_at = NOW()
     RETURNING *`,
    [empresa, cnpj, b.fornecedor_nome || null, produto, b.produto_desc || null, tes, ativo, user]);
  return NextResponse.json({ ok: true, regra: r.rows[0] });
}

/** DELETE /api/fiscal/tes-regras?id= — apaga uma regra; body {ids:[...]} apaga várias */
export async function DELETE(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB não disponível' }, { status: 503 });
  await ensureTesRegrasTable();
  const idParam = request.nextUrl.searchParams.get('id');
  let ids: number[] = [];
  if (idParam) {
    ids = [parseInt(idParam, 10)].filter(Number.isFinite);
  } else {
    const b = await request.json().catch(() => ({}));
    if (Array.isArray(b.ids)) ids = b.ids.filter((n: any) => Number.isFinite(n)).map(Number);
  }
  if (!ids.length) return NextResponse.json({ error: 'informe id ou ids' }, { status: 400 });
  const r = await sql.query(`DELETE FROM lince_tes_regras WHERE id = ANY($1) RETURNING id`, [ids]);
  return NextResponse.json({ ok: true, deleted: r.rowCount });
}
