import { NextRequest, NextResponse } from 'next/server';
import { calculateUserFinancialData, calculatePlanilha1Fields } from '@/lib/vexpenses-calculations';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2026');
    const month = parseInt(searchParams.get('month') || '4');
    const userId = searchParams.get('userId');
    const dayStart = parseInt(searchParams.get('dayStart') || '1');
    const dayEnd = parseInt(searchParams.get('dayEnd') || '15');

    // Buscar despesas do período
    const startDate = `${year}-${String(month).padStart(2, '0')}-${String(dayStart).padStart(2, '0')}`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(dayEnd).padStart(2, '0')}`;

    const params = new URLSearchParams();
    params.append('search', `date:${startDate},${endDate}`);
    params.append('searchFields', 'date:between');
    params.append('include', 'user,costs_center,payment_method');
    params.append('paginate', 'false');

    const response = await fetch(`${API_URL}/v2/expenses?${params.toString()}`, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(120000), // 2 minutos de timeout
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    const expenses = data.data || [];

    // Se userId for especificado, calcular apenas para esse usuário
    if (userId) {
      const userIdNum = parseInt(userId);
      const financialData = calculatePlanilha1Fields(
        expenses,
        userIdNum,
        year,
        month,
        dayStart,
        dayEnd,
        0  // adiantamentoManual (não disponível na API ainda)
      );

      return NextResponse.json({
        success: true,
        userId: userIdNum,
        year,
        month,
        dayStart,
        dayEnd,
        data: financialData,
      });
    }

    // Caso contrário, calcular para todos os usuários
    const allUsersData = calculateUserFinancialData(expenses, year, month, dayStart, dayEnd);

    // Converter Map para array
    const usersArray = Array.from(allUsersData.values()).map(userData => {
      const financialData = calculatePlanilha1Fields(
        expenses,
        userData.userId,
        year,
        month,
        dayStart,
        dayEnd,
        0  // adiantamentoManual (não disponível na API ainda)
      );

      return {
        userId: userData.userId,
        userName: userData.userName,
        userCpf: userData.userCpf,
        ...financialData,
      };
    });

    return NextResponse.json({
      success: true,
      year,
      month,
      dayStart,
      dayEnd,
      totalUsers: usersArray.length,
      data: usersArray,
    });

  } catch (error) {
    console.error('Error calculating financial data:', error);
    return NextResponse.json(
      { error: 'Failed to calculate financial data' },
      { status: 500 }
    );
  }
}
