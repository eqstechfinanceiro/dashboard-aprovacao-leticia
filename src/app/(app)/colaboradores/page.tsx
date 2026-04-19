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
import { getTeamMembers } from "@/lib/vexpenses";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const revalidate = 300;

async function MembersList() {
  const members = await getTeamMembers({ revalidate: 300 });
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
  const admins = members.filter((m) => m.role === "admin").length;
  const active = members.filter((m) => m.active !== false).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{members.length} colaboradores</CardTitle>
        <CardDescription>
          {admins} administradores · {active} ativos
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link href={`/colaboradores/${m.id}`} className="hover:underline">
                    {m.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.email ?? "—"}
                </TableCell>
                <TableCell>{m.departmentName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                    {m.role ?? "user"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={m.active !== false ? "success" : "secondary"}>
                    {m.active !== false ? "Ativo" : "Inativo"}
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

export default function MembersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Colaboradores"
        description="Membros do time extraídos da VExpenses."
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <MembersList />
      </Suspense>
    </div>
  );
}
