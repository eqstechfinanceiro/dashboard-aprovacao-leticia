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
import { getCostsCenters, getReports } from "@/lib/vexpenses";

export const dynamic = "force-dynamic";
export const revalidate = 300;

async function CostsCentersView() {
  const [ccs, reports] = await Promise.all([
    getCostsCenters({ revalidate: 600 }),
    getReports({ include: ["costsCenter"], perPage: 500 }, { revalidate: 300 }),
  ]);

  const totals = new Map<number, { value: number; count: number }>();
  for (const r of reports) {
    const id = r.costs_center?.id ?? r.costs_center_id ?? 0;
    const bucket = totals.get(id) ?? { value: 0, count: 0 };
    bucket.value += Number(r.total ?? 0);
    bucket.count += 1;
    totals.set(id, bucket);
  }

  const rows = ccs.map((c) => ({
    ...c,
    total: totals.get(c.id)?.value ?? 0,
    count: totals.get(c.id)?.count ?? 0,
  }));
  rows.sort((a, b) => b.total - a.total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{rows.length} centros de custo</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Código</TableHead>
              <TableHead className="text-right">Relatórios</TableHead>
              <TableHead className="text-right">Valor total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {c.code ?? "—"}
                </TableCell>
                <TableCell className="text-right">{c.count}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmtBRL(c.total)}
                </TableCell>
                <TableCell>
                  <Badge variant={c.active !== false ? "success" : "secondary"}>
                    {c.active !== false ? "Ativo" : "Inativo"}
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

export default function CostsCentersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Centros de custo"
        description="Totalização de relatórios por centro de custo."
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <CostsCentersView />
      </Suspense>
    </div>
  );
}
