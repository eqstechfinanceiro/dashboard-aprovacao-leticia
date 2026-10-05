'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Pencil, Check, X, AlertTriangle } from 'lucide-react';

interface DocClassification {
  expense_id: number;
  report_id: number;
  tipo_documento: 'nfe' | 'nfce' | 'sat' | 'recibo' | 'desconhecido';
  chave_acesso: string | null;
  needs_review: boolean;
  source: 'bot' | 'humano';
  reviewed_by: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  nfe: 'NF-e (nota)',
  nfce: 'NFC-e (cupom)',
  sat: 'SAT (cupom)',
  recibo: 'Recibo',
  desconhecido: 'Não identificado',
};

const TIPO_BADGE: Record<string, string> = {
  nfe: 'bg-blue-100 text-blue-800 border-blue-200',
  nfce: 'bg-gray-100 text-gray-700 border-gray-200',
  sat: 'bg-gray-100 text-gray-700 border-gray-200',
  recibo: 'bg-gray-100 text-gray-700 border-gray-200',
  desconhecido: 'bg-amber-100 text-amber-800 border-amber-300',
};

interface Props {
  reportId: number;
  expenseId: number;
  reviewerName?: string;
  onSaved?: (c: DocClassification) => void;
}

export function DocClassEditor({ reportId, expenseId, reviewerName = 'humano', onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<DocClassification | null>(null);
  const [editing, setEditing] = useState(false);
  const [tipo, setTipo] = useState<string>('recibo');
  const [chave, setChave] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aprovacao-dinamica/doc-classification?expense_ids=${expenseId}`);
      if (res.ok) {
        const j = await res.json();
        setDoc(j.data?.[0] ?? null);
      }
    } catch { /* silencioso — seção é auxiliar */ }
    setLoading(false);
  }, [expenseId]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    setTipo(doc?.tipo_documento === 'nfe' ? 'nfe' : doc?.tipo_documento ?? 'desconhecido');
    setChave(doc?.chave_acesso ?? '');
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const digits = chave.replace(/\D/g, '');
    if (tipo === 'nfe' && digits.length !== 44) {
      setError('NF-e exige chave de acesso com 44 dígitos');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/aprovacao-dinamica/doc-classification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          expense_id: expenseId,
          tipo_documento: tipo,
          chave_acesso: tipo === 'nfe' ? digits : null,
          reviewer_name: reviewerName,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || 'Falha ao salvar');
        return;
      }
      setEditing(false);
      await load();
      if (doc && onSaved) onSaved(doc);
    } catch {
      setError('Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Classificação do documento…
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs font-medium uppercase text-gray-400">
          <FileText className="h-3 w-3" /> Documento fiscal
        </p>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            title="Corrigir classificação"
          >
            <Pencil className="h-3 w-3" /> Editar
          </button>
        )}
      </div>

      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          {doc ? (
            <>
              <Badge variant="outline" className={TIPO_BADGE[doc.tipo_documento]}>
                {TIPO_LABEL[doc.tipo_documento] ?? doc.tipo_documento}
              </Badge>
              {doc.chave_acesso && (
                <span className="font-mono text-xs text-gray-600" title={doc.chave_acesso}>
                  chave …{doc.chave_acesso.slice(-12)}
                </span>
              )}
              {doc.source === 'humano' && (
                <span className="text-xs text-gray-400">
                  (manual{doc.reviewed_by ? ` · ${doc.reviewed_by}` : ''})
                </span>
              )}
              {doc.needs_review && (
                <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> revisar
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-400">Sem classificação (OCR ainda não rodou)</span>
          )}
        </div>
      )}

      {doc?.needs_review && !editing && (
        <Button size="sm" variant="outline" className="w-full border-amber-300 text-amber-700 hover:bg-amber-50" onClick={startEdit}>
          Classificar manualmente
        </Button>
      )}

      {editing && (
        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="nfe">NF-e (nota)</option>
            <option value="nfce">NFC-e (cupom)</option>
            <option value="sat">SAT (cupom)</option>
            <option value="recibo">Recibo</option>
            <option value="desconhecido">Não identificado</option>
          </select>

          {tipo === 'nfe' && (
            <input
              value={chave}
              onChange={e => setChave(e.target.value.replace(/[^\d]/g, '').slice(0, 44))}
              placeholder="Chave de acesso — 44 dígitos"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
              inputMode="numeric"
            />
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
