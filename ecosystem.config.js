// PM2 ecosystem — apps do vexpenses-dashboard + portal-documentos-backend.
// max_memory_restart: restart graceful (SIGINT→browser fecha direito) antes de
// o processo virar candidato a OOM kill (que deixaria chromium órfão).
module.exports = {
  apps: [
    {
      name: 'dashboard-financeiro',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/dashboard-financeiro/vexpenses-dashboard',
      // exports de quinzena geram XLSX de ~200MB em memória (SheetJS não streama) —
      // 1500M reiniciava o processo no meio do fechamento (313 restarts em 4 dias).
      max_memory_restart: '2500M',
    },
    {
      name: 'comprovantes-worker',
      script: 'worker-dist/worker/comprovantes-worker.js',
      cwd: '/var/www/dashboard-financeiro/vexpenses-dashboard',
      max_memory_restart: '1000M',
    },
    {
      name: 'sync-worker',
      script: 'worker-dist/worker/sync-worker.js',
      cwd: '/var/www/dashboard-financeiro/vexpenses-dashboard',
      max_memory_restart: '800M',
    },
    {
      name: 'portal-documentos-backend',
      script: 'dist/index.js',
      cwd: '/var/www/portal-documentos/backend',
      max_memory_restart: '1500M',
    },
  ],
};
