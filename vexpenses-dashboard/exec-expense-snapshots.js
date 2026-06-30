#!/usr/bin/env node
/**
 * Executa SQL de importação de expense_snapshots via Neon MCP run_sql_transaction.
 * Lê o arquivo SQL gerado e envia em batches via HTTP para o Neon API.
 */
const fs = require('fs');

const file = process.argv[2];
const projectId = process.argv[3] || 'billowing-dust-36154446';
const neonUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!file || !neonUrl) {
  console.error('Uso: NEON_DATABASE_URL=... node exec-expense-snapshots.js <sql_file> <project_id>');
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim().startsWith('INSERT INTO prestacao_expense_snapshots'));
console.log(`Found ${lines.length} INSERT statements`);

// Parse connection string
const match = neonUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^\/]+)\/([^?]+)/);
if (!match) {
  console.error('Invalid connection string');
  process.exit(1);
}

const [, user, password, host, db] = match;
const baseUrl = `https://${host}/sql`;

async function runTransaction(statements) {
  const body = JSON.stringify({ statements });
  const authHeader = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  
  const resp = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'Neon-Connection-String': neonUrl,
    },
    body,
  });
  
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
  
  return resp.json();
}

async function main() {
  const BATCH = 5; // 5 INSERT statements per transaction (250 rows each)
  let done = 0;
  
  for (let i = 0; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH);
    try {
      await runTransaction(batch);
      done += batch.length;
      if (done % 100 === 0 || done === lines.length) {
        console.log(`  ${done}/${lines.length} statements (${done * 50} rows)`);
      }
    } catch (err) {
      console.error(`Error at batch ${i}: ${err.message}`);
      // Try one by one
      for (const stmt of batch) {
        try {
          await runTransaction([stmt]);
          done++;
        } catch (e) {
          console.error(`  Failed individual: ${e.message.substring(0, 200)}`);
        }
      }
    }
  }
  
  console.log(`Done: ${done}/${lines.length} statements`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
