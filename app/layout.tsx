import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { AppShell } from '@/components/app-shell'
import { ensureCacheTable, ensurePreloadStatsTable } from '@/lib/db/neon'
import { ensureUsersTable } from '@/lib/db/auth-db'
import { AuthProvider } from '@/lib/auth/auth-context'
import { VersionChecker } from '@/components/version-checker'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Aery - Portal Financeiro',
  description: 'Aery — Gestão de despesas corporativas',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
}

export const viewport = {
  themeColor: '#0f1117',
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
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('aery-theme');if(t&&t!=='white')document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator && location.protocol === 'https:'){navigator.serviceWorker.register('/sw.js').catch(()=>{});}`,
          }}
        />
        <Providers>
          <AuthProvider>
            <VersionChecker />
            <AppShell>
              {children}
            </AppShell>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  )
}
