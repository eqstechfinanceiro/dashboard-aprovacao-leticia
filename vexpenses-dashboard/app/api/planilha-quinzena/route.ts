/**
 * /api/planilha-quinzena
 * 
 * Retorna os dados da planilha 1QZ para qualquer período,
 * combinando dados da API VExpenses com o índice local das planilhas.
 * 
 * Query params:
 *   year     - ex: 2026
 *   month    - ex: 4 (abril)
 *   quinzena - 1 ou 2
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

function normCPF(v: any): string {
  if (!v) return '';
  return String(v).replace(/\D/g, '').padStart(11, '0');
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const year     = parseInt(sp.get('year')     || '2026');
  const month    = parseInt(sp.get('month')    || '4');
  const quinzena = parseInt(sp.get('quinzena') || '1');

  // Calcular intervalo de datas
  const dayStart = quinzena === 1 ? 1 : 16;
  const dayEnd   = quinzena === 1 ? 15 : new Date(year, month, 0).getDate(); // último dia do mês
  const startDate = `${year}-${String(month).padStart(2,'0')}-${String(dayStart).padStart(2,'0')}`;
  const endDate   = `${year}-${String(month).padStart(2,'0')}-${String(dayEnd).padStart(2,'0')}`;
  const periodKey = `${year}-${String(month).padStart(2,'0')}-${quinzena}`;
  const monthKey  = `${year}-${String(month).padStart(2,'0')}`;

  try {
    // ── 1. Carregar índice local ─────────────────────────────────────────
    const idxPath = path.join(process.cwd(), 'planilha-full-index.json');
    if (!fs.existsSync(idxPath)) {
      return NextResponse.json({ error: 'Índice não encontrado. Execute build-full-index.js.' }, { status: 500 });
    }
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));

    // ── 2. Buscar team members da API ────────────────────────────────────
    let members: any[] = [];
    let membersError: string | null = null;
    try {
      const r = await fetch(`${API_URL}/v2/team-members?include=costsCenters`, {
        headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(60000),
      });
      if (r.ok) {
        const j = await r.json();
        members = j.data || [];
      } else {
        membersError = `team-members: ${r.status}`;
      }
    } catch (e: any) {
      membersError = String(e.message);
    }

    // Criar mapa CPF → membro da API
    const memberByCPF = new Map<string, any>();
    for (const m of members) {
      const cpf = normCPF(m.cpf);
      if (cpf) memberByCPF.set(cpf, m);
    }

    // ── 3. Buscar despesas da API para o período ─────────────────────────
    let expenses: any[] = [];
    let expenseError: string | null = null;
    try {
      const params = new URLSearchParams();
      params.append('search', `date:${startDate},${endDate}`);
      params.append('searchFields', 'date:between');
      params.append('include', 'user,costs_center,payment_method');
      params.append('paginate', 'false');
      const r = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
        headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(120000),
      });
      if (r.ok) {
        const j = await r.json();
        expenses = j.data || [];
      } else {
        expenseError = `expenses: ${r.status}`;
      }
    } catch (e: any) {
      expenseError = String(e.message);
    }

    // Agrupar despesas reembolsáveis por user_id
    const reembolsoByUserId = new Map<number, number>();
    for (const exp of expenses) {
      if (exp.reimbursable) {
        const uid = exp.user_id;
        reembolsoByUserId.set(uid, (reembolsoByUserId.get(uid) || 0) + (exp.value || 0));
      }
    }

    // ── 4. Montar linhas combinando todas as fontes ──────────────────────
    // Usar PAINEL como base principal (tem todos os usuários da planilha)
    const painelData: Record<string, any> = idx.painelData || {};
    const quinzenasData: Record<string, any> = idx.quinzenas || {};
    const saldoCartaoData: Record<string, any[]> = idx.saldoCartaoIdx || {};
    const adicionaisData: Record<string, any> = idx.adicionaisIdx || {};
    const extratoData: Record<string, any> = idx.extratoIdx || {};
    const statusCartaoData: Record<string, string> = idx.statusCartao || {};

    // Helper para buscar saldo cartão mais próximo do fim do período
    function getSaldoCartao(cpf: string): number | null {
      const entries = saldoCartaoData[cpf];
      if (!entries || entries.length === 0) return null;
      // Encontrar entrada mais próxima do endDate
      const valid = entries.filter((e: any) => e.data <= endDate);
      if (valid.length === 0) {
        // Usar a primeira entrada disponível se não houver entrada antes do endDate
        return entries[0].valor;
      }
      return valid[valid.length - 1].valor;
    }

    // Descobrir todos os CPFs disponíveis (API + PAINEL + QUINZENAS)
    const allCPFs = new Set<string>();
    members.forEach(m => { const c = normCPF(m.cpf); if (c) allCPFs.add(c); });
    Object.keys(painelData).forEach(c => allCPFs.add(c));
    Object.keys(quinzenasData).forEach(c => allCPFs.add(c));

    const rows = [];

    for (const cpf of allCPFs) {
      const member   = memberByCPF.get(cpf) || null;
      const painel   = painelData[cpf] || null;
      const quinzenaEntry = quinzenasData[cpf]?.[periodKey] ?? null;
      const adiantamento  = adicionaisData[cpf]?.[monthKey] ?? 0;
      const extrato  = extratoData[cpf]?.[periodKey] || null;
      const saldoCartao = getSaldoCartao(cpf);
      const reembolsoAPI = member ? (reembolsoByUserId.get(member.id) || 0) : 0;

      // Nome e dados cadastrais
      const nome   = member?.name || painel?.nome || '';
      if (!nome) continue; // Pular se não tiver nome

      const statusColab = member
        ? (member.active ? 'ATIVO' : 'INATIVO')
        : (painel?.situacao || '');

      // CENTRO CUSTO: preferir PAINEL (mais preciso) sobre API
      const centroCusto = painel?.centroCusto
        || member?.costsCenters?.data?.[0]?.name
        || '';

      // STATUS DO CARTÃO: PAINEL ou statusCartao index
      const statusCartao = painel?.statusCartao
        || statusCartaoData[nome.toUpperCase().trim()] || '';

      // 1QZ: da tab QUINZENAS (específico para o período)
      const qz1 = quinzenaEntry ?? null;

      // SALDO CARTAO: snapshot de saldo do cartão próximo ao fim do período
      const saldoCartaoVal = saldoCartao;

      // REEMBOLSO: soma de despesas reembolsáveis da API para o período
      const reembolso = reembolsoAPI;

      // SALDO FINAL (fórmula descoberta):
      //   = max(0, PAINEL.saldoPrestacao - SALDO_CARTAO)
      // PAINEL acumula dados históricos. Disponível apenas para o período do arquivo.
      // Para outros períodos, null.
      const painelSaldoPrestacao = painel?.saldoPrestacao ?? null;
      const saldoFinal: number | null = (painelSaldoPrestacao !== null && saldoCartaoVal !== null)
        ? Math.max(0, painelSaldoPrestacao - saldoCartaoVal)
        : null;

      // ADIANTAMENTO
      const adiantamentoVal = adiantamento;

      // CARGA PARCIAL (fórmula): 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
      // Calculável apenas se 1QZ e SALDO CARTAO disponíveis
      const cargaParcialCalc = (qz1 !== null && saldoCartaoVal !== null)
        ? qz1 - (saldoFinal ?? 0) - saldoCartaoVal - adiantamentoVal
        : null;

      // CARGA FINAL (fórmula): MAX(0, CARGA PARCIAL) + REEMBOLSO
      const cargaFinalCalc = cargaParcialCalc !== null
        ? Math.max(0, cargaParcialCalc) + reembolso
        : null;

      // SALDO REEMBOLSAR (fórmula descoberta):
      //   diff = PAINEL.saldoPrestacao - SALDO_CARTAO
      //   Se diff < 0: SALDO REEMBOLSAR = diff (colaborador deve à empresa)
      //   Se diff >= 0: SALDO REEMBOLSAR = null (empresa deve ao colaborador — valor já em SALDO FINAL)
      const saldoReembolsar: number | null = (painelSaldoPrestacao !== null && saldoCartaoVal !== null)
        ? Math.min(0, painelSaldoPrestacao - saldoCartaoVal) || null
        : null;

      rows.push({
        cpf,
        portador:       nome,
        statusColab,
        centroCusto,
        gestor:         painel?.gestor || '',
        direcao:        painel?.diretor || '',
        statusCartao,
        // Campos financeiros
        qz1,
        saldoCartao:    saldoCartaoVal,
        saldoFinal,
        adiantamento:   adiantamentoVal,
        reembolso,
        cargaParcial:   cargaParcialCalc,
        cargaFinal:     cargaFinalCalc,
        saldoReembolsar,
        // Metadados de fonte
        sources: {
          portador:    member ? 'api' : 'planilha',
          statusColab: member ? 'api' : 'planilha',
          centroCusto: painel?.centroCusto ? 'planilha' : (member ? 'api' : null),
          qz1:         quinzenaEntry !== null ? 'planilha' : null,
          saldoCartao: saldoCartaoVal !== null ? 'planilha' : null,
          reembolso:   member ? 'api' : null,
          cargaParcial:'calc',
          cargaFinal:  'calc',
          statusCartao: painel?.statusCartao ? 'planilha' : null,
          saldoReembolsar: painel ? 'planilha' : null,
        },
        // Dados extras para display
        cartaoItau:   painel?.cartaoItau || null,
        regional:     painel?.regional || '',
        foundInAPI:   member !== null,
      });
    }

    // Ordenar por portador
    rows.sort((a, b) => a.portador.localeCompare(b.portador));

    // Períodos disponíveis (a partir do índice de quinzenas)
    const availablePeriods = new Set<string>();
    for (const cpf of Object.keys(quinzenasData)) {
      for (const key of Object.keys(quinzenasData[cpf])) {
        availablePeriods.add(key);
      }
    }

    return NextResponse.json({
      period: { year, month, quinzena, startDate, endDate, periodKey },
      stats: {
        totalRows: rows.length,
        foundInAPI: rows.filter(r => r.foundInAPI).length,
        withQZ1: rows.filter(r => r.qz1 !== null).length,
        withSaldoCartao: rows.filter(r => r.saldoCartao !== null).length,
        withReembolso: rows.filter(r => r.reembolso > 0).length,
        totalExpenses: expenses.length,
      },
      errors: { membersError, expenseError },
      availablePeriods: Array.from(availablePeriods).sort().reverse(),
      rows,
    });

  } catch (err: any) {
    console.error('[planilha-quinzena] Erro:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
