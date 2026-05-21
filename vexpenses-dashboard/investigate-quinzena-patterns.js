/**
 * Script para investigar padrões de quinzena/carga nos dados da API
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
  console.log('=== Investigating Quinzena/Load Patterns ===\n');

  // Buscar despesas de abril 2026
  console.log('Fetching expenses from April 2026...');
  const expenses = await fetchExpenses({
    search: 'date:2026-04-01,2026-04-30',
    searchFields: 'date:between',
    searchJoin: 'and',
    paginate: 'false',
    include: 'user,costs_center,payment_method'
  });

  console.log(`Total expenses: ${expenses.length}\n`);

  // Analisar por payment_method
  console.log('=== Analyzing by Payment Method ===');
  const byPaymentMethod = new Map();
  expenses.forEach(exp => {
    const pm = exp.payment_method?.data?.description || 'Unknown';
    if (!byPaymentMethod.has(pm)) {
      byPaymentMethod.set(pm, []);
    }
    byPaymentMethod.get(pm).push(exp);
  });

  Array.from(byPaymentMethod.entries()).forEach(([pm, exps]) => {
    const total = exps.reduce((sum, e) => sum + e.value, 0);
    console.log(`\n${pm}:`);
    console.log(`  Count: ${exps.length}`);
    console.log(`  Total: R$ ${total.toFixed(2)}`);
    console.log(`  Average: R$ ${(total / exps.length).toFixed(2)}`);
    
    // Mostrar alguns exemplos
    console.log(`  Sample values: ${exps.slice(0, 5).map(e => e.value).join(', ')}`);
  });

  // Buscar despesas específicas dos usuários da planilha
  console.log('\n=== Analyzing Specific Users from Spreadsheet ===');
  const targetUsers = [
    'ABNER ANDRADE CAVALCANTE',
    'RAFAEL AMORIM VELLO',
    'GUILHERME FORTKAMP PROENCA'
  ];

  targetUsers.forEach(userName => {
    const userExpenses = expenses.filter(e => 
      e.user?.data?.name === userName
    );
    
    if (userExpenses.length > 0) {
      console.log(`\n${userName}:`);
      console.log(`  Total expenses: ${userExpenses.length}`);
      
      // Agrupar por payment_method
      const byPM = new Map();
      userExpenses.forEach(e => {
        const pm = e.payment_method?.data?.description || 'Unknown';
        byPM.set(pm, (byPM.get(pm) || 0) + e.value);
      });
      
      Array.from(byPM.entries()).forEach(([pm, total]) => {
        console.log(`    ${pm}: R$ ${total.toFixed(2)}`);
      });
      
      // Mostrar despesas individuais
      console.log(`  Individual expenses:`);
      userExpenses.slice(0, 10).forEach(e => {
        console.log(`    ${e.date.split(' ')[0]} - ${e.payment_method?.data?.description} - R$ ${e.value.toFixed(2)} - ${e.title?.substring(0, 40)}`);
      });
    }
  });

  // Verificar se há despesas com valores muito altos (possíveis cargas)
  console.log('\n=== High Value Expenses (Possible Loads) ===');
  const highValueThreshold = 10000;
  const highValueExpenses = expenses.filter(e => e.value >= highValueThreshold);
  
  console.log(`Expenses >= R$ ${highValueThreshold}: ${highValueExpenses.length}`);
  
  highValueExpenses.slice(0, 20).forEach(e => {
    console.log(`  R$ ${e.value.toFixed(2)} - ${e.payment_method?.data?.description} - ${e.user?.data?.name} - ${e.date.split(' ')[0]} - ${e.title?.substring(0, 50)}`);
  });

  // Verificar padrões de datas (1ª vs 2ª quinzena)
  console.log('\n=== Expenses by Quinzena ===');
  const q1Expenses = expenses.filter(e => {
    const day = parseInt(e.date.split('-')[2]);
    return day >= 1 && day <= 15;
  });
  
  const q2Expenses = expenses.filter(e => {
    const day = parseInt(e.date.split('-')[2]);
    return day >= 16;
  });

  const q1Total = q1Expenses.reduce((sum, e) => sum + e.value, 0);
  const q2Total = q2Expenses.reduce((sum, e) => sum + e.value, 0);

  console.log(`1ª Quinzena (days 1-15): ${q1Expenses.length} expenses, R$ ${q1Total.toFixed(2)}`);
  console.log(`2ª Quinzena (days 16-30): ${q2Expenses.length} expenses, R$ ${q2Total.toFixed(2)}`);

  // Analisar se há despesas específicas nos dias 1, 15, 16 (dias de carga)
  console.log('\n=== Expenses on Load Days (1st, 15th, 16th) ===');
  [1, 15, 16].forEach(day => {
    const dayExpenses = expenses.filter(e => parseInt(e.date.split('-')[2]) === day);
    const dayTotal = dayExpenses.reduce((sum, e) => sum + e.value, 0);
    console.log(`Day ${day}: ${dayExpenses.length} expenses, R$ ${dayTotal.toFixed(2)}`);
    
    if (dayExpenses.length > 0) {
      console.log(`  Sample: ${dayExpenses.slice(0, 3).map(e => `${e.user?.data?.name} - R$ ${e.value.toFixed(2)}`).join(', ')}`);
    }
  });

  // Verificar se há algum campo que indique tipo de transação
  console.log('\n=== Checking for Transaction Type Fields ===');
  if (expenses.length > 0) {
    console.log('Available fields:', Object.keys(expenses[0]));
    
    // Verificar se há campos como transaction_type, operation, etc.
    const potentialFields = ['transaction_type', 'operation', 'type', 'category', 'expense_type_id'];
    potentialFields.forEach(field => {
      if (expenses[0][field] !== undefined) {
        console.log(`  ${field}: ${expenses[0][field]}`);
      }
    });
  }

  console.log('\n=== Investigation Complete ===');
}

main().catch(console.error);
