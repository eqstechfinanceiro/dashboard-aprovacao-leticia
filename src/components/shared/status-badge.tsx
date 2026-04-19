import { Badge } from "@/components/ui/badge";
import type { ReportStatus } from "@/types/vexpenses";
import type { BalanceStatus } from "@/lib/cash-balance";
import { cn } from "@/lib/utils";

const REPORT_VARIANT: Record<
  ReportStatus,
  "default" | "secondary" | "destructive" | "success" | "warning" | "info"
> = {
  ABERTO: "secondary",
  ENVIADO: "info",
  APROVADO: "success",
  REPROVADO: "destructive",
  REABERTO: "warning",
  PAGO: "default",
};

const REPORT_LABEL: Record<ReportStatus, string> = {
  ABERTO: "Aberto",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  REABERTO: "Reaberto",
  PAGO: "Pago",
};

export function ReportStatusBadge({
  status,
  className,
}: {
  status: ReportStatus | string;
  className?: string;
}) {
  const variant =
    REPORT_VARIANT[status as ReportStatus] ?? ("secondary" as const);
  const label = REPORT_LABEL[status as ReportStatus] ?? status;
  return (
    <Badge variant={variant} className={cn("uppercase", className)}>
      {label}
    </Badge>
  );
}

const BALANCE_VARIANT: Record<BalanceStatus, "success" | "secondary" | "destructive"> =
  {
    DEVEDOR: "destructive",
    QUITADO: "secondary",
    CREDOR: "success",
  };

const BALANCE_LABEL: Record<BalanceStatus, string> = {
  DEVEDOR: "Devedor",
  QUITADO: "Quitado",
  CREDOR: "Credor",
};

export function BalanceStatusBadge({
  status,
  className,
}: {
  status: BalanceStatus;
  className?: string;
}) {
  return (
    <Badge variant={BALANCE_VARIANT[status]} className={cn("uppercase", className)}>
      {BALANCE_LABEL[status]}
    </Badge>
  );
}
