import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Lightbulb,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";
import { computeAdvice, type Advice, type AdviceSeverity } from "@/lib/ai-advice";

const SEVERITY_STYLES: Record<
  AdviceSeverity,
  { border: string; badge: string; icon: JSX.Element; label: string }
> = {
  critical: {
    border: "border-destructive/40 bg-destructive/5",
    badge: "bg-destructive text-destructive-foreground",
    icon: <AlertCircle className="h-4 w-4 text-destructive" />,
    label: "Crítico",
  },
  warning: {
    border: "border-warning/40 bg-warning/5",
    badge: "bg-warning text-warning-foreground",
    icon: <AlertTriangle className="h-4 w-4 text-warning" />,
    label: "Atenção",
  },
  info: {
    border: "border-border",
    badge: "bg-secondary text-secondary-foreground",
    icon: <Info className="h-4 w-4 text-muted-foreground" />,
    label: "Insight",
  },
  success: {
    border: "border-success/40 bg-success/5",
    badge: "bg-success text-success-foreground",
    icon: <CheckCircle2 className="h-4 w-4 text-success" />,
    label: "Oportunidade",
  },
};

export async function AdviceCards() {
  let result: Awaited<ReturnType<typeof computeAdvice>>;
  try {
    result = await computeAdvice();
  } catch (e) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Não foi possível calcular recomendações agora
          </CardTitle>
          <CardDescription>
            A API da VExpenses pode estar instável ou o banco indisponível.
            Abra novamente em instantes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
            {e instanceof Error ? e.message : String(e)}
          </pre>
        </CardContent>
      </Card>
    );
  }

  const { advice, generatedAt, source } = result;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5" />
        <span>
          {advice.length} recomendação(ões) a partir de {source.reports}{" "}
          relatórios e {source.balances} colaboradores.
        </span>
        <span>·</span>
        <span>Gerado em {fmtDateTime(generatedAt)}</span>
      </div>

      {advice.length === 0 ? (
        <Card className="border-success/40 bg-success/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Tudo em ordem
            </CardTitle>
            <CardDescription>
              Nenhuma regra foi disparada. Volte depois — as regras são
              avaliadas a cada acesso à aba IA.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {advice.map((a) => (
            <AdviceCard key={a.id} advice={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdviceCard({ advice }: { advice: Advice }) {
  const style = SEVERITY_STYLES[advice.severity];
  return (
    <Card className={style.border}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <div className="mt-0.5">{style.icon}</div>
            <div className="space-y-1">
              <CardTitle className="text-base leading-tight">
                {advice.title}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge
                  variant="outline"
                  className="h-5 border-transparent px-1.5 text-[10px] uppercase tracking-wide"
                  style={{}}
                >
                  {style.label}
                </Badge>
                <span className="text-muted-foreground">· {advice.rule}</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-sm text-muted-foreground">{advice.body}</p>
        {advice.metric ? (
          <div className="text-sm font-medium">{advice.metric}</div>
        ) : null}
        {advice.samples && advice.samples.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {advice.samples.map((s, i) => (
              <li key={i} className="font-mono">
                • {s}
              </li>
            ))}
          </ul>
        ) : null}
        {advice.href ? (
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link href={advice.href}>
              Ver detalhes <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
