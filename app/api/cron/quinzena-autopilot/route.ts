import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/db/audit';
import { notifyAdmins } from '@/lib/sync/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * GET /api/cron/quinzena-autopilot — agenda do "fechamento de um clique".
 *
 * Chamado pelo sync-worker uma vez por dia (dias 10/24/11/25) — ou por cron
 * externo / admin autenticado. Dias em UTC (gate de horário fica no worker):
 *   - dia 10 ou 24  → 'report': precheck da quinzena que fecha amanhã +
 *                     notificação D-1 pros admins ("amanhã fecha, N problemas")
 *   - dia 11 ou 25  → 'close' : chama /api/quinzena-fechar (precheck→freeze→
 *                     Excel→notificação). Se o precheck bloquear, notifica
 *                     os admins com os motivos e NÃO congela.
 *
 * Params: ?mode=auto|report|close (default auto) e override manual
 *         ?year=&month=&quinzena= pra testar/simular outro período.
 *
 * Auth: x-cron-secret (middleware) ou usuário admin logado.
 */
export async function GET(req: NextRequest) {
  try {
    const isCron = !!process.env.CRON_SECRET &&
      req.headers.get('x-cron-secret') === process.env.CRON_SECRET;
    const isAdmin = req.headers.get('x-user-role') === 'admin';
    if (!isCron && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = new URL(req.url).searchParams;
    let mode = sp.get('mode') || 'auto';
    let year = parseInt(sp.get('year') ?? '', 10);
    let month = parseInt(sp.get('month') ?? '', 10);
    let quinzena = parseInt(sp.get('quinzena') ?? '', 10);

    const now = new Date();
    const day = now.getUTCDate();

    if (mode === 'auto') {
      // Datas de fechamento: 1a QZ fecha dia 11, 2a QZ fecha dia 25.
      if (day === 11 || day === 25) mode = 'close';
      else if (day === 10 || day === 24) mode = 'report';
      else return NextResponse.json({ ok: true, skipped: true, reason: `dia ${day} nao e data de fechamento/D-1` });
    }
    if (mode !== 'close' && mode !== 'report') {
      return NextResponse.json({ error: 'mode invalido (auto|report|close)' }, { status: 400 });
    }

    if (!year || !month || !quinzena) {
      // Quinzena sendo fechada: dia 11/10 → 1a do mes; dia 25/24 → 2a do mes.
      year = now.getUTCFullYear();
      month = now.getUTCMonth() + 1;
      quinzena = (day === 11 || day === 10) ? 1 : 2;
    }
    if (month < 1 || month > 12 || (quinzena !== 1 && quinzena !== 2)) {
      return NextResponse.json({ error: 'periodo invalido' }, { status: 400 });
    }

    const periodo = `${MESES[month - 1]}/${year} ${quinzena}a QZ`;
    const base = req.nextUrl.origin;
    const secret = req.headers.get('x-cron-secret') || '';
    const fwd: Record<string, string> = {};
    if (secret) fwd['x-cron-secret'] = secret;
    const cookie = req.headers.get('cookie');
    if (cookie) fwd['cookie'] = cookie;
    const qs = `year=${year}&month=${month}&quinzena=${quinzena}`;

    // ---------- D-1: relatório de véspera ------------------------------------
    if (mode === 'report') {
      const preRes = await fetch(`${base}/api/quinzena-precheck?${qs}`, { headers: fwd, cache: 'no-store' });
      const pre = await preRes.json();
      if (!preRes.ok) {
        return NextResponse.json({ error: pre.error || 'precheck falhou' }, { status: preRes.status });
      }
      // Período já congelado — nada a reportar.
      if ((pre.checks ?? []).some((c: any) => c.id === 'ja_congelada')) {
        return NextResponse.json({ ok: true, mode, skipped: true, reason: 'ja congelada' });
      }
      const errors = pre.summary?.errors ?? 0;
      const warnings = pre.summary?.warnings ?? 0;
      const problems = (pre.checks ?? [])
        .filter((c: any) => c.severity !== 'ok')
        .map((c: any) => `${c.severity === 'error' ? 'BLOQUEIO' : 'alerta'}: ${c.title}`)
        .slice(0, 8);
      const notified = await notifyAdmins({
        type: 'quinzena_d1',
        title: `Amanhã fecha a quinzena ${periodo}`,
        body: errors > 0
          ? `${errors} bloqueio(s) impedem o fechamento automático. ${problems.join(' · ')}`
          : warnings > 0
            ? `${warnings} alerta(s): ${problems.join(' · ')}`
            : 'Todos os checks OK — o fechamento automático deve correr limpo.',
        link: '/controle',
        dedupKey: `quinzena-d1:${year}-${month}-Q${quinzena}`,
        details: { year, month, quinzena, errors, warnings },
      });
      await logAudit(req, {
        action: 'quinzena.autopilot', entity_type: 'quinzena',
        entity_id: `${year}-${month}-${quinzena}`,
        details: { mode, errors, warnings, notified },
      });
      return NextResponse.json({ ok: true, mode, period: { year, month, quinzena }, precheck: pre.summary, notified });
    }

    // ---------- Dia D: fechamento automático ----------------------------------
    const fecharRes = await fetch(`${base}/api/quinzena-fechar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...fwd },
      body: JSON.stringify({ year, month, quinzena }),
    });
    const fechar = await fecharRes.json().catch(() => ({}));

    if (!fecharRes.ok) {
      const errTitles = (fechar.checks ?? [])
        .filter((c: any) => c.severity === 'error')
        .map((c: any) => c.title)
        .slice(0, 6);
      await notifyAdmins({
        type: 'quinzena_bloqueada',
        title: `Fechamento automático da quinzena ${periodo} bloqueado`,
        body: `${fechar.error || `HTTP ${fecharRes.status}`}${errTitles.length ? ' — ' + errTitles.join(' · ') : ''}`,
        link: '/controle',
        dedupKey: `quinzena-bloqueada:${year}-${month}-Q${quinzena}`,
        details: { year, month, quinzena, aborted: fechar.aborted },
      });
      await logAudit(req, {
        action: 'quinzena.autopilot', entity_type: 'quinzena',
        entity_id: `${year}-${month}-${quinzena}`,
        details: { mode, aborted: fechar.aborted, error: fechar.error },
      });
      return NextResponse.json({ ok: false, mode, aborted: fechar.aborted, error: fechar.error, checks: fechar.checks }, { status: 409 });
    }

    await logAudit(req, {
      action: 'quinzena.autopilot', entity_type: 'quinzena',
      entity_id: `${year}-${month}-${quinzena}`,
      details: { mode, download: fechar.download_url, frozen_now: fechar.frozen_now },
    });
    return NextResponse.json({ ok: true, mode, ...fechar });
  } catch (error) {
    console.error('[quinzena-autopilot] Erro:', error);
    return NextResponse.json({ error: 'Erro no autopilot', detail: String(error) }, { status: 500 });
  }
}
