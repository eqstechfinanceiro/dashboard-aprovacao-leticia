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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, KeyRound, ShieldAlert, Database } from "lucide-react";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function SettingsView() {
  const hasToken = Boolean(process.env.VEXPENSES_TOKEN);
  const hasDb = Boolean(process.env.DATABASE_URL);
  const writesEnabled = process.env.ENABLE_WRITES === "true";

  let recentAudit: (typeof schema.auditLog.$inferSelect)[] = [];
  let dbOk = false;
  let dbError: string | null = null;
  try {
    recentAudit = await db()
      .select()
      .from(schema.auditLog)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(20);
    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> VExpenses API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Token configurado"
              value={hasToken ? "Sim" : "Não"}
              ok={hasToken}
            />
            <Row label="Base URL" value="https://api.vexpenses.com" ok />
            <Row
              label="Rate limit"
              value="100 req/min (automatic cache)"
              ok
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" /> Neon Postgres
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="DATABASE_URL"
              value={hasDb ? "Configurado" : "Não configurado"}
              ok={hasDb}
            />
            <Row
              label="Conexão"
              value={dbOk ? "OK" : "Falhou"}
              ok={dbOk}
            />
            {dbError ? (
              <p className="text-xs text-destructive">{dbError}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" /> Escritas VExpenses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="ENABLE_WRITES"
              value={writesEnabled ? "Ligado" : "Desligado"}
              ok={writesEnabled}
              danger={writesEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Quando ligado, aprovar/reprovar/pagar/adiantar chamam a API real.
              Por segurança, começa desligado. Controle em{" "}
              <code>.env.local</code> ou Vercel Settings.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria recente</CardTitle>
          <CardDescription>
            Últimas 20 ações executadas pelo dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Autor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAudit.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-muted-foreground">
                    {fmtDateTime(a.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{a.action}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {a.entity}
                    {a.entityId ? `:${a.entityId}` : ""}
                  </TableCell>
                  <TableCell>{a.actorEmail ?? "—"}</TableCell>
                </TableRow>
              ))}
              {recentAudit.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    {dbOk
                      ? "Sem eventos ainda."
                      : "Configure DATABASE_URL e rode npm run db:push."}
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

function Row({
  label,
  value,
  ok,
  danger,
}: {
  label: string;
  value: string;
  ok?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 font-mono text-xs">
        {value}
        {ok ? (
          <CheckCircle2
            className={danger ? "h-3 w-3 text-warning" : "h-3 w-3 text-success"}
          />
        ) : (
          <ShieldAlert className="h-3 w-3 text-destructive" />
        )}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Integrações, flags e auditoria do dashboard."
      />
      <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
        <SettingsView />
      </Suspense>
    </div>
  );
}
