'use client';

import React, { Suspense } from 'react';
import ImpactoPanel from './impacto-panel';

export const dynamic = 'force-dynamic';

export default function ImpactoFinanceiroPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando…</div>}>
      <ImpactoPanel />
    </Suspense>
  );
}
