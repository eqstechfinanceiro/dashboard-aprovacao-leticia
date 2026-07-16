'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileCheck,
  Receipt,
  BarChart3,
  Wallet,
  Settings,
  TrendingUp,
  FileSpreadsheet,
  Hourglass,
  Bot,
  ClipboardList
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

const ALL_NAVIGATION = [
  { id: 'dashboard', name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { id: 'aprovacoes', name: 'Aprovações', href: '/aprovacoes', icon: FileCheck },
  { id: 'pending-approvals', name: 'Pendências', href: '/pending-approvals', icon: Hourglass },
  { id: 'despesas', name: 'Despesas', href: '/despesas', icon: Receipt },
  { id: 'analytics', name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { id: 'status-caixa', name: 'Status Caixa', href: '/status-caixa', icon: Wallet },
  { id: 'gestao-caixa', name: 'Gestão Caixa', href: '/gestao-caixa', icon: TrendingUp },
  { id: 'quinzena-dinamica', name: 'Quinzena Dinâmica', href: '/quinzena-dinamica', icon: FileSpreadsheet },
  { id: 'controle', name: 'Controle', href: '/controle', icon: ClipboardList },
  { id: 'aprovacao-dinamica', name: 'Aprovação Dinâmica', href: '/aprovacao-dinamica', icon: Bot },
  { id: 'configuracoes', name: 'Configurações', href: '/configuracoes', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
        <div className="flex h-16 items-center justify-center border-b border-gray-800">
          <h1 className="text-xl font-bold">vExpenses</h1>
        </div>
      </div>
    );
  }

  const navigation = user?.role === 'admin'
    ? ALL_NAVIGATION
    : ALL_NAVIGATION.filter((item) => user?.modules?.includes(item.id));

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        <h1 className="text-xl font-bold">vExpenses</h1>
      </div>
      
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="border-t border-gray-800 p-4">
        <div className="text-xs text-gray-400">
          <p>Dashboard vExpenses</p>
          <p className="mt-1">v1.0.0</p>
        </div>
      </div>
    </div>
  );
}
