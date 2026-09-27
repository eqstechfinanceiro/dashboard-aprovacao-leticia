import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { getScopeForRequest } from '@/lib/auth/scope';
import { isFaturaOrCartao } from '@/lib/rules/report-filters';
import { buildNomeToCpf, resolveCpfByName } from '@/lib/quinzena/name-resolve';
import { getQuinzenaDates, r2 } from '@/lib/quinzena/financials';

export const dynamic = 'force-dynamic';

// ---- Reconciliação extrato × prestação --------------------------------------
// Cruza as movimentações do cartão (extrato_movimentacao) com as despesas
// prestadas (prestacao_expenses via id_despesa), acumulado até o cutoff
// financeiro da quinzena (dia 30 do mês anterior — mesmo corte do cálculo).
//
// Buckets:
//   conciliado   → gasto linkado a despesa em relatório Aprovado/Enviado
//   pendente     → gasto linkado a despesa em relatório Aberto/Reaberto/
//                  Reprovado/etc — existe, mas NÃO conta na prestação
//   sem_despesa  → gasto no cartão sem nenhuma despesa vinculada (id_despesa
//                  NULL) — dinheiro gasto que nunca foi prestado
//   saque        → saques em espécie (nunca vinculam; conciliam via saldo_final)
//
// GET ?year&month&quinzena → { cutoff, summary, sem_despesa[], pendente[] }

