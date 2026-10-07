import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { sql } from '@/lib/db/neon';
import { ensureTesRegrasTable, normCnpj, canonProd, normA2, normLoja } from '@/lib/fiscal/tes-regras';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';
import { genericQuery, EMPRESAS } from '@/lib/impacto/totvs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST multipart — importa as listas de parametrização TES.
 *
 * Formatos aceitos:
 *  - XLSX com abas `fornecedores` (Forn/Cliente + Loja → SA2) e/ou `produtos`
 *    (Produto + Desc Produto → SB1). É o formato da planilha oficial do Fiscal.
 *  - CSV/TXT com ?lista=fornecedores|produtos — colunas equivalentes.
 *
 * Fornecedores: a importação resolve o CNPJ via SA2 (A2_CGC) consultando o
 * TOTVS das duas empresas — é esse CNPJ que o bot casa com o <emit> do XML.
 * Códigos não encontrados ficam com cnpj NULL e são reportados.
 */

const normHeader = (h: string) =>
  String(h).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

interface FornRow { a2: string; loja: string }
interface ProdRow { produto: string; descricao: string }

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g)?.length || 0) >= (first.match(/,/g)?.length || 0) ? ';' : ',';
  return text.split(/\r?\n/).filter((l) => l.trim())
    .map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
}

function rowsToForns(rows: string[][]): FornRow[] {
  if (!rows.length) return [];
  // header: "Forn/Cliente","Loja" — ou sem header (cod;loja)
  const h = rows[0].map(normHeader);
  const iCod = h.findIndex((x) => ['forncliente', 'fornecedor', 'codigo', 'cod', 'a2cod'].includes(x));
  const iLoja = h.findIndex((x) => x === 'loja');
  const hasHeader = iCod >= 0;
  const out: FornRow[] = [];
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const a2 = normA2(hasHeader ? (r[iCod] || '') : (r[0] || ''));
    const loja = normLoja(hasHeader ? (r[iLoja >= 0 ? iLoja : 1] || '01') : (r[1] || '01'));
    if (a2) out.push({ a2, loja: loja || '01' });
  }
  return out;
}

function rowsToProds(rows: string[][]): ProdRow[] {
  if (!rows.length) return [];
  const h = rows[0].map(normHeader);
  const iCod = h.findIndex((x) => ['produto', 'codigo', 'cod', 'item', 'material'].includes(x));
  const iDesc = h.findIndex((x) => ['descproduto', 'descricao', 'desc', 'descricao_produto'].includes(x));
  const hasHeader = iCod >= 0;
  const out: ProdRow[] = [];
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const produto = canonProd(hasHeader ? (r[iCod] || '') : (r[0] || ''));
    const descricao = hasHeader && iDesc >= 0 ? (r[iDesc] || '') : (r[1] || '');
    if (produto) out.push({ produto, descricao });
  }
  return out;
}

/** Mapa (a2_cod|a2_loja) → {cnpj, nome, empresa} consultando SA2 das 2 empresas.
 *  A2_COD é char(6) — a planilha traz '557' e o SA2 tem '000557': o IN inclui
 *  a forma com padding e o match final é por chave canônica sem zeros à esq.
 *  NÃO escaneia o SA2 inteiro (97k linhas/empresa) — consulta direta em lotes. */
async function resolverSa2(forns: FornRow[]) {
  const canonA2 = (s: string) => normA2(s).replace(/^0+/, '') || '0';
  const wanted = new Map(forns.map((f) => [`${canonA2(f.a2)}|${f.loja}`, `${f.a2}|${f.loja}`]));
  const found = new Map<string, { cnpj: string; nome: string; empresa: string }>();

  // formas aceitas no IN: código como veio + padded 6
  const forms = new Set<string>();
  for (const f of forns) {
    forms.add(f.a2);
    if (/^\d+$/.test(f.a2) && f.a2.length < 6) forms.add(f.a2.padStart(6, '0'));
  }
  const codes = [...forms];
  const CHUNK = 150;

  for (const [empresa, tenantId] of Object.entries(EMPRESAS)) {
    for (let i = 0; i < codes.length; i += CHUNK) {
      const inList = codes.slice(i, i + CHUNK).map((c) => `'${c}'`).join(',');
      const d: any = await genericQuery(tenantId, {
        tables: 'SA2',
        fields: 'A2_COD,A2_LOJA,A2_CGC,A2_NOME',
        where: `SA2.D_E_L_E_T_=' ' AND A2_COD IN (${inList})`,
        pageSize: String(CHUNK * 4),
      }).catch(() => null);
      for (const o of d?.items || d?.objects || []) {
        const key = `${canonA2(String(o.A2_COD || o.a2_cod || ''))}|${normLoja(String(o.A2_LOJA ?? o.a2_loja ?? '01'))}`;
        const origKey = wanted.get(key);
        if (origKey && !found.has(origKey)) {
          found.set(origKey, { cnpj: normCnpj(o.A2_CGC || o.a2_cgc || ''), nome: String(o.A2_NOME || o.a2_nome || '').trim(), empresa });
        }
      }
    }
    if (found.size === wanted.size) break;
  }
  return found;
}

