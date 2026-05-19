import { NextRequest, NextResponse } from 'next/server';
import { startFractionalPreload, getTaskStatus, getAllActiveTasks } from '@/lib/background-preloader';

// Force dynamic to prevent static generation during build
export const dynamic = 'force-dynamic';

// GET - Obter status de tasks ou status específico
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (taskId) {
      const task = getTaskStatus(taskId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json(task);
    }

    // Retornar todas as tasks ativas
    const tasks = getAllActiveTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('[Preload API] Error in GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Iniciar novo pré-carregamento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, taskId } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    // Iniciar pré-carregamento em background (não aguardar)
    startFractionalPreload(startDate, endDate, taskId).catch(error => {
      console.error('[Preload API] Background preload error:', error);
    });

    const taskIdFinal = taskId || `preload_${Date.now()}`;
    
    return NextResponse.json({ 
      taskId: taskIdFinal,
      status: 'started',
      message: 'Pré-carregamento iniciado em background'
    });
  } catch (error) {
    console.error('[Preload API] Error in POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
