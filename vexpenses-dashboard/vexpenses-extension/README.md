# VExpenses Token Sync — Extensão Chrome

## O que faz

Extrai automaticamente o cookie `laravel_token` (httpOnly) do `app.vexpenses.com` e envia para o dashboard, eliminando a necessidade de copiar/colar o token manualmente.

## Como instalar

1. Abra `chrome://extensions` no Chrome
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `vexpenses-extension`
5. A extensão aparecerá na barra de ferramentas

## Como usar

1. **Faça login** no `app.vexpenses.com` normalmente (com MFA)
2. A extensão **detecta automaticamente** o login e sincroniza o token
3. O token é renovado a cada **30 minutos** automaticamente
4. Clique no ícone da extensão para ver o status e sincronizar manualmente

## Configuração

No popup da extensão:
- **URL do Dashboard**: URL onde o dashboard está rodando (padrão: `http://localhost:3000`)
- **Secret**: opcional, se você configurou `VEXPENSES_EXTENSION_SECRET` no `.env`

## Como funciona

1. A extensão usa a API `chrome.cookies` para ler cookies httpOnly
2. Envia o `laravel_token` e `laravel_session` via POST para `/api/vexpenses/update-laravel-token`
3. O backend salva no Neon (tabela `vexpenses_tokens`)
4. O pipeline e o approval-tracking leem o token do banco em vez da env var
5. Se o token expirar, o backend avisa e a extensão re-sincroniza na próxima visita ao VExpenses

## Produção

Para deployar em produção:
1. Mude a URL do dashboard no popup para a URL de produção
2. Configure `VEXPENSES_EXTENSION_SECRET` no `.env` e na extensão (opcional mas recomendado)
3. Empacote a extensão: `chrome://extensions` > **Empacotar extensão**
