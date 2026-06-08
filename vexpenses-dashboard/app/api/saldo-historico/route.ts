/**
 * /api/saldo-historico
 * 
 * Endpoint que fornece dados históricos de saldos para estimativa em períodos futuros.
 * Baseado na planilha 1QZ de abril 2026 como referência histórica.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Carregar dados históricos da planilha
    const planilhaPath = path.join(process.cwd(), 'planilha-1qz-data.json');
    if (!fs.existsSync(planilhaPath)) {
      return NextResponse.json({ error: 'Dados históricos não encontrados' }, { status: 404 });
    }

    const planilhaData = JSON.parse(fs.readFileSync(planilhaPath, 'utf-8'));

    // Criar índice de saldos por CPF
    const saldoIndex: Record<string, any> = {};

    planilhaData.forEach((user: any) => {
      const cpf = user['CPF'];
      const portador = user['PORTADOR'];

      if (!cpf || !portador) return;

      saldoIndex[cpf] = {
        portador,
        saldoFinal: user['SALDO FINAL'] || null,
        saldoCartao: user['SALDO CARTAO'] || null,
        saldoReembolsar: user['SALDO REEMBOLSAR'] || null,
        qz1: user['1QZ DE ABRIL 26'] || null,
        referencia: '2026-04-01Q' // 1ª quinzena de abril 2026
      };
    });

    return NextResponse.json({
      status: 'success',
      metadata: {
        totalUsers: Object.keys(saldoIndex).length,
        referencia: '2026-04-1Q',
        generatedAt: new Date().toISOString()
      },
      data: saldoIndex
    });

  } catch (error: any) {
    console.error('Erro ao buscar dados históricos de saldos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados históricos', details: error.message },
      { status: 500 }
    );
  }
}