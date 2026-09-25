'use client';

import React from 'react';
import { Receipt, Wallet, Landmark, LayoutGrid, Inbox } from 'lucide-react';

export type Setor = 'all' | 'entrada' | 'caixa' | 'pagar';

export const SETOR_LABEL: Record<Exclude<Setor, 'all'>, string> = {
  entrada: 'Entrada de Notas',
  caixa: 'Gestão de Caixa',
  pagar: 'Contas a Pagar',
};

const SETORES: { id: Setor; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'Todos os setores', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { id: 'entrada', label: SETOR_LABEL.entrada, icon: <Receipt className="h-3.5 w-3.5" /> },
  { id: 'caixa', label: SETOR_LABEL.caixa, icon: <Wallet className="h-3.5 w-3.5" /> },
  { id: 'pagar', label: SETOR_LABEL.pagar, icon: <Landmark className="h-3.5 w-3.5" /> },
];

export function SetorChips({ value, onChange }: { value: Setor; onChange: (s: Setor) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SETORES.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            value === s.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          {s.icon}
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** Estado vazio quando o setor não tem dados no painel atual. */
export function SetorEmpty({ setor }: { setor: Setor }) {
  if (setor === 'all') return null;
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-muted-foreground">
      <Inbox className="h-6 w-6" />
      <p className="text-sm">
        Nenhum dado de <strong>{SETOR_LABEL[setor]}</strong> nesta visão.
      </p>
    </div>
  );
}
