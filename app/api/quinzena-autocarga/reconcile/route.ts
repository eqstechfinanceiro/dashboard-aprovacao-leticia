import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { isAutocargaAllowedEmail } from '@/lib/autocarga/allowlist';
import { ensureAutocargaSchema } from '@/lib/autocarga/tables';

export const dynamic = 'force-dynamic';

// GET /api/quinzena-autocarga/reconcile?year&month&quinzena
// Relatório de divergência planilha × executado: cruza o snapshot congelado
// (o que DEVERIA ter sido carregado) com o último estado dos itens de carga.
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }
  const email = request.headers.get('x-user-email');
  if (!isAutocargaAllowedEmail(email)) {
    return NextResponse.json({ error: 'Auto-carga restrita a operadores autorizados' }, { status: 403 });
  }
  await ensureAutocargaSchema();

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '0');
  const month = parseInt(searchParams.get('month') ?? '0');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '0');
  if (!year || !month || ![1, 2].includes(quinzena)) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 });
  }

  try {
    // Último estado por CPF (todas as runs do período)
    const itemRows = await sql`
      SELECT DISTINCT ON (cpf)
        cpf, colaborador, amount::text, status, block_reason,
        transaction_id, forced, estornado_at, estornado_by, estorno_tx
      FROM quinzena_carga_items
      WHERE year=${year} AND month=${month} AND quinzena=${quinzena}
      ORDER BY cpf, id DESC
    `;
    const byCpf = new Map<string, any>();
    for (const r of itemRows as any[]) byCpf.set(r.cpf, r);

    const snapRows = await sql`
      SELECT cpf, colaborador, carga_final::text, situacao
      FROM quinzena_frozen_snapshots
      WHERE year=${year} AND month=${month} AND quinzena=${quinzena}
    `;

    interface Div {
      cpf: string; colaborador: string; planilha: number; executado: number | null;
      tipo: string; detalhe: string; transaction_id?: string | null;
    }
    const divergencias: Div[] = [];
    let snapshotTotal = 0, loadedTotal = 0;
    let nOk = 0, nEstornado = 0, nFailed = 0, nBlocked = 0;

    for (const s of snapRows as any[]) {
      const esperado = Number(s.carga_final ?? 0);
      if (esperado > 0) snapshotTotal += esperado;
      const it = byCpf.get(s.cpf);
      if (!it) {
        if (esperado > 0) {
          divergencias.push({
            cpf: s.cpf, colaborador: s.colaborador, planilha: esperado, executado: null,
            tipo: 'nao_carregado', detalhe: 'sem execução de carga registrada',
          });
        }
        continue;
      }
      const val = Number(it.amount ?? 0);
      switch (it.status) {
        case 'ok':
        case 'forced_ok':
          nOk++;
          loadedTotal += val;
          if (Math.abs(val - esperado) > 0.004) {
            divergencias.push({
              cpf: s.cpf, colaborador: s.colaborador, planilha: esperado, executado: val,
              tipo: 'valor_divergente',
              detalhe: `carregado ${val.toFixed(2)} ≠ planilha ${esperado.toFixed(2)}${it.forced ? ' (forçado)' : ''}`,
              transaction_id: it.transaction_id,
            });
          }
          break;
        case 'estornado':
          nEstornado++;
          divergencias.push({
            cpf: s.cpf, colaborador: s.colaborador, planilha: esperado, executado: 0,
            tipo: 'estornado',
            detalhe: `estornado por ${it.estornado_by ?? '?'} — valor devolvido`,
            transaction_id: it.estorno_tx,
          });
          break;
        case 'failed':
        case 'forced_failed':
          nFailed++;
          if (esperado > 0) {
            divergencias.push({
              cpf: s.cpf, colaborador: s.colaborador, planilha: esperado, executado: null,
              tipo: 'falhou', detalhe: it.block_reason ?? 'falha na transferência',
            });
          }
          break;
        case 'blocked':
          nBlocked++;
          if (esperado > 0) {
            divergencias.push({
              cpf: s.cpf, colaborador: s.colaborador, planilha: esperado, executado: null,
              tipo: 'bloqueado', detalhe: it.block_reason ?? 'bloqueado no preflight',
            });
          }
          break;
      }
    }

    // Carga executada em CPF fora do snapshot (ex.: forçado sem linha congelada)
    const snapCpf = new Set((snapRows as any[]).map((s) => s.cpf));
    for (const it of itemRows as any[]) {
      if (!snapCpf.has(it.cpf) && ['ok', 'forced_ok'].includes(it.status)) {
        divergencias.push({
          cpf: it.cpf, colaborador: it.colaborador, planilha: 0,
          executado: Number(it.amount ?? 0),
          tipo: 'fora_da_planilha', detalhe: 'carga executada sem linha no snapshot congelado',
          transaction_id: it.transaction_id,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        snapshot_total: Math.round(snapshotTotal * 100) / 100,
        loaded_total: Math.round(loadedTotal * 100) / 100,
        delta: Math.round((snapshotTotal - loadedTotal) * 100) / 100,
        ok: nOk, estornado: nEstornado, failed: nFailed, blocked: nBlocked,
        divergencias: divergencias.length,
      },
      divergencias,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[autocarga/reconcile]', e);
    return NextResponse.json({ error: 'Erro ao reconciliar', detail: String(e) }, { status: 500 });
  }
}
