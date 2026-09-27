import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { getScopeForRequest } from '@/lib/auth/scope';
import { sql } from '@/lib/db/neon';
import { logAudit } from '@/lib/db/audit';
import { notifyAdmins } from '@/lib/sync/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * POST /api/quinzena-fechar — "fechar quinzena de um clique".
 *
 * Orquestra o fechamento completo num único passo:
 *   1. precheck   — bloqueia se houver erros (o usuário confirma warnings via modal)
 *   2. freeze     — grava o snapshot (idempotente: se já congelada, só re-exporta)
 *   3. export     — gera o XLSX e salva em private-downloads/
 *   4. notify     — notifica admins com link direto pro arquivo
 *   5. audit      — registra o evento inteiro
 *
 * Body: { year, month, quinzena }
 * Retorna: { ok, frozen_now, rows_frozen, download_url, checks_summary }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const year = parseInt(body.year, 10);
    const month = parseInt(body.month, 10);
    const quinzena = parseInt(body.quinzena, 10);
    if (!year || !month || month < 1 || month > 12 || (quinzena !== 1 && quinzena !== 2)) {
      return NextResponse.json(
        { error: 'Parametros invalidos. Envie year, month (1-12), quinzena (1 ou 2)' },
        { status: 400 }
      );
    }

    // Mesmo gate do freeze: gestor (escopo restrito) nao executa escrita global
    if (await getScopeForRequest(req)) {
      return NextResponse.json(
        { error: 'Gestores não podem fechar a quinzena global. Solicite a um administrador.' },
        { status: 403 }
      );
    }

    const cookies = req.headers.get('cookie') || '';
    const cronHdr = req.headers.get('x-cron-secret');
    const fwd: Record<string, string> = { cookie: cookies };
    if (cronHdr) fwd['x-cron-secret'] = cronHdr;
    const base = req.nextUrl.origin;
    const qs = `year=${year}&month=${month}&quinzena=${quinzena}`;
    const periodo = `${MESES[month - 1]}/${year} ${quinzena}a QZ`;
    const steps: string[] = [];

    // Ja congelada? Pula precheck+freeze e vai direto pro re-export do snapshot.
    let alreadyFrozen = false;
    if (sql) {
      const r = await sql`
        SELECT COUNT(*)::int AS cnt FROM quinzena_frozen_snapshots
        WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}`;
      alreadyFrozen = (r[0]?.cnt ?? 0) > 0;
    }
    let precheck: any = { summary: null };

    // ---- 1. Precheck (so faz sentido antes do freeze) --------------------------
    if (!alreadyFrozen) {
      const preRes = await fetch(`${base}/api/quinzena-precheck?${qs}`, {
        headers: fwd, cache: 'no-store',
      });
      precheck = await preRes.json();
      if (!preRes.ok) {
        return NextResponse.json(
          { error: precheck.error || 'Falha no precheck' }, { status: preRes.status }
        );
      }
      if (precheck.can_freeze === false) {
        await logAudit(req, {
          action: 'quinzena.fechar', entity_type: 'quinzena',
          entity_id: `${year}-${month}-${quinzena}`,
          details: { aborted: 'precheck', errors: precheck.summary?.errors },
        });
        return NextResponse.json({
          ok: false, aborted: 'precheck',
          error: 'Precheck encontrou bloqueios. Revise antes de fechar.',
          checks: precheck.checks,
        }, { status: 409 });
      }
      steps.push('precheck');
    }

    // ---- 2. Freeze (idempotente) ----------------------------------------------
    let frozenNow = false;
    let rowsFrozen = 0;
    if (alreadyFrozen) {
      steps.push('freeze:ja_congelada');
    } else {
      const freezeRes = await fetch(`${base}/api/quinzena-freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...fwd },
        body: JSON.stringify({ year, month, quinzena }),
      });
      const freezeBody = await freezeRes.json().catch(() => ({}));
      if (freezeRes.status === 409) {
        steps.push('freeze:ja_congelada');
      } else if (!freezeRes.ok) {
        return NextResponse.json(
          { error: freezeBody.error || 'Erro ao congelar' }, { status: freezeRes.status }
        );
      } else {
        frozenNow = true;
        rowsFrozen = freezeBody.rows_frozen ?? freezeBody.frozen_rows ?? 0;
        steps.push('freeze');
      }
    }

    // ---- 3. Export → salva arquivo ---------------------------------------------
    const filename = `controle_${year}_${String(month).padStart(2, '0')}_Q${quinzena}.xlsx`;
    const expRes = await fetch(`${base}/api/quinzena-export?${qs}`, {
      headers: fwd, cache: 'no-store',
    });
    if (!expRes.ok) {
      const eb = await expRes.json().catch(() => ({}));
      await logAudit(req, {
        action: 'quinzena.fechar', entity_type: 'quinzena',
        entity_id: `${year}-${month}-${quinzena}`,
        details: { aborted: 'export', frozen_now: frozenNow, error: eb.error },
      });
      return NextResponse.json({
        ok: false, aborted: 'export', frozen_now: frozenNow,
        error: `Quinzena ${frozenNow ? 'congelada' : 'ja estava congelada'}, mas a exportacao falhou: ${eb.error || expRes.status}`,
      }, { status: 500 });
    }
    const buf = Buffer.from(await expRes.arrayBuffer());
    const dir = path.join(process.cwd(), 'private-downloads');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, filename), buf);
    steps.push('export');

    // ---- 4. Notificacao + audit -------------------------------------------------
    const downloadUrl = `/api/downloads/${filename}`;
    const notified = await notifyAdmins({
      type: 'quinzena_pronta',
      title: `Quinzena ${periodo} pronta`,
      body: `${frozenNow ? `${rowsFrozen} colaboradores congelados` : 'Ja estava congelada'}. Planilha gerada para download.`,
      link: downloadUrl,
      dedupKey: `quinzena:${year}-${month}-Q${quinzena}`,
      details: { year, month, quinzena, bytes: buf.length },
    });

    await logAudit(req, {
      action: 'quinzena.fechar', entity_type: 'quinzena',
      entity_id: `${year}-${month}-${quinzena}`,
      details: {
        frozen_now: frozenNow, rows_frozen: rowsFrozen,
        file: filename, bytes: buf.length, notified,
        precheck_warnings: precheck.summary?.warnings ?? 0,
      },
    });

    return NextResponse.json({
      ok: true, period: { year, month, quinzena, label: periodo },
      frozen_now: frozenNow, rows_frozen: rowsFrozen,
      download_url: downloadUrl, filename,
      checks_summary: precheck.summary, notified, steps,
    });
  } catch (error) {
    console.error('[quinzena-fechar] Erro:', error);
    return NextResponse.json({ error: 'Erro ao fechar quinzena', detail: String(error) }, { status: 500 });
  }
}
