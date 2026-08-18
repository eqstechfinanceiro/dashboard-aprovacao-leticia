/**
 * Script para investigar detalhes de team-members para encontrar campos de saldo/limite
 */

const API_URL = 'https://api.vexpenses.com';
const API_KEY = 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';

async function fetchTeamMembers(params) {
  const url = new URL(`${API_URL}/v2/team-members`);
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
  console.log('=== Investigating Team Members for Balance/Limit Fields ===\n');

  // Buscar team-members com includes
  console.log('Fetching team members with all includes...');
  const members = await fetchTeamMembers({
    paginate: 'false',
    include: 'costsCenters,projects,parameters,cards'
  });

  console.log(`Total members: ${members.length}\n`);

  // Analisar campos disponíveis
  if (members.length > 0) {
    console.log('=== All Team Member Fields ===');
    console.log('Fields:', Object.keys(members[0]));

    // Verificar campos relacionados a saldo/limite
    console.log('\n=== Balance/Limit Related Fields ===');
    const balanceFields = ['balance', 'limit', 'wallet', 'card_limit', 'expense_limit', 'available', 'credit'];
    balanceFields.forEach(field => {
      if (members[0][field] !== undefined) {
        console.log(`  ${field}: ${members[0][field]}`);
      }
    });

    // Verificar campos aninhados
    console.log('\n=== Nested Objects ===');
    const nestedFields = ['parameters', 'costsCenters', 'cards', 'projects'];
    nestedFields.forEach(field => {
      if (members[0][field]) {
        console.log(`  ${field}:`);
        if (Array.isArray(members[0][field])) {
          console.log(`    Type: Array (${members[0][field].length} items)`);
          if (members[0][field].length > 0) {
            console.log(`    First item keys:`, Object.keys(members[0][field][0]));
          }
        } else if (typeof members[0][field] === 'object') {
          console.log(`    Type: Object`);
          console.log(`    Keys:`, Object.keys(members[0][field]));
        }
      }
    });
  }

  // Buscar membros específicos da planilha
  console.log('\n=== Specific Users from Spreadsheet ===');
  const targetUsers = [
    'ABNER ANDRADE CAVALCANTE',
    'RAFAEL AMORIM VELLO',
    'GUILHERME FORTKAMP PROENCA'
  ];

  targetUsers.forEach(userName => {
    const member = members.find(m => m.name === userName);
    if (member) {
      console.log(`\n${userName}:`);
      console.log(`  ID: ${member.id}`);
      console.log(`  Active: ${member.active}`);
      console.log(`  User Type: ${member.user_type}`);
      console.log(`  Expense Limit Policy ID: ${member.expense_limit_policy_id}`);
      console.log(`  Approval Flow ID: ${member.approval_flow_id}`);
      
      if (member.parameters) {
        console.log(`  Parameters:`, member.parameters);
      }
      
      if (member.costsCenters && member.costsCenters.length > 0) {
        console.log(`  Cost Centers (${member.costsCenters.length}):`);
        member.costsCenters.forEach(cc => {
          console.log(`    - ${cc.name} (ID: ${cc.id})`);
        });
      }
      
      if (member.cards && member.cards.length > 0) {
        console.log(`  Cards (${member.cards.length}):`);
        member.cards.forEach(card => {
          console.log(`    - Keys:`, Object.keys(card));
        });
      }
    }
  });

  // Tentar buscar detalhes de um usuário específico
  console.log('\n=== Testing Single User Detail Endpoint ===');
  if (members.length > 0) {
    const userId = members[0].id;
    console.log(`Fetching details for user ID: ${userId}`);
    
    try {
      const response = await fetch(`${API_URL}/v2/team-members/${userId}`, {
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Success!');
        console.log('Data keys:', Object.keys(data.data || {}));
        
        if (data.data) {
          console.log('Full data:', JSON.stringify(data.data, null, 2).substring(0, 1000));
        }
      } else {
        console.log(`Status: ${response.status}`);
        const errorText = await response.text();
        console.log(`Error: ${errorText.substring(0, 200)}`);
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  }

  // Tentar buscar cards do usuário
  console.log('\n=== Testing User Cards Endpoint ===');
  if (members.length > 0) {
    const userId = members[0].id;
    console.log(`Fetching cards for user ID: ${userId}`);
    
    try {
      const response = await fetch(`${API_URL}/v2/team-members/${userId}/cards`, {
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Success!');
        console.log('Data keys:', Object.keys(data.data || {}));
        
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          console.log('First card keys:', Object.keys(data.data[0]));
          console.log('Sample card:', JSON.stringify(data.data[0], null, 2).substring(0, 500));
        }
      } else {
        console.log(`Status: ${response.status}`);
        const errorText = await response.text();
        console.log(`Error: ${errorText.substring(0, 200)}`);
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  }

  // Tentar buscar parâmetros do usuário
  console.log('\n=== Testing User Parameters Endpoint ===');
  if (members.length > 0) {
    const userId = members[0].id;
    console.log(`Fetching parameters for user ID: ${userId}`);
    
    try {
      const response = await fetch(`${API_URL}/v2/team-members/${userId}/parameters`, {
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Success!');
        console.log('Data keys:', Object.keys(data.data || {}));
        
        if (data.data) {
          console.log('Full data:', JSON.stringify(data.data, null, 2).substring(0, 1000));
        }
      } else {
        console.log(`Status: ${response.status}`);
        const errorText = await response.text();
        console.log(`Error: ${errorText.substring(0, 200)}`);
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  }

  console.log('\n=== Investigation Complete ===');
}

main().catch(console.error);
