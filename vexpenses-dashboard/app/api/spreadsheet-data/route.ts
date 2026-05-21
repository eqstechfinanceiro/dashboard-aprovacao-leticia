import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Force dynamic to prevent static generation
export const dynamic = 'force-dynamic';

interface SpreadsheetData {
  nome: string;
  email?: string;
  cpf?: string;
  tipoUsuario?: string;
  statusCartao?: string;
  statusColab?: string;
  centroCusto?: string;
  situacao?: string;
  codCentroCusto?: string;
  gestor?: string;
  diretor?: string;
  direcao?: string;
  // Campos da planilha 1 (1QZ)
  saldoReembolsar?: string;
  saldoFinal?: string;
  qzAbril26?: string;
  saldoCartao?: string;
  adiantamento?: string;
  cargaParcial?: string;
  reembolso?: string;
  cargaFinal?: string;
  obs?: string;
  // Campos do PAINEL (planilha 2)
  regional?: string;
  cargaPainel?: string;
  descarga?: string;
  tarifa?: string;
  prestacao?: string;
  saldoPrestacao?: string;
  saldoCartaoPainel?: string;
  saldoFinalPainel?: string;
  primeiraQz?: string;
  segundaQz?: string;
  adicionaisPainel?: string;
  reembolsoPainel?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sheet = searchParams.get('sheet'); // 'planilha1' ou 'planilha2'
    
    const dataPath = join(process.cwd(), '..', 'data');
    
    let spreadsheetData: SpreadsheetData[] = [];
    
