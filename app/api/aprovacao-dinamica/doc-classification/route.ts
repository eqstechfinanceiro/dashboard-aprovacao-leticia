import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import {
  ensureDocClassTable,
  getClassificationsByReport,
  getClassificationsByExpenseIds,
  saveHumanClassification,
  normalizeTipo,
  type DocTipo,
} from '@/lib/db/doc-classification';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET — consulta de classificação fiscal dos comprovantes.
//   ?report_id=N          → todas as despesas do relatório
//   ?expense_ids=1,2,3    → despesas específicas (consumo da automação protheus-reports-vex)
//   ?pending=1            → só as que precisam de revisão humana
// A automação chama com header x-doc-class-secret (ver middleware).
export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }
    await ensureDocClassTable();

    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('report_id');
    const expenseIdsParam = searchParams.get('expense_ids');
    const pendingOnly = searchParams.get('pending') === '1';

    let data;
    if (expenseIdsParam) {
      const ids = expenseIdsParam
        .split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n));
      data = await getClassificationsByExpenseIds(ids);
    } else if (reportId) {
      data = await getClassificationsByReport(parseInt(reportId));
    } else {
      return NextResponse.json(
        { error: 'Informe report_id ou expense_ids' },
        { status: 400 }
      );
    }

    if (pendingOnly) data = data.filter(d => d.needs_review);

    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('[DocClass API] GET error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST — correção humana de tipo/chave (sessão autenticada com módulo
// aprovacao-dinamica; gestores são bloqueados pelo middleware).
// Body: { report_id, expense_id, tipo_documento, chave_acesso?, reviewer_name? }
export async function POST(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const reportId = parseInt(body.report_id);
    const expenseId = parseInt(body.expense_id);
    const rawTipo = body.tipo_documento;
    const tipo: DocTipo = normalizeTipo(rawTipo);
    const chave = body.chave_acesso ?? null;
    const reviewer =
      request.headers.get('x-user-name') ||
      body.reviewer_name ||
      'humano';

    if (!reportId || !expenseId) {
      return NextResponse.json({ error: 'report_id e expense_id são obrigatórios' }, { status: 400 });
    }
    if (!rawTipo) {
      return NextResponse.json({ error: 'tipo_documento é obrigatório' }, { status: 400 });
    }

    const result = await saveHumanClassification(reportId, expenseId, tipo, chave, reviewer);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    try {
      await logAudit(request, {
        action: 'docclass.correcao_humana',
        entity_type: 'expense',
        entity_id: expenseId,
        details: {
          report_id: reportId,
          tipo_documento: tipo,
          chave_acesso: chave ? String(chave).slice(0, 12) + '…' : null,
          reviewer_name: reviewer,
        },
      });
    } catch { /* auditoria não bloqueia */ }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DocClass API] POST error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
