/**
 * Script para investigar dados financeiros disponíveis na API VExpenses
 */

const API_URL = 'https://api.vexpenses.com';
const API_KEY = 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';

async function fetchExpenses(params) {
  const url = new URL(`${API_URL}/v2/expenses`);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  const response = await fetch(url, {
    headers: {
      'Authorization': API_KEY,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function main() {
  console.log('=== Investigating Financial Data from VExpenses API ===\n');

  // Buscar despesas de abril 2026 para análise
  console.log('Fetching expenses from April 2026...');
  const expenses = await fetchExpenses({
    search: 'date:2026-04-01,2026-04-30',
    searchFields: 'date:between',
    searchJoin: 'and',
    paginate: 'false',
    include: 'user,costs_center,payment_method'
  });

  console.log(`Total expenses: ${expenses.length}\n`);

  // Analisar tipos de payment_method
  console.log('=== Payment Methods ===');
  const paymentMethods = new Map();
  expenses.forEach(exp => {
    const pm = exp.payment_method?.data?.description || 'Unknown';
    paymentMethods.set(pm, (paymentMethods.get(pm) || 0) + 1);
  });
  
  Array.from(paymentMethods.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`  ${name}: ${count} expenses`));

  // Analisar despesas reembolsáveis vs não reembolsáveis
  console.log('\n=== Reimbursable vs Non-Reimbursable ===');
  const reimbursable = expenses.filter(e => e.reimbursable).length;
  const nonReimbursable = expenses.filter(e => !e.reimbursable).length;
  console.log(`  Reimbursable: ${reimbursable}`);
  console.log(`  Non-Reimbursable: ${nonReimbursable}`);

  // Analisar centros de custo
  console.log('\n=== Cost Centers ===');
  const costCenters = new Map();
  expenses.forEach(exp => {
    const cc = exp.costs_center?.data?.name || 'Unknown';
    costCenters.set(cc, (costCenters.get(cc) || 0) + 1);
  });
  
  Array.from(costCenters.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([name, count]) => console.log(`  ${name}: ${count} expenses`));

  // Analisar títulos/descrições para identificar cargas/transferências
  console.log('\n=== Analyzing Titles for Load/Transfer Patterns ===');
  const titlePatterns = {
    'transf': 0,
    'carga': 0,
    'quinzena': 0,
    'saque': 0,
    'estorno': 0,
    'reembolso': 0,
    'pagamento': 0
  };

  expenses.forEach(exp => {
    const title = (exp.title || '').toLowerCase();
    Object.keys(titlePatterns).forEach(pattern => {
      if (title.includes(pattern)) {
        titlePatterns[pattern]++;
      }
    });
  });

  Object.entries(titlePatterns).forEach(([pattern, count]) => {
    if (count > 0) {
      console.log(`  "${pattern}": ${count} expenses`);
    }
  });

  // Mostrar exemplos de despesas com cada padrão
  console.log('\n=== Sample Expenses by Pattern ===');
  Object.entries(titlePatterns).forEach(([pattern, count]) => {
    if (count > 0) {
      const sample = expenses.find(exp => 
        (exp.title || '').toLowerCase().includes(pattern)
      );
      if (sample) {
        console.log(`\n  Pattern: "${pattern}"`);
        console.log(`    Title: ${sample.title}`);
        console.log(`    Value: ${sample.value}`);
        console.log(`    Payment Method: ${sample.payment_method?.data?.description}`);
        console.log(`    Reimbursable: ${sample.reimbursable}`);
        console.log(`    Date: ${sample.date}`);
      }
    }
  });

  // Analisar valores por usuário
  console.log('\n=== Top 10 Users by Total Expenses ===');
  const userTotals = new Map();
  expenses.forEach(exp => {
    const userName = exp.user?.data?.name || 'Unknown';
    const userId = exp.user_id;
    userTotals.set(userId, {
      name: userName,
      total: (userTotals.get(userId)?.total || 0) + exp.value,
      count: (userTotals.get(userId)?.count || 0) + 1
    });
  });

  Array.from(userTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .forEach(user => {
      console.log(`  ${user.name}: R$ ${user.total.toFixed(2)} (${user.count} expenses)`);
    });

  // Analisar despesas por dia
  console.log('\n=== Expenses by Day (April 2026) ===');
  const dailyTotals = new Map();
  expenses.forEach(exp => {
    const date = exp.date.split(' ')[0]; // YYYY-MM-DD
    dailyTotals.set(date, (dailyTotals.get(date) || 0) + exp.value);
  });

  Array.from(dailyTotals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, total]) => {
      console.log(`  ${date}: R$ ${total.toFixed(2)}`);
    });

  // Verificar campos adicionais que podem ser úteis
  console.log('\n=== All Expense Fields ===');
  if (expenses.length > 0) {
    console.log('  Fields:', Object.keys(expenses[0]));
  }

  console.log('\n=== Investigation Complete ===');
}

main().catch(console.error);
