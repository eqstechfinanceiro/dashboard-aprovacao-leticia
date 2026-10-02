'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface Cert {
  slug: string;
  installed_at?: string;
  installed_by?: string;
  file_name?: string;
  subject?: string;
  validade?: string;
}

export default function CertificadoSefazPage() {
  const [certs, setCerts] = useState<Cert[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [senha, setSenha] = useState('');
  const [rotulo, setRotulo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = () => {
    fetch('/api/certificado-sefaz').then(async (r) => {
      if (r.status === 403) { setDenied(true); return; }
      setCerts((await r.json()).certificados || []);
    }).catch(() => setDenied(true));
  };
  useEffect(reload, []);

  const enviar = async () => {
    if (!file || !senha || !rotulo) return;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('senha', senha);
    fd.append('rotulo', rotulo);
    const r = await fetch('/api/certificado-sefaz', { method: 'POST', body: fd });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setMsg({ ok: true, text: `Certificado "${rotulo}" instalado com sucesso.` });
      setFile(null); setSenha(''); setRotulo('');
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
            Você não tem permissão para instalar certificados.
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
            Certificados digitais — SEFAZ (e-CNPJ A1)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {certs && certs.length > 0 ? (
            <div className="space-y-2">
              {certs.map((c) => (
                <div key={c.slug} className="rounded-md border border-green-200 bg-green-50 p-3 space-y-1">
                  <p className="flex items-center gap-1.5 font-medium text-green-800">
                    <CheckCircle2 className="h-4 w-4" /> {c.slug}
                  </p>
                  {c.subject && <p className="text-xs text-green-700 break-all">{c.subject}</p>}
                  {c.validade && <p className="text-xs text-green-700">Válido até: {c.validade}</p>}
                  <p className="text-xs text-green-600">
                    Instalado por {c.installed_by} em{' '}
                    {c.installed_at ? new Date(c.installed_at).toLocaleString('pt-BR') : '—'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Nenhum certificado instalado ainda.</p>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Rótulo (empresa)</label>
              <input
                type="text"
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
                className="w-full rounded-md border px-3 py-1.5 text-sm"
                placeholder="eqs, bratec..."
              />
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Um rótulo por empresa — reenviar com o mesmo rótulo substitui o certificado.
              </p>
            </div>
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
            <Button size="sm" disabled={!file || !senha || !rotulo || busy} onClick={enviar}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Instalar certificado
            </Button>
            {msg && (
              <p className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Os arquivos ficam gravados no servidor com permissão restrita (somente o sistema lê) e
            nunca são expostos para download. A senha é validada antes da instalação.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
