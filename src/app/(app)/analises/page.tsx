import { Suspense } from "react";
import { Clock, Timer, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { fmtBRL, fmtDuration } from "@/lib/format";
import { getReports } from "@/lib/vexpenses";
import {
  computeApprovalTimeStats,
  computeStatusBuckets,
  computeTimeSeries,
  computeTopCostsCenters,
  computeTopMembers,
} from "@/lib/analytics";
import {
  UpstreamErrorCard,
  isUpstreamError,
} from "@/components/shared/upstream-error-card";

export const dynamic = "force-dynamic";
export const revalidate = 180;

async function AnalysisView() {
  let reports;
  try {
    reports = await getReports(
      { include: ["teamMember", "costsCenter"], perPage: 1000 },
      { revalidate: 180 },
    );
  } catch (e) {
    if (isUpstreamError(e)) {
      return <UpstreamErrorCard error={e} area="as análises" />;
    }
    throw e;
  }

  const approvalStats = computeApprovalTimeStats(reports);
  const statusBuckets = computeStatusBuckets(reports);
  const timeSeries = computeTimeSeries(reports, "month");
  const topCC = computeTopCostsCenters(reports, 10);
  const topMembers = computeTopMembers(reports, 10);

  // Curva ABC dos colaboradores
  const abcTotal = topMembers.reduce((s, m) => s + m.value, 0);
  let cum = 0;
  const abc = topMembers.map((m) => {
    cum += m.value;
    const pct = abcTotal > 0 ? cum / abcTotal : 0;
    return {
      ...m,
      cumulativePct: pct,
      classification: pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C",
    };
  });

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tempo médio aprovação"
          value={fmtDuration(approvalStats.averageHours / 24)}
          icon={Clock}
        />
        <KpiCard
          label="Mediana aprovação"
          value={fmtDuration(approvalStats.medianHours / 24)}
          icon={Timer}
        />
        <KpiCard
          label="p90 aprovação"
          value={fmtDuration(approvalStats.p90Hours / 24)}
          icon={TrendingUp}
          accent="warning"
        />
        <KpiCard
          label="Relatórios amostrados"
          value={String(
            reports.filter((r) => r.sent_at && r.approved_at).length,
          )}
          hint={`total ${reports.length}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Valor aprovado × pago (mensal)</CardTitle>
            <CardDescription>
              Série temporal considerando o valor total dos relatórios.
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
              height={280}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por status</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>Setores por tempo de aprovação</CardTitle>
          <CardDescription>
            Tempo médio (horas) desde envio até aprovação. Menor = melhor.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setor</TableHead>
                <TableHead className="text-right">Relatórios</TableHead>
                <TableHead className="text-right">Tempo médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvalStats.byDepartment.map((d) => (
                <TableRow key={d.name}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell className="text-right">{d.count}</TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtDuration(d.averageHours / 24)}
                  </TableCell>
                </TableRow>
              ))}
              {approvalStats.byDepartment.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-6 text-center text-muted-foreground"
                  >
                    Sem dados suficientes (faltam{" "}
                    <code>sent_at</code>/<code>approved_at</code>).
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top centros de custo (valor)</CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyBarChart
              data={topCC.map((c) => ({ label: c.label, value: c.value }))}
              xKey="label"
              yKey="value"
              label="Valor"
              horizontal
              height={Math.max(240, topCC.length * 30)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Curva ABC por colaborador</CardTitle>
            <CardDescription>
              Classe A (80% do valor), B (15%), C (5%).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">% acum.</TableHead>
                  <TableHead>Classe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abc.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell>{m.label}</TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtBRL(m.value)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(m.cumulativePct * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell>{m.classification}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function AnalysisPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Análises"
        description="Tempo médio de aprovação, ranking por setor, curva ABC e distribuição de status."
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <AnalysisView />
      </Suspense>
    </div>
  );
}
