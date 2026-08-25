import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const periodo = searchParams.get('periodo') || 'hoje';

  const now = new Date();
  let dataInicio: string;

  if (periodo === 'hoje') {
    dataInicio = now.toISOString().split('T')[0];
  } else if (periodo === 'semana') {
    const start = new Date(now.getTime() - 7 * 86400000);
    dataInicio = start.toISOString().split('T')[0];
  } else {
    const start = new Date(now.getTime() - 30 * 86400000);
    dataInicio = start.toISOString().split('T')[0];
  }

  try {
    const notas = await sql`
      SELECT id, titulo, tipo, valor, tempo_segundos, feita_pelo_bot, data, hora, fonte
      FROM resultados_notas
      WHERE data >= ${dataInicio}
      ORDER BY data DESC, hora DESC NULLS LAST
    `;

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

    return NextResponse.json({
      notas: notas.map((n: any) => ({
        id: String(n.id),
        titulo: n.titulo,
        tipo: n.tipo,
        valor: Number(n.valor),
        tempoSegundos: n.tempo_segundos,
        feitaPeloBot: n.feita_pelo_bot,
        data: n.data instanceof Date ? n.data.toISOString().split('T')[0] : String(n.data).split('T')[0],
        hora: n.hora,
        fonte: n.fonte,
      })),
      fechamentos: fechamentos.map((f: any) => ({
        id: String(f.id),
        responsavel: f.responsavel,
        data: f.data instanceof Date ? f.data.toISOString().split('T')[0] : String(f.data).split('T')[0],
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
        data: c.data instanceof Date ? c.data.toISOString().split('T')[0] : String(c.data).split('T')[0],
        fonte: c.fonte,
      })),
    });
  } catch (error) {
    console.error('[API Resultados] Erro ao buscar dados:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
