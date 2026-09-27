'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  FileCheck,
  BarChart3,
  Settings,
  TrendingUp,
  FileSpreadsheet,
  Hourglass,
  Bot,
  ClipboardList,
  FileText,
  ChevronDown,
  ChevronRight,
  Send,
  LifeBuoy,
  DollarSign,
  Activity,
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { canAccessModule } from '@/lib/auth/auth';

type NavItem = {
  id: string;
  name: string;
  href: string;
  icon: any;
  always?: boolean; // visível para todos, independente de modules
  altIds?: string[]; // módulos alternativos que também liberam o item (páginas unificadas)
};

type NavCategory = {
  label: string;
  items: NavItem[];
};

const ALL_CATEGORIES: NavCategory[] = [
  {
    label: 'Análise Gerencial',
    items: [
      { id: 'dashboard', name: 'Visão Geral', href: '/', icon: LayoutDashboard },
      { id: 'analytics', name: 'Despesas', href: '/analytics', icon: BarChart3 },
      { id: 'gestao-caixa', name: 'Posição de Caixa', href: '/gestao-caixa', icon: TrendingUp },
      { id: 'pendencias', name: 'Pendências & Resultados', href: '/pendencias', icon: Hourglass, altIds: ['resultados'] },
      { id: 'impacto-financeiro', name: 'Impacto Financeiro', href: '/impacto-financeiro', icon: DollarSign },
      { id: 'fiscal', name: 'Fiscal', href: '/fiscal', icon: ScrollText },
    ],
  },
  {
    label: 'Operacional',
    items: [
      { id: 'aprovacoes', name: 'Aprovações', href: '/aprovacoes', icon: FileCheck },
      { id: 'pending-approvals', name: 'Pendências', href: '/pending-approvals', icon: Hourglass },
      { id: 'aprovacao-dinamica', name: 'Aprovação Dinâmica', href: '/aprovacao-dinamica', icon: Bot },
      { id: 'automacao-comprovantes', name: 'Automação Comprovantes', href: '/automacao-comprovantes', icon: Send },
      { id: 'ferramentas-itau', name: 'Ferramentas Itaú', href: '/ferramentas-itau', icon: FileSpreadsheet },
      { id: 'cartorios', name: 'Cartórios', href: '/cartorios', icon: FileText },
    ],
  },
  {
    label: 'Fechamento',
    items: [
      { id: 'quinzena-dinamica', name: 'Quinzena Dinâmica', href: '/quinzena-dinamica', icon: FileSpreadsheet },
      { id: 'controle', name: 'Controle', href: '/controle', icon: ClipboardList },
      { id: 'fechamento', name: 'Fechamento', href: '/fechamento', icon: FileText },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'suporte', name: 'Suporte', href: '/suporte', icon: LifeBuoy, always: true },
      { id: 'sync-health', name: 'Saúde dos Syncs', href: '/sync-health', icon: Activity },
      { id: 'audit-log', name: 'Log de Auditoria', href: '/audit-log', icon: ScrollText },
      { id: 'configuracoes', name: 'Configurações', href: '/configuracoes', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  // Todas as categorias começam expandidas — só fecham se o usuário clicar
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(ALL_CATEGORIES.map((c) => c.label))
  );

  if (loading) {
    return (
      <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
        <div className="flex h-16 items-center justify-center border-b border-gray-800">
          <Image src="/aery-logo.png" alt="Aery" width={32} height={32} className="mr-2" />
          <h1 className="text-xl font-bold">Aery</h1>
        </div>
      </div>
    );
  }

  const toggleCategory = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // Filter categories based on user permissions
  const categories = ALL_CATEGORIES.map((cat) => {
    const items = cat.items.filter(
      (item) =>
        item.always ||
        (user &&
          (canAccessModule(user.role, user.modules, item.id) ||
            (item.altIds ?? []).some((alt) => canAccessModule(user.role, user.modules, alt))))
    );
    return { ...cat, items };
  }).filter((cat) => cat.items.length > 0);

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        <Image src="/aery-logo.png" alt="Aery" width={32} height={32} className="mr-2" />
        <h1 className="text-xl font-bold">Aery</h1>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {categories.map((cat) => {
          const isExpanded = expanded.has(cat.label);
          const hasActive = cat.items.some((item) => pathname === item.href);

          return (
            <div key={cat.label} className="mb-1">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.label)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors',
                  hasActive
                    ? 'text-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                )}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                {cat.label}
              </button>

              {/* Category items */}
              {isExpanded && (
                <div className="mt-0.5 space-y-0.5">
                  {cat.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 ml-5 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        )}
                      >
                        <item.icon className="h-4.5 w-4.5 flex-shrink-0" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 p-4">
        <div className="text-xs text-gray-400">
          <p>Aery</p>
          <p className="mt-1">v26.3.6</p>
        </div>
      </div>
    </div>
  );
}
