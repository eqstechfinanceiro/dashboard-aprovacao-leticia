import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { Providers } from './providers'
import { ensureCacheTable, ensurePreloadStatsTable } from '@/lib/neon'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'vExpenses Dashboard',
  description: 'Dashboard para gestão de despesas corporativas',
}

// Garantir que as tabelas do banco existam quando o servidor iniciar
if (typeof window === 'undefined') {
  ensureCacheTable()
  ensurePreloadStatsTable()
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
          <div className="flex h-screen bg-gray-50">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-6">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
