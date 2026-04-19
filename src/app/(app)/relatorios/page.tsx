import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ReportStatusBadge } from "@/components/shared/status-badge";
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
import { fmtBRL, fmtDate } from "@/lib/format";
import { getReports } from "@/lib/vexpenses";
import { ReportFilters } from "@/components/reports/report-filters";
import type { ReportStatus } from "@/types/vexpenses";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface PageProps {
  searchParams: {
    status?: string;
    search?: string;
    page?: string;
  };
}

async function ReportsList({ searchParams }: PageProps) {
  const status = searchParams.status as ReportStatus | undefined;
  const search = searchParams.search?.trim();
  const page = Number(searchParams.page ?? 1);
  const perPage = 50;

  const reports = await getReports(
    {
      status,
      search,
      page,
      perPage,
      include: ["teamMember", "costsCenter", "project"],
    },
    { revalidate: 60 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {reports.length} relatório{reports.length === 1 ? "" : "s"}
        </CardTitle>
        <CardDescription>
          Página {page}. Use os filtros acima para refinar.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Centro de custo</TableHead>
              <TableHead>Projeto</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/relatorios/${r.id}`} className="hover:underline">
                    #{r.id}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[260px] truncate">
                  {r.description ?? "—"}
                </TableCell>
                <TableCell>{r.team_member?.name ?? "—"}</TableCell>
                <TableCell>{r.costs_center?.name ?? "—"}</TableCell>
                <TableCell>{r.project?.name ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtBRL(r.total ?? 0)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {fmtDate(r.updated_at)}
                </TableCell>
                <TableCell>
                  <ReportStatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
            {reports.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Nenhum relatório encontrado.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage(props: PageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Todos os relatórios de despesa sincronizados da VExpenses."
      />
      <ReportFilters />
      <Suspense
        key={JSON.stringify(props.searchParams)}
        fallback={<Skeleton className="h-[600px] w-full" />}
      >
        <ReportsList {...props} />
      </Suspense>
    </div>
  );
}
