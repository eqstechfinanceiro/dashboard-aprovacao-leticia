import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getReports, getTeamMember, VExpensesError } from "@/lib/vexpenses";
import {
  BalanceStatusBadge,
  ReportStatusBadge,
} from "@/components/shared/status-badge";
import { buildBalances } from "@/lib/cash-balance";
import { fmtBRL, fmtDate } from "@/lib/format";
import { AdvanceButton } from "@/components/cash/advance-button";
import {
  UpstreamErrorCard,
  isUpstreamError,
} from "@/components/shared/upstream-error-card";

export const dynamic = "force-dynamic";
export const revalidate = 120;

export default async function MemberDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  let member;
  try {
    member = await getTeamMember(id, { revalidate: 300 });
  } catch (e) {
    if (e instanceof VExpensesError && e.status === 404) notFound();
    throw e;
  }

  let reports: Awaited<ReturnType<typeof getReports>> = [];
  let reportsError: unknown = null;
  try {
    reports = await getReports(
      {
        teamMemberId: id,
        include: [
          "teamMember",
          "expenses",
          "expenses.paymentMethod",
          "costsCenter",
          "advance",
        ],
        perPage: 300,
      },
      { revalidate: 60 },
    );
  } catch (e) {
    if (isUpstreamError(e)) {
      reportsError = e;
    } else {
      throw e;
    }
  }

  const [balance] = buildBalances([member], reports, []);

  const byStatus = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title={member.name}
        description={member.email ?? member.departmentName ?? undefined}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/colaboradores">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Voltar
              </Link>
            </Button>
            <AdvanceButton
              teamMemberId={member.id}
              teamMemberName={member.name}
              balance={balance?.balance ?? 0}
              status={balance?.status ?? "QUITADO"}
            />
          </>
        }
      />

      {reportsError ? (
        <UpstreamErrorCard
          error={reportsError}
          area="os relatórios deste colaborador"
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Saldo"
          value={fmtBRL(balance?.balance ?? 0)}
          hint={balance?.status ?? "QUITADO"}
          accent={
            balance?.status === "DEVEDOR"
              ? "destructive"
              : balance?.status === "CREDOR"
                ? "success"
                : "default"
          }
          icon={Wallet}
        />
        <KpiCard
          label="Adiantamentos"
          value={fmtBRL(balance?.totalAdvances ?? 0)}
        />
        <KpiCard
          label="Consumido (caixa)"
          value={fmtBRL(balance?.totalConsumed ?? 0)}
        />
        <KpiCard
          label="Reembolso pendente"
          value={fmtBRL(balance?.totalPendingReimbursement ?? 0)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {balance ? <BalanceStatusBadge status={balance.status} /> : null}
        <Badge variant="outline">Setor: {member.departmentName ?? "—"}</Badge>
        <Badge variant="outline">Papel: {member.role ?? "user"}</Badge>
        <Badge variant="outline">
          {reports.length} relatório{reports.length === 1 ? "" : "s"}
        </Badge>
        {Object.entries(byStatus).map(([s, n]) => (
          <Badge key={s} variant="secondary">
            {s}: {n}
          </Badge>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Relatórios do colaborador</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Atualizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/relatorios/${r.id}`}
                      className="font-mono text-xs hover:underline"
                    >
                      #{r.id}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate">
                    {r.description ?? "—"}
                  </TableCell>
                  <TableCell>{r.costs_center?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">
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
              {reports.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Sem relatórios.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
