"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Undo2, Wallet, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Report } from "@/types/vexpenses";

export function ApprovalActions({ report }: { report: Report }) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [payDate, setPayDate] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const router = useRouter();

  async function call(
    action: "approve" | "reject" | "reopen" | "pay",
    body?: Record<string, unknown>,
  ) {
    setPending(action);
    try {
      const res = await fetch(`/api/reports/${report.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast.success(`Ação "${action}" enviada.`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  const canApprove = report.status === "ENVIADO" || report.status === "REABERTO";
  const canReject = report.status === "ENVIADO";
  const canReopen = report.status === "APROVADO" || report.status === "REPROVADO";
  const canPay = report.status === "APROVADO";

  return (
    <div className="flex flex-wrap gap-2">
      {canApprove ? (
        <Button
          variant="success"
          size="sm"
          disabled={pending !== null}
          onClick={() => call("approve")}
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          Aprovar
        </Button>
      ) : null}

      {canReject ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={pending !== null}>
              <X className="mr-1 h-3.5 w-3.5" />
              Reprovar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reprovar relatório #{report.id}</DialogTitle>
              <DialogDescription>
                Informe o motivo para que o colaborador ajuste e reenvie.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo da reprovação (opcional)"
              rows={4}
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={pending !== null}
                onClick={() => call("reject", { reason })}
              >
                Confirmar reprovação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {canReopen ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => call("reopen")}
        >
          <Undo2 className="mr-1 h-3.5 w-3.5" />
          Reabrir
        </Button>
      ) : null}

      {canPay ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" disabled={pending !== null}>
              <Wallet className="mr-1 h-3.5 w-3.5" />
              Marcar como pago
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pagar relatório #{report.id}</DialogTitle>
              <DialogDescription>
                Registra a data de pagamento na VExpenses.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={pending !== null}
                onClick={() => call("pay", { payment_date: payDate })}
              >
                Confirmar pagamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
