// Fórmulas puras da quinzena — extraídas de app/api/quinzena-complete/route.ts
// para permitir teste unitário (lib/quinzena/financials.test.ts) e reuso por
// outros endpoints (reconcile, diff, export). NÃO duplicar a lógica aqui.

/**
 * Regra quinzenal (validada em jul/2026):
 *   1ª QZ: período 26 do mês anterior → 10 do mês atual  (fechamento dia 11)
 *   2ª QZ: período 11 → 25 do mês atual                  (fechamento dia 25)
 *
 * Cutoff financeiro (carga/transf/tarifa/prestação): dia 30 do mês anterior
 * Saldo cartão CONTROLE: último snapshot até dia 1 do mês atual
 * Saldo cartão CARGA: último snapshot até a data de fechamento (11 ou 25)
 */
export function getQuinzenaDates(year: number, month: number, quinzena: number) {
  const mm = String(month).padStart(2, '0');
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const pmm = String(prevMonth).padStart(2, '0');

  // Financial data cutoff: last day of previous month (same for both quinzenas)
  const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const financial_cutoff = `${prevYear}-${pmm}-${String(prevMonthLastDay).padStart(2, '0')}`;

  // Saldo cartão CONTROLE: last snapshot up to day 1 of current month
  const saldo_cartao_controle_date = `${year}-${mm}-01`;

  if (quinzena === 1) {
    return {
      start_date:    `${prevYear}-${pmm}-26`,
      end_date:      `${year}-${mm}-10`,
      fechamento:    `${year}-${mm}-11`,
      financial_cutoff,
      saldo_cartao_controle_date,
      saldo_cartao_carga_date: `${year}-${mm}-11`,
    };
  }
  return {
    start_date:  `${year}-${mm}-11`,
    end_date:    `${year}-${mm}-25`,
    fechamento:  `${year}-${mm}-25`,
    financial_cutoff,
    saldo_cartao_controle_date,
    saldo_cartao_carga_date: `${year}-${mm}-25`,
  };
}

export function toNum(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

export function r2(v: number): number {
  // Number.EPSILON corrige casos como 1.005 → binário 1.00499999… → *100=100.4999
  // que sem a correção arredondaria errado pra baixo (R$1,00 em vez de R$1,01).
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Fórmulas confirmadas por inspeção direta nas planilhas de Carga (validado 100% em mai/2026):
 *
 *   col_qz_efetivo  = col_qz_manual ?? col_qz_planilha ?? 0
 *
 *   CARGA_PARCIAL = col_qz_efetivo - saldo_final_carga - saldo_cartao_carga - adiantamento
 *     (saldo_final_carga = max(0, saldo_final); se negativo → 0, exceto cadastro pendente que força 0)
 *
 *   REEMBOLSO = max(0, saldo_reembolsar) * 0.5   ← SOMENTE na 1ª QZ
 *               0                                 ← sempre na 2ª QZ
 *
 *   CARGA_FINAL = max(0, CARGA_PARCIAL) + REEMBOLSO
 *
 * Regras de negócio:
 *   - status_cartao contém "pendente" → carga_parcial=0, carga_final=0
 *   - Reembolso é mensal único: pago na 1ª QZ, 0 na 2ª QZ
 */
export function calcFinancials(
  col_qz_efetivo: number,
  saldo_final: number,
  saldo_cartao: number,
  saldo_reembolsar: number,
  adiantamento: number,
  quinzena: number,
  status_cartao: string,
  reembolso_multiplier: number = 0.5,
): { carga_parcial: number; reembolso: number; carga_final: number } {
  const isPendente = status_cartao.toLowerCase().includes('pendente');

  if (isPendente) {
    return { carga_parcial: 0, reembolso: 0, carga_final: 0 };
  }

  const carga_parcial = r2(col_qz_efetivo - saldo_final - saldo_cartao - adiantamento);
  const reembolso     = quinzena === 1 ? r2(Math.max(0, saldo_reembolsar) * reembolso_multiplier) : 0;
  const carga_final   = r2(Math.max(0, carga_parcial) + reembolso);

  return { carga_parcial, reembolso, carga_final };
}
