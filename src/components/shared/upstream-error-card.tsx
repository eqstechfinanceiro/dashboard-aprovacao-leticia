import { AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VExpensesError } from "@/lib/vexpenses";

/**
 * Reusable fallback card shown when the VExpenses upstream is unavailable
 * (HTTP 5xx, timeout, network error). Keeps the page shell intact and
 * avoids a full-page runtime crash when dependent data can't be fetched.
 */
export function UpstreamErrorCard({
  error,
  area,
}: {
  error: unknown;
  area?: string;
}) {
  const status =
    error instanceof VExpensesError ? error.status : undefined;
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown");

  const title = status
    ? `VExpenses indisponível (HTTP ${status})`
    : "VExpenses indisponível";

  const where = area ? ` ${area}` : "";

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-warning" />
          {title}
        </CardTitle>
        <CardDescription>
          A API pública da VExpenses está retornando erro para{where} agora.
          Os demais dados que não dependem dessa rota continuam funcionando.
          Atualize a página em alguns instantes — o app tentará de novo
          automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
          {message}
        </pre>
      </CardContent>
    </Card>
  );
}

/**
 * True for errors that come from the VExpenses upstream and that we want to
 * show as a soft fallback card (non-crashing). Anything else should keep
 * bubbling so genuine bugs aren't hidden.
 */
export function isUpstreamError(e: unknown): boolean {
  if (e instanceof VExpensesError) return true;
  // fetch() in Node/Edge throws TypeError for network-level failures
  if (e instanceof TypeError && /fetch/i.test(e.message)) return true;
  const code = (e as { code?: string } | null)?.code;
  if (code === "UND_ERR_SOCKET" || code === "ECONNRESET" || code === "ETIMEDOUT") {
    return true;
  }
  return false;
}
