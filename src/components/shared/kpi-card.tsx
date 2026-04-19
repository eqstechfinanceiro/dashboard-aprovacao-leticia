import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    direction: "up" | "down" | "flat";
    label?: string;
    good?: "up" | "down";
  };
  accent?: "default" | "success" | "warning" | "destructive" | "info";
}

const ACCENT_CLASSES: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  accent = "default",
}: KpiCardProps) {
  const trendDir = trend?.direction ?? "flat";
  const TrendIcon =
    trendDir === "up" ? ArrowUpRight : trendDir === "down" ? ArrowDownRight : Minus;
  const goodDirection = trend?.good ?? "up";
  const isGood =
    trendDir === "flat"
      ? true
      : goodDirection === "up"
        ? trendDir === "up"
        : trendDir === "down";
  const trendColor =
    trendDir === "flat"
      ? "text-muted-foreground"
      : isGood
        ? "text-success"
        : "text-destructive";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {Icon ? (
          <Icon
            className={cn("h-4 w-4 text-muted-foreground", ACCENT_CLASSES[accent])}
          />
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={cn("text-2xl font-semibold", ACCENT_CLASSES[accent])}>
          {value}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend ? (
            <span className={cn("inline-flex items-center gap-0.5", trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend.value).toLocaleString("pt-BR", {
                style: "percent",
                minimumFractionDigits: 1,
              })}
            </span>
          ) : null}
          {hint ? <span>{hint}</span> : null}
          {trend?.label ? <span>{trend.label}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
