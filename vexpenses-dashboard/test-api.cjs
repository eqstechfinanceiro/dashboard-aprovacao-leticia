const http = require('http');

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  const PORT = 3000;
  console.log('Logging in...');
  const loginRes = await fetch(`http://localhost:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'leticia@eqsengenharia.com.br', password: 'EqS@2026!' }),
  });
  console.log('Login status:', loginRes.status);
  if (loginRes.status !== 200) {
    console.log('Login failed:', loginRes.body);
    process.exit(1);
  }
  const cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0];
  if (!cookie) { console.log('No cookie!'); process.exit(1); }

  console.log('Testing quinzena-complete...');
  const apiRes = await fetch(`http://localhost:${PORT}/api/quinzena-complete?year=2026&month=7&quinzena=2`, {
    headers: { 'Cookie': cookie },
  });
  console.log('API status:', apiRes.status);
  if (apiRes.status === 200) {
    const d = JSON.parse(apiRes.body);
    console.log('data_mode:', d.data_mode);
    console.log('is_frozen:', d.is_frozen);
    console.log('total_rows:', d.statistics.total_rows);
    console.log('ativos:', d.statistics.ativos);
    console.log('com_carga:', d.statistics.com_carga);
    console.log('total_carga_final:', d.statistics.total_carga_final);
    const sample = (d.data || []).slice(0, 5);
    for (const r of sample) {
      console.log(`  ${r.colaborador} | carga=${r.carga} | transf=${r.transferencia} | tarifa=${r.tarifa} | prest=${r.prestacao} | sp=${r.saldo_prestacao} | sc=${r.saldo_cartao} | sf=${r.saldo_final} | cf=${r.carga_final}`);
    }
  } else {
    console.log('Error:', apiRes.body.substring(0, 3000));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
