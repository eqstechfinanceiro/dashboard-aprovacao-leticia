import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { apiCache } from '@/lib/neon-cache';

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
    aprovado: number;
    totalGeral: number;
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

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
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

    const cacheKey = 'team-members:include';
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

    if (teamMember) {
      colaboradorName = teamMember.name;
      colaboradorCpf = teamMember.cpf ? String(teamMember.cpf) : null;
      colaboradorId = teamMember.id;
    }

    if (!colaboradorName) {
      return NextResponse.json(
        { error: 'Colaborador não encontrado' },
        { status: 404 }
      );
    }

    // 2. Fetch EXTRATO from Neon DB (extrato_movimentacao)
    let extratoRows: ExtratoRow[] = [];
    if (sql) {
      try {
        const normalizedNome = colaboradorName.trim();
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
          WHERE usuario ILIKE ${'%' + normalizedNome + '%'}
            AND is_snapshot = false
          ORDER BY data ASC, hora ASC
        `;
        extratoRows = rows as ExtratoRow[];
      } catch (dbErr) {
        console.error('[Fechamento] Error querying extrato_movimentacao:', dbErr);
      }
    }

    // 3. Fetch REPORTS + EXPENSES from Neon DB (prestacao_reports + prestacao_expenses)
    let userReports: any[] = [];
    let prestacaoContas: PrestacaoRow[] = [];

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
        // Exclude Cartão Itaú payment method (627401) — covers FATURA and ITAU-related expenses
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
            AND COALESCE(e.raw_data->>'payment_method_id', '0') NOT IN ('627401')
          ORDER BY e.date DESC
        `;

        prestacaoContas = (expenseRows as any[]).map((row: any) => {
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
            forma_pagamento: raw.payment_method?.data?.description || raw.payment_method_name || raw.payment_method?.data?.name || '',
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

    // Status panel (Aberto = ABERTO + ENVIADO + REABERTO; Aprovado = APROVADO + PAGO)
    const abertoTotal = prestacaoContas
      .filter(p => {
        const st = (p.status || '').toUpperCase();
        return st === 'ABERTO' || st === 'ENVIADO' || st === 'REABERTO';
      })
      .reduce((s, p) => s + p.valor_total, 0);
    const aprovadoTotal = prestacaoContas
      .filter(p => {
        const st = (p.status || '').toUpperCase();
        return st !== 'ABERTO' && st !== 'ENVIADO' && st !== 'REABERTO' && st !== 'REPROVADO';
      })
      .reduce((s, p) => s + p.valor_total, 0);

    // 8. Try to get saldo cartão from last extrato snapshot
    let saldoCartao = 0;
    if (sql) {
      try {
        const snapshotRows = await sql`
          SELECT valor
          FROM extrato_movimentacao
          WHERE usuario ILIKE ${'%' + colaboradorName.trim() + '%'}
            AND is_snapshot = true
          ORDER BY data DESC
          LIMIT 1
        `;
        if (snapshotRows.length > 0) {
          saldoCartao = Number((snapshotRows[0] as any).valor) || 0;
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
      statusPanel: {
        aberto: abertoTotal,
        aprovado: aprovadoTotal,
        totalGeral: abertoTotal + aprovadoTotal,
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
