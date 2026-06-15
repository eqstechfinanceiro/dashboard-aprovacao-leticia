const API_URL = 'https://api.vexpenses.com';
const API_KEY = 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';

const endpoints = [
  '/v2/panel',
  '/v2/dashboard',
  '/v2/summary',
  '/v2/overview',
  '/v2/statistics',
  '/v2/team-members/895944/balance',
  '/v2/team-members/895944/summary',
  '/v2/team-members/895944/expenses',
  '/v2/users/895944',
  '/v2/users/895944/balance',
  '/v2/expenses/summary',
  '/v2/expenses/statistics',
  '/v2/reports/7603397',
  '/v2/reports/7603397/expenses',
  '/v2/companies/1825947',
  '/v2/companies/1825947/balance',
  '/v2/panels',
  '/v2/analytics',
  '/v2/insights',
  '/v2/metrics',
];

async function testEndpoint(path) {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.status === 404 || response.status === 405) {
      console.log(`❌ ${path} => ${response.status}`);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ ${path} => ${response.status}`);
    if (data.data) {
      console.log('   Data type:', Array.isArray(data.data) ? `Array(${data.data.length})` : typeof data.data);
      if (!Array.isArray(data.data) && data.data) {
        console.log('   Keys:', Object.keys(data.data));
      }
      if (Array.isArray(data.data) && data.data.length > 0) {
        console.log('   First item keys:', Object.keys(data.data[0]).slice(0, 10));
      }
    }
    
    // If it has data, print a sample
    if (data.data && !Array.isArray(data.data)) {
      console.log('   Sample:', JSON.stringify(data.data, null, 2).substring(0, 500));
    }
  } catch (error) {
    console.log(`❌ ${path} => Error: ${error.message}`);
  }
}

async function main() {
  console.log('=== Testing Hidden Endpoints ===\n');
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
  }
  console.log('\n=== Done ===');
}

main().catch(console.error);
