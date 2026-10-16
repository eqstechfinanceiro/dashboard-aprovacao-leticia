'use client';

import { useEffect, useState } from 'react';

const INTERVAL = 3 * 60 * 1000; // 3 min
const STORAGE_KEY = 'aery_build_id';
let reloading = false;

/**
 * Força reload quando o servidor passa a servir um build mais novo.
 * Cobre usuários que deixam a aba aberta por dias com bundle antigo —
 * inclusive propaga mudanças de permissão, já que /api/auth/me re-emite
 * o cookie no mount pós-reload.
 */
export function VersionChecker() {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = await res.json();
        if (!v || stopped || reloading) return;
        const seen = sessionStorage.getItem(STORAGE_KEY);
        if (!seen) {
          sessionStorage.setItem(STORAGE_KEY, v);
          return;
        }
        if (seen !== v) {
          reloading = true;
          sessionStorage.setItem(STORAGE_KEY, v);
          try { navigator.serviceWorker?.getRegistration().then((r) => r?.update()); } catch { /* ignora */ }
          setUpdating(true);
          setTimeout(() => location.reload(), 1500);
        }
      } catch {
        /* rede indisponível ou dev mode — ignora */
      }
    };
    const onFocus = () => check();
    const iv = setInterval(check, INTERVAL);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    check();
    return () => {
      stopped = true;
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  if (!updating) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: '#1e293b',
        color: '#f8fafc',
        border: '1px solid #3b82f6',
        borderRadius: 8,
        padding: '10px 18px',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 4px 18px rgba(0,0,0,.4)',
      }}
    >
      Nova versão disponível — atualizando…
    </div>
  );
}
