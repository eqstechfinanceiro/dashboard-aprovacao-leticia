// Teste local do syncConferencia — ciclo real limitado.
// Uso: node _test_conferencia.js [janelaDias] [maxNfs]
const { readFileSync } = require('fs');
const path = require('path');

const envFile = path.join(__dirname, 'vexpenses-dashboard', '.env.local');
for (const line of readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { syncConferencia } = require('./vexpenses-dashboard/worker-dist/lib/conferencia/sync.js');

(async () => {
  const janelaDias = parseInt(process.argv[2] || '7', 10);
  const maxNfs = parseInt(process.argv[3] || '8', 10);
  console.log(`syncConferencia janela=${janelaDias}d maxNfs=${maxNfs} sieg=off`);
  const r = await syncConferencia({ janelaDias, maxNfs, useSieg: false });
  console.log('RESULT', JSON.stringify(r, null, 2));
  process.exit(r.error ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
