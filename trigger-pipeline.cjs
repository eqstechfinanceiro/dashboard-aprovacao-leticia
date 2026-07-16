/**
 * Login and test quinzena-complete API
 */
const http = require('http');

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? require('https') : http;
    const req = mod.request(url, {
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
  // Login
  console.log('--- Logging in ---');
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'leticia@eqsengenharia.com.br', password: 'EqS@2026!' }),
  });
  console.log('Login status:', loginRes.status);
  const cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0];
  if (!cookie) { console.log('No cookie!'); process.exit(1); }

  // Test quinzena-complete API
  console.log('\n--- Testing quinzena-complete API ---');
  const apiRes = await fetch('http://localhost:3001/api/quinzena-complete?year=2026&month=7&quinzena=2', {
    headers: { 'Cookie': cookie },
  });
  console.log('API status:', apiRes.status);
  
  if (apiRes.status === 200) {
    const data = JSON.parse(apiRes.body);
    console.log('data_mode:', data.data_mode);
    console.log('is_frozen:', data.is_frozen);
    console.log('total_rows:', data.statistics.total_rows);
    console.log('ativos:', data.statistics.ativos);
    console.log('com_carga:', data.statistics.com_carga);
    console.log('total_carga_final:', data.statistics.total_carga_final);
    console.log('total_saldo_final:', data.statistics.total_saldo_final);
    console.log('Sample rows (first 3):');
    for (const row of (data.data || []).slice(0, 3)) {
      console.log(`  ${row.colaborador} | cpf=${row.cpf} | carga=${row.carga} | transf=${row.transferencia} | tarifa=${row.tarifa} | prestacao=${row.prestacao} | sp=${row.saldo_prestacao} | sc=${row.saldo_cartao} | sf=${row.saldo_final} | carga_final=${row.carga_final}`);
    }
  } else {
    console.log('Error body:', apiRes.body.substring(0, 2000));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
