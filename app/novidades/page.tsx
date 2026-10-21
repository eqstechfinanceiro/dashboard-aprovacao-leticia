'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import {
  Sparkles,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Rocket,
  Wrench,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CHANGELOG_SEEN_KEY = 'aery:changelog-seen';

interface ChangelogItem {
  tag: 'feat' | 'improve' | 'fix';
  text: string;
}

interface ChangelogEntry {
  version: string;
  seq: number;
  date: string;
  title: string;
  items: ChangelogItem[];
  updated_by: string | null;
}

const TAG_STYLE: Record<string, { label: string; cls: string; icon: any }> = {
  feat: { label: 'Novo', cls: 'bg-emerald-100 text-emerald-700', icon: Rocket },
  improve: { label: 'Melhoria', cls: 'bg-blue-100 text-blue-700', icon: TrendingUp },
  fix: { label: 'Correção', cls: 'bg-amber-100 text-amber-700', icon: Wrench },
};

function fmtData(d: string): string {
  const s = (d || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : d;
}

function ItemEditor({ items, onChange }: { items: ChangelogItem[]; onChange: (items: ChangelogItem[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select
            className="rounded border bg-white px-1.5 py-1 text-xs"
            value={it.tag}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...it, tag: e.target.value as ChangelogItem['tag'] };
              onChange(next);
            }}
          >
            <option value="feat">Novo</option>
            <option value="improve">Melhoria</option>
            <option value="fix">Correção</option>
          </select>
          <input
            className="flex-1 rounded border bg-white px-2 py-1 text-xs"
            value={it.text}
            placeholder="Descreva a mudança…"
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...it, text: e.target.value };
              onChange(next);
            }}
          />
          <button
            className="text-slate-400 hover:text-red-600"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        className="text-xs text-blue-600 hover:underline"
        onClick={() => onChange([...items, { tag: 'feat', text: '' }])}
      >
        + adicionar item
      </button>
    </div>
  );
}

export default function NovidadesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{ version: string; date: string; title: string; items: ChangelogItem[] }>({
    version: '', date: new Date().toISOString().slice(0, 10), title: '', items: [{ tag: 'feat', text: '' }],
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/changelog');
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setEntries(b.entries || []);
      // Marca a versão mais nova como vista — apaga o dot da sidebar.
      const latest = (b.entries || [])[0]?.version;
      if (latest) {
        try { window.localStorage.setItem(CHANGELOG_SEEN_KEY, latest); } catch {}
        window.dispatchEvent(new Event('aery:changelog-seen'));
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const salvarNovo = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, items: form.items.filter((i) => i.text.trim()) }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setCreating(false);
      setForm({ version: '', date: new Date().toISOString().slice(0, 10), title: '', items: [{ tag: 'feat', text: '' }] });
      await load();
    } catch (e: any) {
      alert(`Erro ao criar versão: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const salvarEdicao = async (version: string) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/changelog/${encodeURIComponent(version)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: form.date, title: form.title, items: form.items.filter((i) => i.text.trim()) }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setEditing(null);
      await load();
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (version: string) => {
    if (!confirm(`Excluir a versão ${version} do changelog?`)) return;
    const r = await fetch(`/api/changelog/${encodeURIComponent(version)}`, { method: 'DELETE' });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      alert(`Erro ao excluir: ${b.error || r.status}`);
      return;
    }
    await load();
  };

  return (
    <div className="p-6 space-y-6 max-w-[900px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-600" />
            Novidades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            O que mudou no dashboard — versões, melhorias e correções.
          </p>
        </div>
        {isAdmin && !creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova versão
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {creating && (
        <Card className="border-blue-300">
          <CardHeader>
            <CardTitle className="text-base">Nova versão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <input
                className="rounded border bg-white px-2 py-1.5 text-sm w-28"
                placeholder="26.4.1"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
              />
              <input
                type="date"
                className="rounded border bg-white px-2 py-1.5 text-sm"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
              <input
                className="flex-1 min-w-[200px] rounded border bg-white px-2 py-1.5 text-sm"
                placeholder="Título da versão"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <ItemEditor items={form.items} onChange={(items) => setForm({ ...form, items })} />
            <div className="flex gap-2">
              <Button size="sm" disabled={saving || !form.version.trim()} onClick={salvarNovo}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                Publicar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!entries ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Nenhuma versão registrada ainda.</p>
      ) : (
        <div className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border">
          {entries.map((e, idx) => {
            const isEditing = editing === e.version;
            return (
              <div key={e.version} className="relative pl-10">
                <div className={cn(
                  'absolute left-0 top-1.5 h-8 w-8 rounded-full border-2 flex items-center justify-center bg-background',
                  idx === 0 ? 'border-blue-500 text-blue-600' : 'border-slate-300 text-slate-400'
                )}>
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">v{e.version}</CardTitle>
                          {idx === 0 && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              mais recente
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {e.title} · {fmtData(e.date)}
                        </p>
                      </div>
                      {isAdmin && !isEditing && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            className="rounded p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                            title="Editar"
                            onClick={() => {
                              setEditing(e.version);
                              setForm({ version: e.version, date: e.date.slice(0, 10), title: e.title, items: [...e.items] });
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Excluir"
                            onClick={() => excluir(e.version)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex gap-2 flex-wrap">
                          <input
                            type="date"
                            className="rounded border bg-white px-2 py-1.5 text-sm"
                            value={form.date}
                            onChange={(e2) => setForm({ ...form, date: e2.target.value })}
                          />
                          <input
                            className="flex-1 min-w-[200px] rounded border bg-white px-2 py-1.5 text-sm"
                            value={form.title}
                            onChange={(e2) => setForm({ ...form, title: e2.target.value })}
                          />
                        </div>
                        <ItemEditor items={form.items} onChange={(items) => setForm({ ...form, items })} />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={saving} onClick={() => salvarEdicao(e.version)}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {(e.items || []).map((it, i) => {
                          const tag = TAG_STYLE[it.tag] || TAG_STYLE.improve;
                          const Icon = tag.icon;
                          return (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 mt-0.5', tag.cls)}>
                                <Icon className="h-3 w-3" /> {tag.label}
                              </span>
                              <span>{it.text}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
