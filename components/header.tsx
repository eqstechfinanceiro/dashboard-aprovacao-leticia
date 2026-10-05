'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, Eye, User, LogOut, Puzzle, Check, UserX, Camera, Trash2, KeyRound, MonitorDown, Download, AlertTriangle, FileCheck, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { SECTOR_VIEWS, VIEW_STORAGE_KEY, VIEW_EVENT, readStoredView, type SectorView } from '@/lib/nav-views';
import { useRouter } from 'next/navigation';
import { ThemeSwitcher } from '@/components/theme-switcher';

interface AlertItem {
  id: number;
  colaborador: string;
  situacao: string | null;
  saldo_prestacao: number;
  saldo_cartao: number;
  saldo_reembolsar: number;
  detected_at: string;
  read_at: string | null;
  resolved_at: string | null;
}

interface NotifItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export function Header() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [installEvt, setInstallEvt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [view, setView] = useState<SectorView>('all');

  useEffect(() => setView(readStoredView()), []);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
    setIsElectron(/Electron/.test(navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    const onInstalled = () => { setIsStandalone(true); setInstallEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (installEvt) {
      installEvt.prompt();
      await installEvt.userChoice.catch(() => null);
      setInstallEvt(null);
      return;
    }
    // Sem prompt nativo: em HTTP o browser não oferece instalação — leva ao HTTPS.
    if (location.protocol !== 'https:') {
      window.open('https://179-199-149-43.sslip.io', '_blank');
      return;
    }
    alert('Para instalar: menu do navegador (⋮) → "Instalar app" / "Instalar Aery".');
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
    router.refresh();
  };

  const fetchAlerts = async () => {
    try {
      const [ra, rn] = await Promise.all([
        fetch('/api/inactive-alerts?all=1'),
        fetch('/api/notifications'),
      ]);
      let unread = 0;
      if (ra.ok) {
        const data = await ra.json();
        setAlerts(data.alerts || []);
        unread += (data.alerts || []).filter((a: AlertItem) => !a.read_at && !a.resolved_at).length;
      }
      if (rn.ok) {
        const data = await rn.json();
        setNotifs(data.notifications || []);
        unread += (data.notifications || []).filter((n: NotifItem) => !n.read_at && !n.resolved_at).length;
      }
      setUnreadCount(unread);
    } catch {}
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10_000);
    const onAlertsUpdated = () => fetchAlerts();
    window.addEventListener('inactive-alerts-updated', onAlertsUpdated);
    return () => { clearInterval(interval); window.removeEventListener('inactive-alerts-updated', onAlertsUpdated); };
  }, []);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const onAvatarFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Envie uma imagem (PNG, JPG, WEBP ou GIF)'); return; }
    if (file.size > 3 * 1024 * 1024) { alert('Imagem muito grande (máx. 3 MB)'); return; }
    setAvatarBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result));
        rd.onerror = () => reject(rd.error);
        rd.readAsDataURL(file);
      });
      const r = await fetch('/api/auth/me/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataUrl }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || 'Erro ao enviar foto');
        return;
      }
      await refresh();
      setUserMenuOpen(false);
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const onAvatarRemove = async () => {
    setAvatarBusy(true);
    try {
      await fetch('/api/auth/me/avatar', { method: 'DELETE' });
      await refresh();
      setUserMenuOpen(false);
    } finally {
      setAvatarBusy(false);
    }
  };

  const markAllRead = async () => {
    try {
      await Promise.all([
        fetch('/api/inactive-alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark_all: true }),
        }),
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark_all: true }),
        }),
      ]);
      setAlerts(prev => prev.map(a => ({ ...a, read_at: 'now' })));
      setNotifs(prev => prev.map(n => ({ ...n, read_at: 'now' })));
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('inactive-alerts-updated'));
    } catch {}
  };

  const notifIcon = (type: string) => {
    switch (type) {
      case 'sync_failure': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'approval_digest': return <FileCheck className="h-4 w-4 text-blue-500" />;
      case 'prestacao_stale': return <Clock className="h-4 w-4 text-amber-500" />;
      default: return <Bell className="h-4 w-4 text-gray-400" />;
    }
  };

  const roleLabel = user?.role === 'admin' ? 'Administrador' : user?.role === 'gestor' ? 'Gestor' : 'Usuário';

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Eye className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={view}
            onChange={(e) => {
              const v = e.target.value as SectorView;
              setView(v);
              window.localStorage.setItem(VIEW_STORAGE_KEY, v);
              window.dispatchEvent(new CustomEvent(VIEW_EVENT, { detail: v }));
            }}
            title="Ver o menu como um setor específico"
            className="w-48 appearance-none rounded-lg border border-gray-300 pl-10 pr-8 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:w-56"
          >
            {SECTOR_VIEWS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === 'all' ? 'Ver: todos os setores' : `Ver como: ${s.label}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {!isStandalone && !isElectron && (
          <button
            onClick={handleInstallPwa}
            title="Instalar o Aery como aplicativo (PWA) — abre em janela própria, sem instalar nada pesado"
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <Download className="h-4 w-4" />
            Instalar app
          </button>
        )}

        <a
          href="/api/downloads/Aery-Setup-1.0.0.exe"
          download="Aery-Setup-1.0.0.exe"
          title="Baixar o Aery para Windows — instale e use o portal como aplicativo"
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          <MonitorDown className="h-4 w-4" />
          App Desktop
        </a>

        <a
          href="/api/downloads/aery-extension.zip"
          download="aery-extension.zip"
          title="Baixar extensão Aery para Chrome — atualize sempre que houver nova versão"
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          <Puzzle className="h-4 w-4" />
          Extensão
        </a>

        <ThemeSwitcher />

        {/* Notification bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            title="Notificações"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-semibold text-gray-800">
                    Notificações
                  </span>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Marcar todos
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifs.length > 0 && (
                  <>
                    <div className="border-b bg-gray-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Sistema
                    </div>
                    {notifs.map(n => {
                      const isResolved = !!n.resolved_at;
                      const isUnread = !n.read_at && !isResolved;
                      const inner = (
                        <div className={`flex items-start gap-2.5 px-4 py-3 ${isUnread ? 'bg-blue-50/50' : ''} ${isResolved ? 'opacity-60' : ''}`}>
                          <div className="mt-0.5 flex-shrink-0">{notifIcon(n.type)}</div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                              {n.title}
                            </p>
                            {n.body && <p className="mt-0.5 text-xs text-gray-500">{n.body}</p>}
                            <p className="mt-0.5 text-[10px] text-gray-400">
                              {new Date(n.created_at).toLocaleString('pt-BR')}
                              {isResolved && <span className="ml-1 text-green-600">· resolvido</span>}
                            </p>
                          </div>
                          {isUnread && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
                        </div>
                      );
                      return n.link ? (
                        <a key={`n${n.id}`} href={n.link} className="block border-b last:border-0 hover:bg-gray-50">
                          {inner}
                        </a>
                      ) : (
                        <div key={`n${n.id}`} className="border-b last:border-0">{inner}</div>
                      );
                    })}
                  </>
                )}

                {alerts.length > 0 && (
                  <div className="border-b bg-gray-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    <span className="flex items-center gap-1"><UserX className="h-3 w-3 text-red-500" /> Inativos com saldo</span>
                  </div>
                )}
                {alerts.length === 0 && notifs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhuma notificação
                  </div>
                ) : (
                  alerts.map(a => {
                    const isResolved = !!a.resolved_at;
                    const isUnread = !a.read_at && !isResolved;
                    const totalSaldo = a.saldo_prestacao + a.saldo_cartao + a.saldo_reembolsar;
                    return (
                      <div
                        key={a.id}
                        className={`border-b px-4 py-3 last:border-0 ${isUnread ? 'bg-blue-50/50' : ''} ${isResolved ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                              {a.colaborador}
                            </p>
                            <p className="text-xs text-gray-400">
                              {a.situacao || 'Inativo'} · {formatDate(a.detected_at)}
                              {isResolved && <span className="ml-1 text-green-600">· resolvido</span>}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs">
                              {a.saldo_prestacao > 0 && (
                                <span className="text-gray-600">A prestar: {BRL(a.saldo_prestacao)}</span>
                              )}
                              {a.saldo_reembolsar > 0 && (
                                <span className="text-blue-600">A reembolsar: {BRL(a.saldo_reembolsar)}</span>
                              )}
                              {a.saldo_cartao > 0 && (
                                <span className="text-gray-600">Cartão: {BRL(a.saldo_cartao)}</span>
                              )}
                            </div>
                          </div>
                          {isUnread && (
                            <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {alerts.length > 0 && (
                <div className="border-t px-4 py-2.5">
                  <a
                    href="/gestao-caixa"
                    className="block text-center text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Ver Posição de Caixa →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="relative" ref={userMenuRef}>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={e => onAvatarFile(e.target.files?.[0])}
          />
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
            title="Minha conta"
          >
            {user?.has_avatar ? (
              <img
                src={`/api/auth/avatar/${user.id}?v=${user.avatar_v ?? 0}`}
                alt={user.name}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-sm font-bold text-white">
                  {user?.name?.charAt(0).toUpperCase() ?? <User className="h-5 w-5 text-white" />}
                </span>
              </div>
            )}
            <div className="min-w-0 text-sm text-left">
              <p className="max-w-[180px] truncate font-medium text-gray-900">{user?.name ?? '—'}</p>
              <p className="max-w-[180px] truncate text-xs text-gray-500">
                {user?.job_title || roleLabel}
              </p>
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-semibold text-gray-800">{user?.name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  {user?.has_avatar ? 'Alterar foto de perfil' : 'Adicionar foto de perfil'}
                </button>
                {user?.has_avatar && (
                  <button
                    onClick={onAvatarRemove}
                    disabled={avatarBusy}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover foto
                  </button>
                )}
                <button
                  onClick={() => { setUserMenuOpen(false); router.push('/change-password'); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <KeyRound className="h-4 w-4" />
                  Trocar senha
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
          title="Sair"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
