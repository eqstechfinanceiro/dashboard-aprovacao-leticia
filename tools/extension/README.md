# Aery — Extensão Chrome

Extrai automaticamente o cookie `laravel_token` (httpOnly) do `app.vexpenses.com` e envia para o portal Aery, eliminando a necessidade de copiar/colar o token manualmente.

## Instalação / Atualização

1. Baixe o `aery-extension.zip` pelo botão **"Extensão"** no header do portal
2. Extraia o ZIP em uma pasta (ex.: `C:\aery-extension`)
   - **Para atualizar:** extraia por cima da pasta anterior, substituindo os arquivos
3. Abra `chrome://extensions`
4. Ative **Modo do desenvolvedor** (canto superior direito)
5. **Primeira instalação:** clique em "Carregar sem compactação" e selecione a pasta extraída
   - **Atualização:** clique no ícone de recarregar (⟳) no card da extensão Aery

## Uso

1. **Faça login** no `app.vexpenses.com` normalmente (com MFA)
2. A extensão detecta e sincroniza o token automaticamente
3. Clique no ícone da extensão para ver o status da sincronização

## Configuração

- **URL do Dashboard**: `http://179.199.149.43:3000` (já vem pré-configurada)
- **Secret**: opcional, se você configurou `VEXPENSES_EXTENSION_SECRET` no `.env`

## Como funciona

1. Ao visitar `app.vexpenses.com`, lê os cookies `laravel_token`/`laravel_session`
2. Envia via POST para `/api/vexpenses/update-laravel-token`
3. O backend salva no banco (tabela `vexpenses_tokens`)
4. Sincroniza automaticamente a cada 30 minutos
5. Se o token expirar, o backend avisa e a extensão re-sincroniza na próxima visita ao VExpenses

## Desenvolvimento

- Ícones são gerados a partir de `public/aery-logo.png`: `node tools/extension/generate-icons.js`
- O ZIP de distribuição é gerado automaticamente no build (`tools/build-extension-zip.js` → `public/downloads/aery-extension.zip`)
