"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import type { AIRule } from "@/db/schema";

interface RuleDraft {
  id?: number;
  name: string;
  description: string;
  kind: "advice" | "autoaction";
  enabled: boolean;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
}

const EMPTY_DRAFT: RuleDraft = {
  name: "",
  description: "",
  kind: "advice",
  enabled: true,
  condition: { field: "report.total", op: "lte", value: 300 },
  action: { type: "advise", message: "Sugerir aprovação automática." },
};

export function AIRulesManager({ initial }: { initial: AIRule[] }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<RuleDraft>(EMPTY_DRAFT);
  const [pending, setPending] = React.useState(false);

  async function save() {
    setPending(true);
    try {
      const res = await fetch("/api/ai-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Regra salva.");
      setDraft(EMPTY_DRAFT);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function toggle(rule: AIRule) {
    try {
      const res = await fetch(`/api/ai-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(rule: AIRule) {
    if (!confirm(`Remover regra "${rule.name}"?`)) return;
    try {
      const res = await fetch(`/api/ai-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Regra removida.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Regras cadastradas</CardTitle>
          <CardDescription>
            Cada regra avalia relatórios/ados e pode sugerir ações ou (quando{" "}
            <code>ENABLE_WRITES=true</code>) executar automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {initial.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma regra ainda. Crie sua primeira ao lado.
            </p>
          ) : (
            initial.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <Badge
                        variant={r.kind === "autoaction" ? "warning" : "secondary"}
                      >
                        {r.kind}
                      </Badge>
                      {r.enabled ? (
                        <Badge variant="success">ativa</Badge>
                      ) : (
                        <Badge variant="secondary">desligada</Badge>
                      )}
                    </div>
                    {r.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.description}
                      </p>
                    ) : null}
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                      <CodeBlock label="Condição" value={r.condition} />
                      <CodeBlock label="Ação" value={r.action} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => toggle(r)}
                      title={r.enabled ? "Desligar" : "Ligar"}
                    >
                      {r.enabled ? (
                        <PowerOff className="h-3 w-3" />
                      ) : (
                        <Power className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => remove(r)}
                      title="Remover"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nova regra</CardTitle>
          <CardDescription>
            Defina condição e ação em JSON simples.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Aprovar automaticamente refeições baratas"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={draft.kind}
              onValueChange={(v) =>
                setDraft({ ...draft, kind: v as RuleDraft["kind"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="advice">
                  Conselho (apenas sugere)
                </SelectItem>
                <SelectItem value="autoaction">
                  Auto-ação (executa)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <JsonField
            label="Condição (JSON)"
            value={draft.condition}
            onChange={(v) => setDraft({ ...draft, condition: v })}
          />
          <JsonField
            label="Ação (JSON)"
            value={draft.action}
            onChange={(v) => setDraft({ ...draft, action: v })}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
              />
              <Label>Ativa ao criar</Label>
            </div>
            <Button size="sm" disabled={pending || !draft.name} onClick={save}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Salvar regra
            </Button>
          </div>
          <Separator />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <strong>Campos aceitos:</strong> <code>report.total</code>,{" "}
              <code>report.status</code>, <code>report.team_member.name</code>,{" "}
              <code>report.costs_center.name</code>.
            </p>
            <p>
              <strong>Operadores:</strong> <code>eq</code>, <code>neq</code>,{" "}
              <code>lt</code>, <code>lte</code>, <code>gt</code>,{" "}
              <code>gte</code>, <code>in</code>, <code>contains</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const [text, setText] = React.useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            setError(null);
            onChange(parsed);
          } catch {
            setError("JSON inválido");
          }
        }}
        className="font-mono text-xs"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function CodeBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
        {JSON.stringify(value, null, 0)}
      </pre>
    </div>
  );
}
