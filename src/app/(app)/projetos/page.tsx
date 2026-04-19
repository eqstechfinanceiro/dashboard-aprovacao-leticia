import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
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
import { fmtBRL } from "@/lib/format";
import { getProjects, getReports } from "@/lib/vexpenses";

export const dynamic = "force-dynamic";
export const revalidate = 300;

async function ProjectsView() {
  const [projects, reports] = await Promise.all([
    getProjects({ revalidate: 600 }),
    getReports({ include: ["project"], perPage: 500 }, { revalidate: 300 }),
  ]);

  const totals = new Map<number, { value: number; count: number }>();
  for (const r of reports) {
    const id = r.project?.id ?? r.project_id ?? 0;
    const bucket = totals.get(id) ?? { value: 0, count: 0 };
    bucket.value += Number(r.total ?? 0);
    bucket.count += 1;
    totals.set(id, bucket);
  }

  const rows = projects.map((p) => ({
    ...p,
    total: totals.get(p.id)?.value ?? 0,
    count: totals.get(p.id)?.count ?? 0,
  }));
  rows.sort((a, b) => b.total - a.total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{rows.length} projetos</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">Relatórios</TableHead>
              <TableHead className="text-right">Valor total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell className="text-right">{p.count}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtBRL(p.total)}
                </TableCell>
                <TableCell>
                  <Badge variant={p.active !== false ? "success" : "secondary"}>
                    {p.active !== false ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Projetos"
        description="Projetos cadastrados na VExpenses com totalização por valor."
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <ProjectsView />
      </Suspense>
    </div>
  );
}
