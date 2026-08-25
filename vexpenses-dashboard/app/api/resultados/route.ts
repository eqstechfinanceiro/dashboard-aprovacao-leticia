import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

function fmtDate(d: any): string {
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  return s.includes('T') ? s.split('T')[0] : s;
}

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const periodo = searchParams.get('periodo') || 'mes';
  const empresaFilter = searchParams.get('empresa') || 'all';
  const usuarioFilter = searchParams.get('usuario') || 'all';
  const monthFilter = searchParams.get('mes') || 'all';
  const tipoFilter = searchParams.get('tipo') || 'all';

  const now = new Date();
  let dataInicio: string;

  if (periodo === 'hoje') {
    dataInicio = now.toISOString().split('T')[0];
  } else if (periodo === 'semana') {
    const start = new Date(now.getTime() - 7 * 86400000);
    dataInicio = start.toISOString().split('T')[0];
  } else {
    const start = new Date(now.getTime() - 365 * 86400000);
    dataInicio = start.toISOString().split('T')[0];
  }

  try {
    // Fetch filter metadata (unique empresas, usuarios, months)
    const [empresasResult, usuariosResult, mesesResult] = await Promise.all([
      sql`SELECT DISTINCT empresa FROM resultados_notas WHERE empresa IS NOT NULL ORDER BY empresa`,
      sql`SELECT DISTINCT usuario FROM resultados_notas WHERE usuario IS NOT NULL ORDER BY usuario`,
      sql`SELECT DISTINCT TO_CHAR(data, 'YYYY-MM') as mes FROM resultados_notas ORDER BY mes DESC`,
    ]);

    // Build dynamic WHERE for notas
    const notasConditions: string[] = [`data >= '${dataInicio}'`];
    if (empresaFilter !== 'all') notasConditions.push(`empresa = '${empresaFilter.replace(/'/g, "''")}'`);
    if (usuarioFilter !== 'all') notasConditions.push(`usuario = '${usuarioFilter.replace(/'/g, "''")}'`);
    if (monthFilter !== 'all') notasConditions.push(`TO_CHAR(data, 'YYYY-MM') = '${monthFilter.replace(/'/g, "''")}'`);
    if (tipoFilter !== 'all') notasConditions.push(`tipo = '${tipoFilter.replace(/'/g, "''")}'`);

    const notasWhere = notasConditions.join(' AND ');

    const notasResult = await sql.query(`
      SELECT id, titulo, tipo, valor, tempo_segundos, feita_pelo_bot, data, hora, fonte,
             empresa, usuario, fornecedor_nome, numero_nota, especie_doc
      FROM resultados_notas
      WHERE ${notasWhere}
      ORDER BY data DESC, hora DESC NULLS LAST
      LIMIT 500
    `);
    const notas = notasResult.rows;

    // Total count (without LIMIT) for the counter card
    const totalNotasResult = await sql.query(`
      SELECT COUNT(*) as total,
             SUM(tempo_segundos) as tempo_total,
             AVG(tempo_segundos) FILTER (WHERE tempo_segundos > 0) as tempo_medio,
             COUNT(*) FILTER (WHERE feita_pelo_bot) as bot_count,
             SUM(valor) as valor_total
      FROM resultados_notas
      WHERE ${notasWhere}
    `);
    const totalNotasData = totalNotasResult.rows[0];

    // Fechamentos and conferencias still use periodo-based filter
    const fechamentos = await sql`
      SELECT id, responsavel, data, aprovado_pela_app, despesas_reprovadas_ia,
             itens_duplicados, valor_duplicado, fonte
      FROM resultados_fechamentos
      WHERE data >= ${dataInicio}
      ORDER BY data DESC
    `;

    const conferencias = await sql`
      SELECT id, titulo, tipo, erro, valor, data, fonte
      FROM resultados_conferencias
      WHERE data >= ${dataInicio}
      ORDER BY data DESC
    `;

    // Notas aggregated by day and empresa for line chart
    const notasPorDiaEmpresaResult = await sql.query(`
      SELECT data, empresa, COUNT(*) as total
      FROM resultados_notas
      WHERE ${notasWhere}
      GROUP BY data, empresa
      ORDER BY data ASC
    `);
    const notasPorDiaEmpresa = notasPorDiaEmpresaResult.rows;

    return NextResponse.json({
      filtros: {
        empresas: empresasResult.map((e: any) => e.empresa),
        usuarios: usuariosResult.map((u: any) => u.usuario),
        meses: mesesResult.map((m: any) => m.mes),
      },
      totalNotas: Number(totalNotasData.total),
      tempoTotalNotas: Number(totalNotasData.tempo_total || 0),
      tempoMedioNotas: Number(totalNotasData.tempo_medio || 0),
      notasBot: Number(totalNotasData.bot_count || 0),
      valorTotalNotas: Number(totalNotasData.valor_total || 0),
      notas: notas.map((n: any) => ({
        id: String(n.id),
        titulo: n.titulo,
        tipo: n.tipo,
        valor: Number(n.valor),
        tempoSegundos: n.tempo_segundos,
        feitaPeloBot: n.feita_pelo_bot,
        data: fmtDate(n.data),
        hora: n.hora ? String(n.hora).slice(0, 8) : null,
        fonte: n.fonte,
        empresa: n.empresa,
        usuario: n.usuario,
        fornecedorNome: n.fornecedor_nome,
        numeroNota: n.numero_nota,
        especieDoc: n.especie_doc,
      })),
      notasPorDiaEmpresa: notasPorDiaEmpresa.map((r: any) => ({
        data: fmtDate(r.data),
        empresa: r.empresa,
        total: Number(r.total),
      })),
      fechamentos: fechamentos.map((f: any) => ({
        id: String(f.id),
        responsavel: f.responsavel,
        data: fmtDate(f.data),
        aprovadoPelaApp: f.aprovado_pela_app,
        despesasReprovadasIA: f.despesas_reprovadas_ia,
        itensDuplicados: f.itens_duplicados,
        valorDuplicado: Number(f.valor_duplicado),
        fonte: f.fonte,
      })),
      conferencias: conferencias.map((c: any) => ({
        id: String(c.id),
        titulo: c.titulo,
        tipo: c.tipo,
        erro: c.erro,
        valor: Number(c.valor),
        data: fmtDate(c.data),
        fonte: c.fonte,
      })),
    });
  } catch (error) {
    console.error('[API Resultados] Erro ao buscar dados:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
