import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { apiCache } from '@/lib/db/neon-cache';
import { getScopeForRequest, normalizeName as scopeNormalizeName } from '@/lib/auth/scope';
import { isFaturaOrCartao } from '@/lib/rules/report-filters';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// ---- Types ------------------------------------------------------------------

interface ExtratoRow {
  data: string;
  hora: string;
  codigo_transacao: string;
  usuario: string;
  tipo: string;
  descricao: string;
  valor: number;
  is_snapshot: boolean;
}

interface PrestacaoRow {
  despesa_id: number;
  relatorio_id: number;
  nome_relatorio: string;
  data: string;
  nome_membro: string;
  cpf: string;
  status: string;
  descricao_despesa: string;
  tipo_despesa: string;
  reembolsavel: string;
  anotacao: string;
  centro_custos: string;
  forma_pagamento: string;
  projeto: string;
  percentual_projeto: number;
  moeda_relatorio: string;
  valor: number;
  valor_total: number;
  ultrapassou_politica: string;
}

interface MonthAggregation {
  ano: number;
  mes: string;
  carga: number;
  transferencia: number;
  taxa: number;
  prestacao_contas: number;
  saldo: number;
  acumulado: number;
}

interface FechoResponse {
  colaborador: string;
  cpf: string | null;
  extrato: ExtratoRow[];
  prestacaoContas: PrestacaoRow[];
  fechamento: MonthAggregation[];
  resumo: {
    saldoFinal: number;
    saldoDisponivel: number;
    prestacaoContas: number;
    fechamentoPrestacao: number;
    saldoCartao: number;
    fechamentoFinal: number;
  };
  statusPanel: {
    aberto: number;
    enviado: number;
    aprovado: number;
    totalGeral: number;
  };
  cartaoExcluido: { despesas: number; total: number };
  caixas: {
    fechados: { nome: string; valor: number; status: string }[];
    emAprovacao: { nome: string; valor: number; status: string }[];
    abertos: { nome: string; valor: number; status: string }[];
    totalFechados: number;
    totalEmAprovacao: number;
    totalAbertos: number;
  };
  exportadoEm: string;
}

// ---- Helpers ----------------------------------------------------------------

const MESES_PT = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

function getMesNome(dateStr: string): string {
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length >= 2) {
    return MESES_PT[parseInt(parts[1], 10) - 1];
  }
  return MESES_PT[new Date(dateStr).getMonth()];
}

function getAno(dateStr: string): number {
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length >= 1) {
    return parseInt(parts[0], 10);
  }
  return new Date(dateStr).getFullYear();
}

// Parse report period from report name (e.g. "CAIXA 02/2026" -> { ano: 2026, mes: 'FEVEREIRO' })
// Falls back to expense date if name doesn't contain MM/YYYY pattern
function getReportPeriodFromDate(reportName: string, fallbackDate: string): { ano: number; mes: string } {
  const period = getReportPeriod(reportName);
  if (period) return period;
  return { ano: getAno(fallbackDate), mes: getMesNome(fallbackDate) };
}

