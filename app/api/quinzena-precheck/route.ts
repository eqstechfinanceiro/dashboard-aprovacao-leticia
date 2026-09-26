import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';

export const dynamic = 'force-dynamic';

// ---- Pré-freeze checklist ----------------------------------------------------
// Roda uma bateria de validações antes de congelar a quinzena e devolve uma
// lista de checks com severidade (ok | warn | error). O freeze em si continua
// em /api/quinzena-freeze — este endpoint apenas informa os riscos.
//
// severity:
//   error → bloqueia o freeze (can_freeze = false)
//   warn  → permite, mas exige confirmação explícita na UI
//   ok    → tudo certo

type Severity = 'ok' | 'warn' | 'error';

interface PrecheckItem {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  items?: string[];
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtAgo = (iso: string | null | undefined): string => {
  if (!iso) return 'nunca';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'agora mesmo';
  if (ms < 3_600_000) return `há ${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `há ${(ms / 3_600_000).toFixed(1)} h`;
  return `há ${(ms / 86_400_000).toFixed(1)} dias`;
};

const minutesAgo = (iso: string | null | undefined): number =>
  iso ? (Date.now() - new Date(iso).getTime()) / 60_000 : Infinity;

export async function GET(request: NextRequest) {
  if (!sql) {
    return NextResponse.json({ error: 'Banco de dados nao configurado' }, { status: 503 });
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

  const checks: PrecheckItem[] = [];

  try {
    // 1. Já congelada? — bloqueio
    const frozen = await sql`
      SELECT COUNT(*) AS cnt, MIN(frozen_at) AS frozen_at
      FROM quinzena_frozen_snapshots
      WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
    `;
    if (Number(frozen[0].cnt) > 0) {
      checks.push({
        id: 'ja_congelada',
        severity: 'error',
        title: 'Quinzena já congelada',
        detail: `Este período já foi congelado em ${new Date(frozen[0].frozen_at).toLocaleString('pt-BR')} (${frozen[0].cnt} linhas). Descongele antes se precisar refazer.`,
      });
      return NextResponse.json({ can_freeze: false, checks });
    }

    // 2. Dados calculados — mesma fonte que o freeze usa
    const baseUrl = new URL(request.url).origin;
    const apiRes = await fetch(
      `${baseUrl}/api/quinzena-complete?year=${year}&month=${month}&quinzena=${quinzena}&forceCalc=true`,
      { headers: { cookie: request.headers.get('cookie') || '' } }
    );
    if (!apiRes.ok) {
      return NextResponse.json(
        { error: 'Falha ao calcular dados da quinzena para o pré-check' },
        { status: 500 }
      );
    }
    const apiData = await apiRes.json();
    const rows: any[] = apiData.data || [];

    if (rows.length === 0) {
      checks.push({
        id: 'sem_dados',
        severity: 'error',
        title: 'Nenhum dado calculado',
        detail: 'A quinzena retornou 0 linhas — provavelmente o cadastro está vazio ou o sync nunca rodou.',
      });
      return NextResponse.json({ can_freeze: false, checks });
    }
    checks.push({
      id: 'dados_ok',
      severity: 'ok',
      title: `${rows.length} colaboradores na base`,
      detail: `${apiData.statistics?.ativos ?? 0} ativos · ${apiData.statistics?.com_carga ?? 0} com carga calculada`,
    });

    // 3. Queries auxiliares (paralelo)
    const [hotRun, warmRun, hotOk, warmOk, cadastroUpd, pendingExp, extratoMax, snapshotMax] = await Promise.all([
      sql`SELECT status, finished_at FROM sync_runs WHERE kind = 'hot'  ORDER BY id DESC LIMIT 1`,
      sql`SELECT status, finished_at FROM sync_runs WHERE kind = 'warm' ORDER BY id DESC LIMIT 1`,
      sql`SELECT finished_at FROM sync_runs WHERE kind = 'hot'  AND status = 'done' ORDER BY id DESC LIMIT 1`,
      sql`SELECT finished_at FROM sync_runs WHERE kind = 'warm' AND status = 'done' ORDER BY id DESC LIMIT 1`,
      sql`SELECT MAX(updated_at) AS last_upd FROM quinzena_cadastro`,
      sql`
        SELECT COUNT(*) AS despesas, COUNT(DISTINCT r.id) AS relatorios,
               COALESCE(SUM(e.value), 0)::text AS total
        FROM prestacao_reports r
        JOIN prestacao_expenses e ON e.report_id = r.id
        WHERE r.user_cpf IS NOT NULL
          AND r.name NOT ILIKE '%FATURA%'
          AND r.name NOT ILIKE '%CARTAO%'
          AND r.name NOT ILIKE '%CARTÃO%'
          AND r.status NOT ILIKE 'Aprovado'
          AND r.status NOT ILIKE 'Enviado'
          AND r.status NOT ILIKE 'Deletado'
      `,
      sql`SELECT MAX(data)::text AS max_data FROM extrato_movimentacao WHERE is_snapshot = FALSE`,
      sql`SELECT MAX(data)::text AS max_data FROM extrato_movimentacao WHERE is_snapshot = TRUE`,
    ]);

    // 3a. Sync VExpenses recente (HOT roda a cada 5 min)
    // Bloqueia só se não há um 'done' recente — um erro transitório no último
    // ciclo vira warn, não bloqueio, se o sync bem-sucedido é fresco.
    const hot = hotRun[0];
    const hotOkMin = minutesAgo(hotOk[0]?.finished_at);
    if (!hot || hotOkMin > 60) {
      checks.push({
        id: 'sync_hot',
        severity: 'error',
        title: 'Sync de despesas quebrado ou muito antigo',
        detail: !hot
          ? 'Nenhum ciclo HOT registrado — o worker pode estar parado.'
          : `Último sync bem-sucedido ${fmtAgo(hotOk[0]?.finished_at)}${hot.status === 'error' ? ' e o ciclo mais recente terminou em ERRO' : ''} — rode "Sincronizar VExpenses" antes de congelar.`,
      });
    } else if (hot.status === 'error') {
      checks.push({
        id: 'sync_hot',
        severity: 'warn',
        title: 'Último ciclo de sync falhou',
        detail: `O ciclo mais recente terminou em erro, mas há um sync OK ${fmtAgo(hotOk[0]?.finished_at)}. Verifique se os dados estão completos.`,
      });
    } else if (hotOkMin > 15) {
      checks.push({
        id: 'sync_hot',
        severity: 'warn',
        title: 'Sync de despesas defasado',
        detail: `Última sincronização ${fmtAgo(hotOk[0]?.finished_at)} — idealmente congele logo após um sync.`,
      });
    } else {
      checks.push({ id: 'sync_hot', severity: 'ok', title: 'Sync de despesas atualizado', detail: `Último ciclo ${fmtAgo(hotOk[0]?.finished_at)}` });
    }

    // 3b. Sync do extrato do cartão (WARM roda a cada 45 min)
    const warm = warmRun[0];
    const warmOkMin = minutesAgo(warmOk[0]?.finished_at);
    if (!warm || warmOkMin > 180) {
      checks.push({
        id: 'sync_warm',
        severity: 'error',
        title: 'Sync do extrato quebrado ou muito antigo',
        detail: !warm
          ? 'Nenhum ciclo WARM registrado — o worker pode estar parado.'
          : `Último sync bem-sucedido ${fmtAgo(warmOk[0]?.finished_at)}${warm.status === 'error' ? ' e o ciclo mais recente terminou em ERRO' : ''} — o saldo de cartão pode estar errado.`,
      });
    } else if (warm.status === 'error') {
      checks.push({
        id: 'sync_warm',
        severity: 'warn',
        title: 'Último ciclo do extrato falhou',
        detail: `O ciclo mais recente terminou em erro, mas há um sync OK ${fmtAgo(warmOk[0]?.finished_at)}.`,
      });
    } else if (warmOkMin > 60) {
      checks.push({
        id: 'sync_warm',
        severity: 'warn',
        title: 'Sync do extrato defasado',
        detail: `Última atualização ${fmtAgo(warmOk[0]?.finished_at)}.`,
      });
    } else {
      checks.push({ id: 'sync_warm', severity: 'ok', title: 'Extrato do cartão atualizado', detail: `Último ciclo ${fmtAgo(warmOk[0]?.finished_at)}` });
    }

    // 3c. Cobertura do extrato vs data de fechamento
    const maxMov = extratoMax[0]?.max_data ? String(extratoMax[0].max_data).slice(0, 10) : null;
    const maxSnap = snapshotMax[0]?.max_data ? String(snapshotMax[0].max_data).slice(0, 10) : null;
    const hoje = new Date().toISOString().slice(0, 10);
    const fimRef = apiData.period?.end_date && apiData.period.end_date < hoje ? apiData.period.end_date : hoje;
    if (maxSnap && maxSnap < fimRef) {
      checks.push({
        id: 'extrato_cobertura',
        severity: 'warn',
        title: 'Extrato pode estar incompleto',
        detail: `Último snapshot de saldo é de ${maxSnap.split('-').reverse().join('/')} e o período vai até ${fimRef.split('-').reverse().join('/')}. Transações recentes podem faltar.`,
      });
    } else {
      checks.push({
        id: 'extrato_cobertura',
        severity: 'ok',
        title: 'Extrato cobre o período',
        detail: `Última movimentação: ${(maxMov ?? '?').split('-').reverse().join('/')} · último snapshot: ${(maxSnap ?? '?').split('-').reverse().join('/')}`,
      });
    }

    // 3d. Cadastro atualizado
    const lastCadastro = cadastroUpd[0]?.last_upd;
    if (minutesAgo(lastCadastro) > 30 * 24 * 60) {
      checks.push({
        id: 'cadastro',
        severity: 'warn',
        title: 'Cadastro desatualizado',
        detail: `Última atualização do cadastro ${fmtAgo(lastCadastro)} — confirme se gestor/CC estão corretos.`,
      });
    } else {
      checks.push({ id: 'cadastro', severity: 'ok', title: 'Cadastro recente', detail: `Atualizado ${fmtAgo(lastCadastro)}` });
    }

    // 3e. Despesas pendentes de aprovação (prestação ainda pode mudar)
    const pendCount = Number(pendingExp[0]?.despesas || 0);
    const pendReports = Number(pendingExp[0]?.relatorios || 0);
    const pendTotal = Number(pendingExp[0]?.total || 0);
    if (pendCount > 0) {
      checks.push({
        id: 'despesas_pendentes',
        severity: 'warn',
        title: `${pendCount} despesas ainda não aprovadas`,
        detail: `${pendReports} relatórios não-finalizados somando ${fmtBRL(pendTotal)} — a prestação desses colaboradores pode mudar depois do freeze.`,
      });
    } else {
      checks.push({ id: 'despesas_pendentes', severity: 'ok', title: 'Nenhuma despesa pendente de aprovação' });
    }

    // 4. Checks derivados dos dados calculados
    const ativos = rows.filter((r) => r.situacao?.toUpperCase() === 'ATIVO');

    // 4a. Planilha de carga importada?
    const totalQz = Number(apiData.statistics?.total_col_qz || 0);
    const ativosSemQz = ativos.filter((r) => r.col_qz_manual === null);
    if (totalQz === 0) {
      checks.push({
        id: 'qz_import',
        severity: 'error',
        title: 'Nenhuma carga importada (planilha QZ ausente)',
        detail: `Nenhum colaborador tem valor na coluna QZ desta quinzena — use "Importar QZ" antes de congelar, senão todas as cargas saem zeradas.`,
      });
    } else if (ativosSemQz.length > 0) {
      checks.push({
        id: 'qz_parcial',
        severity: 'warn',
        title: `${ativosSemQz.length} ativos sem valor na coluna QZ`,
        detail: `Carga total da quinzena: ${fmtBRL(totalQz)}. Ativos sem QZ saem com carga calculada a partir dos saldos.`,
        items: ativosSemQz.slice(0, 8).map((r) => r.colaborador || r.cpf),
      });
    } else {
      checks.push({ id: 'qz_import', severity: 'ok', title: 'Coluna QZ importada', detail: `Carga total: ${fmtBRL(totalQz)}` });
    }

    // 4b. Gestores faltantes
    const semGestor = ativos.filter((r) => !r.gestor);
    if (semGestor.length > 0) {
      checks.push({
        id: 'gestor',
        severity: 'warn',
        title: `${semGestor.length} ativos sem gestor`,
        detail: 'Sem gestor, esses colaboradores ficam fora do escopo de visão dos gestores.',
        items: semGestor.slice(0, 8).map((r) => r.colaborador || r.cpf),
      });
    } else {
      checks.push({ id: 'gestor', severity: 'ok', title: 'Todos os ativos têm gestor' });
    }

    // 4c. Extrato sem cadastro (dinheiro fora do cálculo)
    const unresolved: { nome: string; net: number }[] = apiData.unresolved_extrato || [];
    if (unresolved.length > 0) {
      const netTotal = unresolved.reduce((s, u) => s + Math.abs(u.net), 0);
      checks.push({
        id: 'extrato_sem_cpf',
        severity: 'warn',
        title: `${unresolved.length} nomes do extrato sem cadastro`,
        detail: `${fmtBRL(netTotal)} em movimentações fora do cálculo — mapear esses nomes evita erro no saldo.`,
        items: unresolved.slice(0, 8).map((u) => `${u.nome} (${fmtBRL(u.net)})`),
      });
    } else {
      checks.push({ id: 'extrato_sem_cpf', severity: 'ok', title: 'Todo o extrato mapeado para CPFs' });
    }

    // 4d. Inativos com saldo
    const inativosComSaldo = rows.filter(
      (r) => r.situacao && r.situacao.toUpperCase() !== 'ATIVO' && (r.saldo_final || 0) > 0.01
    );
    if (inativosComSaldo.length > 0) {
      const total = inativosComSaldo.reduce((s, r) => s + r.saldo_final, 0);
      checks.push({
        id: 'inativos_saldo',
        severity: 'warn',
        title: `${inativosComSaldo.length} inativos com saldo`,
        detail: `${fmtBRL(total)} parados em colaboradores inativos/desligados.`,
        items: inativosComSaldo.slice(0, 8).map((r) => `${r.colaborador || r.cpf} (${fmtBRL(r.saldo_final)})`),
      });
    } else {
      checks.push({ id: 'inativos_saldo', severity: 'ok', title: 'Nenhum inativo com saldo' });
    }

    // 4e. Cartões pendentes de emissão
    const cartaoPendente = ativos.filter((r) => (r.status_cartao || '').toLowerCase().includes('pendente'));
    if (cartaoPendente.length > 0) {
      checks.push({
        id: 'cartao_pendente',
        severity: 'warn',
        title: `${cartaoPendente.length} ativos com cartão pendente`,
        detail: 'Carga zerada automaticamente para quem tem cartão pendente.',
        items: cartaoPendente.slice(0, 8).map((r) => r.colaborador || r.cpf),
      });
    }

    const errors = checks.filter((c) => c.severity === 'error').length;
    const warnings = checks.filter((c) => c.severity === 'warn').length;

    return NextResponse.json({
      can_freeze: errors === 0,
      summary: { errors, warnings, oks: checks.length - errors - warnings },
      checks,
      period: apiData.period,
      generated_at: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[quinzena-precheck] Erro:', error);
    return NextResponse.json(
      { error: 'Erro no pré-check', detail: String(error) },
      { status: 500 }
    );
  }
}
