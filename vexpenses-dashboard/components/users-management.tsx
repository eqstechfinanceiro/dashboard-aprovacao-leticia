'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Copy, Check, RefreshCw, Trash2, KeyRound, X } from 'lucide-react';
import { MODULES } from '@/lib/auth';

interface UserItem {
  id: number;
  email: string;
  name: string;
  job_title: string | null;
  role: 'admin' | 'gestor' | 'usuario';
  allowed_modules: string[];
  must_change_password: boolean;
  active: boolean;
  created_at: string;
}

export function UsersManagement() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const resp = await fetch('/api/users');
      if (resp.ok) {
        const data = await resp.json();
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCopyPassword = (password: string) => {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleActive = async (user: UserItem) => {
    try {
      const resp = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      });
      if (resp.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error('Error toggling user:', err);
    }
  };

  const handleResetPassword = async (user: UserItem) => {
    if (!confirm(`Redefinir senha de ${user.name}? Uma nova senha de primeiro acesso será gerada.`)) return;
    try {
      const resp = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_password: true }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setCreatedPassword(data.first_access_password);
        setEditingUser(null);
        setShowEditModal(false);
        fetchUsers();
      }
    } catch (err) {
      console.error('Error resetting password:', err);
    }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    gestor: 'Gestor',
    usuario: 'Usuário',
  };

  const roleBadgeStyles: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800 border-purple-200',
    gestor: 'bg-blue-100 text-blue-800 border-blue-200',
    usuario: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Usuários do Sistema</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchUsers} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Novo Usuário
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cargo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Módulos</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{user.name}</p>
                  {user.job_title && (
                    <p className="text-xs text-gray-500">{user.job_title}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleBadgeStyles[user.role]}`}>
                    {roleLabels[user.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.role === 'admin' ? (
                    <span className="text-xs text-gray-500">Todos</span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {user.allowed_modules.length} módulo(s)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.active ? (
                    <Badge className="bg-green-100 text-green-800 border-green-200">Ativo</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800 border-red-200">Inativo</Badge>
                  )}
                  {user.must_change_password && (
                    <Badge className="ml-1 bg-yellow-100 text-yellow-800 border-yellow-200">Senha pendente</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => { setEditingUser(user); setShowEditModal(true); }}
                      className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
                      title="Editar"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleResetPassword(user)}
                      className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
                      title="Redefinir senha"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(user)}
                      className="rounded p-1.5 text-gray-600 hover:bg-gray-200"
                      title={user.active ? 'Desativar' : 'Ativar'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <NewUserModal
          onClose={() => setShowModal(false)}
          onCreated={(password) => {
            setCreatedPassword(password);
            setShowModal(false);
            fetchUsers();
          }}
        />
      )}

      {showEditModal && editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => { setShowEditModal(false); setEditingUser(null); }}
          onSaved={() => {
            setShowEditModal(false);
            setEditingUser(null);
            fetchUsers();
          }}
        />
      )}

      {createdPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Senha de Primeiro Acesso</CardTitle>
                <button onClick={() => setCreatedPassword(null)} className="rounded p-1 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Compartilhe esta senha com o novo usuário. Ele será obrigado a definir uma nova senha no primeiro login.
              </p>
              <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-4">
                <code className="flex-1 text-lg font-mono font-bold tracking-wider">{createdPassword}</code>
                <Button
                  variant="outline"
                  onClick={() => handleCopyPassword(createdPassword)}
                  className="flex items-center gap-2"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
              <Button onClick={() => setCreatedPassword(null)} className="w-full">
                Entendi
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function NewUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (password: string) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<'admin' | 'gestor' | 'usuario'>('usuario');
  const [modules, setModules] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleModule = (id: string) => {
    setModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const resp = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: name || undefined,
          job_title: jobTitle || undefined,
          role,
          allowed_modules: role === 'admin' ? [] : modules,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error || 'Erro ao criar usuário');
        return;
      }

      onCreated(data.first_access_password);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Novo Usuário</CardTitle>
            <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email *</label>
              <Input
                type="email"
                placeholder="usuario@eqsengenharia.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Nome (opcional)</label>
              <Input
                type="text"
                placeholder="Será derivado do email se vazio"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Cargo (texto livre)</label>
              <Input
                type="text"
                placeholder="Ex: Analista Financeiro, Diretor, etc."
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Nível de Acesso *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'gestor' | 'usuario')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="usuario">Usuário</option>
                <option value="gestor">Gestor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            {role !== 'admin' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Módulos Permitidos</label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                  {MODULES.map((mod) => (
                    <label key={mod.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={modules.includes(mod.id)}
                        onChange={() => toggleModule(mod.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {mod.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: UserItem; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [jobTitle, setJobTitle] = useState(user.job_title ?? '');
  const [role, setRole] = useState(user.role);
  const [modules, setModules] = useState<string[]>(user.allowed_modules);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleModule = (id: string) => {
    setModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const resp = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          job_title: jobTitle || null,
          role,
          allowed_modules: role === 'admin' ? [] : modules,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        setError(data.error || 'Erro ao atualizar');
        return;
      }

      onSaved();
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Editar Usuário</CardTitle>
            <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input type="email" value={user.email} disabled className="bg-gray-50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Nome</label>
              <Input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Cargo</label>
              <Input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Nível de Acesso</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'gestor' | 'usuario')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="usuario">Usuário</option>
                <option value="gestor">Gestor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            {role !== 'admin' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Módulos Permitidos</label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                  {MODULES.map((mod) => (
                    <label key={mod.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={modules.includes(mod.id)}
                        onChange={() => toggleModule(mod.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {mod.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