    if (sheet === 'planilha1') {
      // Ler planilha 1 - 1QZ ABRIL 2026 - VEXPENSES.xlsx
      const filePath = join(dataPath, '1QZ ABRIL 2026 - VEXPENSES (1).xlsx');
      const fileBuffer = await readFile(filePath);
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      
      // Ler aba Planilha1/2/3 (Cadastro)
      if (workbook.Sheets['Planilha1']) {
        const worksheet = workbook.Sheets['Planilha1'];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        // Pular cabeçalho (linha 1) e processar dados
        for (let i = 2; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (row[1] && typeof row[1] === 'string') {
            spreadsheetData.push({
              nome: row[1] || '',
              email: row[2] || '',
              tipoUsuario: row[3] || '',
              statusCartao: row[4] || ''
            });
          }
        }
      }
      
      // Ler aba 1 QZ VEXPENSES 04_2026
      // Header na linha 4 (0-indexed). Colunas:
      // 1=PORTADOR, 2=CPF, 3=STATUS COLAB, 4=CENTRO CUSTO, 5=COD CENTRO CUSTO,
      // 6=GESTOR, 7=DIREÇÃO, 8=SALDO REEMBOLSAR, 9=SALDO FINAL, 10=1QZ DE ABRIL 26,
      // 11=SALDO CARTAO, 12=ADIANTAMENTO, 13=CARGA PARCIAL, 14=REEMBOLSO,
      // 15=CARGA FINAL, 16=STATUS DO CARTAO, 17=OBS
      if (workbook.Sheets['1 QZ VEXPENSES 04_2026']) {
        const worksheet = workbook.Sheets['1 QZ VEXPENSES 04_2026'];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        // Cabeçalho na linha 4 (0-indexed), dados a partir da linha 5
        for (let i = 5; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (row[1] && typeof row[1] === 'string' && row[1].trim()) {
            spreadsheetData.push({
              nome: row[1]?.trim() || '',
              cpf: row[2] ? String(row[2]).trim() : '',
              statusColab: row[3] ? String(row[3]).trim() : '',
              centroCusto: row[4] ? String(row[4]).trim() : '',
              codCentroCusto: row[5] ? String(row[5]).trim() : '',
              gestor: row[6] ? String(row[6]).trim() : '',
              direcao: row[7] ? String(row[7]).trim() : '',
              saldoReembolsar: row[8] !== undefined && row[8] !== null ? String(row[8]).trim() : '',
              saldoFinal: row[9] !== undefined && row[9] !== null ? String(row[9]).trim() : '',
              qzAbril26: row[10] !== undefined && row[10] !== null ? String(row[10]).trim() : '',
              saldoCartao: row[11] !== undefined && row[11] !== null ? String(row[11]).trim() : '',
              adiantamento: row[12] !== undefined && row[12] !== null ? String(row[12]).trim() : '',
              cargaParcial: row[13] !== undefined && row[13] !== null ? String(row[13]).trim() : '',
              reembolso: row[14] !== undefined && row[14] !== null ? String(row[14]).trim() : '',
              cargaFinal: row[15] !== undefined && row[15] !== null ? String(row[15]).trim() : '',
              statusCartao: row[16] ? String(row[16]).trim() : '',
              obs: row[17] ? String(row[17]).trim() : ''
            });
          }
        }
      }
    } else if (sheet === 'planilha2') {
      // Ler planilha 2 - CONTROLE - VEXPENSES - ABRIL- 2026.xlsb
      const filePath = join(dataPath, 'CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb');
      const fileBuffer = await readFile(filePath);
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      
      // Ler aba PAINEL
      // Header na linha 10 (0-indexed). Colunas:
      // 0=EMPRESA, 1=COLABORADOR, 2=CPF, 3=CHAVE, 4=SITUAÇÃO, 5=STATUS DO CARTÃO,
      // 6=CARTÃO ITAU, 7=TERMO, 8=REGIONAL, 9=CENTRO DE CUSTO, 10=GESTOR, 11=DIRETOR,
      // 12=CARTÃO VEXPENSES, 13=CARGA, 14=DESCARGA, 15=(-) TARIFA,
      // 16=(-) PRESTAÇÃO DE CONTAS, 17=SALDO PRESTAÇÃO, 18=(-) SALDO CARTAO,
      // 19=SALDO FINAL, 20=1ª QZ, 21=2ª QZ, 22=ADICIONAIS, 23=REEMBOLSO,
      // 24=CARTÃO CRED. ITAU, 25=ITAU, 26=ADICIONAL ITAU
      if (workbook.Sheets['PAINEL']) {
        const worksheet = workbook.Sheets['PAINEL'];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        // Header na linha 10 (0-indexed), dados a partir da linha 11
        for (let i = 11; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (row[1] && typeof row[1] === 'string' && row[1].trim()) {
            spreadsheetData.push({
              nome: row[1]?.trim() || '',
              cpf: row[2] ? String(row[2]).trim() : '',
              situacao: row[4] ? String(row[4]).trim() : '',
              statusCartao: row[5] ? String(row[5]).trim() : '',
              regional: row[8] ? String(row[8]).trim() : '',
              centroCusto: row[9] ? String(row[9]).trim() : '',
              gestor: row[10] ? String(row[10]).trim() : '',
              diretor: row[11] ? String(row[11]).trim() : '',
              cargaPainel: row[13] !== undefined && row[13] !== null ? String(row[13]).trim() : '',
              descarga: row[14] !== undefined && row[14] !== null ? String(row[14]).trim() : '',
              tarifa: row[15] !== undefined && row[15] !== null ? String(row[15]).trim() : '',
              prestacao: row[16] !== undefined && row[16] !== null ? String(row[16]).trim() : '',
              saldoPrestacao: row[17] !== undefined && row[17] !== null ? String(row[17]).trim() : '',
              saldoCartaoPainel: row[18] !== undefined && row[18] !== null ? String(row[18]).trim() : '',
              saldoFinalPainel: row[19] !== undefined && row[19] !== null ? String(row[19]).trim() : '',
              primeiraQz: row[20] !== undefined && row[20] !== null ? String(row[20]).trim() : '',
              segundaQz: row[21] !== undefined && row[21] !== null ? String(row[21]).trim() : '',
              adicionaisPainel: row[22] !== undefined && row[22] !== null ? String(row[22]).trim() : '',
              reembolsoPainel: row[23] !== undefined && row[23] !== null ? String(row[23]).trim() : ''
            });
          }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      data: spreadsheetData
    });
    
  } catch (error) {
    console.error('Error reading spreadsheet:', error);
    return NextResponse.json(
      { error: 'Failed to read spreadsheet data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
