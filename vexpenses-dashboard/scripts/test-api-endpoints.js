/**
 * Script para testar endpoints da API VExpenses e descobrir dados financeiros
 */

const API_URL = 'https://api.vexpenses.com';
const API_KEY = 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';

async function testEndpoint(path, params = {}) {
  const url = new URL(`${API_URL}${path}`);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  console.log(`\n🔍 Testing: ${url.toString()}`);

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    console.log(`Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Error: ${errorText.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    console.log(`Success! Data keys:`, Object.keys(data));
    
    if (data.data) {
      console.log(`Data type: ${Array.isArray(data.data) ? 'Array' : typeof data.data}`);
      if (Array.isArray(data.data) && data.data.length > 0) {
        console.log(`First item keys:`, Object.keys(data.data[0]));
        console.log(`Sample data:`, JSON.stringify(data.data[0], null, 2).substring(0, 500));
      }
    }
    
    return data;
  } catch (error) {
    console.log(`Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== VExpenses API Discovery ===');
  console.log(`API Key: ${API_KEY ? API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);

  // Testar endpoints conhecidos
  await testEndpoint('/v2/team-members', { paginate: 'false', include: 'costsCenters' });
  await testEndpoint('/v2/reports', { paginate: 'false', include: 'user' });
  await testEndpoint('/v2/projects', { paginate: 'false' });
  await testEndpoint('/v2/costs-centers', { paginate: 'false' });
  await testEndpoint('/v2/approval-flows', { paginate: 'false' });

  // Testar expenses com diferentes filtros
  console.log('\n=== Testing Expenses with different filters ===');
  
  await testEndpoint('/v2/expenses', {
    search: 'date:2026-04-01,2026-04-15',
    searchFields: 'date:between',
    searchJoin: 'and',
    paginate: 'true',
    page: '1',
    per_page: '5',
    include: 'user,costs_center,payment_method'
  });

  // Testar filtros por usuário
  await testEndpoint('/v2/expenses', {
    search: 'user_id:890792;date:2026-04-01,2026-04-30',
    searchFields: 'user_id:=;date:between',
    searchJoin: 'and',
    paginate: 'true',
    page: '1',
    per_page: '5',
    include: 'user,payment_method'
  });

  // Testar filtros por reembolsável
  await testEndpoint('/v2/expenses', {
    search: 'reimbursable:true;date:2026-04-01,2026-04-30',
    searchFields: 'reimbursable:=;date:between',
    searchJoin: 'and',
    paginate: 'true',
    page: '1',
    per_page: '5',
    include: 'user,payment_method'
  });

  // Testar endpoints que podem existir para cards/balance
  console.log('\n=== Testing potential card/balance endpoints ===');
  await testEndpoint('/v2/cards');
  await testEndpoint('/v2/wallets');
  await testEndpoint('/v2/balances');
  await testEndpoint('/v2/transfers');
  await testEndpoint('/v2/payments');
  await testEndpoint('/v2/transactions');

  // Testar endpoints de tipo de despesa
  console.log('\n=== Testing expense-related endpoints ===');
  await testEndpoint('/v2/expense-types');
  await testEndpoint('/v2/payment-methods');
  await testEndpoint('/v2/categories');
  
  console.log('\n=== Discovery Complete ===');
}

main().catch(console.error);
