// PM2 ecosystem — apps do vexpenses-dashboard + portal-documentos-backend.
// max_memory_restart: restart graceful (SIGINT→browser fecha direito) antes de
// o processo virar candidato a OOM kill (que deixaria chromium órfão).
// min_uptime/max_restarts/restart_delay: sem eles o PM2 marca o app 'errored'
// e PARA de reiniciar após ~15 crashes rápidos — foi o que derrubou o
// dashboard de vez numa tempestade de exports (out/2026).
module.exports = {
  apps: [
    {
      name: 'dashboard-financeiro',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/dashboard-financeiro/vexpenses-dashboard',
      // Cap de heap do V8: memória patológica morre rápido com erro claro em
      // vez de swap até o OOM killer. O export agora é streamado (~fila de
      // chunks), então o uso real fica bem abaixo disso.
      node_args: '--max-old-space-size=3072',
      max_memory_restart: '3500M',
      min_uptime: '15s',
      max_restarts: 30,
      restart_delay: 3000,
      kill_timeout: 8000,
    },
    {
      name: 'comprovantes-worker',
      script: 'worker-dist/worker/comprovantes-worker.js',
      cwd: '/var/www/dashboard-financeiro/vexpenses-dashboard',
      max_memory_restart: '1000M',
      min_uptime: '15s',
      max_restarts: 30,
      restart_delay: 3000,
    },
    {
      name: 'sync-worker',
      script: 'worker-dist/worker/sync-worker.js',
      cwd: '/var/www/dashboard-financeiro/vexpenses-dashboard',
      max_memory_restart: '800M',
      min_uptime: '15s',
      max_restarts: 30,
      restart_delay: 3000,
    },
    {
      name: 'portal-documentos-backend',
      script: 'dist/index.js',
      cwd: '/var/www/portal-documentos/backend',
      max_memory_restart: '1500M',
      min_uptime: '15s',
      max_restarts: 30,
      restart_delay: 3000,
    },
  ],
};
