const API_URL = 'https://api.vexpenses.com';
const API_KEY = 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';

const endpoints = [
  '/v2/export',
  '/v2/exports',
  '/v2/reports/export',
  '/v2/download',
  '/v2/billing',
  '/v2/billings',
  '/v2/invoice',
  '/v2/invoices',
  '/v2/statement',
  '/v2/statements',
  '/v2/expenses/statement',
  '/v2/team-members/895944/statement',
  '/v2/wallet',
  '/v2/limits',
  '/v2/card/limits',
  '/v2/expense-limits',
  '/v2/policies',
  '/v2/expense-policies',
  '/v2/limit-policies',
  '/v2/expense-limit-policies',
  '/v2/payments/limits',
  '/v2/integrations',
  '/v2/integration',
  '/v2/webhooks',
  '/v2/notification',
  '/v2/notifications',
  '/v2/audit',
  '/v2/logs',
  '/v2/history',
  '/v2/activities',
  '/v2/activity',
  '/v2/feed',
  '/v2/timeline',
  '/v2/backup',
  '/v2/backups',
  '/v2/data',
  '/v2/dataset',
  '/v2/query',
  '/v2/search',
  '/v2/filter',
];

async function testEndpoint(path) {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    
    if (response.status === 404 || response.status === 405) {
      console.log(`❌ ${path} => ${response.status}`);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ ${path} => ${response.status}`);
    console.log('   Keys:', Object.keys(data));
    if (data.data) {
      console.log('   Data type:', Array.isArray(data.data) ? `Array(${data.data.length})` : typeof data.data);
    }
    if (data.message) console.log('   Message:', data.message);
  } catch (error) {
    console.log(`❌ ${path} => Error: ${error.message}`);
  }
}

async function main() {
  console.log('=== Testing More Endpoints ===\n');
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }
  console.log('\n=== Done ===');
}

main().catch(console.error);
