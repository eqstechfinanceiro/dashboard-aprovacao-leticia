import Link from "next/link";
import { Suspense } from "react";
import { ArrowDown, ArrowUp, Minus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { BalanceStatusBadge } from "@/components/shared/status-badge";
import { WriteFlagBanner } from "@/components/shared/write-flag-banner";
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
import { fmtBRL, fmtRelative } from "@/lib/format";
import { computeBalancesLive } from "@/lib/cash-balance";
import { AdvanceButton } from "@/components/cash/advance-button";

export const dynamic = "force-dynamic";
export const revalidate = 120;

async function CashView() {
  const balances = await computeBalancesLive();

  const devedores = balances.filter((b) => b.status === "DEVEDOR");
  const credores = balances.filter((b) => b.status === "CREDOR");
  const quitados = balances.filter((b) => b.status === "QUITADO");
  const totalDevedor = devedores.reduce((s, b) => s + b.balance, 0);
  const totalCredor = credores.reduce((s, b) => s + b.balance, 0);

  return (
    <>
      <WriteFlagBanner />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Colaboradores devedores"
          value={String(devedores.length)}
          hint={`Total: ${fmtBRL(Math.abs(totalDevedor))}`}
          accent="destructive"
          icon={ArrowDown}
        />
        <KpiCard
          label="Colaboradores credores"
          value={String(credores.length)}
          hint={`Total: ${fmtBRL(totalCredor)}`}
          accent="success"
          icon={ArrowUp}
        />
        <KpiCard
          label="Quitados"
          value={String(quitados.length)}
          icon={Minus}
        />
        <KpiCard
          label="Total analisado"
          value={String(balances.length)}
          hint="colaboradores com movimento"
          icon={Wallet}
        />
      </div>

      <Tabs defaultValue="devedores" className="space-y-4">
        <TabsList>
          <TabsTrigger value="devedores">
            Devedores ({devedores.length})
          </TabsTrigger>
          <TabsTrigger value="credores">
            Credores ({credores.length})
          </TabsTrigger>
          <TabsTrigger value="todos">Todos ({balances.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="devedores">
          <BalanceTable rows={devedores} />
        </TabsContent>
        <TabsContent value="credores">
          <BalanceTable rows={credores} />
        </TabsContent>
        <TabsContent value="todos">
          <BalanceTable rows={balances} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function BalanceTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof computeBalancesLive>>;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Ninguém nessa categoria no momento.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saldo por colaborador</CardTitle>
        <CardDescription>
          Saldo = adiantamentos − despesas que afetam caixa − reembolsos
          pendentes.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead className="text-right">Adiantamentos</TableHead>
              <TableHead className="text-right">Consumido</TableHead>
              <TableHead className="text-right">Reembolso pendente</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último mov.</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.teamMemberId}>
                <TableCell>
                  <Link
                    href={`/colaboradores/${b.teamMemberId}`}
                    className="hover:underline"
                  >
                    {b.teamMemberName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {b.departmentName ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtBRL(b.totalAdvances)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtBRL(b.totalConsumed)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmtBRL(b.totalPendingReimbursement)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {fmtBRL(b.balance)}
                </TableCell>
                <TableCell>
                  <BalanceStatusBadge status={b.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {b.lastMovementAt ? fmtRelative(b.lastMovementAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <AdvanceButton
                    teamMemberId={b.teamMemberId}
                    teamMemberName={b.teamMemberName}
                    balance={b.balance}
                    status={b.status}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function CashPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Caixa"
        description="Saldo de cada colaborador e gestão de adiantamentos."
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <CashView />
      </Suspense>
    </div>
  );
}
