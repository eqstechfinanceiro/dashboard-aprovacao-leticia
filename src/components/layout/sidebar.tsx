"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./sidebar-nav";
import { cn } from "@/lib/utils";
import { Wallet } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden border-r bg-muted/30 md:flex md:w-60 md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="h-4 w-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Letícia Dashboard</span>
          <span className="text-xs text-muted-foreground">EQS · VExpenses</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-0.5 p-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active &&
                    "bg-accent text-foreground font-medium shadow-sm",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.shortcut ? (
                  <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground group-hover:inline-flex md:inline-flex">
                    {item.shortcut}
                  </kbd>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">
        <div>EQS Engenharia · v0.1.0</div>
        <div className="text-[10px]">Fonte: VExpenses API v2</div>
      </div>
    </aside>
  );
}
