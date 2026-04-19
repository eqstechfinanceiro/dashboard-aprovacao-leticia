import { AlertTriangle } from "lucide-react";

export function WriteFlagBanner() {
  const enabled = process.env.ENABLE_WRITES === "true";
  if (enabled) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="space-y-1">
        <div className="font-medium text-foreground">
          Modo leitura · escritas na VExpenses estão desabilitadas.
        </div>
        <p className="text-muted-foreground">
          Para permitir que botões de <strong>aprovar</strong>,{" "}
          <strong>reprovar</strong>, <strong>pagar</strong> e{" "}
          <strong>liberar adiantamento</strong> realmente chamem a API, defina{" "}
          <code className="font-mono">ENABLE_WRITES=true</code> no ambiente
          (Vercel Project Settings → Environment Variables ou <code>.env.local</code>
          ) e re-deploy.
        </p>
      </div>
    </div>
  );
}
