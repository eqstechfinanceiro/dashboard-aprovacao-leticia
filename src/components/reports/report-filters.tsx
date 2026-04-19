"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useState, useTransition } from "react";

const STATUSES = [
  { value: "any", label: "Todos os status" },
  { value: "ABERTO", label: "Aberto" },
  { value: "ENVIADO", label: "Enviado" },
  { value: "APROVADO", label: "Aprovado" },
  { value: "PAGO", label: "Pago" },
  { value: "REPROVADO", label: "Reprovado" },
  { value: "REABERTO", label: "Reaberto" },
];

export function ReportFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value && value !== "any") next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update("search", search);
        }}
        className="relative flex-1 md:max-w-sm"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descrição ou ID..."
          className="pl-8"
        />
      </form>
      <Select
        value={params.get("status") ?? "any"}
        onValueChange={(v) => update("status", v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {params.get("search") || params.get("status") ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            startTransition(() => router.push(pathname));
          }}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Limpar
        </Button>
      ) : null}
      {isPending ? (
        <span className="text-xs text-muted-foreground">carregando…</span>
      ) : null}
    </div>
  );
}
