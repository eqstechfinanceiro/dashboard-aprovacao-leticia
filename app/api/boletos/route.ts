import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureBoletosTables } from '@/lib/boletos/totvs';

export const dynamic = 'force-dynamic';

const csv = (v: string | null) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const esc = (s: string) => s.replace(/'/g, "''");

export async function GET(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  try {
    await ensureBoletosTables();
    const p = request.nextUrl.searchParams;
    const empresas = csv(p.get('empresas')).map((e) => e.toUpperCase()).filter((e) => e === 'EQS' || e === 'BRATEC');
    const flagTipos = csv(p.get('flags'));
    const status = p.get('status') || ''; // 'aberto' | 'baixado' | ''
    const busca = (p.get('q') || '').trim();
    const soComFlags = p.get('so_flags') !== '0'; // default: só inconsistentes
    const limit = Math.min(parseInt(p.get('limit') || '500', 10) || 500, 5000);

    const conds: string[] = [];
    if (soComFlags) conds.push('flag_count > 0');
    if (empresas.length) conds.push(`empresa IN (${empresas.map((e) => `'${esc(e)}'`).join(',')})`);
    if (status === 'aberto') conds.push('baixa IS NULL');
    if (status === 'baixado') conds.push('baixa IS NOT NULL');
    if (flagTipos.length) {
      conds.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(flags) f WHERE f->>'tipo' IN (${flagTipos.map((f) => `'${esc(f)}'`).join(',')}))`);
    }
    if (busca) {
      const b = esc(busca);
      conds.push(`(num ILIKE '%${b}%' OR fornecedor ILIKE '%${b}%' OR fornecedor_nome ILIKE '%${b}%' OR lindig ILIKE '%${b}%')`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [titulos, resumoFlags, optForn, lastSync, totais] = await Promise.all([
      sql.query(
        `SELECT id, empresa, filial, prefixo, num, parcela, tipo, natureza, natureza_desc,
                fornecedor, fornecedor_nome, emissao, vencto, vencto_real, baixa, dt_digit,
                valor, acresc, multa, juros, saldo, codbar, lindig, portado, bco_pgto,
                historico, origem, flags, flag_count, synced_at
         FROM boletos_titulos ${where}
         ORDER BY flag_count DESC, vencto_real ASC NULLS LAST, id LIMIT ${limit}`
      ),
      sql.query(
        `SELECT f->>'tipo' AS tipo, COUNT(*) AS qtd
         FROM boletos_titulos, jsonb_array_elements(flags) f
         ${where ? `${where} AND` : 'WHERE'} flag_count > 0
         GROUP BY 1 ORDER BY qtd DESC`
      ),
      sql.query(
        `SELECT DISTINCT COALESCE(NULLIF(fornecedor_nome,''), fornecedor) AS nome
         FROM boletos_titulos WHERE flag_count > 0 ORDER BY 1 LIMIT 200`
      ),
      sql.query(`SELECT empresa, last_sync_at, last_count, last_flagged FROM boletos_sync_state ORDER BY empresa`),
      sql.query(
        `SELECT COUNT(*) AS qtd, COUNT(*) FILTER (WHERE baixa IS NULL) AS abertos,
                SUM(valor) FILTER (WHERE baixa IS NULL) AS valor_aberto
         FROM boletos_titulos ${where}`
      ),
    ]);

    const fmt = (v: any) => v?.toISOString?.().slice(0, 10) ?? v;
    return NextResponse.json({
      titulos: titulos.rows.map((t: any) => ({
        ...t,
        emissao: fmt(t.emissao), vencto: fmt(t.vencto), vencto_real: fmt(t.vencto_real),
        baixa: fmt(t.baixa), dt_digit: fmt(t.dt_digit),
        valor: Number(t.valor) || 0, acresc: Number(t.acresc) || 0,
        multa: Number(t.multa) || 0, juros: Number(t.juros) || 0, saldo: Number(t.saldo) || 0,
      })),
      resumoFlags: resumoFlags.rows.map((r: any) => ({ tipo: r.tipo, qtd: Number(r.qtd) })),
      fornecedores: optForn.rows.map((r: any) => r.nome),
      sync: lastSync.rows.map((r: any) => ({
        empresa: r.empresa, at: r.last_sync_at, count: r.last_count, flagged: r.last_flagged,
      })),
      totais: {
        qtd: Number(totais.rows[0]?.qtd) || 0,
        abertos: Number(totais.rows[0]?.abertos) || 0,
        valorAberto: Number(totais.rows[0]?.valor_aberto) || 0,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    console.error('[boletos GET]', e);
    return NextResponse.json({ error: e?.message || 'Erro ao carregar boletos' }, { status: 500 });
  }
}
