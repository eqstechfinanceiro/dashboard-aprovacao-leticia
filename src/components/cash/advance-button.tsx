"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { fmtBRL } from "@/lib/format";
import type { BalanceStatus } from "@/lib/cash-balance";

export function AdvanceButton({
  teamMemberId,
  teamMemberName,
  balance,
  status,
}: {
  teamMemberId: number;
  teamMemberName: string;
  balance: number;
  status: BalanceStatus;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [override, setOverride] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();

  const isDebtor = status === "DEVEDOR";

  async function submit() {
    const amount = Number(value.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_member_id: teamMemberId,
          team_member_name: teamMemberName,
          value: amount,
          description: description || undefined,
          override_debtor: override,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(
        data.enabled_writes
          ? "Adiantamento criado na VExpenses e registrado localmente."
          : "Adiantamento registrado localmente (escritas VExpenses desativadas).",
      );
      setOpen(false);
      setValue("");
      setDescription("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant={isDebtor ? "outline" : "default"}>
          <Wallet className="mr-1 h-3 w-3" />
          Adiantar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liberar adiantamento · {teamMemberName}</DialogTitle>
          <DialogDescription>
            Saldo atual: <strong>{fmtBRL(balance)}</strong> · status{" "}
            <strong>{status}</strong>.
          </DialogDescription>
        </DialogHeader>
        {isDebtor ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <p>
              Este colaborador está <strong>DEVEDOR</strong>. O procedimento
              padrão é quitar antes de liberar novo adiantamento. Se houver
              motivo para fazer mesmo assim, ative o override abaixo.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Switch
                id="override"
                checked={override}
                onCheckedChange={setOverride}
              />
              <Label htmlFor="override">
                Sobrescrever bloqueio (registrar mesmo assim)
              </Label>
            </div>
          </div>
        ) : null}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="value">Valor (R$)</Label>
            <Input
              id="value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Descrição (opcional)</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: adiantamento para obra XPTO"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || (isDebtor && !override)}
            onClick={submit}
          >
            {pending ? "Enviando…" : "Liberar adiantamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
