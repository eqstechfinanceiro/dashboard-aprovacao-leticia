import "server-only";
import { differenceInDays, parseISO } from "date-fns";
import { getReports } from "./vexpenses";
import { computeBalancesLive, type UserBalance } from "./cash-balance";
import {
  computeApprovalTimeStats,
  computeTopCostsCenters,
} from "./analytics";
import type { Report } from "@/types/vexpenses";

/**
 * Rule-based (no LLM) recommendation engine.
 *
 * Each rule is a pure function of the fetched data and returns a list of
 * Advice items. Rules were designed around the information the EQS team
 * cares about most (balance DEVEDOR, slow approval flows, missing receipts,
 * cost center concentration), per the user's request for "conselhos programados".
 */

export type AdviceSeverity = "critical" | "warning" | "info" | "success";

export interface Advice {
  id: string;
  severity: AdviceSeverity;
  title: string;
  body: string;
  /** Optional deep link into the dashboard to act on the advice. */
  href?: string;
  /** Human-readable metric the user can glance at (value, count, etc). */
  metric?: string;
  /** Up to 5 sample items (names, report ids) that triggered the rule. */
  samples?: string[];
  /** Which rule produced this advice — useful for enabling/disabling later. */
  rule: string;
}

export interface AdviceContext {
  reports: Report[];
  balances: UserBalance[];
  generatedAt: string;
}

function isPending(r: Report): boolean {
  return r.status === "ENVIADO" || r.status === "REABERTO";
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  try {
    return differenceInDays(new Date(), parseISO(iso));
  } catch {
    return 0;
  }
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

/* --------------------------------- rules --------------------------------- */

function ruleDevedorAntigos(ctx: AdviceContext): Advice | null {
  const devedores = ctx.balances.filter(
    (b) => b.status === "DEVEDOR" && daysSince(b.lastMovementAt) >= 30,
  );
  if (devedores.length === 0) return null;
  const total = devedores.reduce((s, d) => s + Math.abs(d.balance), 0);
  return {
    id: "devedor-antigos",
    rule: "DEVEDOR há 30+ dias",
    severity: devedores.length >= 3 ? "critical" : "warning",
    title: `${devedores.length} colaborador(es) DEVEDOR há 30+ dias`,
    body: "Estes colaboradores têm saldo negativo sem movimentação recente. Cobrar prestação de contas ou quitar antes de liberar novo adiantamento.",
    metric: `Exposição total: ${fmtBRL(total)}`,
    samples: devedores
      .slice(0, 5)
      .map(
        (d) =>
          `${d.teamMemberName} · ${fmtBRL(Math.abs(d.balance))} · ${daysSince(d.lastMovementAt)}d`,
      ),
    href: "/caixa?status=DEVEDOR",
  };
}

function ruleCredorAlto(ctx: AdviceContext): Advice | null {
  const credores = ctx.balances
    .filter((b) => b.status === "CREDOR" && b.balance >= 1000)
    .sort((a, b) => b.balance - a.balance);
  if (credores.length === 0) return null;
  const total = credores.reduce((s, c) => s + c.balance, 0);
  return {
    id: "credor-alto",
    rule: "CREDOR ≥ R$ 1.000",
    severity: credores.length >= 5 ? "warning" : "info",
    title: `${credores.length} colaborador(es) com reembolso ≥ R$ 1.000 pendente`,
    body: "A empresa deve reembolsar esses valores. Considere priorizar no próximo lote de pagamentos para reduzir fricção.",
    metric: `Total a pagar: ${fmtBRL(total)}`,
    samples: credores
      .slice(0, 5)
      .map((c) => `${c.teamMemberName} · ${fmtBRL(c.balance)}`),
    href: "/caixa?status=CREDOR",
  };
}

function ruleAprovacoesAntigas(ctx: AdviceContext): Advice | null {
  const pending = ctx.reports.filter(
    (r) => isPending(r) && r.sent_at && daysSince(r.sent_at) >= 7,
  );
  if (pending.length === 0) return null;
  const total = pending.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const worst = [...pending].sort(
    (a, b) => daysSince(b.sent_at) - daysSince(a.sent_at),
  );
  return {
    id: "aprovacoes-antigas",
    rule: "aguardando aprovação ≥ 7 dias",
    severity: pending.length >= 5 ? "critical" : "warning",
    title: `${pending.length} relatório(s) parado(s) há 7+ dias na aprovação`,
    body: "Gargalo no fluxo de aprovação. Acionar os aprovadores ou revisar o fluxo.",
    metric: `Valor retido: ${fmtBRL(total)}`,
    samples: worst
      .slice(0, 5)
      .map(
        (r) =>
          `#${r.id} · ${r.team_member?.name ?? "—"} · ${fmtBRL(Number(r.total ?? 0))} · ${daysSince(r.sent_at)}d`,
      ),
    href: "/aprovacoes",
  };
}

function ruleAprovacoesGrandes(ctx: AdviceContext): Advice | null {
  const big = ctx.reports
    .filter((r) => isPending(r) && Number(r.total ?? 0) >= 5000)
    .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0));
  if (big.length === 0) return null;
  const total = big.reduce((s, r) => s + Number(r.total ?? 0), 0);
  return {
    id: "aprovacoes-grandes",
    rule: "pendente ≥ R$ 5.000",
    severity: big.length >= 3 ? "warning" : "info",
    title: `${big.length} relatório(s) ≥ R$ 5.000 aguardando aprovação`,
    body: "Valores altos devem ser priorizados. Confira se o fluxo está correto e se há documentação suficiente.",
    metric: `Total: ${fmtBRL(total)}`,
    samples: big
      .slice(0, 5)
      .map(
        (r) =>
          `#${r.id} · ${r.team_member?.name ?? "—"} · ${fmtBRL(Number(r.total ?? 0))}`,
      ),
    href: "/aprovacoes",
  };
}

