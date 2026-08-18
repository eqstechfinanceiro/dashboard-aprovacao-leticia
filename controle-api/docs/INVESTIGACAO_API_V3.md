# Investigação API VExpenses — Endpoints /v3/pay/

## Contexto

Durante a investigação de como obter dados de **CARGA, TRANSFERÊNCIA, TARIFA e SALDO CARTÃO**
diretamente da API VExpenses (sem depender de exportação manual de planilhas), descobrimos
a existência de uma API interna `/v3/pay/` usada pelo frontend da plataforma.

---

## Como foi descoberto

A URL da página de movimentações do VExpenses:
```
https://amp.vexpenses.com/cartoes/movimentacoes?movementType=ALL&endDate=2026-06-15&startDate=2026-05-16&timezone=-3:00&accounts=COMPANY
```

Ao inspecionar o tráfego de rede via `performance.getEntriesByType('resource')` no console
do DevTools, foram identificadas as seguintes chamadas à API:

---

## Endpoints /v3/pay/ identificados

| Endpoint | Descrição |
|----------|-----------|
| `GET /v3/oauth/user` | Dados do usuário autenticado |
| `GET /v3/pay/company/authenticated` | Empresa autenticada |
| `GET /v3/pay/company/balance` | **Saldo total da empresa** |
| `GET /v3/pay/v2/app/company/allocated-balance?refresh=1` | **Saldo alocado da empresa** |
| `GET /v3/pay/v2/app/accounts/card/expiring-soon` | Cartões prestes a expirar |
| `GET /v3/pay/v2/app/accounts?sort_order=ASC&limit=100000&page=1` | **Todas as contas/cartões** |
| `GET /v3/pay/users/authenticated` | Usuário autenticado |
| `GET /v3/pay/users/{user_uuid}/accounts` | **Contas de um usuário específico** |
| `GET /v3/pay/statement/account-aggregations/{account_uuid}?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&limit=10000000&description=` | **Extrato de uma conta por período** |
| `GET /v3/pay/v2/app/card-groups/` | Grupos de cartões |
| `GET /web/outsourcing-permissions/list-by-user` | Permissões de terceirização |

### Endpoint mais relevante

```
GET /v3/pay/statement/account-aggregations/3fff20e4-8d9b-4f01-803f-8fef1740cb53
    ?end_date=2026-06-15
    &limit=10000000
    &start_date=2026-05-16
    &description=
```

Este endpoint retorna o extrato de movimentações de uma conta (cartão) por período —
provavelmente contendo CARGA, TRANSFERÊNCIA, TARIFA e SALDO.

O UUID `3fff20e4-8d9b-4f01-803f-8fef1740cb53` é o identificador da conta/cartão
obtido via `/v3/pay/v2/app/accounts`.

---

## Autenticação da API /v3/

A API `/v3/` usa autenticação **JWT (Bearer token)**, diferente do token simples da API `/v2/`.

### Token JWT capturado

Armazenado em `localStorage` sob a chave `@vex/authCookies` → campo `vexAt`.

**Payload decodificado:**
```json
{
  "aud": "39",
  "iat": 1781528450.99872,
  "exp": 1782133250.966438,
  "sub": "12187bab-1aed-4a50-9f14-534fb56d1d07",
  "scopes": [],
  "auth_users": [
    "d0e8d260-93d3-4ae7-a454-245ab737b8e2",
    "523e38e5-3d3f-4a35-957f-2edaca06f225"
  ],
  "email_logged": "andrey.reginaldo@eqsengenharia.com.br",
  "user_id": "12187bab-1aed-4a50-9f14-534fb56d1d07",
  "company_id": null,
  "mfa_method": "APP_AUTENTICADOR"
}
```

**Validade:** emitido em 15/06/2026, expira em 22/06/2026.

### Problema de autenticação

Ao testar com `Authorization: Bearer <token>` em `api.vexpenses.com/v3/pay/...`,
todos os endpoints retornam **401 Token inválido**.

