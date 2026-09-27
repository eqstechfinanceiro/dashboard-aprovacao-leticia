import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureImpactoTables } from '@/lib/impacto/totvs';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';

const VALIDACOES = [
  'BOLETO ENVIADO VENCIDO',
  'PAGTO FORA DA DATA VENCTO',
  'AVISO DE CARTÓRIO',
  'AVISO DE CARTORIO',
  'BOLETO COM TAXA/DIFERENÇA',
];

const csv = (v: string | null) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const csvNums = (v: string | null, lo: number, hi: number) =>
  csv(v).map((s) => parseInt(s, 10)).filter((n) => n >= lo && n <= hi);
const esc = (s: string) => s.replace(/'/g, "''");

export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  try {
    await ensureImpactoTables();
    const p = request.nextUrl.searchParams;
    const empresas = csv(p.get('empresas')).map((e) => e.toUpperCase()).filter((e) => e === 'EQS' || e === 'BRATEC');
    const anos = csvNums(p.get('anos'), 2000, 2100);
    const meses = csvNums(p.get('meses'), 1, 12);
    const setores = csv(p.get('setores'));
    const validacoes = csv(p.get('validacoes'));
    const gestores = csv(p.get('gestores'));
    const tipos = csv(p.get('tipos'));
    const naturezas = csv(p.get('naturezas'));
    const busca = (p.get('q') || '').trim();
    const semValidacao = p.get('sem_validacao') === '1';
    const limit = Math.min(parseInt(p.get('limit') || '500', 10) || 500, 5000);

    const conds: string[] = [];
    if (empresas.length) conds.push(`empresa IN (${empresas.map((e) => `'${esc(e)}'`).join(',')})`);
    if (anos.length) conds.push(`EXTRACT(YEAR FROM baixa)::int IN (${anos.join(',')})`);
    if (meses.length) conds.push(`EXTRACT(MONTH FROM baixa)::int IN (${meses.join(',')})`);
    if (setores.length) conds.push(`setor IN (${setores.map((s) => `'${esc(s)}'`).join(',')})`);
    if (validacoes.length) conds.push(`validacao IN (${validacoes.map((s) => `'${esc(s)}'`).join(',')})`);
    if (gestores.length) conds.push(`gestor IN (${gestores.map((s) => `'${esc(s)}'`).join(',')})`);
    if (tipos.length) conds.push(`tipo IN (${tipos.map((s) => `'${esc(s)}'`).join(',')})`);
    if (naturezas.length) conds.push(`natureza IN (${naturezas.map((s) => `'${esc(s)}'`).join(',')})`);
    if (busca) {
      const b = esc(busca);
      conds.push(`(num ILIKE '%${b}%' OR fornecedor ILIKE '%${b}%' OR fornecedor_nome ILIKE '%${b}%')`);
    }
    if (semValidacao) conds.push(`(validacao IS NULL OR validacao = '')`);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const acrescExpr = `(COALESCE(multa,0) + COALESCE(juros,0) + COALESCE(acresc,0))`;

    const [titulos, mensal, anual, topForn, topSetor, optSetor, optValid, optGestor, optTipo, optNat, lastSync, totais] = await Promise.all([
      sql.query(
        `SELECT id, empresa, filial, num, parcela, tipo, fornecedor, fornecedor_nome,
                natureza, natureza_desc, emissao, vencto, vencto_real, baixa,
                valor, multa, juros, acresc, ccusto, ccusto_desc, historico,
                validacao, observacao, setor, gestor
         FROM impacto_titulos ${where}
         ORDER BY baixa DESC NULLS LAST, id DESC LIMIT ${limit}`
      ),
      sql.query(
        `SELECT TO_CHAR(baixa,'YYYY-MM') AS mes,
                SUM(CASE WHEN empresa='EQS' THEN ${acrescExpr} ELSE 0 END) AS eqs,
                SUM(CASE WHEN empresa='BRATEC' THEN ${acrescExpr} ELSE 0 END) AS bratec,
                COUNT(*) AS qtd
         FROM impacto_titulos ${where} GROUP BY 1 ORDER BY 1`
      ),
      sql.query(
        `SELECT EXTRACT(YEAR FROM baixa)::int AS ano, SUM(${acrescExpr}) AS total
         FROM impacto_titulos ${where} GROUP BY 1 ORDER BY 1`
      ),
      sql.query(
        `SELECT COALESCE(NULLIF(fornecedor_nome,''), fornecedor) AS nome, SUM(${acrescExpr}) AS total, COUNT(*) AS qtd
         FROM impacto_titulos ${where} GROUP BY 1 ORDER BY total DESC LIMIT 50`
      ),
      sql.query(
        `SELECT COALESCE(NULLIF(setor,''),'SEM SETOR') AS setor, SUM(${acrescExpr}) AS total, COUNT(*) AS qtd
         FROM impacto_titulos ${where} GROUP BY 1 ORDER BY total DESC LIMIT 8`
      ),
      sql.query(`SELECT DISTINCT setor FROM impacto_titulos WHERE setor IS NOT NULL AND setor<>'' ORDER BY 1`),
      sql.query(`SELECT DISTINCT validacao FROM impacto_titulos WHERE validacao IS NOT NULL AND validacao<>'' ORDER BY 1`),
      sql.query(`SELECT DISTINCT gestor FROM impacto_titulos WHERE gestor IS NOT NULL AND gestor<>'' ORDER BY 1`),
      sql.query(`SELECT DISTINCT tipo FROM impacto_titulos WHERE tipo IS NOT NULL AND tipo<>'' ORDER BY 1`),
      sql.query(`SELECT DISTINCT natureza FROM impacto_titulos WHERE natureza IS NOT NULL AND natureza<>'' ORDER BY 1`),
      sql.query(`SELECT empresa, last_sync_at, last_count FROM impacto_sync_state ORDER BY empresa`),
      sql.query(
        `SELECT COUNT(*) AS qtd, SUM(${acrescExpr}) AS juros_total, SUM(valor) AS valor_total,
                SUM(${acrescExpr}) FILTER (WHERE validacao IS NULL OR validacao='') AS sem_validacao_valor,
                COUNT(*) FILTER (WHERE validacao IS NULL OR validacao='') AS sem_validacao_qtd
         FROM impacto_titulos ${where}`
      ),
    ]);

    // Detalhamento por setor: ranking + soma por validação
    const [detalhe, porValid] = await Promise.all([
      sql.query(
        `SELECT COALESCE(NULLIF(setor,''),'SEM SETOR') AS setor, COALESCE(NULLIF(validacao,''),'SEM VALIDAÇÃO') AS validacao,
                SUM(${acrescExpr}) AS total, COUNT(*) AS qtd
         FROM impacto_titulos ${where} GROUP BY 1,2 ORDER BY 1, total DESC`
      ),
      sql.query(
        `SELECT COALESCE(NULLIF(validacao,''),'SEM VALIDAÇÃO') AS validacao,
                SUM(${acrescExpr}) AS total, COUNT(*) AS qtd
         FROM impacto_titulos ${where} GROUP BY 1 ORDER BY total DESC`
      ),
    ]);

    return NextResponse.json({
      titulos: titulos.rows.map((t: any) => ({
        ...t,
        emissao: t.emissao?.toISOString?.().slice(0, 10) ?? t.emissao,
        vencto: t.vencto?.toISOString?.().slice(0, 10) ?? t.vencto,
        vencto_real: t.vencto_real?.toISOString?.().slice(0, 10) ?? t.vencto_real,
        baixa: t.baixa?.toISOString?.().slice(0, 10) ?? t.baixa,
        valor: Number(t.valor) || 0, multa: Number(t.multa) || 0,
        juros: Number(t.juros) || 0, acresc: Number(t.acresc) || 0,
      })),
      porMes: mensal.rows.filter((r: any) => r.mes).map((r: any) => ({ mes: r.mes, eqs: Number(r.eqs) || 0, bratec: Number(r.bratec) || 0, qtd: Number(r.qtd) })),
      porAno: anual.rows.filter((r: any) => r.ano).map((r: any) => ({ ano: r.ano, total: Number(r.total) || 0 })),
      topFornecedores: topForn.rows.map((r: any) => ({ nome: r.nome, total: Number(r.total) || 0, qtd: Number(r.qtd) })),
      topSetores: topSetor.rows.map((r: any) => ({ setor: r.setor, total: Number(r.total) || 0, qtd: Number(r.qtd) })),
      detalheSetor: detalhe.rows.map((r: any) => ({ setor: r.setor, validacao: r.validacao, total: Number(r.total) || 0, qtd: Number(r.qtd) })),
      porValidacao: porValid.rows.map((r: any) => ({ validacao: r.validacao, total: Number(r.total) || 0, qtd: Number(r.qtd) })),
      opcoes: {
        setores: optSetor.rows.map((r: any) => r.setor),
        validacoes: [...new Set([...VALIDACOES, ...optValid.rows.map((r: any) => r.validacao)])],
        gestores: optGestor.rows.map((r: any) => r.gestor),
        tipos: optTipo.rows.map((r: any) => r.tipo),
        naturezas: optNat.rows.map((r: any) => r.natureza),
      },
      sync: lastSync.rows.map((r: any) => ({ empresa: r.empresa, at: r.last_sync_at, count: r.last_count })),
      totais: {
        qtd: Number(totais.rows[0]?.qtd) || 0,
        jurosTotal: Number(totais.rows[0]?.juros_total) || 0,
        valorTotal: Number(totais.rows[0]?.valor_total) || 0,
        semValidacaoQtd: Number(totais.rows[0]?.sem_validacao_qtd) || 0,
        semValidacaoValor: Number(totais.rows[0]?.sem_validacao_valor) || 0,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    console.error('[impacto GET]', e);
    return NextResponse.json({ error: e?.message || 'Erro ao carregar impacto' }, { status: 500 });
  }
}

const MANUAL_FIELDS = new Set(['validacao', 'observacao', 'setor', 'gestor']);

export async function PATCH(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco não configurado' }, { status: 503 });
  try {
    await ensureImpactoTables();
    const b = await request.json();
    const id = parseInt(b.id, 10);
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    const sets: string[] = [];
    const vals: any[] = [];
    for (const f of MANUAL_FIELDS) {
      if (f in b) {
        vals.push(b[f] === '' ? null : b[f]);
        sets.push(`${f} = $${vals.length}`);
      }
    }
    if (!sets.length) return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
    const before = await sql.query(
      'SELECT id, num, prefixo, validacao, observacao, setor, gestor FROM impacto_titulos WHERE id = $1',
      [id]
    );
    vals.push(id);
    const r = await sql.query(`UPDATE impacto_titulos SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`, vals);
    if (!r.rows.length) return NextResponse.json({ error: 'Título não encontrado' }, { status: 404 });

    const prev = before.rows[0] || {};
    const changes: Record<string, { de: unknown; para: unknown }> = {};
    for (const f of MANUAL_FIELDS) {
      if (f in b) changes[f] = { de: prev[f] ?? null, para: b[f] === '' ? null : b[f] };
    }
    await logAudit(request, {
      action: 'impacto.titulo_edit',
      entity_type: 'titulo',
      entity_id: prev.num ? `${prev.prefixo}/${prev.num}` : id,
      details: { titulo_id: id, changes },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[impacto PATCH]', e);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}
