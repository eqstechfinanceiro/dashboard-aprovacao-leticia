import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { AppShell } from '@/components/app-shell'
import { ensureCacheTable, ensurePreloadStatsTable } from '@/lib/neon'
import { ensureUsersTable } from '@/lib/auth-db'
import { AuthProvider } from '@/lib/auth-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'vExpenses Dashboard',
  description: 'Dashboard para gestão de despesas corporativas',
}

// Garantir que as tabelas do banco existam quando o servidor iniciar
if (typeof window === 'undefined') {
  ensureCacheTable()
  ensurePreloadStatsTable()
  ensureUsersTable()
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>
          <AuthProvider>
            <AppShell>
              {children}
            </AppShell>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  )
}