async function importarFornecedores(forns: FornRow[], user: string | null) {
  const sa2 = await resolverSa2(forns);
  let inseridos = 0, atualizados = 0;
  const naoResolvidos: string[] = [];
  for (const f of forns) {
    const hit = sa2.get(`${f.a2}|${f.loja}`);
    const empresa = hit?.empresa || '*';
    if (!hit?.cnpj) naoResolvidos.push(`${f.a2}/${f.loja}`);
    try {
      const r = await sql.query(
        `INSERT INTO lince_tes_fornecedores (empresa,a2_cod,a2_loja,cnpj,nome,created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (empresa,a2_cod,a2_loja) DO UPDATE SET
           cnpj=COALESCE(EXCLUDED.cnpj,lince_tes_fornecedores.cnpj),
           nome=COALESCE(EXCLUDED.nome,lince_tes_fornecedores.nome),
           ativo=TRUE, updated_at=NOW()
         RETURNING (xmax = 0) AS inserted`,
        [empresa, f.a2, f.loja, hit?.cnpj || null, hit?.nome || null, user]);
      r.rows[0]?.inserted ? inseridos++ : atualizados++;
    } catch { /* ignora linha problemática */ }
  }
  return { inseridos, atualizados, naoResolvidos };
}

async function importarProdutos(prods: ProdRow[], user: string | null) {
  let inseridos = 0, atualizados = 0;
  for (const p of prods) {
    try {
      const r = await sql.query(
        `INSERT INTO lince_tes_produtos (produto,descricao,created_by)
         VALUES ($1,$2,$3)
         ON CONFLICT (produto) DO UPDATE SET
           descricao=COALESCE(EXCLUDED.descricao,lince_tes_produtos.descricao),
           ativo=TRUE, updated_at=NOW()
         RETURNING (xmax = 0) AS inserted`,
        [p.produto, p.descricao || null, user]);
      r.rows[0]?.inserted ? inseridos++ : atualizados++;
    } catch { /* ignora */ }
  }
  return { inseridos, atualizados };
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
  const listaParam = request.nextUrl.searchParams.get('lista');
  const resultado: any = { ok: true };
  let importou = false;

  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    for (const sheet of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheet], { header: 1, defval: '', raw: false })
        .map((r) => r.map((c) => String(c ?? '').trim()));
      const name = sheet.toLowerCase();
      if (name.includes('fornec')) {
        const forns = rowsToForns(rows);
        resultado.fornecedores = await importarFornecedores(forns, user);
        importou = true;
      } else if (name.includes('prod')) {
        resultado.produtos = await importarProdutos(rowsToProds(rows), user);
        importou = true;
      }
    }
    if (!importou) {
      // XLSX de aba única sem nome reconhecível — infere pela lista param ou header
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false })
        .map((r) => r.map((c) => String(c ?? '').trim()));
      if (listaParam === 'fornecedores') {
        resultado.fornecedores = await importarFornecedores(rowsToForns(rows), user); importou = true;
      } else if (listaParam === 'produtos') {
        resultado.produtos = await importarProdutos(rowsToProds(rows), user); importou = true;
      }
    }
  } else {
    const rows = parseCsv(buf.toString('utf8'));
    if (listaParam === 'fornecedores') {
      resultado.fornecedores = await importarFornecedores(rowsToForns(rows), user); importou = true;
    } else if (listaParam === 'produtos') {
      resultado.produtos = await importarProdutos(rowsToProds(rows), user); importou = true;
    }
  }

  if (!importou) {
    return NextResponse.json({
      error: 'Nenhuma aba/lista reconhecida. Use XLSX com abas "fornecedores"+"produtos" ou CSV com ?lista=',
    }, { status: 400 });
  }
  return NextResponse.json(resultado);
}
