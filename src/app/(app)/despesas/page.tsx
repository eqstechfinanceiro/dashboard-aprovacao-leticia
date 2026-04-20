import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
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
import { Badge } from "@/components/ui/badge";
import { fmtBRL, fmtDate } from "@/lib/format";
import { getReports } from "@/lib/vexpenses";
import { ExternalLink, ReceiptText } from "lucide-react";
import { KpiCard } from "@/components/shared/kpi-card";
import {
  UpstreamErrorCard,
  isUpstreamError,
} from "@/components/shared/upstream-error-card";

export const dynamic = "force-dynamic";
export const revalidate = 120;

async function ExpensesView() {
  let reports;
  try {
    reports = await getReports(
      {
        include: ["teamMember", "expenses", "expenses.expenseType", "expenses.paymentMethod"],
        perPage: 200,
      },
      { revalidate: 120 },
    );
  } catch (e) {
    if (isUpstreamError(e)) {
      return <UpstreamErrorCard error={e} area="a lista de despesas" />;
    }
    throw e;
  }

  type ExpenseRow = {
    id: number;
    reportId: number;
    date?: string;
    value: number;
    typeName: string;
    memberName: string;
    receipt?: string | null;
    paymentMethod?: string | null;
    affectsAdvance: boolean;
    reimbursable: boolean;
  };

  const rows: ExpenseRow[] = [];
  for (const r of reports) {
    const memberName = r.team_member?.name ?? `#${r.team_member_id}`;
    for (const e of r.expenses ?? []) {
      rows.push({
        id: e.id,
        reportId: r.id,
        date: e.date,
        value: Number(e.value ?? 0),
        typeName: e.expense_type?.name ?? "—",
        memberName,
        receipt: e.receipt_url ?? e.reicept_url ?? null,
        paymentMethod: e.payment_method?.name ?? null,
        affectsAdvance: Boolean(e.payment_method?.affects_advance),
        reimbursable: Boolean(e.payment_method?.reimbursable),
      });
    }
  }

  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const total = rows.reduce((s, r) => s + r.value, 0);
  const reimbursable = rows.filter((r) => r.reimbursable).reduce((s, r) => s + r.value, 0);
  const affectsAdvance = rows.filter((r) => r.affectsAdvance).reduce((s, r) => s + r.value, 0);
  const withReceipt = rows.filter((r) => r.receipt).length;

  const gallery = rows.filter((r) => r.receipt).slice(0, 12);
  const display = rows.slice(0, 300);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total de despesas" value={String(rows.length)} icon={ReceiptText} />
        <KpiCard label="Valor total" value={fmtBRL(total)} />
        <KpiCard label="Reembolsáveis" value={fmtBRL(reimbursable)} accent="info" />
        <KpiCard label="Afetam caixa" value={fmtBRL(affectsAdvance)} accent="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comprovantes recentes</CardTitle>
          <CardDescription>
            {withReceipt} despesas com comprovante anexado. Clique para abrir em nova aba.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {gallery.map((r) => (
            <a
              key={r.id}
              href={r.receipt!}
              target="_blank"
              rel="noreferrer"
              className="group flex aspect-[3/4] flex-col items-center justify-center rounded-lg border bg-muted/30 p-2 text-center text-[11px] text-muted-foreground hover:border-primary/50"
            >
              <ReceiptText className="h-5 w-5" />
              <span className="mt-1 line-clamp-2">{r.typeName}</span>
              <span className="mt-1 font-mono">{fmtBRL(r.value)}</span>
            </a>
          ))}
          {gallery.length === 0 ? (
            <div className="col-span-full py-6 text-center text-sm text-muted-foreground">
              Sem comprovantes.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Despesas individuais</CardTitle>
          <CardDescription>
            Últimas {display.length} despesas. Use a aba <strong>Relatórios</strong>{" "}
            para filtrar por centro de custo, projeto ou colaborador.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Relatório</TableHead>
                <TableHead>Comprovante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {display.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.date)}</TableCell>
                  <TableCell>{r.typeName}</TableCell>
                  <TableCell>{r.memberName}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span>{r.paymentMethod ?? "—"}</span>
                      {r.affectsAdvance ? (
                        <Badge variant="warning">caixa</Badge>
                      ) : null}
                      {r.reimbursable ? (
                        <Badge variant="info">reembolso</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtBRL(r.value)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/relatorios/${r.reportId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      #{r.reportId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {r.receipt ? (
                      <a
                        href={r.receipt}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        abrir
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Despesas"
        description="Itens individuais de despesa entre todos os relatórios da VExpenses."
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <ExpensesView />
      </Suspense>
    </div>
  );
}
