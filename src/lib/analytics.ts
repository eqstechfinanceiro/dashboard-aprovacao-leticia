import "server-only";
import type { Report } from "@/types/vexpenses";
import { differenceInHours, parseISO } from "date-fns";

/** Aggregations reused across Visão geral, Análises, and IA. */

export interface ApprovalTimeStats {
  averageHours: number;
  medianHours: number;
  p90Hours: number;
  byDepartment: Array<{ name: string; averageHours: number; count: number }>;
  byApprover: Array<{ name: string; averageHours: number; count: number }>;
}

export interface StatusBucket {
  status: string;
  count: number;
  total: number;
}

export interface ValueByBucket {
  key: string;
  label: string;
  value: number;
  count: number;
}

export function computeStatusBuckets(reports: Report[]): StatusBucket[] {
  const map = new Map<string, StatusBucket>();
  for (const r of reports) {
    const s = r.status ?? "UNKNOWN";
    const bucket = map.get(s) ?? { status: s, count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += Number(r.total ?? 0);
    map.set(s, bucket);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function computeTopCostsCenters(
  reports: Report[],
  limit = 10,
): ValueByBucket[] {
  const map = new Map<string, ValueByBucket>();
  for (const r of reports) {
    const key = r.costs_center?.name ?? "Sem centro de custo";
    const bucket = map.get(key) ?? { key, label: key, value: 0, count: 0 };
    bucket.value += Number(r.total ?? 0);
    bucket.count += 1;
    map.set(key, bucket);
  }
  return Array.from(map.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function computeTopMembers(
  reports: Report[],
  limit = 10,
): ValueByBucket[] {
  const map = new Map<string, ValueByBucket>();
  for (const r of reports) {
    const name = r.team_member?.name ?? `#${r.team_member_id ?? "?"}`;
    const key = String(r.team_member_id ?? name);
    const bucket = map.get(key) ?? { key, label: name, value: 0, count: 0 };
    bucket.value += Number(r.total ?? 0);
    bucket.count += 1;
    map.set(key, bucket);
  }
  return Array.from(map.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function computeApprovalTimeStats(
  reports: Report[],
): ApprovalTimeStats {
  const diffs: number[] = [];
  const byDept = new Map<string, { total: number; count: number }>();

  for (const r of reports) {
    if (!r.sent_at || !r.approved_at) continue;
    const hours = differenceInHours(
      parseISO(r.approved_at),
      parseISO(r.sent_at),
    );
    if (hours < 0 || hours > 24 * 60) continue;
    diffs.push(hours);
    const dept = r.team_member?.departmentName ?? "Sem setor";
    const agg = byDept.get(dept) ?? { total: 0, count: 0 };
    agg.total += hours;
    agg.count += 1;
    byDept.set(dept, agg);
  }

  if (diffs.length === 0) {
    return {
      averageHours: 0,
      medianHours: 0,
      p90Hours: 0,
      byDepartment: [],
      byApprover: [],
    };
  }

  diffs.sort((a, b) => a - b);
  const sum = diffs.reduce((s, v) => s + v, 0);
  const average = sum / diffs.length;
  const median = diffs[Math.floor(diffs.length / 2)];
  const p90 = diffs[Math.floor(diffs.length * 0.9)];

  return {
    averageHours: average,
    medianHours: median,
    p90Hours: p90,
    byDepartment: Array.from(byDept.entries())
      .map(([name, v]) => ({
        name,
        averageHours: v.total / v.count,
        count: v.count,
      }))
      .sort((a, b) => a.averageHours - b.averageHours),
    byApprover: [],
  };
}

export function computeTimeSeries(
  reports: Report[],
  granularity: "day" | "week" | "month" = "day",
): Array<{ date: string; approved: number; paid: number; count: number }> {
  const map = new Map<
    string,
    { date: string; approved: number; paid: number; count: number }
  >();
  for (const r of reports) {
    const source = r.approved_at ?? r.sent_at ?? r.created_at;
    if (!source) continue;
    const key = bucketKey(source, granularity);
    const entry = map.get(key) ?? {
      date: key,
      approved: 0,
      paid: 0,
      count: 0,
    };
    entry.count += 1;
    const value = Number(r.total ?? 0);
    if (r.status === "APROVADO") entry.approved += value;
    if (r.status === "PAGO") entry.paid += value;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function bucketKey(iso: string, granularity: "day" | "week" | "month"): string {
  const date = parseISO(iso);
  if (granularity === "month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (granularity === "week") {
    const onejan = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(
      ((date.getTime() - onejan.getTime()) / 86400000 + onejan.getUTCDay() + 1) /
        7,
    );
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return (curr - prev) / prev;
}