interface SemDespesaRow {
  usuario: string;
  data: string;
  tipo: string;
  descricao: string | null;
  valor: number;
}

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
  }
  // Mesmo critério do diff: gestor com escopo restrito não vê reconciliação global
  if (await getScopeForRequest(request)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const year     = parseInt(searchParams.get('year')     ?? '0');
  const month    = parseInt(searchParams.get('month')    ?? '0');
  const quinzena = parseInt(searchParams.get('quinzena') ?? '0');

  if (!year || !month || month < 1 || month > 12 || ![1, 2].includes(quinzena)) {
    return NextResponse.json(
      { error: 'Parametros invalidos: year, month, quinzena obrigatorios' },
      { status: 400 }
    );
  }

  const { financial_cutoff } = getQuinzenaDates(year, month, quinzena);

  try {
    // Cadastro para resolver usuario→CPF
    const cadastroRows = await sql`
      SELECT cpf, colaborador, situacao FROM quinzena_cadastro WHERE cpf IS NOT NULL
    `;
    const nomeToCpf = buildNomeToCpf(cadastroRows as any[]);
    const cpfToNome = new Map<string, string>();
    for (const c of cadastroRows as any[]) if (c.cpf) cpfToNome.set(c.cpf, c.colaborador || '');
    const fuzzyCache = new Map<string, string>();
    const resolve = (usuario: string) => resolveCpfByName(usuario, nomeToCpf, fuzzyCache);

    // Gastos sem despesa vinculada — detalhe por transação (limitado pra UI)
    const semDespesaRows = await sql`
      SELECT UPPER(TRIM(usuario)) AS usuario, data::text AS data, tipo, descricao, valor
      FROM extrato_movimentacao
      WHERE is_snapshot = FALSE
        AND tipo IN ('Compra', 'Pix')
        AND id_despesa IS NULL
        AND valor < 0
        AND data <= ${financial_cutoff}
      ORDER BY valor ASC
      LIMIT 500
    `;

    // Agregado dos sem-despesa (pode exceder o LIMIT do detalhe)
    const semDespesaAgg = await sql`
      SELECT COUNT(*) AS n, COALESCE(SUM(-valor), 0)::text AS total
      FROM extrato_movimentacao
      WHERE is_snapshot = FALSE
        AND tipo IN ('Compra', 'Pix')
        AND id_despesa IS NULL
        AND valor < 0
        AND data <= ${financial_cutoff}
    `;

    // Gastos vinculados a despesa — por status+nome do relatório (o nome é
    // necessário pra excluir FATURA/CARTÃO, mesma regra do somase)
    const porStatusRows = await sql`
      SELECT r.status, r.name, COUNT(*) AS n, COALESCE(SUM(-e2.valor), 0)::text AS total
      FROM extrato_movimentacao e2
      JOIN prestacao_expenses pe ON pe.id = e2.id_despesa
      JOIN prestacao_reports r ON r.id = pe.report_id
      WHERE e2.is_snapshot = FALSE
        AND e2.valor < 0
        AND e2.tipo IN ('Compra', 'Pix')
        AND e2.data <= ${financial_cutoff}
      GROUP BY r.status, r.name
    `;

    // Pendente por usuário (gasto linkado a relatório não-final)
    const pendenteUserRows = await sql`
      SELECT UPPER(TRIM(e2.usuario)) AS usuario, r.status, r.name,
             COUNT(*) AS n, COALESCE(SUM(-e2.valor), 0)::text AS total
      FROM extrato_movimentacao e2
      JOIN prestacao_expenses pe ON pe.id = e2.id_despesa
      JOIN prestacao_reports r ON r.id = pe.report_id
      WHERE e2.is_snapshot = FALSE
        AND e2.valor < 0
        AND e2.tipo IN ('Compra', 'Pix')
        AND e2.data <= ${financial_cutoff}
        AND r.status NOT ILIKE 'Aprovado'
        AND r.status NOT ILIKE 'Enviado'
        AND r.status NOT ILIKE 'Deletado'
      GROUP BY UPPER(TRIM(e2.usuario)), r.status, r.name
      ORDER BY SUM(-e2.valor) DESC
    `;

    // Saques em espécie — totais apenas (conciliam via saldo, não por transação)
    const saqueAgg = await sql`
      SELECT COUNT(*) AS n, COALESCE(SUM(-valor), 0)::text AS total
      FROM extrato_movimentacao
      WHERE is_snapshot = FALSE
        AND tipo = 'Saque'
        AND valor < 0
        AND data <= ${financial_cutoff}
    `;

    const conciliado = { n: 0, total: 0 };
    const pendentePorStatus = new Map<string, { n: number; total: number }>();
    for (const r of porStatusRows as any[]) {
      const n = Number(r.n), total = Number(r.total);
      const st = String(r.status || 'DESCONHECIDO').toUpperCase();
      if (st === 'APROVADO' || st === 'ENVIADO') {
        conciliado.n += n; conciliado.total += total;
      } else if (st !== 'DELETADO' && !isFaturaOrCartao(r.name || '')) {
        const cur = pendentePorStatus.get(st) ?? { n: 0, total: 0 };
        pendentePorStatus.set(st, { n: cur.n + n, total: cur.total + total });
      }
    }

    // Agrega por usuário+status somando os relatórios (exclui FATURA/CARTÃO)
    const pendByUserStatus = new Map<string, { usuario: string; status: string; n: number; total: number }>();
    for (const r of pendenteUserRows as any[]) {
      if (isFaturaOrCartao(r.name || '')) continue;
      const key = `${r.usuario}|${r.status}`;
      const cur = pendByUserStatus.get(key) ?? { usuario: r.usuario, status: r.status, n: 0, total: 0 };
      cur.n += Number(r.n); cur.total += Number(r.total);
      pendByUserStatus.set(key, cur);
    }
    const pendente = [...pendByUserStatus.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 300)
      .map((r) => {
        const cpf = resolve(r.usuario);
        return {
          cpf: cpf ?? null,
          colaborador: cpf ? (cpfToNome.get(cpf) || r.usuario) : r.usuario,
          status: String(r.status || '').toUpperCase(),
          n: Number(r.n),
          total: r2(Number(r.total)),
        };
      });

    const sem_despesa = (semDespesaRows as unknown as SemDespesaRow[]).map((r) => {
      const cpf = resolve(r.usuario);
      return {
        cpf: cpf ?? null,
        colaborador: cpf ? (cpfToNome.get(cpf) || r.usuario) : r.usuario,
        usuario_extrato: r.usuario,
        data: String(r.data).slice(0, 10),
        tipo: r.tipo,
        descricao: r.descricao,
        valor: r2(-r.valor),
      };
    });

    const pendenteTotals = [...pendentePorStatus.entries()].reduce(
      (s, [, v]) => ({ n: s.n + v.n, total: s.total + v.total }),
      { n: 0, total: 0 }
    );

    return NextResponse.json({
      cutoff: financial_cutoff,
      generated_at: new Date().toISOString(),
      summary: {
        sem_despesa_n: Number(semDespesaAgg[0]?.n || 0),
        sem_despesa_total: r2(Number(semDespesaAgg[0]?.total || 0)),
        pendente_n: pendenteTotals.n,
        pendente_total: r2(pendenteTotals.total),
        pendente_por_status: Object.fromEntries(
          [...pendentePorStatus.entries()].map(([k, v]) => [k, { n: v.n, total: r2(v.total) }])
        ),
        conciliado_n: conciliado.n,
        conciliado_total: r2(conciliado.total),
        saque_n: Number(saqueAgg[0]?.n || 0),
        saque_total: r2(Number(saqueAgg[0]?.total || 0)),
      },
      sem_despesa,
      pendente,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[quinzena-reconcile] Erro:', error);
    return NextResponse.json(
      { error: 'Erro na reconciliação', detail: String(error) },
      { status: 500 }
    );
  }
}