**Hipótese:** a API `/v3/` pode exigir headers adicionais além do `Authorization`, como:
- `X-Company-UUID`
- `X-Auth-User`
- Cookie de sessão

Esses headers extras não foram capturados pois o acesso ao DevTools Network foi encerrado
antes de inspecionar os Request Headers de uma chamada `/v3/pay/`.

---

## Como obter os headers corretos (pendente)

Quando houver acesso ao VExpenses novamente:

1. Abrir DevTools → aba **Network**
2. Filtrar por **Fetch/XHR**
3. Navegar para `https://amp.vexpenses.com/cartoes/movimentacoes`
4. Clicar em qualquer chamada `api.vexpenses.com/v3/pay/...`
5. Copiar a seção **Request Headers** completa

Alternativamente, no console:
```javascript
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const url = args[0];
  const options = args[1] || {};
  if (url && url.toString().includes('vexpenses.com/v3')) {
    console.log('URL:', url);
    console.log('Headers:', JSON.stringify(options.headers, null, 2));
  }
  return originalFetch.apply(this, args);
};
```
Depois mudar algum filtro de data na página para disparar uma nova chamada.

---

## Contexto adicional — API /v2/ (pública)

| Item | Valor |
|------|-------|
| Base URL | `https://api.vexpenses.com` |
| Autenticação | `Authorization: <token>` (sem Bearer) |
| Token | `N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8` |

### Endpoints funcionais /v2/

| Endpoint | Dados retornados |
|----------|-----------------|
| `GET /v2/team-members` | Lista todos os colaboradores com CPF, email, user_id |
| `GET /v2/team-members/{id}` | Dados de um colaborador |
| `GET /v2/reports?search=user_id:{id}` | Reports (prestações de contas) do usuário |
| `GET /v2/reports/{id}?include=expenses` | Despesas de um report |

### Payment method IDs confirmados

| ID | Tipo |
|----|------|
| `627508` | Cartão VExpenses |
| `627721` | Saque VExpenses |
| `668240` | Pix VExpenses |
| `627401` | Cartão Corporativo Itaú |

### Endpoints /v2/ que retornam 405 (só OPTIONS)

Todos retornam: `"Supported methods: OPTIONS"` — existem mas não são acessíveis via GET/POST:
`/v2/wallets`, `/v2/cards`, `/v2/balances`, `/v2/accounts`, `/v2/transactions`,
`/v2/statements`, `/v2/extract`, `/v2/financial`, `/v2/card-loads`, `/v2/deposits`,
`/v2/withdrawals`, `/v2/transfers`, `/v2/payments`, `/v2/advances`

---

## Status atual dos campos financeiros

| Campo | Disponível via API? | Observação |
|-------|---------------------|------------|
| PRESTAÇÃO DE CONTAS | **Sim — /v2/reports** | Soma de expenses com payment_method_id=627508 |
| CARGA | **Pendente — /v3/pay/statement** | Depende de autenticar na /v3/ |
| TRANSFERÊNCIA | **Pendente — /v3/pay/statement** | Depende de autenticar na /v3/ |
| TARIFA | **Pendente — /v3/pay/statement** | Depende de autenticar na /v3/ |
| SALDO CARTÃO | **Pendente — /v3/pay/statement** | Depende de autenticar na /v3/ |
| 1ª QZ | **Não** | Input manual do gestor |
| Adiantamento | **Não** | Input manual do gestor |

---

## Próximos passos

1. **Capturar headers exatos** da chamada `/v3/pay/`
2. **Testar autenticação** com os headers corretos
3. **Mapear estrutura de resposta** do endpoint `account-aggregations`
4. **Identificar tipos de movimentação** (CARGA, TRANSFERÊNCIA, TARIFA) no extrato
5. **Cruzar account_uuid** com user_id da /v2/ para buscar por colaborador
