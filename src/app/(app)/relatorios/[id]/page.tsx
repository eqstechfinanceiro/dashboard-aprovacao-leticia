import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ReportStatusBadge } from "@/components/shared/status-badge";
import { WriteFlagBanner } from "@/components/shared/write-flag-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtBRL, fmtDate, fmtDateTime } from "@/lib/format";
import { getReport, VExpensesError } from "@/lib/vexpenses";
import { ApprovalActions } from "@/components/reports/approval-actions";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import {
  UpstreamErrorCard,
  isUpstreamError,
} from "@/components/shared/upstream-error-card";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default async function ReportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  let report;
  try {
    report = await getReport(
      id,
      [
        "teamMember",
        "costsCenter",
        "project",
        "expenses",
        "expenses.expenseType",
        "expenses.paymentMethod",
        "expenses.costsCenter",
        "expenses.project",
        "approvalFlow",
        "approvalFlow.approvalSteps",
        "approvalFlow.approvalSteps.approvers",
        "history",
        "history.teamMember",
        "advance",
      ],
      { revalidate: 30 },
    );
  } catch (err) {
    if (err instanceof VExpensesError && err.status === 404) notFound();
    if (isUpstreamError(err)) {
      return (
        <div className="space-y-6">
          <PageHeader
            title={`Relatório #${id}`}
            description="VExpenses indisponível — não foi possível carregar o relatório."
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href="/relatorios">
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Voltar
                </Link>
              </Button>
            }
          />
          <UpstreamErrorCard error={err} area={`o relatório #${id}`} />
        </div>
      );
    }
    throw err;
  }

  const expenses = report.expenses ?? [];
  const history = report.history ?? [];
  const advances = Array.isArray(report.advance)
    ? report.advance
    : report.advance
      ? [report.advance]
      : [];
  const totalAdvance = advances.reduce((s, a) => s + Number(a.value ?? 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.value ?? 0), 0);
  const reimbursable = expenses
    .filter((e) => e.payment_method?.reimbursable)
    .reduce((s, e) => s + Number(e.value ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Relatório #${report.id}`}
        description={report.description ?? "(sem descrição)"}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/relatorios">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ReportStatusBadge status={report.status} />
        {report.payment_date ? (
          <Badge variant="info">Pago em {fmtDate(report.payment_date)}</Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">
          Atualizado em {fmtDateTime(report.updated_at)}
        </span>
      </div>

      <WriteFlagBanner />
      <ApprovalActions report={report} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Colaborador</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-medium">{report.team_member?.name ?? `#${report.team_member_id}`}</div>
            <div className="text-muted-foreground">
              {report.team_member?.email ?? "—"}
            </div>
            <div className="text-muted-foreground">
              Setor: {report.team_member?.departmentName ?? "—"}
            </div>
            {report.team_member_id ? (
              <Button asChild size="sm" variant="link" className="px-0">
                <Link href={`/colaboradores/${report.team_member_id}`}>
                  Ver perfil
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Centro de custo / Projeto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>CC: {report.costs_center?.name ?? "—"}</div>
            <div>Projeto: {report.project?.name ?? "—"}</div>
            <div>Fluxo: {report.approval_flow?.name ?? "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Totais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Total" value={fmtBRL(report.total ?? totalExpenses)} strong />
            <Row label="Adiantamento" value={fmtBRL(totalAdvance)} />
            <Row label="Reembolsável" value={fmtBRL(reimbursable)} />
            <Row
              label="Saldo (reembolso)"
              value={fmtBRL(reimbursable - totalAdvance)}
            />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="expenses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="expenses">
            Despesas ({expenses.length})
          </TabsTrigger>
          <TabsTrigger value="flow">
            Fluxo de aprovação ({report.approval_flow?.steps?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="history">
            Histórico ({history.length})
          </TabsTrigger>
          <TabsTrigger value="attachments">Comprovantes</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Forma de pagamento</TableHead>
                    <TableHead>CC</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Comprovante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => {
                    const receipt = e.receipt_url ?? e.reicept_url ?? null;
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{fmtDate(e.date)}</TableCell>
                        <TableCell>{e.expense_type?.name ?? "—"}</TableCell>
                        <TableCell className="max-w-[260px] truncate">
                          {e.description ?? "—"}
                        </TableCell>
                        <TableCell>
                          {e.payment_method?.name ?? "—"}
                          {e.payment_method?.affects_advance ? (
                            <Badge variant="warning" className="ml-1">
                              afeta caixa
                            </Badge>
                          ) : null}
                          {e.payment_method?.reimbursable ? (
                            <Badge variant="info" className="ml-1">
                              reembolsável
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{e.costs_center?.name ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtBRL(e.value)}
                        </TableCell>
                        <TableCell>
                          {receipt ? (
                            <a
                              href={receipt}
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
                    );
                  })}
                  {expenses.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Sem despesas neste relatório.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flow">
          <Card>
            <CardHeader>
              <CardTitle>{report.approval_flow?.name ?? "Sem fluxo"}</CardTitle>
              <CardDescription>
                Etapas do fluxo e aprovadores deste relatório.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(report.approval_flow?.steps ?? []).map((step) => (
                <div key={step.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      Etapa {step.order} · lógica {step.logic ?? "AND"}
                    </div>
                    {step.entrance_value ? (
                      <Badge variant="outline">
                        entrada ≥ {fmtBRL(step.entrance_value)}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(step.approvers ?? []).map((a) => (
                      <Badge
                        key={a.id}
                        variant={a.approved ? "success" : "secondary"}
                      >
                        Aprovador #{a.team_member_id}{" "}
                        {a.approved ? "· aprovou" : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
              {(report.approval_flow?.steps ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum fluxo associado.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="space-y-3 p-4">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem histórico.</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 border-b pb-2">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{h.action}</div>
                      <div className="text-xs text-muted-foreground">
                        {h.team_member?.name ?? `#${h.team_member_id}`} ·{" "}
                        {fmtDateTime(h.created_at)}
                      </div>
                      {h.description ? (
                        <div className="text-sm">{h.description}</div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments">
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
              {expenses
                .map((e) => e.receipt_url ?? e.reicept_url)
                .filter((u): u is string => !!u)
                .map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex aspect-[3/4] items-center justify-center rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground hover:border-primary/50"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <FileText className="h-6 w-6" />
                      Comprovante {i + 1}
                    </div>
                  </a>
                ))}
              {expenses.every((e) => !(e.receipt_url ?? e.reicept_url)) ? (
                <div className="col-span-full py-6 text-center text-sm text-muted-foreground">
                  Nenhum comprovante anexado.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "font-mono"}>{value}</span>
    </div>
  );
}
