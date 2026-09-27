import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { getScopeForRequest } from '@/lib/auth/scope';

export const dynamic = 'force-dynamic';

// ---- Diff pós-freeze ---------------------------------------------------------
// Compara o snapshot congelado com os dados recalculados AGORA (forceCalc) para
// o mesmo período. Qualquer divergência é movimento depois do freeze:
// liquidação tardia de cartão, aprovação de relatório antiga, cadastro alterado.
//
// GET ?year&month&quinzena → { summary, added, removed, changed }

const MONEY_FIELDS: { key: string; label: string }[] = [
  { key: 'carga',           label: 'Carga' },
  { key: 'transferencia',   label: 'Transferência' },
  { key: 'tarifa',          label: 'Tarifa' },
  { key: 'prestacao',       label: 'Prestação' },
  { key: 'saldo_prestacao', label: 'Saldo Prestação' },
  { key: 'saldo_cartao',    label: 'Saldo Cartão' },
  { key: 'saldo_final',     label: 'Saldo Final' },
  { key: 'saldo_reembolsar',label: 'Saldo a Reembolsar' },
  { key: 'carga_parcial',   label: 'Carga Parcial' },
  { key: 'reembolso',       label: 'Reembolso' },
  { key: 'carga_final',     label: 'Carga Final' },
  { key: 'col_qz',          label: 'Col. QZ' },
  { key: 'adiantamento',    label: 'Adiantamento' },
];

const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: 'situacao',      label: 'Situação' },
  { key: 'status_cartao', label: 'Status Cartão' },
  { key: 'gestor',        label: 'Gestor' },
  { key: 'diretor',       label: 'Diretor' },
  { key: 'centro_custo',  label: 'Centro de Custo' },
  { key: 'regional',      label: 'Regional' },
];

const EPS = 0.005; // centavos — ignora ruído de arredondamento

const toNum = (v: any): number => {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? 0 : n;
};

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }
  // Gestor não pode rodar diff global (usa dados completos)
  if (await getScopeForRequest(request)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const year     = parseInt(searchParams.get('year')     ?? '0');
  const month    = parseInt(searchParams.get('month')    ?? '0');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '0');

  if (!year || !month || ![1, 2].includes(quinzena)) {
    return NextResponse.json(
      { error: 'Parametros invalidos: year, month, quinzena obrigatorios' },
      { status: 400 }
    );
  }

  try {
    // 1. Snapshot congelado
    const frozenRows = await sql`
      SELECT cpf, colaborador, situacao, status_cartao, regional, centro_custo,
             gestor, diretor,
             carga::text, transferencia::text, tarifa::text, prestacao::text,
             saldo_prestacao::text, saldo_cartao::text, saldo_final::text,
             saldo_reembolsar::text, col_qz::text, adiantamento::text,
             carga_parcial::text, reembolso::text, carga_final::text,
             frozen_at
      FROM quinzena_frozen_snapshots
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
    `;

    if (frozenRows.length === 0) {
      return NextResponse.json(
        { error: 'Quinzena nao esta congelada — sem snapshot para comparar' },
        { status: 404 }
      );
    }

    const frozenByCpf = new Map<string, Record<string, any>>();
    for (const r of frozenRows) frozenByCpf.set(r.cpf, r as any);
    const frozenAt = (frozenRows[0] as any).frozen_at;

    // 2. Dados recalculados agora (forceCalc ignora o freeze)
    const baseUrl = new URL(request.url).origin;
    const apiRes = await fetch(
      `${baseUrl}/api/quinzena-complete?year=${year}&month=${month}&quinzena=${quinzena}&forceCalc=true`,
      { headers: { cookie: request.headers.get('cookie') || '' } }
    );
    if (!apiRes.ok) {
      return NextResponse.json(
        { error: 'Falha ao recalcular dados para o diff' },
        { status: 500 }
      );
    }
    const apiData = await apiRes.json();
    const calcRows: Record<string, any>[] = apiData.data || [];
    const calcByCpf = new Map<string, Record<string, any>>();
    for (const r of calcRows) calcByCpf.set(r.cpf, r);

    // 3. Diff
    const added: { cpf: string; colaborador: string }[] = [];
    const removed: { cpf: string; colaborador: string }[] = [];
    const changed: {
      cpf: string; colaborador: string;
      field: string; label: string;
      from: string; to: string; delta?: number;
    }[] = [];

    for (const [cpf, calc] of calcByCpf) {
      const frozen = frozenByCpf.get(cpf);
      if (!frozen) {
        added.push({ cpf, colaborador: calc.colaborador || cpf });
        continue;
      }
      const name = calc.colaborador || frozen.colaborador || cpf;

      for (const f of MONEY_FIELDS) {
        const a = toNum(frozen[f.key] ?? (f.key === 'col_qz' ? frozen.col_qz : undefined));
        const b = toNum(calc[f.key] ?? (f.key === 'col_qz' ? calc.col_qz_manual : undefined));
        const delta = b - a;
        if (Math.abs(delta) > EPS) {
          changed.push({
            cpf, colaborador: name, field: f.key, label: f.label,
            from: fmtBRL(a), to: fmtBRL(b), delta: Math.round(delta * 100) / 100,
          });
        }
      }
      for (const f of TEXT_FIELDS) {
        const a = String(frozen[f.key] ?? '');
        const b = String(calc[f.key] ?? '');
        if (a !== b) {
          changed.push({
            cpf, colaborador: name, field: f.key, label: f.label, from: a || '—', to: b || '—',
          });
        }
      }
    }
    for (const [cpf, frozen] of frozenByCpf) {
      if (!calcByCpf.has(cpf)) {
        removed.push({ cpf, colaborador: frozen.colaborador || cpf });
      }
    }

    // Ordena: maiores divergências financeiras primeiro
    changed.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));

    const moneyChanged = changed.filter((c) => c.delta !== undefined);
    const totalDrift = moneyChanged
      .filter((c) => c.field === 'carga_final')
      .reduce((s, c) => s + Math.abs(c.delta!), 0);

    return NextResponse.json({
      period: { year, month, quinzena },
      frozen_at: frozenAt,
      compared_at: new Date().toISOString(),
      summary: {
        frozen_rows: frozenRows.length,
        calc_rows: calcRows.length,
        added: added.length,
        removed: removed.length,
        changed_fields: changed.length,
        changed_cpfs: new Set(changed.map((c) => c.cpf)).size,
        total_drift_carga_final: Math.round(totalDrift * 100) / 100,
        identical: changed.length === 0 && added.length === 0 && removed.length === 0,
      },
      added,
      removed,
      changed: changed.slice(0, 500),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[quinzena-diff] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao comparar', detail: String(error) },
      { status: 500 }
    );
  }
}
