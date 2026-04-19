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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { db, schema } from "@/db";
import { AIRulesManager } from "@/components/ai/rules-manager";
import { AIAdviceChat } from "@/components/ai/advice-chat";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function AIView() {
  let rules: (typeof schema.aiRules.$inferSelect)[] = [];
  try {
    rules = await db().select().from(schema.aiRules);
  } catch (e) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Banco não configurado</CardTitle>
          <CardDescription>
            A IA Consultora persiste regras no Neon. Configure{" "}
            <code>DATABASE_URL</code> e rode as migrações (
            <code>npm run db:push</code>) para começar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
            {String(e instanceof Error ? e.message : e)}
          </pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="rules" className="space-y-4">
      <TabsList>
        <TabsTrigger value="rules">
          Regras programadas ({rules.length})
        </TabsTrigger>
        <TabsTrigger value="chat">Chat contextual</TabsTrigger>
      </TabsList>
      <TabsContent value="rules">
        <AIRulesManager initial={rules} />
      </TabsContent>
      <TabsContent value="chat">
        <AIAdviceChat />
      </TabsContent>
    </Tabs>
  );
}

export default function AIPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="IA Consultora"
        description="Regras no-code para sugestões e ações + chat contextual para análise ad-hoc."
        actions={
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" /> MVP
          </Badge>
        }
      />
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <AIView />
      </Suspense>
    </div>
  );
}
