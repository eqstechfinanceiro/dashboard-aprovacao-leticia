import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { getScopeForRequest, normalizeCpf } from '@/lib/auth/scope';
import { buildNomeToCpf, resolveCpfByName } from '@/lib/quinzena/name-resolve';
import { isFaturaOrCartao } from '@/lib/rules/report-filters';

export const dynamic = 'force-dynamic';

// Posição de Caixa — "quem está com dinheiro parado / quem deve".
// Fonte: último quinzena_controle_snapshot (saldos por CPF) +
// prestacao_reports CAIXA * (abertos vs fechados, aging).
export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados não configurado' }, { status: 503 });
  }

  const scope = await getScopeForRequest(request);
  const cpfs = scope ? Array.from(scope.cpfs) : null;

  try {
    // Último período congelado disponível
    const lastSnap = await sql`
      SELECT year, month, quinzena FROM quinzena_frozen_snapshots
      ORDER BY year DESC, month DESC, quinzena DESC LIMIT 1
    `;
    if (!lastSnap.length) {
      return NextResponse.json({ error: 'Sem snapshot de quinzena disponível' }, { status: 404 });
    }
    const per = lastSnap[0] as any;

    // Saldos por colaborador (do snapshot congelado) + regional/centro de custo
    // situacao/status_cartao vêm do cadastro live (mais fresco que o snapshot)
    // carga = total VITALÍCIO carregado no cartão; carga_final = carga desta quinzena;
    // col_qz = valor da quinzena cadastrada (null = sem quinzena)
    const saldos = cpfs
      ? await sql`
          SELECT s.cpf, s.colaborador, s.regional, s.centro_custo,
                 COALESCE(NULLIF(c.situacao,''), s.situacao) AS situacao,
                 COALESCE(NULLIF(c.status_cartao,''), s.status_cartao) AS status_cartao,
                 COALESCE(s.saldo_prestacao,0)::float AS saldo_prestacao,
                 COALESCE(s.saldo_cartao,0)::float AS saldo_cartao,
                 COALESCE(s.saldo_final,0)::float AS saldo_final,
                 s.col_qz::float AS col_qz,
                 COALESCE(s.carga_final,0)::float AS carga_final,
                 COALESCE(s.reembolso,0)::float AS reembolso,
                 COALESCE(s.saldo_reembolsar,0)::float AS saldo_reembolsar
          FROM quinzena_frozen_snapshots s
          LEFT JOIN quinzena_cadastro c
            ON lpad(regexp_replace(c.cpf, '\D', '', 'g'), 11, '0') = lpad(regexp_replace(s.cpf, '\D', '', 'g'), 11, '0')
          WHERE s.year = ${per.year} AND s.month = ${per.month} AND s.quinzena = ${per.quinzena}
            AND s.cpf = ANY(${cpfs})
          ORDER BY s.saldo_prestacao DESC NULLS LAST
        `
      : await sql`
          SELECT s.cpf, s.colaborador, s.regional, s.centro_custo,
                 COALESCE(NULLIF(c.situacao,''), s.situacao) AS situacao,
                 COALESCE(NULLIF(c.status_cartao,''), s.status_cartao) AS status_cartao,
                 COALESCE(s.saldo_prestacao,0)::float AS saldo_prestacao,
                 COALESCE(s.saldo_cartao,0)::float AS saldo_cartao,
                 COALESCE(s.saldo_final,0)::float AS saldo_final,
                 s.col_qz::float AS col_qz,
                 COALESCE(s.carga_final,0)::float AS carga_final,
                 COALESCE(s.reembolso,0)::float AS reembolso,
                 COALESCE(s.saldo_reembolsar,0)::float AS saldo_reembolsar
          FROM quinzena_frozen_snapshots s
          LEFT JOIN quinzena_cadastro c
            ON lpad(regexp_replace(c.cpf, '\D', '', 'g'), 11, '0') = lpad(regexp_replace(s.cpf, '\D', '', 'g'), 11, '0')
          WHERE s.year = ${per.year} AND s.month = ${per.month} AND s.quinzena = ${per.quinzena}
          ORDER BY s.saldo_prestacao DESC NULLS LAST
        `;

    // Caixas abertos vs fechados (por usuário) — relatórios "CAIXA %"
    const caixas = cpfs
      ? await sql`
          SELECT r.user_cpf AS cpf, max(r.user_name) AS nome,
                 count(*) FILTER (WHERE r.status IN ('ABERTO','ENVIADO','REABERTO'))::int AS abertos,
                 count(*) FILTER (WHERE r.status = 'APROVADO')::int AS fechados,
                 COALESCE(sum((
                   SELECT sum(e.value) FROM prestacao_expenses e WHERE e.report_id = r.id
                 )) FILTER (WHERE r.status IN ('ABERTO','ENVIADO','REABERTO')),0)::float AS valor_aberto,
                 COALESCE(sum((
                   SELECT sum(e.value) FROM prestacao_expenses e WHERE e.report_id = r.id
                 )) FILTER (WHERE r.status = 'APROVADO'),0)::float AS valor_fechado,
                 min(r.created_at) FILTER (WHERE r.status IN ('ABERTO','ENVIADO','REABERTO'))::text AS caixa_aberto_mais_antigo
          FROM prestacao_reports r
          WHERE r.name LIKE 'CAIXA %' AND r.status <> 'DELETADO'
            AND r.user_cpf = ANY(${cpfs})
          GROUP BY r.user_cpf
        `
      : await sql`
          SELECT r.user_cpf AS cpf, max(r.user_name) AS nome,
                 count(*) FILTER (WHERE r.status IN ('ABERTO','ENVIADO','REABERTO'))::int AS abertos,
                 count(*) FILTER (WHERE r.status = 'APROVADO')::int AS fechados,
                 COALESCE(sum((
                   SELECT sum(e.value) FROM prestacao_expenses e WHERE e.report_id = r.id
                 )) FILTER (WHERE r.status IN ('ABERTO','ENVIADO','REABERTO')),0)::float AS valor_aberto,
                 COALESCE(sum((
                   SELECT sum(e.value) FROM prestacao_expenses e WHERE e.report_id = r.id
                 )) FILTER (WHERE r.status = 'APROVADO'),0)::float AS valor_fechado,
                 min(r.created_at) FILTER (WHERE r.status IN ('ABERTO','ENVIADO','REABERTO'))::text AS caixa_aberto_mais_antigo
          FROM prestacao_reports r
          WHERE r.name LIKE 'CAIXA %' AND r.status <> 'DELETADO'
          GROUP BY r.user_cpf
        `;

    const caixaByCpf = new Map((caixas as any[]).map(c => [normalizeCpf(c.cpf), c]));

    // Saldos de cartão ao vivo (extrato_movimentacao is_snapshot — atualizado pela sync).
    //   saldo_cartao_carga: último snapshot até a data de fechamento da quinzena congelada (11 ou 25)
    //   saldo_cartao_hoje:  último snapshot disponível (sem corte)
    const mm = String(per.month).padStart(2, '0');
    const cargaDate = per.quinzena === 1 ? `${per.year}-${mm}-11` : `${per.year}-${mm}-25`;

    const cadastroNames = await sql`
      SELECT cpf, colaborador, situacao FROM quinzena_cadastro
    `;
    const nomeToCpf = buildNomeToCpf(cadastroNames as any[]);
    const fuzzyCache = new Map<string, string>();

    const latestSaldo = async (cutoff?: string) => {
      const rowsS = cutoff
        ? await sql`
            SELECT DISTINCT ON (UPPER(TRIM(usuario)))
              UPPER(TRIM(usuario)) AS usuario_up, COALESCE(valor, 0) AS saldo
            FROM extrato_movimentacao
            WHERE is_snapshot = TRUE AND data <= ${cutoff}
            ORDER BY UPPER(TRIM(usuario)), data DESC
          `
        : await sql`
            SELECT DISTINCT ON (UPPER(TRIM(usuario)))
              UPPER(TRIM(usuario)) AS usuario_up, COALESCE(valor, 0) AS saldo
            FROM extrato_movimentacao
            WHERE is_snapshot = TRUE
            ORDER BY UPPER(TRIM(usuario)), data DESC
          `;
      const map = new Map<string, number>();
      for (const r of rowsS as any[]) {
        const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
        const key = cpf ? normalizeCpf(cpf) : null;
        if (key) map.set(key, (map.get(key) ?? 0) + Number(r.saldo));
      }
      return map;
    };

    const [saldoCargaMap, saldoHojeMap] = await Promise.all([
      latestSaldo(cargaDate),
      latestSaldo(),
    ]);

    // "A prestar contas" AO VIVO — mesma fórmula do /api/fechamento (acumulado
    // vitalício): (cargas + transferências + taxas do extrato) − prestações de
    // contas (reports não-REPROVADO, excl. FATURA/CARTÃO e payment_method
    // 627401, valor = converted_value || value). Independe do freeze.
    const [extratoLiveRows, liveReports] = await Promise.all([
      sql`
        SELECT UPPER(TRIM(usuario)) AS usuario_up,
               COALESCE(SUM(valor) FILTER (WHERE tipo = 'Transferência' AND valor > 0), 0)::float AS carga,
               COALESCE(SUM(valor) FILTER (WHERE tipo = 'Transferência' AND valor < 0), 0)::float AS transf,
               COALESCE(SUM(valor) FILTER (WHERE tipo = 'Taxa'), 0)::float AS taxa
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
        GROUP BY UPPER(TRIM(usuario))
      `,
      sql`
        SELECT r.id, r.name, r.user_cpf
        FROM prestacao_reports r
        WHERE r.status <> 'REPROVADO' AND r.user_cpf IS NOT NULL
      `,
    ]);
    const liveReportIds = (liveReports as any[])
      .filter(r => !isFaturaOrCartao(r.name || ''))
      .map(r => r.id);
    const somaseLiveRows = liveReportIds.length
      ? await sql`
          SELECT r.user_cpf,
                 SUM(CASE
                   WHEN (e.raw_data->>'converted_value') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                     AND (e.raw_data->>'converted_value')::numeric <> 0
                   THEN (e.raw_data->>'converted_value')::numeric
                   ELSE e.value END)::float AS total
            FROM prestacao_expenses e
            JOIN prestacao_reports r ON e.report_id = r.id
            WHERE r.id = ANY(${liveReportIds})
              AND COALESCE(e.raw_data->>'payment_method_id', '') <> '627401'
            GROUP BY r.user_cpf
        `
      : [];

    const pendenteLiveByCpf = new Map<string, number>();
    for (const r of extratoLiveRows as any[]) {
      const cpf = resolveCpfByName(String(r.usuario_up), nomeToCpf, fuzzyCache);
      const key = cpf ? normalizeCpf(cpf) : null;
      if (key) pendenteLiveByCpf.set(key, (pendenteLiveByCpf.get(key) ?? 0) + r.carga + r.transf + r.taxa);
    }
    for (const r of somaseLiveRows as any[]) {
      const key = r.user_cpf ? normalizeCpf(String(r.user_cpf)) : null;
      if (key) pendenteLiveByCpf.set(key, (pendenteLiveByCpf.get(key) ?? 0) - (r.total ?? 0));
    }

    // Consolida por colaborador
    const rows = (saldos as any[]).map(s => {
      const c = caixaByCpf.get(normalizeCpf(s.cpf));
      const diasAberto = c?.caixa_aberto_mais_antigo
        ? Math.floor((Date.now() - new Date(c.caixa_aberto_mais_antigo).getTime()) / 86400000)
        : null;
      const alertas: string[] = [];
      const qz = s.col_qz ?? 0;
      const sit = (s.situacao || '').toUpperCase();
      const card = (s.status_cartao || '').toUpperCase();
      const inativo = sit.includes('INATIVO') || sit.includes('DESLIGAD') ||
        sit.includes('SUSPENSO') || sit.includes('APOSENTADORIA') || sit.includes('PERICIA') ||
        card.includes('INATIV') || card.includes('CANCEL');
      // Inativo ainda segurando dinheiro — gestor precisa agir (prestar contas / reembolsar / cartão)
      if (inativo && (s.saldo_prestacao > 0 || s.saldo_cartao > 0 || s.saldo_reembolsar > 0)) {
        alertas.push('inativo_com_saldo');
      }
      // Deve prestação de contas e o cartão está quase zerado → gastou sem prestar
      if (s.saldo_prestacao >= 500 && s.saldo_cartao < s.saldo_prestacao * 0.3) {
        alertas.push('prestacao_pendente');
      }
      // Valor significativo parado no cartão (≥ metade da quinzena, ou sem quinzena)
      if (s.saldo_cartao >= 500 && (qz <= 0 || s.saldo_cartao >= qz * 0.5)) {
        alertas.push('cartao_parado');
      }
      // Empresa deve a ele mais do que a quinzena que ele recebe (mín. R$200)
      if (s.saldo_reembolsar > Math.max(qz, 200)) {
        alertas.push('reembolso_maior_quinzena');
      }
      return {
        cpf: s.cpf,
        colaborador: s.colaborador,
        regional: s.regional,
        centro_custo: s.centro_custo,
        situacao: s.situacao,
        status_cartao: s.status_cartao,
        saldo_prestacao: s.saldo_prestacao,
        saldo_prestacao_hoje: pendenteLiveByCpf.get(normalizeCpf(s.cpf) ?? '') ?? null,
        saldo_cartao: s.saldo_cartao,
        saldo_cartao_carga: saldoCargaMap.get(normalizeCpf(s.cpf) ?? '') ?? 0,
        saldo_cartao_hoje: saldoHojeMap.get(normalizeCpf(s.cpf) ?? '') ?? 0,
        saldo_final: s.saldo_final,
        col_qz: s.col_qz,
        carga_final: s.carga_final,
        reembolso: s.reembolso,
        saldo_reembolsar: s.saldo_reembolsar,
        alertas,
        caixas_abertos: c?.abertos ?? 0,
        caixas_fechados: c?.fechados ?? 0,
        valor_aberto: c?.valor_aberto ?? 0,
        valor_fechado: c?.valor_fechado ?? 0,
        dias_caixa_aberto: diasAberto,
      };
    });

    // KPIs globais
    const tot = rows.reduce((acc, r) => ({
      prestacao: acc.prestacao + r.saldo_prestacao,
      cartao: acc.cartao + r.saldo_cartao,
      cartaoHoje: acc.cartaoHoje + r.saldo_cartao_hoje,
      caixasAbertos: acc.caixasAbertos + r.caixas_abertos,
      valorAberto: acc.valorAberto + r.valor_aberto,
      reembolsar: acc.reembolsar + r.saldo_reembolsar,
      cargaQZ: acc.cargaQZ + r.carga_final,
      comCargaQZ: acc.comCargaQZ + (r.carga_final > 0 ? 1 : 0),
      pessoasComSaldo: acc.pessoasComSaldo + (r.saldo_prestacao > 0 ? 1 : 0),
      pessoasComCaixaAberto: acc.pessoasComCaixaAberto + (r.caixas_abertos > 0 ? 1 : 0),
      pessoasReembolsar: acc.pessoasReembolsar + (r.saldo_reembolsar > 0 ? 1 : 0),
      pessoasAlerta: acc.pessoasAlerta + (r.alertas.length > 0 ? 1 : 0),
    }), { prestacao: 0, cartao: 0, cartaoHoje: 0, caixasAbertos: 0, valorAberto: 0, reembolsar: 0, cargaQZ: 0, comCargaQZ: 0, pessoasComSaldo: 0, pessoasComCaixaAberto: 0, pessoasReembolsar: 0, pessoasAlerta: 0 });

    // Aging: caixas abertos mais antigos
    const aging = rows
      .filter(r => r.dias_caixa_aberto !== null && r.dias_caixa_aberto > 30)
      .sort((a, b) => (b.dias_caixa_aberto ?? 0) - (a.dias_caixa_aberto ?? 0))
      .slice(0, 15);

    return NextResponse.json({
      periodo: { year: per.year, month: per.month, quinzena: per.quinzena },
      kpis: {
        saldoPrestacao: tot.prestacao,
        saldoCartao: tot.cartao,
        saldoCartaoHoje: tot.cartaoHoje,
        caixasAbertos: tot.caixasAbertos,
        valorCaixasAbertos: tot.valorAberto,
        saldoReembolsar: tot.reembolsar,
        cargaQuinzena: tot.cargaQZ,
        pessoasComCarga: tot.comCargaQZ,
        pessoasComSaldo: tot.pessoasComSaldo,
        pessoasComCaixaAberto: tot.pessoasComCaixaAberto,
        pessoasReembolsar: tot.pessoasReembolsar,
        pessoasAlerta: tot.pessoasAlerta,
        colaboradores: rows.length,
      },
      rows,
      aging,
    });
  } catch (e) {
    console.error('[posicao-caixa]', e);
    return NextResponse.json({ error: 'Erro ao carregar posição de caixa' }, { status: 500 });
  }
}
