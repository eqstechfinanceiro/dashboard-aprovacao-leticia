'use client';

import { useState } from 'react';
import { ExternalLink, Copy, Check, KeyRound, Loader2, AlertCircle } from 'lucide-react';

interface TokenData {
  laravel_token: string;
  laravel_session: string | null;
  xsrf_token: string | null;
  expires_at: string;
}

export default function AutoLoginPage() {
  const [loading, setLoading] = useState(false);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchToken = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const resp = await fetch('/api/auto-login');
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Failed to fetch token');
      setTokenData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const snippet = tokenData ? `document.cookie = "laravel_token=${tokenData.laravel_token}; path=/; domain=.vexpenses.com; secure; samesite=lax";
document.cookie = "laravel_token=${tokenData.laravel_token}; path=/; secure; samesite=lax";${
    tokenData.laravel_session
      ? `\ndocument.cookie = "laravel_session=${tokenData.laravel_session}; path=/; domain=.vexpenses.com; secure; samesite=lax";\ndocument.cookie = "laravel_session=${tokenData.laravel_session}; path=/; secure; samesite=lax";`
      : ''
  }${
    tokenData.xsrf_token
      ? `\ndocument.cookie = "XSRF-TOKEN=${tokenData.xsrf_token}; path=/; domain=.vexpenses.com; secure; samesite=lax";\ndocument.cookie = "XSRF-TOKEN=${tokenData.xsrf_token}; path=/; secure; samesite=lax";`
      : ''
  }\nwindow.location.href = "https://app.vexpenses.com/admin/relatorio-acompanhamento-aprovacao";` : '';

  const copySnippet = () => {
    if (!snippet) return;
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const openVExpenses = () => {
    window.open('https://app.vexpenses.com/admin/relatorio-acompanhamento-aprovacao', '_blank');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <KeyRound className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Auto Login VExpenses</h1>
            <p className="text-sm text-gray-500">Acesso rápido ao painel do VExpenses</p>
          </div>
        </div>

        {!tokenData && !loading && (
          <button
            onClick={fetchToken}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Buscar token de acesso
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="ml-2 text-sm text-gray-600">Carregando...</span>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {tokenData && (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              Token encontrado! Expira em: {new Date(tokenData.expires_at).toLocaleString('pt-BR')}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="mb-2 text-sm font-medium text-gray-700">Passo a passo:</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600">
                <li>Clique em <strong>Copiar snippet</strong> abaixo</li>
                <li>Clique em <strong>Abrir VExpenses</strong> — uma nova aba abrirá</li>
                <li>Na nova aba (pode mostrar tela de login), pressione <strong>F12</strong> para abrir o console</li>
                <li>Cole o snippet no console (Ctrl+V) e pressione <strong>Enter</strong></li>
                <li>Você será redirecionado já logado no painel</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <button
                onClick={openVExpenses}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir VExpenses
              </button>
              <button
                onClick={copySnippet}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors ${
                  copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar snippet
                  </>
                )}
              </button>
            </div>

            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">Ver snippet</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{snippet}</pre>
            </details>

            <button
              onClick={fetchToken}
              className="w-full text-xs text-gray-400 hover:text-gray-600"
            >
              Atualizar token
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