function ruleSetorLento(ctx: AdviceContext): Advice | null {
  const stats = computeApprovalTimeStats(ctx.reports);
  const slow = stats.byDepartment.filter((d) => d.averageHours / 24 >= 7);
  if (slow.length === 0) return null;
  return {
    id: "setor-lento",
    rule: "setor tempo médio ≥ 7 dias",
    severity: "warning",
    title: `${slow.length} setor(es) com tempo médio de aprovação ≥ 7 dias`,
    body: "Setores lentos geram atrito para o colaborador e acumulam caixa parado. Converse com os aprovadores.",
    samples: slow
      .slice(0, 5)
      .map(
        (d) =>
          `${d.name} · ${(d.averageHours / 24).toFixed(1)}d média (${d.count} rel.)`,
      ),
    href: "/analises",
  };
}

function ruleSemComprovante(ctx: AdviceContext): Advice | null {
  let missing = 0;
  let total = 0;
  const samples: string[] = [];
  for (const r of ctx.reports) {
    if (!r.expenses) continue;
    if (r.status !== "ENVIADO" && r.status !== "REABERTO") continue;
    for (const e of r.expenses) {
      const receipt = (e as { receipt_url?: string; reicept_url?: string })
        .receipt_url ??
        (e as { reicept_url?: string }).reicept_url;
      const reimbursable = e.payment_method?.reimbursable;
      if (!receipt && reimbursable) {
        missing += 1;
        total += Number(e.value ?? 0);
        if (samples.length < 5) {
          samples.push(
            `#${r.id} · ${e.expense_type?.name ?? "—"} · ${fmtBRL(Number(e.value ?? 0))}`,
          );
        }
      }
    }
  }
  if (missing === 0) return null;
  return {
    id: "sem-comprovante",
    rule: "despesa reembolsável sem comprovante",
    severity: missing >= 10 ? "critical" : "warning",
    title: `${missing} despesa(s) reembolsável(is) sem comprovante`,
    body: "A VExpenses permite anexar comprovante em cada despesa. Despesas reembolsáveis sem anexo podem gerar problema contábil.",
    metric: `Total sem comprovante: ${fmtBRL(total)}`,
    samples,
    href: "/despesas",
  };
}

function ruleConcentracaoCC(ctx: AdviceContext): Advice | null {
  const top = computeTopCostsCenters(ctx.reports, 5);
  if (top.length === 0) return null;
  const grand = top.reduce((s, t) => s + t.value, 0);
  if (grand === 0) return null;
  const dominant = top[0];
  const share = dominant.value / grand;
  if (share < 0.5) return null;
  return {
    id: "concentracao-cc",
    rule: "1º centro de custo concentra >50% do valor",
    severity: "info",
    title: `${dominant.label} concentra ${(share * 100).toFixed(1)}% do gasto`,
    body: "Alta concentração em um único centro de custo. Vale verificar rateio ou se outro CC deveria ser usado.",
    metric: fmtBRL(dominant.value),
    samples: top.map(
      (t) =>
        `${t.label} · ${fmtBRL(t.value)} (${((t.value / grand) * 100).toFixed(1)}%)`,
    ),
    href: "/centros-custo",
  };
}