// payment_method_id → descrição, espelho de GET /v3/payment-methods da conta.
// O raw_data da despesa guarda só o id — sem este mapa a coluna sai vazia.
const PAYMENT_METHODS: Record<string, string> = {
  '627401': 'Cartão Corporativo Itaú',
  '627508': 'Cartão VExpenses',
  '627721': 'Saque VExpenses',
  '627726': 'Desconto Colaborador',
  '627741': 'Tarifa de Saque',
  '630113': 'Recurso Próprio',
  '668240': 'Pix VExpenses',
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Prepositions/articles that should be ignored when matching name parts
const NAME_STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os']);

// Extract all significant name parts (excluding prepositions/articles)
// e.g. "Everson Esteves dos Santos" -> ["everson", "esteves", "santos"]
function getSignificantNameParts(fullName: string): string[] {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  return parts.filter(p => p.length > 1 && !NAME_STOPWORDS.has(p));
}

// Filters extrato rows to those belonging to `colaboradorName`.
// Strict: all significant name parts must appear in `usuario`.
// Fallback (safe): when strict match finds nothing (e.g. card holder name
// registered differently in VExpenses — "Francielly Felix Cavalcante de
// Andrade" vs extrato "Francielly Cavalcante Santos de Andrade"), pick the
// usuario that shares the FIRST name and the most parts — only if it's a
// unique winner. Never risks merging two different people.
function matchExtratoUsuario<T extends { usuario?: string | null }>(
  candidateRows: T[],
  colaboradorName: string,
  context: string
): T[] {
  const significantParts = getSignificantNameParts(colaboradorName);
  const normalizedParts = significantParts.map(p => p.toLowerCase());
  const firstName = normalizedParts[0] || normalizeName(colaboradorName).split(' ')[0];

  // Strict: require ALL significant parts
  let rows = candidateRows.filter(row => {
    const usuarioLower = (row.usuario || '').toLowerCase();
    return normalizedParts.every(p => usuarioLower.includes(p));
  });
  if (rows.length > 0) return rows;

  // Fallback: first name must match + best part score + unique winner
  if (normalizedParts.length >= 2 && firstName) {
    const scored = new Map<string, { score: number; rows: T[] }>();
    for (const r of candidateRows) {
      const u = (r.usuario || '').toLowerCase().trim();
      const uParts = new Set(getSignificantNameParts(r.usuario || ''));
      if (!uParts.has(firstName)) continue;
      let score = 0;
      for (const p of normalizedParts) if (uParts.has(p)) score++;
      const cur = scored.get(u) || { score: 0, rows: [] };
      cur.score = Math.max(cur.score, score);
      cur.rows.push(r);
      scored.set(u, cur);
    }
    let best = '';
    let bestScore = 0;
    let tie = false;
    for (const [u, entry] of scored) {
      if (entry.score > bestScore) { bestScore = entry.score; best = u; tie = false; }
      else if (entry.score === bestScore) { tie = true; }
    }
    // Require: majority of parts + strictly unique winner
    if (best && !tie && bestScore >= Math.max(2, Math.ceil(normalizedParts.length / 2))) {
      console.warn(`[Fechamento] ${context}: fallback de nome "${colaboradorName}" -> "${best}" (score ${bestScore}/${normalizedParts.length})`);
      return scored.get(best)!.rows;
    }
    console.warn(`[Fechamento] ${context}: nenhum match seguro para "${colaboradorName}" (partes: ${normalizedParts.join(', ')})`);
  }
  return [];
}

// Parse report name to extract month/year (e.g. "CAIXA 10/2025" -> {ano: 2025, mes: 'OUTUBRO'})
// Returns null if name doesn't contain a MM/YYYY pattern
function getReportPeriod(reportName: string): { ano: number; mes: string } | null {
  const match = reportName.match(/(\d{1,2})\s*\/\s*(\d{4})/);
  if (!match) return null;
  const mesNum = parseInt(match[1], 10);
  const ano = parseInt(match[2], 10);
  if (mesNum < 1 || mesNum > 12) return null;
  return { ano, mes: MESES_PT[mesNum - 1] };
}

// ---- API Route ---------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const userName = searchParams.get('userName');

  if (!userId && !userName) {
    return NextResponse.json(
      { error: 'Parâmetro userId ou userName é obrigatório' },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch team member info to get name + CPF
    let colaboradorName = userName || '';
    let colaboradorCpf: string | null = null;
    let colaboradorId: number | null = userId ? parseInt(userId) : null;

    // Same canonical cache key as /api/vexpenses/team-members (include=null) —
    // a separate key caused stale divergent snapshots and false "não encontrado".
    const cacheKey = 'team-members:null';
    const cachedTM = await apiCache.get<any>(cacheKey);
    let teamMembers: any[] = [];

    if (cachedTM?.data) {
      teamMembers = cachedTM.data;
    } else {
      const tmResponse = await fetch(`${API_URL}/v2/team-members`, {
        headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(120000),
      });
      if (tmResponse.ok) {
        const tmData = await tmResponse.json();
        teamMembers = tmData.data || [];
        await apiCache.set(cacheKey, tmData, 10 * 60 * 1000);
      }
    }

    // Find the team member
    let teamMember: any = null;
    if (colaboradorId) {
      teamMember = teamMembers.find((m: any) => m.id === colaboradorId);
    }
    if (!teamMember && userName) {
      const normalized = normalizeName(userName);
      teamMember = teamMembers.find((m: any) => normalizeName(m.name) === normalized);
      if (!teamMember) {
        teamMember = teamMembers.find((m: any) => normalizeName(m.name).includes(normalized));
      }
    }

    // Not in the cached list (e.g. member created minutes ago) — fetch directly by id
    if (!teamMember && colaboradorId !== null && Number.isFinite(colaboradorId)) {
      try {
        const singleRes = await fetch(`${API_URL}/v2/team-members/${colaboradorId}`, {
          headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(30000),
        });
        if (singleRes.ok) {
          const singleData = await singleRes.json();
          teamMember = singleData?.data || null;
          if (teamMember) {
            console.log(`[Fechamento] member ${colaboradorId} fetched directly (absent from cached list)`);
          }
        }
      } catch (singleErr) {
        console.error('[Fechamento] direct member fetch failed:', singleErr);
      }
    }

    if (teamMember) {
      colaboradorName = teamMember.name;
      colaboradorCpf = teamMember.cpf ? String(teamMember.cpf) : null;
      colaboradorId = teamMember.id;
    }

    // Escopo de gestor: só permite consultar membros do próprio escopo
    const scope = await getScopeForRequest(request);
    if (scope) {
      const inScope =
        (colaboradorId !== null && scope.memberIds.has(colaboradorId)) ||
        (colaboradorName !== '' && scope.names.has(scopeNormalizeName(colaboradorName))) ||
        (colaboradorCpf !== null && scope.cpfs.has(colaboradorCpf.replace(/\D/g, '').padStart(11, '0')));
      if (!inScope) {
        return NextResponse.json(
          { error: 'Colaborador fora do seu escopo de gestão' },
          { status: 403 }
        );
      }
    }

    if (!colaboradorName) {
      return NextResponse.json(
        { error: 'Colaborador não encontrado' },
        { status: 404 }
      );
    }

    // 2. Fetch EXTRATO from Neon DB (extrato_movimentacao)
    // Use ALL significant name parts to avoid mixing users with same first/last name
    let extratoRows: ExtratoRow[] = [];
    if (sql) {
      try {
        const significantParts = getSignificantNameParts(colaboradorName);
        // Strategy 1: Require ALL significant name parts to match
        // e.g. "Everson Esteves dos Santos" -> WHERE usuario ILIKE '%everson%' AND ILIKE '%esteves%' AND ILIKE '%santos%'
        if (significantParts.length >= 2) {
          // Build dynamic WHERE with all parts — use tagged template with AND conditions
          // We can't easily do dynamic AND with neon tagged templates, so we fetch a superset
          // and filter in JS. But for 2-3 parts, we can construct the query.
          // Actually, neon supports building queries with .append() or we can use raw SQL.
          // Simplest: fetch by first part, then filter in JS by all parts.
          const firstPart = significantParts[0];
          const candidateRows = await sql`
            SELECT
              data::text as data,
              hora,
              codigo_transacao,
              usuario,
              tipo,
              descricao,
              valor,
              is_snapshot
            FROM extrato_movimentacao
            WHERE unaccent(usuario) ILIKE unaccent(${'%' + firstPart + '%'})
              AND is_snapshot = false
            ORDER BY data ASC, hora ASC
          `;
          // Strict all-parts match, with safe first-name fallback
          extratoRows = matchExtratoUsuario(candidateRows as ExtratoRow[], colaboradorName, 'extrato');

          // Verify uniqueness: if multiple distinct usuario names matched, log a warning
          if (extratoRows.length > 0) {
            const distinctUsers = new Set(extratoRows.map(r => r.usuario?.toLowerCase().trim()));
            if (distinctUsers.size > 1) {
              console.warn(`[Fechamento] Multiple users matched for "${colaboradorName}" (parts: ${significantParts.join(', ')}): ${[...distinctUsers].join(', ')}. Using exact match.`);
              // Try exact normalized match first
              const targetNormalized = normalizeName(colaboradorName);
              const exactMatches = extratoRows.filter(r => normalizeName(r.usuario || '') === targetNormalized);
              if (exactMatches.length > 0) {
                extratoRows = exactMatches;
              } else {
                // Fall back to the most similar user name
                const targetParts = new Set(significantParts.map(p => p.toLowerCase()));
                const userScores = new Map<string, number>();
                for (const r of extratoRows) {
                  const u = (r.usuario || '').toLowerCase().trim();
                  const uParts = new Set(getSignificantNameParts(r.usuario || ''));
                  let score = 0;
                  for (const p of targetParts) {
                    if (uParts.has(p)) score++;
                  }
                  userScores.set(u, Math.max(userScores.get(u) || 0, score));
                }
                let bestUser = '';
                let bestScore = 0;
                for (const [u, s] of userScores) {
                  if (s > bestScore) { bestScore = s; bestUser = u; }
                }
                if (bestUser) {
                  console.warn(`[Fechamento] Selected best match: "${bestUser}" (score: ${bestScore}/${significantParts.length})`);
                  extratoRows = extratoRows.filter(r => (r.usuario || '').toLowerCase().trim() === bestUser);
                }
              }
            }
          }
        } else {
          // Only one significant part — use it but warn about potential ambiguity
          const onlyPart = significantParts[0] || colaboradorName.trim().split(/\s+/)[0];
          const rows = await sql`
            SELECT
              data::text as data,
              hora,
              codigo_transacao,
              usuario,
              tipo,
              descricao,
              valor,
              is_snapshot
            FROM extrato_movimentacao
            WHERE unaccent(usuario) ILIKE unaccent(${'%' + onlyPart + '%'})
              AND is_snapshot = false
            ORDER BY data ASC, hora ASC
          `;
          extratoRows = rows as ExtratoRow[];
        }
      } catch (dbErr) {
        console.error('[Fechamento] Error querying extrato_movimentacao:', dbErr);
      }
    }

    // 3. Fetch REPORTS + EXPENSES from Neon DB (prestacao_reports + prestacao_expenses)
    let userReports: any[] = [];
    let prestacaoContas: PrestacaoRow[] = [];
    let cartaoDespesas = 0;
    let cartaoTotal = 0;

    if (sql && colaboradorId) {
      try {
        // Fetch reports for this user from Neon DB
        const reportRows = await sql`
          SELECT id, name, status, user_id, user_cpf, total_value, created_at
          FROM prestacao_reports
          WHERE user_id = ${colaboradorId}
          ORDER BY created_at DESC
        `;
        userReports = reportRows as any[];

        // Fetch expenses joined with reports from Neon DB
        // Exclude Cartão Itaú payment method (627401) AND FATURA/CARTÃO-named
        // reports — card-invoice expenses are not caixa prestação (same rule
        // as quinzena-complete somase; a pm filter alone misses other card
        // methods like 627508 "Cartao VExpenses").
        const expenseRows = await sql`
          SELECT
            e.id as despesa_id,
            e.report_id,
            e.value,
            e.date,
            e.description,
            e.raw_data,
            r.name as report_name,
            r.status as report_status
          FROM prestacao_expenses e
          JOIN prestacao_reports r ON e.report_id = r.id
          WHERE r.user_id = ${colaboradorId}
          ORDER BY e.date DESC
        `;

        const caixaExpenses = (expenseRows as any[]).filter((row: any) => {
          const pm = String(row.raw_data?.payment_method_id ?? '0');
          const excl = pm === '627401' || isFaturaOrCartao(row.report_name || '');
          if (excl) {
            cartaoDespesas++;
            cartaoTotal += Number(row.value) || 0;
          }
          return !excl;
        });

        prestacaoContas = caixaExpenses.map((row: any) => {
          const raw = row.raw_data || {};
          const valor = Number(row.value) || 0;
          const convertedValue = Number(raw.converted_value) || valor;
          const valorTotal = convertedValue || valor;

          return {
            despesa_id: row.despesa_id,
            relatorio_id: row.report_id,
            nome_relatorio: row.report_name || '',
            data: row.date ? new Date(row.date).toISOString().split('T')[0] : '',
            nome_membro: colaboradorName.toUpperCase(),
            cpf: colaboradorCpf || '',
            status: row.report_status || '',
            descricao_despesa: row.description || raw.title || '',
            tipo_despesa: '',
            reembolsavel: raw.reimbursable ? 'Sim' : 'Não',
            anotacao: raw.observation || '',
            centro_custos: '',
            forma_pagamento: raw.payment_method?.data?.description || raw.payment_method_name || raw.payment_method?.data?.name
              || PAYMENT_METHODS[String(raw.payment_method_id ?? '')] || '',
            projeto: '',
            percentual_projeto: 1,
            moeda_relatorio: raw.original_currency_iso || 'BRL',
            valor: valor,
            valor_total: valorTotal,
            ultrapassou_politica: 'Não',
          };
        });
      } catch (dbErr) {
        console.error('[Fechamento] Error querying prestacao_reports/expenses:', dbErr);
      }
    }

    // Sort by date desc
    prestacaoContas.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    // 6. Compute FECHAMENTO (monthly aggregations)
    const monthMap = new Map<string, { ano: number; mes: string; carga: number; transferencia: number; taxa: number; prestacao: number }>();

    // Aggregate EXTRATO by month
    for (const row of extratoRows) {
      const ano = getAno(row.data);
      const mes = getMesNome(row.data);
      const key = `${ano}-${mes}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, { ano, mes, carga: 0, transferencia: 0, taxa: 0, prestacao: 0 });
      }

      const entry = monthMap.get(key)!;
      const valor = Number(row.valor) || 0;

      if (row.tipo === 'Transferência' && valor > 0) {
        entry.carga += valor;
      } else if (row.tipo === 'Transferência' && valor < 0) {
        entry.transferencia += valor;
      } else if (row.tipo === 'Taxa') {
        entry.taxa += valor;
      }
    }

    // Aggregate PREST. CONTAS by month (include all except Reprovado, matching Excel sheets)
    for (const row of prestacaoContas) {
      const st = (row.status || '').toUpperCase();
      if (st === 'REPROVADO') {
        continue;
      }

      const ano = getAno(row.data);
      const mes = getMesNome(row.data);
      const key = `${ano}-${mes}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, { ano, mes, carga: 0, transferencia: 0, taxa: 0, prestacao: 0 });
      }

      const entry = monthMap.get(key)!;
      entry.prestacao += row.valor_total;
    }

    // Build sorted month list and compute saldo + acumulado
    const sortedMonths = Array.from(monthMap.values()).sort((a, b) => {
      const ma = MESES_PT.indexOf(a.mes);
      const mb = MESES_PT.indexOf(b.mes);
      if (a.ano !== b.ano) return a.ano - b.ano;
      return ma - mb;
    });

    let acumulado = 0;
    const fechamento: MonthAggregation[] = sortedMonths.map(m => {
      const saldo = m.carga + m.transferencia + m.taxa - m.prestacao;
      acumulado += saldo;
      return {
        ano: m.ano,
        mes: m.mes,
        carga: m.carga,
        transferencia: m.transferencia,
        taxa: m.taxa,
        prestacao_contas: m.prestacao,
        saldo,
        acumulado,
      };
    });

    // 7. Compute resumo
    const totalCarga = fechamento.reduce((s, m) => s + m.carga, 0);
    const totalTransferencia = fechamento.reduce((s, m) => s + m.transferencia, 0);
    const totalTaxa = fechamento.reduce((s, m) => s + m.taxa, 0);
    const totalPrestacao = fechamento.reduce((s, m) => s + m.prestacao_contas, 0);
    const saldoFinal = acumulado;
    const saldoDisponivel = totalCarga + totalTransferencia + totalTaxa;
    const fechamentoPrestacao = saldoDisponivel - totalPrestacao;

    // Status panel — ENVIADO não é caixa aberto: já foi prestado pelo
    // funcionário e aguarda aprovação (mesma semântica do Visão Geral).
    // Aberto = ABERTO + REABERTO; Em aprovação = ENVIADO; Aprovado = resto.
    const abertoTotal = prestacaoContas
      .filter(p => {
        const st = (p.status || '').toUpperCase();
        return st === 'ABERTO' || st === 'REABERTO';
      })
      .reduce((s, p) => s + p.valor_total, 0);
    const enviadoTotal = prestacaoContas
      .filter(p => (p.status || '').toUpperCase() === 'ENVIADO')
      .reduce((s, p) => s + p.valor_total, 0);
    const aprovadoTotal = prestacaoContas
      .filter(p => {
        const st = (p.status || '').toUpperCase();
        return st !== 'ABERTO' && st !== 'ENVIADO' && st !== 'REABERTO' && st !== 'REPROVADO';
      })
      .reduce((s, p) => s + p.valor_total, 0);

    // Caixas por relatório (relatório = "caixa" do mês, ex.: "CAIXA 02/2026")
    // Aberto = ABERTO/REABERTO; Em aprovação = ENVIADO; Fechado = resto (menos REPROVADO)
    const caixaMap = new Map<number, { nome: string; status: string; valor: number }>();
    for (const p of prestacaoContas) {
      const st = (p.status || '').toUpperCase();
      if (st === 'REPROVADO') continue;
      const cur = caixaMap.get(p.relatorio_id) || { nome: p.nome_relatorio || `Relatório ${p.relatorio_id}`, status: st, valor: 0 };
      cur.valor += p.valor_total;
      caixaMap.set(p.relatorio_id, cur);
    }
    const caixaSort = (a: { nome: string }, b: { nome: string }) => {
      const pa = getReportPeriod(a.nome);
      const pb = getReportPeriod(b.nome);
      if (pa && pb) {
        if (pa.ano !== pb.ano) return pa.ano - pb.ano;
        return MESES_PT.indexOf(pa.mes) - MESES_PT.indexOf(pb.mes);
      }
      if (pa) return -1;
      if (pb) return 1;
      return a.nome.localeCompare(b.nome);
    };
    const caixasFechados = [...caixaMap.values()]
      .filter(c => c.status !== 'ABERTO' && c.status !== 'ENVIADO' && c.status !== 'REABERTO')
      .map(c => ({ nome: c.nome, valor: c.valor, status: c.status }))
      .sort(caixaSort);
    const caixasEmAprovacao = [...caixaMap.values()]
      .filter(c => c.status === 'ENVIADO')
      .map(c => ({ nome: c.nome, valor: c.valor, status: c.status }))
      .sort(caixaSort);
    const caixasAbertos = [...caixaMap.values()]
      .filter(c => c.status === 'ABERTO' || c.status === 'REABERTO')
      .map(c => ({ nome: c.nome, valor: c.valor, status: c.status }))
      .sort(caixaSort);

    // 8. Try to get saldo cartão from last extrato snapshot
    // Use same robust matching as extrato: require all significant name parts
    let saldoCartao = 0;
    if (sql) {
      try {
        const significantParts = getSignificantNameParts(colaboradorName);
        if (significantParts.length >= 2) {
          const firstPart = significantParts[0];
          const candidateSnapshots = await sql`
            SELECT valor, usuario
            FROM extrato_movimentacao
            WHERE unaccent(usuario) ILIKE unaccent(${'%' + firstPart + '%'})
              AND is_snapshot = true
            ORDER BY data DESC
          `;
          const filteredSnapshots = matchExtratoUsuario(candidateSnapshots as any[], colaboradorName, 'saldo cartão');
          // If multiple users matched, pick exact or best match
          if (filteredSnapshots.length > 0) {
            const distinctUsers = new Set(filteredSnapshots.map(r => (r.usuario || '').toLowerCase().trim()));
            if (distinctUsers.size > 1) {
              const targetNormalized = normalizeName(colaboradorName);
              const exact = filteredSnapshots.filter(r => normalizeName(r.usuario || '') === targetNormalized);
              if (exact.length > 0) {
                saldoCartao = Number(exact[0].valor) || 0;
              } else {
                saldoCartao = Number(filteredSnapshots[0].valor) || 0;
              }
            } else {
              saldoCartao = Number(filteredSnapshots[0].valor) || 0;
            }
          }
        } else {
          const onlyPart = significantParts[0] || colaboradorName.trim().split(/\s+/)[0];
          const snapshotRows = await sql`
            SELECT valor
            FROM extrato_movimentacao
            WHERE unaccent(usuario) ILIKE unaccent(${'%' + onlyPart + '%'})
              AND is_snapshot = true
            ORDER BY data DESC
            LIMIT 1
          `;
          if (snapshotRows.length > 0) {
            saldoCartao = Number((snapshotRows[0] as any).valor) || 0;
          }
        }
      } catch (e) {
        console.error('[Fechamento] Error fetching saldo cartao snapshot:', e);
      }
    }

    const response: FechoResponse = {
      colaborador: colaboradorName,
      cpf: colaboradorCpf,
      extrato: extratoRows,
      prestacaoContas,
      fechamento,
      resumo: {
        saldoFinal,
        saldoDisponivel,
        prestacaoContas: totalPrestacao,
        fechamentoPrestacao,
        saldoCartao,
        fechamentoFinal: fechamentoPrestacao - saldoCartao,
      },
      cartaoExcluido: { despesas: cartaoDespesas, total: cartaoTotal },
      statusPanel: {
        aberto: abertoTotal,
        enviado: enviadoTotal,
        aprovado: aprovadoTotal,
        totalGeral: abertoTotal + enviadoTotal + aprovadoTotal,
      },
      caixas: {
        fechados: caixasFechados,
        emAprovacao: caixasEmAprovacao,
        abertos: caixasAbertos,
        totalFechados: caixasFechados.reduce((s, c) => s + c.valor, 0),
        totalEmAprovacao: caixasEmAprovacao.reduce((s, c) => s + c.valor, 0),
        totalAbertos: caixasAbertos.reduce((s, c) => s + c.valor, 0),
      },
      exportadoEm: new Date().toISOString(),
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Fechamento] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar fechamento' },
      { status: 500 }
    );
  }
}
