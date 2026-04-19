import "server-only";
import { getReports, getTeamMembers } from "./vexpenses";
import type { Advance, Report, TeamMember } from "@/types/vexpenses";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";

/**
 * Cash-balance computation per team member, following the formal spec in
 * docs/Cash-Balance-Calculation.md.
 *
 *   Saldo(u) = (advances recebidos)
 *            − (despesas aprovadas cujo payment_method.affects_advance = true)
 *            − (despesas reembolsáveis APROVADAS ainda sem payment_date)
 *
 *   DEVEDOR : saldo < 0   (usuário deve à empresa — bloqueia novo adiantamento)
 *   QUITADO : saldo ≈ 0
 *   CREDOR  : saldo > 0   (empresa deve ao usuário — pagar reembolso)
 *
 *  We treat monetary values in their source currency; mixed-currency balances
 *  are flagged separately (`hasMixedCurrency`) for the UI to warn the user.
 */

export type BalanceStatus = "DEVEDOR" | "QUITADO" | "CREDOR";

export interface UserBalance {
  teamMemberId: number;
  teamMemberName: string;
  departmentName?: string | null;
  totalAdvances: number;
  totalConsumed: number;
  totalPendingReimbursement: number;
  balance: number;
  status: BalanceStatus;
  lastMovementAt?: string;
  openReports: number;
  paidReimbursements: number;
  hasMixedCurrency: boolean;
}

const EPSILON = 0.005;

export function classify(balance: number): BalanceStatus {
  if (balance < -EPSILON) return "DEVEDOR";
  if (balance > EPSILON) return "CREDOR";
  return "QUITADO";
}

/**
 * Build a snapshot of every team member's balance from a list of reports
 * (expected to come with `teamMember`, `expenses.paymentMethod`, `advance`
 * includes) plus any locally-logged advances.
 */
export function buildBalances(
  members: TeamMember[],
  reports: Report[],
  localAdvances: Array<{
    teamMemberId: number;
    value: string | number;
    currencyCode?: string;
    createdAt: Date | string;
  }>,
): UserBalance[] {
  const byId = new Map<number, UserBalance>();

  for (const m of members) {
    byId.set(m.id, {
      teamMemberId: m.id,
      teamMemberName: m.name,
      departmentName: m.departmentName ?? null,
      totalAdvances: 0,
      totalConsumed: 0,
      totalPendingReimbursement: 0,
      balance: 0,
      status: "QUITADO",
      openReports: 0,
      paidReimbursements: 0,
      hasMixedCurrency: false,
    });
  }

  // Fold API-reported advances (from report includes)
  for (const r of reports) {
    const memberId = r.team_member_id ?? r.team_member?.id;
    if (!memberId) continue;
    const row = ensureRow(byId, memberId, r.team_member);

    const advances: Advance[] = [];
    if (Array.isArray(r.advance)) advances.push(...r.advance);
    else if (r.advance) advances.push(r.advance as Advance);
    for (const a of advances) {
      row.totalAdvances += toNumber(a.value);
    }

    if (r.status === "ABERTO" || r.status === "ENVIADO" || r.status === "REABERTO") {
      row.openReports += 1;
    }

    const expenses = r.expenses ?? [];
    for (const e of expenses) {
      const value = toNumber(e.value);
      if (value === 0) continue;
      const pm = e.payment_method;
      if (!pm) continue;

      if (r.status === "APROVADO" || r.status === "PAGO") {
        if (pm.affects_advance) {
          row.totalConsumed += value;
        }
        if (pm.reimbursable && r.status === "APROVADO" && !r.payment_date) {
          row.totalPendingReimbursement += value;
        }
        if (pm.reimbursable && (r.status === "PAGO" || r.payment_date)) {
          row.paidReimbursements += value;
        }
      }
    }

    if (r.updated_at) {
      if (!row.lastMovementAt || r.updated_at > row.lastMovementAt) {
        row.lastMovementAt = r.updated_at;
      }
    }
  }

  // Fold locally-logged advances created through this dashboard
  for (const a of localAdvances) {
    const row = byId.get(a.teamMemberId);
    if (!row) continue;
    row.totalAdvances += toNumber(a.value);
    const createdAt =
      a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt;
    if (createdAt && (!row.lastMovementAt || createdAt > row.lastMovementAt)) {
      row.lastMovementAt = createdAt;
    }
  }

  const rows = Array.from(byId.values());
  for (const row of rows) {
    row.balance = row.totalAdvances - row.totalConsumed - row.totalPendingReimbursement;
    row.status = classify(row.balance);
  }

  return rows.sort((a, b) => a.balance - b.balance);
}

function ensureRow(
  map: Map<number, UserBalance>,
  memberId: number,
  member?: TeamMember | null,
): UserBalance {
  const existing = map.get(memberId);
  if (existing) return existing;
  const row: UserBalance = {
    teamMemberId: memberId,
    teamMemberName: member?.name ?? `#${memberId}`,
    departmentName: member?.departmentName ?? null,
    totalAdvances: 0,
    totalConsumed: 0,
    totalPendingReimbursement: 0,
    balance: 0,
    status: "QUITADO",
    openReports: 0,
    paidReimbursements: 0,
    hasMixedCurrency: false,
  };
  map.set(memberId, row);
  return row;
}

function toNumber(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/**
 * End-to-end helper: fetches everything needed and returns the list.
 * Costly — intended to be called inside a cached server action and
 * persisted through balanceSnapshots. Avoid calling on every request.
 */
export async function computeBalancesLive(): Promise<UserBalance[]> {
  const [members, reports] = await Promise.all([
    getTeamMembers({ revalidate: 300 }),
    getReports(
      {
        include: [
          "teamMember",
          "expenses",
          "expenses.paymentMethod",
          "advance",
        ],
      },
      { revalidate: 60 },
    ),
  ]);

  const local = await db().select().from(schema.advances).orderBy(desc(schema.advances.createdAt));
  const mapped = local
    .filter((a) => a.status !== "cancelled")
    .map((a) => ({
      teamMemberId: a.teamMemberId,
      value: a.value,
      currencyCode: a.currencyCode,
      createdAt: a.createdAt,
    }));
  return buildBalances(members, reports, mapped);
}

export async function getUserBalance(
  teamMemberId: number,
): Promise<UserBalance | null> {
  const snapshot = await db()
    .select()
    .from(schema.balanceSnapshots)
    .where(eq(schema.balanceSnapshots.teamMemberId, teamMemberId))
    .limit(1);
  if (snapshot.length > 0) {
    const s = snapshot[0];
    return {
      teamMemberId: s.teamMemberId,
      teamMemberName: s.teamMemberName,
      departmentName: s.departmentName,
      totalAdvances: Number(s.totalAdvances),
      totalConsumed: Number(s.totalConsumed),
      totalPendingReimbursement: Number(s.totalPendingReimbursement),
      balance: Number(s.balance),
      status: s.status as BalanceStatus,
      openReports: 0,
      paidReimbursements: 0,
      hasMixedCurrency: false,
    };
  }
  const all = await computeBalancesLive();
  return all.find((b) => b.teamMemberId === teamMemberId) ?? null;
}
