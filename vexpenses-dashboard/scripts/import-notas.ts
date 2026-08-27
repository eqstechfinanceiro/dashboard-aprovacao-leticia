import * as XLSX from 'xlsx';
import { Pool } from 'pg';

const NEON_URL = process.env.NEON_DATABASE_URL;
if (!NEON_URL) {
  console.error('NEON_DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });

// Excel serial date to JS Date
function excelDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569); // 25569 = days between 1900-01-01 and 1970-01-01
  const utcValue = utcDays * 86400; // seconds
  const date = new Date(utcValue * 1000);
  return date;
}

function excelTime(fraction: number): string | null {
  if (fraction == null || isNaN(fraction)) return null;
  const totalSeconds = Math.round(fraction * 86400);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  const filePath = 'c:\\Users\\italo.medrado\\Downloads\\NOTAS LANÇADAS_EQS.xlsx';
  console.log('Reading Excel file...');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  console.log(`Total rows in Excel: ${rows.length}`);

  // Headers are at row index 2
  const headers = rows[2] as string[];
  console.log('Headers:', JSON.stringify(headers));

  // Data starts at row index 3
  const dataRows = rows.slice(3).filter(r => r && r.length > 0 && r[0]);

  // Deduplicate - each row appears twice in the spreadsheet
  const seen = new Set<string>();
  const uniqueRows: any[][] = [];
  for (const row of dataRows) {
    const key = `${row[0]}|${row[2]}|${row[3]}|${row[6]}|${row[27]}`; // empresa|numero|fornecedor|dtEmissao|usuario
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRows.push(row);
    }
  }
  console.log(`Unique rows: ${uniqueRows.length} (removed ${dataRows.length - uniqueRows.length} duplicates)`);

  // Build batch insert values
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
    const batch = uniqueRows.slice(i, i + BATCH_SIZE);
    const values: string[] = [];
    const params: any[] = [];
    let validCount = 0;

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const empresa = row[0] || 'EQS';
      const filial = row[1] || null;
      const numero = String(row[2] || '');
      const fornecedorCodigo = String(row[3] || '');
      const fornecedorNome = String(row[4] || '');
      const valor = Number(row[7] || 0);
      const dtLancto = row[9] ? excelDate(Number(row[9])) : null;
      const especieDoc = String(row[11] || '');
      const tipoNota = String(row[19] || 'N');
      const horaFraction = row[21] ? Number(row[21]) : null;
      const hora = horaFraction != null ? excelTime(horaFraction) : null;
      const usuario = String(row[27] || '');
      const feitaPeloBot = false;
      const titulo = `${numero} - ${fornecedorNome.substring(0, 40)}`;
      const tipo = tipoNota === 'D' ? 'devolucao' : especieDoc === 'SPED' ? 'mercadoria' : 'servico';
      const dataStr = dtLancto ? formatDate(dtLancto) : null;

      if (!dataStr || dataStr.includes('NaN')) continue;

      const baseIdx = validCount * 15;
      values.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13}, $${baseIdx + 14}, $${baseIdx + 15})`);
      params.push(titulo, tipo, valor, 0, feitaPeloBot, dataStr, hora, 'excel-import', empresa, usuario, fornecedorCodigo, fornecedorNome, numero, especieDoc, filial);
      validCount++;
    }

    if (values.length === 0) continue;

    const query = `
      INSERT INTO resultados_notas (titulo, tipo, valor, tempo_segundos, feita_pelo_bot, data, hora, fonte, empresa, usuario, fornecedor_codigo, fornecedor_nome, numero_nota, especie_doc, filial)
      VALUES ${values.join(', ')}
    `;

    try {
      await pool.query(query, params);
      inserted += values.length;
      if (inserted % 5000 === 0 || i + BATCH_SIZE >= uniqueRows.length) {
        console.log(`Inserted ${inserted}/${uniqueRows.length} rows...`);
      }
    } catch (err: any) {
      console.error(`Error inserting batch at offset ${i}:`, err.message);
      // Try smaller batches
      for (let k = 0; k < batch.length; k++) {
        const row = batch[k];
        const empresa = row[0] || 'EQS';
        const filial = row[1] || null;
        const numero = String(row[2] || '');
        const fornecedorCodigo = String(row[3] || '');
        const fornecedorNome = String(row[4] || '');
        const valor = Number(row[7] || 0);
        const dtLancto = row[9] ? excelDate(Number(row[9])) : null;
        const especieDoc = String(row[11] || '');
        const tipoNota = String(row[19] || 'N');
        const horaFraction = row[21] ? Number(row[21]) : null;
        const hora = horaFraction != null ? excelTime(horaFraction) : null;
        const usuario = String(row[27] || '');
        const feitaPeloBot = false;
        const titulo = `${numero} - ${fornecedorNome.substring(0, 40)}`;
        const tipo = tipoNota === 'D' ? 'devolucao' : especieDoc === 'SPED' ? 'mercadoria' : 'servico';
        const dataStr = dtLancto ? formatDate(dtLancto) : null;
        if (!dataStr) continue;

        try {
          await pool.query(
            `INSERT INTO resultados_notas (titulo, tipo, valor, tempo_segundos, feita_pelo_bot, data, hora, fonte, empresa, usuario, fornecedor_codigo, fornecedor_nome, numero_nota, especie_doc)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [titulo, tipo, valor, 0, feitaPeloBot, dataStr, hora, 'excel-import', empresa, usuario, fornecedorCodigo, fornecedorNome, numero, especieDoc]
          );
          inserted++;
        } catch (e) {
          // skip
        }
      }
    }
  }

  console.log(`Done! Total inserted: ${inserted}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
