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
  Calculator,
  FileSpreadsheet as FileSpreadsheetIcon,
  Hourglass
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Aprovações', href: '/aprovacoes', icon: FileCheck },
  { name: 'Pendências', href: '/pending-approvals', icon: Hourglass },
  { name: 'Despesas', href: '/despesas', icon: Receipt },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Status Caixa', href: '/status-caixa', icon: Wallet },
  { name: 'Gestão Caixa', href: '/gestao-caixa', icon: TrendingUp },
  { name: 'Quinzena Dinâmica', href: '/quinzena-dinamica', icon: FileSpreadsheetIcon },
  { name: 'Configurações', href: '/configuracoes', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

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
