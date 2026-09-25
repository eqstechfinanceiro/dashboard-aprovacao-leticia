import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';

export const dynamic = 'force-dynamic';

function fmtDate(d: any): string {
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  return s.includes('T') ? s.split('T')[0] : s;
}

const esc = (v: string) => v.replace(/'/g, "''");

// Empresa normalizada: lançamentos do tipo 'agilitas' são tratados como a
// empresa AGILITAS (não se misturam a EQS/BRATEC). Em todos os agrupamentos e
// filtros usar esta expressão.
const EMPRESA_NORM = `CASE WHEN tipo = 'agilitas' THEN 'AGILITAS' ELSE upper(empresa) END`;

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const periodo = searchParams.get('periodo') || 'hoje';
  const empresaFilter = searchParams.get('empresa') || 'all';
  const usuarioFilter = searchParams.get('usuario') || 'all';
  const monthFilter = searchParams.get('mes') || 'all';
  const tipoFilter = searchParams.get('tipo') || 'all';
  const anosFilter = (searchParams.get('anos') || '')
    .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 2000 && n <= 2100);
  const mesesFilter = (searchParams.get('meses') || '')
    .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 12);

  const now = new Date();
  let dataInicio: string;

  if (periodo === 'hoje') {
    dataInicio = now.toISOString().split('T')[0];
  } else if (periodo === 'semana') {
    const start = new Date(now.getTime() - 7 * 86400000);
    dataInicio = start.toISOString().split('T')[0];
  } else if (periodo === 'mes') {
    const start = new Date(now.getTime() - 30 * 86400000);
    dataInicio = start.toISOString().split('T')[0];
  } else {
    dataInicio = '1900-01-01'; // 'tudo' — sem piso de data
  }

  try {
    // Empresas normalizadas (agilitas vira empresa própria), usuários e meses
    // para os filtros. Usuários com nome fora do padrão "nome.sobrenome" são
    // ruído de OCR do Protheus — excluídos do filtro/ranking.
    const [empresasResult, usuariosResult, mesesResult, anosResult] = await Promise.all([
      sql.query(`SELECT DISTINCT ${EMPRESA_NORM} AS empresa FROM resultados_notas WHERE empresa IS NOT NULL ORDER BY 1`),
      sql`SELECT DISTINCT usuario FROM resultados_notas
          WHERE usuario IS NOT NULL AND usuario ~ '^[a-zA-Z]+\\.[a-zA-Z]+' ORDER BY usuario`,
      sql`SELECT DISTINCT TO_CHAR(data, 'YYYY-MM') as mes FROM resultados_notas ORDER BY mes DESC`,
      sql`SELECT DISTINCT EXTRACT(YEAR FROM data)::int AS ano FROM resultados_notas ORDER BY 1 DESC`,
    ]);

    // Build dynamic WHERE for notas
    const notasConditions: string[] = [`data >= '${dataInicio}'`];
    if (empresaFilter !== 'all') {
      const f = esc(empresaFilter);
      if (f === 'AGILITAS') {
        notasConditions.push(`tipo = 'agilitas'`);
      } else {
        notasConditions.push(`upper(empresa) = '${f}' AND coalesce(tipo, '') <> 'agilitas'`);
      }
    }
    if (usuarioFilter !== 'all') notasConditions.push(`usuario = '${esc(usuarioFilter)}'`);
    if (monthFilter !== 'all') notasConditions.push(`TO_CHAR(data, 'YYYY-MM') = '${esc(monthFilter)}'`);
    if (anosFilter.length) notasConditions.push(`EXTRACT(YEAR FROM data)::int IN (${anosFilter.join(',')})`);
    if (mesesFilter.length) notasConditions.push(`EXTRACT(MONTH FROM data)::int IN (${mesesFilter.join(',')})`);
    if (tipoFilter !== 'all') notasConditions.push(`tipo = '${esc(tipoFilter)}'`);

    const notasWhere = notasConditions.join(' AND ');
    const listasWhere = `data >= '${dataInicio}'` +
      (anosFilter.length ? ` AND EXTRACT(YEAR FROM data)::int IN (${anosFilter.join(',')})` : '') +
      (mesesFilter.length ? ` AND EXTRACT(MONTH FROM data)::int IN (${mesesFilter.join(',')})` : '');

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
             AVG(tempo_segundos) FILTER (WHERE tempo_segundos > 0 AND feita_pelo_bot) as tempo_medio_bot,
             AVG(tempo_segundos) FILTER (WHERE tempo_segundos > 0 AND NOT feita_pelo_bot) as tempo_medio_humano,
             COUNT(*) FILTER (WHERE feita_pelo_bot) as bot_count,
             SUM(valor) as valor_total
      FROM resultados_notas
      WHERE ${notasWhere}
    `);
    const totalNotasData = totalNotasResult.rows[0];

    // Count by tipo (full count, not limited to 500)
    const tiposResult = await sql.query(`
      SELECT tipo, COUNT(*) as total
      FROM resultados_notas
      WHERE ${notasWhere}
      GROUP BY tipo
    `);
    const tiposCount: Record<string, number> = {};
    for (const r of tiposResult.rows) {
      tiposCount[r.tipo] = Number(r.total);
    }

    // Lançadores (ranking estilo "Quantidade por Lançador" do PowerBI)
    const lancadoresResult = await sql.query(`
      SELECT usuario,
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE feita_pelo_bot) as bot_count,
             AVG(tempo_segundos) FILTER (WHERE tempo_segundos > 0) as tempo_medio,
             SUM(valor) as valor_total
      FROM resultados_notas
      WHERE ${notasWhere} AND usuario IS NOT NULL AND usuario ~ '^[a-zA-Z]+\\.[a-zA-Z]+'
      GROUP BY usuario
      ORDER BY total DESC
      LIMIT 12
    `);

    // Fechamentos and conferencias
    const fechamentos = await sql.query(`
      SELECT id, responsavel, data, aprovado_pela_app, despesas_reprovadas_ia,
             itens_duplicados, valor_duplicado, fonte
      FROM resultados_fechamentos
      WHERE ${listasWhere}
      ORDER BY data DESC
    `);

    const conferencias = await sql.query(`
      SELECT id, titulo, tipo, erro, valor, data, fonte
      FROM resultados_conferencias
      WHERE ${listasWhere}
      ORDER BY data DESC
    `);

    // Notas aggregated by day and empresa for line chart
    const notasPorDiaEmpresaResult = await sql.query(`
      SELECT data, ${EMPRESA_NORM} AS empresa, COUNT(*) as total
      FROM resultados_notas
      WHERE ${notasWhere}
      GROUP BY data, ${EMPRESA_NORM}
      ORDER BY data ASC
    `);
    const notasPorDiaEmpresa = notasPorDiaEmpresaResult.rows;

    // ---- Fluxo diário da fila de lançamento (Entrada de Notas) --------------
    // entradas: notas que chegaram ao monitor SDS no dia (dataimp)
    // lancadas: notas lançadas no Protheus no dia (resultados_notas)
    // emAberto: profundidade da fila CONTABIL reconstruída por dia:
    //   entrou (dataimp <= d) e ainda não tinha saído (status P hoje, ou
    //   detectado RESOLVIDO depois de d). Só é confiável desde que o worker
    //   passou a registrar RESOLVIDO; snapshots diários cobrem dali pra frente.
    const fluxoEmpresaSql =
      empresaFilter === 'all'
        ? ''
        : ` AND upper(s.empresa) = '${esc(empresaFilter)}'`;

    // Agilitas não existe na fila SDS — dias vazios, só com lançadas
    const fluxoResult = empresaFilter === 'AGILITAS'
      ? {
          rows: Array.from({ length: 30 }, (_, i) => ({
            d: new Date(now.getTime() - (29 - i) * 86400000).toISOString().split('T')[0],
            entradas: 0,
            em_aberto: 0,
          })),
        }
      : await sql.query(`
        WITH days AS (
          SELECT generate_series(current_date - 29, current_date, interval '1 day')::date AS d
        ),
        entradas AS (
          SELECT dataimp::date AS d, COUNT(*) AS c
          FROM z01.totvs_sds_notas s
          WHERE dataimp ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            AND dataimp::date >= current_date - 29
            ${empresaFilter === 'all' ? '' : `AND upper(s.empresa) = '${esc(empresaFilter)}'`}
          GROUP BY 1
        ),
        aberto AS (
          SELECT d.d,
                 (SELECT COUNT(*) FROM z01.totvs_sds_notas s
                   WHERE s.fila = 'CONTABIL'
                     AND s.dataimp ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                     AND s.dataimp::date <= d.d
                     AND (s.status = 'P' OR s.synced_at::date > d.d)
                     ${fluxoEmpresaSql}) AS c
          FROM days d
        )
        SELECT days.d,
               COALESCE(e.c, 0) AS entradas,
               a.c AS em_aberto
        FROM days
        LEFT JOIN entradas e ON e.d = days.d
        JOIN aberto a ON a.d = days.d
        ORDER BY days.d ASC
      `);

    const lancadasPorDiaResult = await sql.query(`
      SELECT data AS d, COUNT(*) AS c,
             COUNT(*) FILTER (WHERE feita_pelo_bot) AS bot
      FROM resultados_notas
      WHERE data >= current_date - 29 ${empresaFilter === 'all'
        ? ''
        : empresaFilter === 'AGILITAS'
          ? ` AND tipo = 'agilitas'`
          : ` AND upper(empresa) = '${esc(empresaFilter)}' AND coalesce(tipo, '') <> 'agilitas'`}
      GROUP BY data
    `);
    const lancadasMap = new Map<string, { c: number; bot: number }>();
    for (const r of lancadasPorDiaResult.rows) {
      lancadasMap.set(fmtDate(r.d), { c: Number(r.c), bot: Number(r.bot) });
    }

    // Snapshots reais da fila (quando existirem) sobrepõem a reconstrução.
    // Agilitas não tem fila SDS — não entra no emAberto.
    let snapshotsMap = new Map<string, number>();
    try {
      const snaps = empresaFilter === 'AGILITAS'
        ? { rows: [] as any[] }
        : await sql.query(`
          SELECT dia::text AS d, SUM(qtd) AS c
          FROM public.entrada_fila_snapshot
          WHERE dia >= current_date - 29
          ${empresaFilter === 'all' ? '' : `AND empresa = '${esc(empresaFilter)}'`}
          GROUP BY dia
        `);
      snapshotsMap = new Map(snaps.rows.map((r: any) => [String(r.d), Number(r.c)]));
    } catch {
      // tabela ainda não existe — usa só a reconstrução
    }

    // A reconstrução de "em aberto" só é confiável desde que o worker passou a
    // registrar RESOLVIDO — antes disso saídas antigas inflariam a fila.
    const minDeteccaoResult = empresaFilter === 'AGILITAS'
      ? { rows: [{ d: null }] }
      : await sql.query(`
        SELECT min(synced_at)::date AS d
        FROM z01.totvs_sds_notas
        WHERE status = 'RESOLVIDO'
      `);
    const minDeteccao = minDeteccaoResult.rows[0]?.d ? fmtDate(minDeteccaoResult.rows[0].d) : null;

    // Lançamentos por hora — só faz sentido num dia único (visão "hoje")
    const porHoraResult = periodo === 'hoje'
      ? await sql.query(`
          SELECT EXTRACT(HOUR FROM hora)::int AS h, COUNT(*) AS c,
                 COUNT(*) FILTER (WHERE feita_pelo_bot) AS bot
          FROM resultados_notas
          WHERE ${notasWhere} AND hora IS NOT NULL
          GROUP BY 1 ORDER BY 1
        `)
      : { rows: [] as any[] };

    const fluxo = fluxoResult.rows.map((r: any) => {
      const d = fmtDate(r.d);
      const l = lancadasMap.get(d);
      const snap = snapshotsMap.get(d);
      const reconstruido = Number(r.em_aberto);
      return {
        dia: d,
        entradas: Number(r.entradas),
        lancadas: l?.c ?? 0,
        lancadasBot: l?.bot ?? 0,
        emAberto: snap ?? (minDeteccao && d >= minDeteccao ? reconstruido : null),
      };
    });

    const botCount = Number(totalNotasData.bot_count || 0);
    const tempoMedioBot = Number(totalNotasData.tempo_medio_bot || 0);
    const tempoMedioHumano = Number(totalNotasData.tempo_medio_humano || 0);
    const horasEconomizadas =
      tempoMedioHumano > tempoMedioBot
        ? (botCount * (tempoMedioHumano - tempoMedioBot)) / 3600
        : 0;

    return NextResponse.json({
      filtros: {
        empresas: empresasResult.rows.map((e: any) => e.empresa),
        usuarios: usuariosResult.map((u: any) => u.usuario),
        meses: mesesResult.map((m: any) => m.mes),
        anos: anosResult.map((a: any) => Number(a.ano)),
      },
      totalNotas: Number(totalNotasData.total),
      tempoTotalNotas: Number(totalNotasData.tempo_total || 0),
      tempoMedioNotas: Number(totalNotasData.tempo_medio || 0),
      notasBot: botCount,
      valorTotalNotas: Number(totalNotasData.valor_total || 0),
      bot: {
        lancadas: botCount,
        tempoMedioSegundos: tempoMedioBot,
        tempoMedioHumanoSegundos: tempoMedioHumano,
        horasEconomizadas,
        pct: Number(totalNotasData.total) ? (botCount / Number(totalNotasData.total)) * 100 : 0,
      },
      porLancador: lancadoresResult.rows.map((r: any) => ({
        usuario: r.usuario,
        total: Number(r.total),
        bot: Number(r.bot_count),
        tempoMedioSegundos: Number(r.tempo_medio || 0),
        valorTotal: Number(r.valor_total || 0),
      })),
      fluxo,
      porHora: porHoraResult.rows.map((r: any) => ({
        hora: Number(r.h),
        total: Number(r.c),
        bot: Number(r.bot),
      })),
      tiposCount,
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
        empresa: n.tipo === 'agilitas' ? 'AGILITAS' : n.empresa?.toUpperCase(),
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
      fechamentos: fechamentos.rows.map((f: any) => ({
        id: String(f.id),
        responsavel: f.responsavel,
        data: fmtDate(f.data),
        aprovadoPelaApp: f.aprovado_pela_app,
        despesasReprovadasIA: f.despesas_reprovadas_ia,
        itensDuplicados: f.itens_duplicados,
        valorDuplicado: Number(f.valor_duplicado),
        fonte: f.fonte,
      })),
      conferencias: conferencias.rows.map((c: any) => ({
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
