import { Suspense } from "react";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MoneyBarChart,
  MoneyLineChart,
  StatusDonut,
} from "@/components/shared/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportStatusBadge } from "@/components/shared/status-badge";
import { fmtBRL, fmtDate, fmtDuration, fmtNumber } from "@/lib/format";
import { getReports } from "@/lib/vexpenses";
import {
  computeApprovalTimeStats,
  computeStatusBuckets,
  computeTimeSeries,
  computeTopCostsCenters,
  computeTopMembers,
} from "@/lib/analytics";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const revalidate = 60;

async function OverviewContent() {
  const reports = await getReports(
    {
      include: ["teamMember", "costsCenter"],
      perPage: 500,
    },
    { revalidate: 120 },
  );

  const total = reports.length;
  const totalValue = reports.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const pending = reports.filter((r) => r.status === "ENVIADO").length;
  const pendingValue = reports
    .filter((r) => r.status === "ENVIADO")
    .reduce((s, r) => s + Number(r.total ?? 0), 0);
  const approved = reports.filter(
    (r) => r.status === "APROVADO" || r.status === "PAGO",
  ).length;
  const paid = reports.filter((r) => r.status === "PAGO").length;

  const approvalStats = computeApprovalTimeStats(reports);
  const statusBuckets = computeStatusBuckets(reports);
  const topCC = computeTopCostsCenters(reports, 7);
  const topMembers = computeTopMembers(reports, 7);
  const timeSeries = computeTimeSeries(reports, "month");

  const approvalRate = total > 0 ? approved / total : 0;
  const recent = [...reports]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, 8);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Relatórios (total)"
          value={fmtNumber(total)}
          hint="na base"
          icon={FileText}
        />
        <KpiCard
          label="Aguardando aprovação"
          value={fmtNumber(pending)}
          hint={fmtBRL(pendingValue)}
          icon={Clock}
          accent="warning"
        />
        <KpiCard
          label="Aprovados"
          value={fmtNumber(approved)}
          hint={`${(approvalRate * 100).toFixed(1)}% de aprovação`}
          icon={CheckCircle2}
          accent="success"
        />
        <KpiCard
          label="Pagos"
          value={fmtNumber(paid)}
          icon={Wallet}
          accent="info"
        />
        <KpiCard
          label="Valor total movimentado"
          value={fmtBRL(totalValue)}
          icon={DollarSign}
        />
        <KpiCard
          label="Tempo médio aprovação"
          value={fmtDuration(approvalStats.averageHours / 24)}
          hint={`p90: ${fmtDuration(approvalStats.p90Hours / 24)}`}
          icon={ReceiptText}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Valor aprovado × pago (por mês)</CardTitle>
            <CardDescription>
              Somatório do valor total dos relatórios por mês, desde o primeiro
              registro na API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MoneyLineChart
              data={timeSeries}
              xKey="date"
              series={[
                { key: "approved", label: "Aprovado" },
                { key: "paid", label: "Pago" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status dos relatórios</CardTitle>
            <CardDescription>
              Distribuição atual por status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatusDonut
              data={statusBuckets.map((b) => ({
                name: b.status,
                value: b.count,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Top centros de custo</CardTitle>
              <CardDescription>Somatório por valor aprovado.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/centros-custo">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <MoneyBarChart
              data={topCC.map((c) => ({ label: c.label, value: c.value }))}
              xKey="label"
              yKey="value"
              label="Valor total"
              horizontal
              height={Math.max(220, topCC.length * 30)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Top colaboradores</CardTitle>
              <CardDescription>
                Quem mais movimenta valor no período.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/colaboradores">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <MoneyBarChart
              data={topMembers.map((c) => ({ label: c.label, value: c.value }))}
              xKey="label"
              yKey="value"
              label="Valor total"
              horizontal
              height={Math.max(220, topMembers.length * 30)}
              color="hsl(142 71% 45%)"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>
              Últimos relatórios atualizados na VExpenses.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/relatorios">Ver relatórios</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Atualizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/relatorios/${r.id}`}
                      className="hover:underline"
                    >
                      #{r.id}
                    </Link>
                  </TableCell>
                  <TableCell>{r.team_member?.name ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    {r.description ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {fmtBRL(r.total ?? 0)}
                  </TableCell>
                  <TableCell>
                    <ReportStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(r.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-64" />
    </>
  );
}

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description="Painel da EQS com os principais indicadores financeiros e de aprovação."
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}
