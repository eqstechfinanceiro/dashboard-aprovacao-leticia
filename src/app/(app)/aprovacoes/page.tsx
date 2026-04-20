import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ReportStatusBadge } from "@/components/shared/status-badge";
import { KpiCard } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtBRL, fmtDate, fmtRelative, fmtNumber } from "@/lib/format";
import { getReports } from "@/lib/vexpenses";
import type { Report } from "@/types/vexpenses";
import { AlertTriangle, CheckCircle2, Clock, Timer } from "lucide-react";
import { WriteFlagBanner } from "@/components/shared/write-flag-banner";
import {
  UpstreamErrorCard,
  isUpstreamError,
} from "@/components/shared/upstream-error-card";

export const dynamic = "force-dynamic";
export const revalidate = 60;

async function ApprovalsContent() {
  let reports;
  try {
    reports = await getReports(
      {
        status: ["ENVIADO", "REABERTO", "ABERTO"],
        include: ["teamMember", "costsCenter", "approvalFlow"],
        perPage: 300,
      },
      { revalidate: 60 },
    );
  } catch (e) {
    if (isUpstreamError(e)) {
      return (
        <>
          <WriteFlagBanner />
          <UpstreamErrorCard error={e} area="a fila de aprovações" />
        </>
      );
    }
    throw e;
  }

  const pending = reports.filter((r) => r.status === "ENVIADO");
  const reopened = reports.filter((r) => r.status === "REABERTO");
  const drafts = reports.filter((r) => r.status === "ABERTO");

  const pendingValue = sumValue(pending);
  const reopenedValue = sumValue(reopened);

  return (
    <>
      <WriteFlagBanner />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Aguardando aprovação"
          value={fmtNumber(pending.length)}
          hint={fmtBRL(pendingValue)}
          icon={Clock}
          accent="warning"
        />
        <KpiCard
          label="Reabertos"
          value={fmtNumber(reopened.length)}
          hint={fmtBRL(reopenedValue)}
          icon={AlertTriangle}
          accent="warning"
        />
        <KpiCard
          label="Rascunhos"
          value={fmtNumber(drafts.length)}
          icon={Timer}
        />
        <KpiCard
          label="Aprovados (histórico)"
          value={fmtNumber(
            reports.filter((r) => r.status === "APROVADO").length,
          )}
          icon={CheckCircle2}
          accent="success"
        />
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Minha fila ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="reopened">
            Reabertos ({reopened.length})
          </TabsTrigger>
          <TabsTrigger value="drafts">Rascunhos ({drafts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <ApprovalTable reports={pending} emptyMessage="Nenhum relatório aguardando aprovação." />
        </TabsContent>
        <TabsContent value="reopened">
          <ApprovalTable reports={reopened} emptyMessage="Nenhum relatório reaberto." />
        </TabsContent>
        <TabsContent value="drafts">
          <ApprovalTable reports={drafts} emptyMessage="Nenhum rascunho." />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ApprovalTable({
  reports,
  emptyMessage,
}: {
  reports: Report[];
  emptyMessage: string;
}) {
  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Fila de aprovação</CardTitle>
          <CardDescription>
            Clique num relatório para abrir o detalhe e aprovar/rejeitar.
          </CardDescription>
        </div>
        <div className="text-sm text-muted-foreground">
          Total: {fmtBRL(sumValue(reports))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Centro de custo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Enviado</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  <Link
                    href={`/relatorios/${r.id}`}
                    className="hover:underline"
                  >
                    #{r.id}
                  </Link>
                </TableCell>
                <TableCell>{r.team_member?.name ?? `#${r.team_member_id}`}</TableCell>
                <TableCell className="max-w-[260px] truncate">
                  {r.description ?? "—"}
                </TableCell>
                <TableCell>{r.costs_center?.name ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtBRL(r.total ?? 0)}
                </TableCell>
                <TableCell
                  className="text-muted-foreground"
                  title={fmtDate(r.sent_at ?? r.updated_at)}
                >
                  {r.sent_at
                    ? fmtRelative(r.sent_at)
                    : fmtRelative(r.updated_at)}
                </TableCell>
                <TableCell>
                  <ReportStatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function sumValue(list: Report[]): number {
  return list.reduce((s, r) => s + Number(r.total ?? 0), 0);
}

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Aprovações"
        description="Centraliza relatórios que estão aguardando sua análise."
        actions={
          <Button asChild variant="outline">
            <Link href="/configuracoes">Regras de aprovação</Link>
          </Button>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-80" />
          </div>
        }
      >
        <ApprovalsContent />
      </Suspense>
    </div>
  );
}
