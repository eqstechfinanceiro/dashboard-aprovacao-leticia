'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Hourglass, Trophy, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { canAccessModule } from '@/lib/auth/auth';
import PendenciasPanel from './pendencias-panel';
import ResultadosPanel from './resultados-panel';

export const dynamic = 'force-dynamic';

type TabId = 'pendencias' | 'resultados';

const TABS: { id: TabId; label: string; module: 'pendencias' | 'resultados'; icon: React.ReactNode }[] = [
  { id: 'pendencias', label: 'Pendências', module: 'pendencias', icon: <Hourglass className="h-4 w-4" /> },
  { id: 'resultados', label: 'Resultados', module: 'resultados', icon: <Trophy className="h-4 w-4" /> },
];

function PendenciasPageInner() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [selected, setSelected] = useState<TabId | null>(
    () => (searchParams.get('tab') === 'resultados' ? 'resultados' : null)
  );

  const allowed = TABS.filter(
    (t) => user && canAccessModule(user.role, user.modules, t.module)
  );

  const active: TabId | null =
    (selected && allowed.some((t) => t.id === selected) ? selected : null) ??
    allowed[0]?.id ??
    null;

  const switchTab = (id: TabId) => {
    setSelected(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', id);
      window.history.replaceState(null, '', url.toString());
    } catch { /* ignora — a aba já trocou na UI */ }
  };

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!active) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem acesso a esta página.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pendências &amp; Resultados</h1>
          <p className="text-sm text-gray-500">Fila de lançamento Protheus e métricas de produtividade</p>
        </div>
        {allowed.length > 1 && (
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {allowed.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors ${
                  active === t.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {active === 'pendencias' ? <PendenciasPanel /> : <ResultadosPanel />}
    </div>
  );
}

export default function PendenciasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-gray-500">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Carregando…
        </div>
      }
    >
      <PendenciasPageInner />
    </Suspense>
  );
}
