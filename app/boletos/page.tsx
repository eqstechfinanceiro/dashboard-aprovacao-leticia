'use client';

import React, { Suspense } from 'react';
import BoletosPanel from './boletos-panel';

export const dynamic = 'force-dynamic';

export default function BoletosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando…</div>}>
      <BoletosPanel />
    </Suspense>
  );
}
