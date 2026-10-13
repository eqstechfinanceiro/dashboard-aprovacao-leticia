import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Confirma (ou cancela) um run de remessa que está 'aguardando_confirmacao'.
 * confirmar → phase='envio' + status='queued' (o worker re-clama e executa)
 * cancelar  → status='cancelado'
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { action, envioIds, forcarCompetencia } = await request.json().catch(() => ({}));
  if (action !== 'confirmar' && action !== 'cancelar') {
    return NextResponse.json({ error: "action deve ser 'confirmar' ou 'cancelar'" }, { status: 400 });
  }
  const onlyEnvioIds = Array.isArray(envioIds)
    ? envioIds.filter((n: any) => Number.isFinite(n)).map(Number)
    : undefined;

  const rows = await sql`SELECT id, status, selection FROM comprovantes_runs WHERE id = ${id}`;
  const run = rows[0];
  if (!run) return NextResponse.json({ error: 'run não encontrado' }, { status: 404 });
  if (run.status !== 'aguardando_confirmacao') {
    return NextResponse.json({ error: `run está '${run.status}', não aguardando confirmação` }, { status: 409 });
  }

  if (action === 'cancelar') {
    await sql`UPDATE comprovantes_runs SET status='cancelado', finished_at=NOW() WHERE id=${id}`;
    return NextResponse.json({ ok: true, status: 'cancelado' });
  }

  // Guarda de competência: folha indexa no mês ANTERIOR ao pagamento; férias
  // (e adiantamentos) no MÊS do pagamento. Se a informada diverge das datas
  // de pagamento dos comprovantes (calculadas na análise já com a regra do
  // tipo do run), exige confirmação explícita — erro aqui indexa o documento
  // na competência errada no e2doc.
  const tipoRun = (run.selection as any)?.tipo === 'FER' ? 'FER' : 'FOL';
  const regraCompetencia = tipoRun === 'FER'
    ? 'Para férias, a competência no e2doc é o MÊS DO PAGAMENTO.'
    : 'Para folha, a competência no e2doc é o MÊS ANTERIOR ao pagamento.';
  const competenciaSel = typeof (run.selection as any)?.competencia === 'string'
    ? (run.selection as any).competencia
    : null;
  if (competenciaSel && forcarCompetencia !== true) {
    const esperadas = (await sql`
      SELECT DISTINCT meta->>'competenciaEsperada' AS ce
      FROM comprovantes_envios
      WHERE run_id = ${id} AND meta->>'competenciaEsperada' IS NOT NULL
    `).map((r: any) => r.ce).filter(Boolean) as string[];
    if (esperadas.length > 0 && !esperadas.includes(competenciaSel)) {
      return NextResponse.json({
        error: `Competência ${competenciaSel} diverge das datas de pagamento dos comprovantes (esperada: ${esperadas.join(' ou ')}). ${regraCompetencia}`,
        code: 'competencia_divergente',
        informada: competenciaSel,
        esperada: esperadas,
        tipo: tipoRun,
        regra: regraCompetencia,
      }, { status: 409 });
    }
  }

  const sel = { ...(run.selection as any), phase: 'envio', ...(onlyEnvioIds?.length ? { onlyEnvioIds } : {}) };
  await sql`UPDATE comprovantes_runs
    SET status='queued', selection=${JSON.stringify(sel)}::jsonb, started_at=NULL, finished_at=NULL
    WHERE id=${id}`;
  return NextResponse.json({ ok: true, status: 'queued' });
}