function ruleRejeicaoAlta(ctx: AdviceContext): Advice | null {
  const recent = ctx.reports.filter((r) => {
    const ref = r.rejected_at ?? r.approved_at ?? r.sent_at ?? r.created_at;
    if (!ref) return false;
    return daysSince(ref) <= 30;
  });
  if (recent.length < 10) return null;
  const rejected = recent.filter((r) => r.status === "REPROVADO").length;
  const rate = rejected / recent.length;
  if (rate < 0.15) return null;
  return {
    id: "rejeicao-alta",
    rule: "taxa de rejeição ≥ 15% (30d)",
    severity: rate >= 0.3 ? "critical" : "warning",
    title: `Taxa de rejeição de ${(rate * 100).toFixed(1)}% nos últimos 30 dias`,
    body: "Muitos relatórios sendo reprovados. Pode indicar despesas fora da política, comprovantes inválidos ou falta de treinamento.",
    metric: `${rejected} reprovados em ${recent.length} fechados`,
    href: "/relatorios?status=REPROVADO",
  };
}

function ruleQuicksAprovacao(ctx: AdviceContext): Advice | null {
  // Sugestão positiva: lista relatórios que podem ser aprovados com segurança
  // (valor baixo, colaborador não-devedor, há mais de 2 dias na fila).
  const byMemberStatus = new Map<number, UserBalance>();
  for (const b of ctx.balances) byMemberStatus.set(b.teamMemberId, b);

  const candidates = ctx.reports.filter((r) => {
    if (!isPending(r)) return false;
    if (Number(r.total ?? 0) > 500) return false;
    if (!r.sent_at || daysSince(r.sent_at) < 2) return false;
    const memberId = r.team_member_id ?? r.team_member?.id;
    if (!memberId) return true;
    const bal = byMemberStatus.get(memberId);
    return !bal || bal.status !== "DEVEDOR";
  });
  if (candidates.length < 3) return null;
  const total = candidates.reduce((s, r) => s + Number(r.total ?? 0), 0);
  return {
    id: "quicks-aprovacao",
    rule: "elegíveis para aprovação rápida",
    severity: "success",
    title: `${candidates.length} relatório(s) elegíveis para aprovação em lote`,
    body: "Critérios: valor ≤ R$ 500, colaborador não DEVEDOR, em fila há 2+ dias. Use a aba Aprovações para revisar e aprovar em lote.",
    metric: `Total: ${fmtBRL(total)}`,
    samples: candidates
      .slice(0, 5)
      .map(
        (r) =>
          `#${r.id} · ${r.team_member?.name ?? "—"} · ${fmtBRL(Number(r.total ?? 0))}`,
      ),
    href: "/aprovacoes",
  };
}

const RULES: Array<(ctx: AdviceContext) => Advice | null> = [
  ruleDevedorAntigos,
  ruleCredorAlto,
  ruleAprovacoesAntigas,
  ruleAprovacoesGrandes,
  ruleSetorLento,
  ruleSemComprovante,
  ruleConcentracaoCC,
  ruleRejeicaoAlta,
  ruleQuicksAprovacao,
];

const SEVERITY_ORDER: Record<AdviceSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
};

export async function computeAdvice(): Promise<{
  advice: Advice[];
  generatedAt: string;
  source: { reports: number; balances: number };
}> {
  const [reports, balances] = await Promise.all([
    getReports(
      {
        include: [
          "teamMember",
          "costsCenter",
          "expenses",
          "expenses.expenseType",
          "expenses.paymentMethod",
        ],
        perPage: 300,
      },
      { revalidate: 120 },
    ),
    computeBalancesLive().catch(() => [] as UserBalance[]),
  ]);

  const ctx: AdviceContext = {
    reports,
    balances,
    generatedAt: new Date().toISOString(),
  };

  const advice = RULES.map((fn) => {
    try {
      return fn(ctx);
    } catch {
      return null;
    }
  }).filter((a): a is Advice => a !== null);

  advice.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return {
    advice,
    generatedAt: ctx.generatedAt,
    source: { reports: reports.length, balances: balances.length },
  };
}
