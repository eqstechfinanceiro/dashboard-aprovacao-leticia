import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const NUMBER = new Intl.NumberFormat("pt-BR");

const PERCENT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function fmtBRL(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return BRL.format(n);
}

export function fmtCurrency(
  value: number | string | null | undefined,
  currencyCode: string = "BRL",
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currencyCode,
    }).format(n);
  } catch {
    return `${currencyCode} ${n.toFixed(2)}`;
  }
}

export function fmtNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return NUMBER.format(n);
}

export function fmtPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return PERCENT.format(value);
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export function fmtRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: ptBR });
}

export function fmtDuration(days: number | null | undefined): string {
  if (days == null || Number.isNaN(days)) return "—";
  const d = Math.abs(days);
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 30) return `${d.toFixed(1)}d`;
  return `${(d / 30).toFixed(1)} meses`;
}

export function initialsFromName(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
