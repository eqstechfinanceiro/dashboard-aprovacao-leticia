'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Dados considerados frescos por 5 minutos
            staleTime: 5 * 60 * 1000,
            // Manter dados no cache por 1 hora
            gcTime: 60 * 60 * 1000,
            // Tentar refetch em background quando a janela ganha foco
            refetchOnWindowFocus: false,
            // Não refetchar ao remontar
            refetchOnMount: false,
            // Refetch automático quando dados ficam stale
            refetchOnReconnect: true,
            // Número de retries em caso de falha
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
