import { addDays, startOfDay, startOfMonth, subDays } from "date-fns";

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string;
}

export function last30Days(): DateRange {
  const end = startOfDay(new Date());
  const start = subDays(end, 29);
  return {
    startDate: iso(start),
    endDate: iso(end),
    label: "Últimos 30 dias",
  };
}

export function thisMonth(): DateRange {
  const end = startOfDay(new Date());
  const start = startOfMonth(end);
  return {
    startDate: iso(start),
    endDate: iso(end),
    label: "Este mês",
  };
}

export function rangeFromPreset(preset: string): DateRange {
  switch (preset) {
    case "7d": {
      const end = startOfDay(new Date());
      return {
        startDate: iso(subDays(end, 6)),
        endDate: iso(end),
        label: "Últimos 7 dias",
      };
    }
    case "90d": {
      const end = startOfDay(new Date());
      return {
        startDate: iso(subDays(end, 89)),
        endDate: iso(end),
        label: "Últimos 90 dias",
      };
    }
    case "ytd": {
      const now = new Date();
      return {
        startDate: iso(new Date(now.getFullYear(), 0, 1)),
        endDate: iso(now),
        label: "Ano atual",
      };
    }
    case "month":
      return thisMonth();
    case "all":
      return {
        startDate: iso(new Date(2000, 0, 1)),
        endDate: iso(addDays(new Date(), 1)),
        label: "Todo o período",
      };
    case "30d":
    default:
      return last30Days();
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
