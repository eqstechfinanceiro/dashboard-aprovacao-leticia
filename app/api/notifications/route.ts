import { NextRequest, NextResponse } from 'next/server';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/sync/notifications';

export const dynamic = 'force-dynamic';

// GET /api/notifications — notificações genéricas do usuário logado
// (o sino do header combina estas com os alertas de inativos).
export async function GET(request: NextRequest) {
  const userId = parseInt(request.headers.get('x-user-id') || '', 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  try {
    const notifications = await listNotifications(userId);
    return NextResponse.json({
      notifications,
      unread: notifications.filter((n) => !n.read_at && !n.resolved_at).length,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[notifications GET]', e);
    return NextResponse.json({ error: 'Erro ao carregar notificações' }, { status: 500 });
  }
}

// POST /api/notifications — { id } marca uma como lida · { mark_all: true } todas
export async function POST(request: NextRequest) {
  const userId = parseInt(request.headers.get('x-user-id') || '', 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (body.mark_all) {
      const count = await markAllNotificationsRead(userId);
      return NextResponse.json({ marked: count });
    }
    const id = parseInt(body.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }
    const ok = await markNotificationRead(userId, id);
    if (!ok) {
      return NextResponse.json({ error: 'Notificação não encontrada' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[notifications POST]', e);
    return NextResponse.json({ error: 'Erro ao marcar notificação' }, { status: 500 });
  }
}
