import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';

export const dynamic = 'force-dynamic';

// "A conferir" = reports PARCIAIS na tela Agilitas (lançamento iniciado,
// aguardando conferência) — conta TODOS os meios de pagamento.
// "A lançar" (SIGA) = reports meipag='V' PENDENTE + PARCIAL — a fila de
// lançamento do Protheus só cobre os caixas VExpenses.
// Ambos somam o valor TOTAL do caixa (não só itens pendentes).
// A tabela lista só a fila acionável: PARCIAIS (todos os meios) + caixas VEX.
// Itaú PENDENTE é backlog histórico fora da fila SIGA — não entra na lista.

interface ReportRow {
  idagil: string;
  state: string;
  meipag: string | null;
  dtemis: string | null;
  total: number | string | null;
  item_count: number | null;
  pending: number | null;
  launched: number | null;
  finished: number | null;
  user_id: string | null;
  synced_at: string;
  nome: string | null;
  usuario: string | null;
}

function bucket(rows: ReportRow[], pred: (r: ReportRow) => boolean) {
  const sel = rows.filter(pred);
  return {
    count: sel.length,
    valor: sel.reduce((s, r) => s + (Number(r.total) || 0), 0),
  };
}

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });
  }

  try {
    const reports: ReportRow[] = await sql`
      SELECT r.idagil, r.state, r.meipag, r.dtemis, r.total,
             r.item_count, r.pending, r.launched, r.finished, r.user_id,
             r.synced_at,
             p.name AS nome, p.user_name AS usuario
      FROM z01.totvs_reports r
      LEFT JOIN public.prestacao_reports p ON p.id::text = r.idagil
      WHERE r.state IN ('PENDENTE','PARCIAL')
        AND (r.state = 'PARCIAL' OR r.meipag = 'V')
      ORDER BY r.state, r.total DESC NULLS LAST
    `;

    const conferir = {
      total: bucket(reports, (r) => r.state === 'PARCIAL'),
      itau: bucket(reports, (r) => r.state === 'PARCIAL' && r.meipag === 'I'),
      vex: bucket(reports, (r) => r.state === 'PARCIAL' && r.meipag === 'V'),
      outros: bucket(reports, (r) => r.state === 'PARCIAL' && r.meipag !== 'I' && r.meipag !== 'V'),
    };
    const lancar = {
      total: bucket(reports, (r) => r.meipag === 'V'),
      pendente: bucket(reports, (r) => r.meipag === 'V' && r.state === 'PENDENTE'),
      parcial: bucket(reports, (r) => r.meipag === 'V' && r.state === 'PARCIAL'),
    };
    // SDS — notas pendentes de lançamento no setor contábil (fila derivada
    // pelo worker: setor '2' = "Situação Processo: Contábil" do monitor SDS).
    // Demais setores são etapas anteriores do fluxo ou backlog histórico.
    const sdsResumo = await sql`
      SELECT empresa, classificacao,
             COUNT(*) AS count,
             COALESCE(SUM(valmerc), 0) AS valmerc,
             COALESCE(SUM(total_nf), 0) AS total_nf
      FROM z01.totvs_sds_notas
      WHERE status = 'P' AND fila = 'CONTABIL'
      GROUP BY empresa, classificacao
      ORDER BY empresa, classificacao
    `;

    const sdsNotas = await sql`
      SELECT nota_key, empresa, classificacao, doc, serie,
             nomefor, cnpj, emissa, pvenc, valmerc, total_nf, chavenf
      FROM z01.totvs_sds_notas
      WHERE status = 'P' AND fila = 'CONTABIL'
      ORDER BY emissa DESC NULLS LAST
    `;

    const syncedAt = reports.length
      ? reports.reduce((m, r) => (r.synced_at > m ? r.synced_at : m), reports[0].synced_at)
      : null;

    return NextResponse.json({
      geradoEm: new Date().toISOString(),
      syncedAt,
      agilitas: { conferir, lancar },
      reports: reports.map((r) => ({
        idagil: r.idagil,
        state: r.state,
        meipag: r.meipag,
        dtemis: r.dtemis,
        total: Number(r.total) || 0,
        itemCount: r.item_count ?? 0,
        pending: r.pending ?? 0,
        launched: r.launched ?? 0,
        finished: r.finished ?? 0,
        userId: r.user_id,
        nome: r.nome,
        usuario: r.usuario,
      })),
      sds: {
        resumo: sdsResumo.map((r: any) => ({
          empresa: r.empresa,
          classificacao: r.classificacao,
          count: Number(r.count),
          valmerc: Number(r.valmerc),
          totalNf: Number(r.total_nf),
        })),
        notas: sdsNotas.map((n: any) => ({
          key: n.nota_key,
          empresa: n.empresa,
          classificacao: n.classificacao,
          doc: n.doc,
          serie: n.serie,
          fornecedor: n.nomefor,
          cnpj: n.cnpj,
          emissao: n.emissa,
          vencimento: n.pvenc,
          valmerc: Number(n.valmerc) || 0,
          totalNf: Number(n.total_nf) || 0,
          chaveNf: n.chavenf,
        })),
      },
    });
  } catch (error) {
    console.error('[API Pendencias] Erro:', error);
    return NextResponse.json({ error: 'Erro ao buscar pendências' }, { status: 500 });
  }
}
