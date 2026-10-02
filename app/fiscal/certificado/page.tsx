'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface CertStatus {
  installed: boolean;
  installed_at?: string;
  installed_by?: string;
  file_name?: string;
  subject?: string;
  validade?: string;
}

export default function CertificadoSefazPage() {
  const [status, setStatus] = useState<CertStatus | null>(null);
  const [denied, setDenied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = () => {
    fetch('/api/fiscal/certificado').then(async (r) => {
      if (r.status === 403) { setDenied(true); return; }
      setStatus(await r.json());
    }).catch(() => setDenied(true));
  };
  useEffect(reload, []);

  const enviar = async () => {
    if (!file || !senha) return;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('senha', senha);
    const r = await fetch('/api/fiscal/certificado', { method: 'POST', body: fd });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setMsg({ ok: true, text: 'Certificado instalado com sucesso.' });
      setFile(null); setSenha('');
      reload();
    } else {
      setMsg({ ok: false, text: d.error || `Erro ${r.status}` });
    }
    setBusy(false);
  };

  if (denied) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <XCircle className="mx-auto mb-2 h-6 w-6 text-red-500" />
            Você não tem permissão para instalar o certificado digital.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-8 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Certificado digital — SEFAZ (e-CNPJ A1)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {status?.installed ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-1">
              <p className="flex items-center gap-1.5 font-medium text-green-800">
                <CheckCircle2 className="h-4 w-4" /> Certificado instalado
              </p>
              {status.subject && <p className="text-xs text-green-700 break-all">{status.subject}</p>}
              {status.validade && <p className="text-xs text-green-700">Válido até: {status.validade}</p>}
              <p className="text-xs text-green-600">
                Instalado por {status.installed_by} em{' '}
                {status.installed_at ? new Date(status.installed_at).toLocaleString('pt-BR') : '—'}
              </p>
              <p className="text-[11px] text-green-600">Enviar outro arquivo substitui o certificado atual.</p>
            </div>
          ) : (
            <p className="text-muted-foreground">Nenhum certificado instalado ainda.</p>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Arquivo do certificado (.pfx ou .p12)</label>
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-blue-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Senha do certificado</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-md border px-3 py-1.5 text-sm"
                placeholder="Senha que protege o .pfx"
              />
            </div>
            <Button size="sm" disabled={!file || !senha || busy} onClick={enviar}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Instalar certificado
            </Button>
            {msg && (
              <p className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            O arquivo fica gravado no servidor com permissão restrita (somente o sistema lê) e nunca é
            exposto para download. A senha é validada antes da instalação.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
