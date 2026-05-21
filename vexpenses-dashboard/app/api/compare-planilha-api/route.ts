import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

// Normalizar CPF para 11 dígitos
function normCPF(cpf: any): string {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '').padStart(11, '0');
}

// Comparar valores numéricos com tolerância
function numClose(a: any, b: any, tol = 0.05): boolean {
  const na = parseFloat(String(a ?? '').replace(',', '.'));
  const nb = parseFloat(String(b ?? '').replace(',', '.'));
  if (isNaN(na) || isNaN(nb)) return false;
  return Math.abs(na - nb) <= tol;
}

// Comparar textos (uppercase, trim)
function textMatch(a: any, b: any): boolean {
  if (a == null || b == null) return false;
  return String(a).toUpperCase().trim() === String(b).toUpperCase().trim();
}

export async function GET(request: NextRequest) {
  try {
    // 1. Carregar dados enriquecidos da planilha (gerado pelo script build-comparison-data.js)
    const enrichedPath = path.join(process.cwd(), 'planilha-1qz-enriched.json');
    if (!fs.existsSync(enrichedPath)) {
      return NextResponse.json({ error: 'Arquivo planilha-1qz-enriched.json não encontrado. Execute o script build-comparison-data.js.' }, { status: 500 });
    }
    const enrichedRaw = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));
    const sheetData: any[] = enrichedRaw.data || [];

    // 2. Buscar membros da equipe da API
    const membersResponse = await fetch(`${API_URL}/v2/team-members?include=costsCenters`, {
      headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(60000),
    });
    if (!membersResponse.ok) throw new Error(`team-members: ${membersResponse.status}`);
    const membersJson = await membersResponse.json();
    const members: any[] = membersJson.data || [];

    // Criar mapa CPF → membro
    const memberByCPF = new Map<string, any>();
    for (const m of members) {
      const cpf = normCPF(m.cpf);
      if (cpf) memberByCPF.set(cpf, m);
    }

    // 3. Buscar despesas de Abril 1-15, 2026 da API
    const startDate = '2026-04-01';
    const endDate = '2026-04-15';
    const params = new URLSearchParams();
    params.append('search', `date:${startDate},${endDate}`);
    params.append('searchFields', 'date:between');
    params.append('include', 'user,costs_center,payment_method');
    params.append('paginate', 'false');

    let expenses: any[] = [];
    let expenseError: string | null = null;

    try {
      const expResponse = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
        headers: { 'Authorization': API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(120000),
      });
      if (expResponse.ok) {
        const expJson = await expResponse.json();
        expenses = expJson.data || [];
      } else {
        expenseError = `API expenses retornou ${expResponse.status}`;
      }
    } catch (e: any) {
      expenseError = `Falha ao buscar despesas: ${e.message}`;
    }

    // Agrupar despesas por user_id
    const expByUserId = new Map<number, any[]>();
    for (const exp of expenses) {
      const uid = exp.user_id;
      if (!expByUserId.has(uid)) expByUserId.set(uid, []);
      expByUserId.get(uid)!.push(exp);
    }

    // 4. Gerar comparação para cada linha da planilha
    const rows = sheetData
      .filter((row: any) => row.cpf && row.portador)
      .map((row: any) => {
        const cpf = normCPF(row.cpf);
        const member = memberByCPF.get(cpf) || null;
        const userExpenses = member ? (expByUserId.get(member.id) || []) : [];

        // ── Valores da planilha ──────────────────────────────────────────
        const sheet = row.sheet;
        const sheetPortador = String(row.portador || '').trim();
        const sheetCPF = cpf;
        const sheetStatusColab = String(row.statusColab || '').trim();
        const sheetCentroCusto = String(row.centroCusto || '').trim();
        const sheetQZ1 = sheet.qz1 ?? null;
        const sheetSaldoCartao = sheet.saldoCartao ?? null;
        const sheetSaldoFinal = sheet.saldoFinal ?? null;
        const sheetAdiantamento = sheet.adiantamento ?? null;
        const sheetCargaParcial = sheet.cargaParcial ?? null;
        const sheetReembolso = sheet.reembolso ?? null;
        const sheetCargaFinal = sheet.cargaFinal ?? null;
        const sheetSaldoReembolsar = sheet.saldoReembolsar ?? null;
        const sheetStatusCartao = sheet.statusCartao ?? null;

        // ── Valores da API e fontes secundárias ─────────────────────────
        // Dados que vêm diretamente da API VExpenses
        const apiPortador = member?.name ?? null;
        const apiCPF = member ? normCPF(member.cpf) : null;
        const apiStatusColab = member ? (member.active ? 'ATIVO' : 'INATIVO') : null;
        // costsCenters é um array; pegar o primeiro nome
        const apiCentroCusto = member?.costsCenters?.data?.[0]?.name ?? member?.costs_center?.data?.name ?? null;

        // REEMBOLSO: soma despesas reembolsáveis da API (Abril 1-15)
        const apiReembolso = userExpenses.reduce((s: number, e: any) => {
          return s + (e.reimbursable ? (e.value || 0) : 0);
        }, 0);

        // Dados que vêm da planilha (local), não da API diretamente
        // 1QZ: da tab QUINZENAS do CONTROLE
        const local1QZ = row.quinzenaData ?? null;
        // SALDO CARTAO: da tab SALDO CARTAO do CONTROLE
        const localSaldoCartao = row.saldoCartaoCtrl ?? null;
        // STATUS DO CARTAO: da Planilha3 do 1QZ
        const localStatusCartao = row.statusCartaoP3 ?? null;
        // ADIANTAMENTO: da tab ADICIONAIS (0 para Abril 2026)
        const localAdiantamento = row.adiantamentoCtrl ?? 0;

        // CARGA PARCIAL (calculada): 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO
        // Usa valores da planilha para campos não obtidos da API
        const calcQZ1 = local1QZ ?? sheetQZ1 ?? 0;
        const calcSaldoFinal = sheetSaldoFinal ?? 0; // SALDO FINAL ainda não calculável via API
        const calcSaldoCartao = localSaldoCartao ?? sheetSaldoCartao ?? 0;
        const calcAdiantamento = localAdiantamento ?? sheetAdiantamento ?? 0;
        const calcCargaParcial = calcQZ1 - calcSaldoFinal - calcSaldoCartao - calcAdiantamento;
        const calcCargaFinal = Math.max(0, calcCargaParcial) + (apiReembolso || sheetReembolso || 0);

        // ── Comparar cada campo ──────────────────────────────────────────
        function field(
          name: string,
          sheetVal: any,
          apiVal: any,
          source: 'api' | 'local' | 'calc' | 'unavailable',
          isCalc = false,
          tooltip?: string
        ) {
          let status: 'match' | 'mismatch' | 'calc' | 'no_api_data' | 'unavailable';
          if (isCalc) {
            status = 'calc';
          } else if (source === 'unavailable') {
            status = 'unavailable';
          } else if (apiVal === null || apiVal === undefined) {
            status = 'no_api_data';
          } else {
            const matches = typeof sheetVal === 'number' || typeof apiVal === 'number'
              ? numClose(sheetVal, apiVal)
              : textMatch(sheetVal, apiVal);
            status = matches ? 'match' : 'mismatch';
          }
          return { name, sheetVal, apiVal, source, status, tooltip };
        }

        return {
          cpf: sheetCPF,
          portador: sheetPortador,
          foundInAPI: member !== null,
          apiUserId: member?.id ?? null,
          expenseCount: userExpenses.length,
          fields: [
            field('PORTADOR',          sheetPortador,        apiPortador,          'api'),
            field('CPF',               sheetCPF,             apiCPF,               'api'),
            field('STATUS COLAB',      sheetStatusColab,     apiStatusColab,       'api'),
            field('CENTRO CUSTO',      sheetCentroCusto,     apiCentroCusto,       'api'),
            field('1QZ',               sheetQZ1,             local1QZ,             'local', false, 'Tab QUINZENAS do CONTROLE'),
            field('SALDO CARTAO',      sheetSaldoCartao,     localSaldoCartao,     'local', false, 'Tab SALDO CARTAO do CONTROLE (12/04/2026)'),
            field('SALDO FINAL',       sheetSaldoFinal,      null,                 'unavailable', false, 'Calculado no PAINEL do CONTROLE - não disponível via API'),
            // Adiantamento: null na planilha = 0 (sem adiantamento)
            field('ADIANTAMENTO',      sheetAdiantamento ?? 0, localAdiantamento ?? 0, 'local', false, 'Tab ADICIONAIS (0 para Abril 2026)'),
            field('REEMBOLSO',         sheetReembolso,       apiReembolso,         'api', false, 'Despesas reembolsáveis da API para Abril 1-15'),
            field('CARGA PARCIAL',     sheetCargaParcial,    calcCargaParcial,     'calc', true,  'Fórmula: 1QZ - SALDO FINAL - SALDO CARTAO - ADIANTAMENTO'),
            field('CARGA FINAL',       sheetCargaFinal,      calcCargaFinal,       'calc', true,  'Fórmula: MAX(0,CARGA PARCIAL) + REEMBOLSO'),
            field('STATUS CARTAO',     sheetStatusCartao,    localStatusCartao,    'local', false, 'Planilha3 da 1QZ (exportação VExpenses)'),
            field('SALDO REEMBOLSAR',  sheetSaldoReembolsar, null,                 'unavailable', false, 'Não calculável via API isolada'),
          ],
        };
      });

    // 5. Estatísticas
    const totalRows = rows.length;
    const foundInAPI = rows.filter((r: any) => r.foundInAPI).length;
    let matchCount = 0, mismatchCount = 0, calcCount = 0, noDataCount = 0;
    for (const row of rows) {
      for (const f of row.fields) {
        if (f.status === 'match') matchCount++;
        else if (f.status === 'mismatch') mismatchCount++;
        else if (f.status === 'calc') calcCount++;
        else noDataCount++;
      }
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      expenseError,
      totalExpenses: expenses.length,
      stats: { totalRows, foundInAPI, matchCount, mismatchCount, calcCount, noDataCount },
      rows,
    });

  } catch (err: any) {
    console.error('[compare-planilha-api] Erro:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
