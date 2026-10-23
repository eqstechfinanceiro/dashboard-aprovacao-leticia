# VExpenses Pay API — Auto-Carga de Cartões (contrato capturado)

> Investigado end-to-end via GUI (amp.vexpenses.com) com captura de rede + replay
> API-only com sucesso. Data: 23/10/2026. Todas as chamadas provadas com valores
> reais e revertidas — estado restaurado exatamente ao original.

## Veredicto

**Auto-carga 100% viável via API.** Nenhuma chamada depende de sessão de browser,
header XSRF ou qualquer coisa além de **um único cookie `laravel_token`**
(o mesmo que a extensão já sincroniza pra `vexpenses_tokens` no banco).
Write provado com `Cookie: laravel_token=<token>` sozinho — `laravel_session` e
`XSRF-TOKEN` **não são necessários** server-side.

## Modelo de dinheiro

```
Pool EQS (empresa)  ──deposit──▶  Grupo de cartões (centro de custo)  ──CREDIT──▶  Cartão do funcionário
     ▲                    │                                              │
     └────withdrawal──────┘◀─────────────DEBIT───────────────────────────┘
```

- Cada **grupo** tem `id` (uuid do card-group) e `balance_id` (conta de saldo).
- Cada **cartão** tem `account.id` e `balances[0].id` (conta de saldo do cartão).
- As operações de dinheiro sempre referenciam o **`balance_id`/`balances[].id`**,
  nunca o uuid do grupo nem o número do cartão.

## Auth

```
GET/POST https://api.vexpenses.com/v3/pay/**
Cookie: laravel_token=<valor>          # suficiente sozinho
Accept: application/json
Content-Type: application/json          # em POSTs
```

Token vem da tabela `vexpenses_tokens` (company `eqs`), sincronizado pela
extensão Aery. Verificar `expires_at` — o worker precisa de token fresco.

## Endpoints — leitura

| Uso | Chamada | Resposta |
|---|---|---|
| Saldo do pool EQS | `GET /v3/pay/company/balance` | `{amount: 2977.35}` |
| Listar grupos | `GET /v3/pay/v2/app/card-groups?page=1&limit=10&ordenation_type=ASC` | `{objects:[{id,name,balance_id,account_aggregation_id}], total:24}` |
| Detalhe do grupo | `GET /v3/pay/v2/app/card-groups/{uuid}` | `{id,name,balance_id}` |
| Cartões do grupo | `GET /v3/pay/v2/app/accounts?card_group_id={uuid}&page=1&limit=10&sort_order=ASC` | `{objects:[{individual:{user_id,user_name,account:{id,card_number,card_status,balances:[{id}]}}}]}` |
| Saldo de uma conta | `GET /v3/pay/accounts/balances/{balance_id}/amount` | `{amount}` |
| Soma nos cartões do grupo | `GET /v3/pay/v2/app/company/allocated-balance?card_group_id={uuid}&refresh=1` | `{amount}` (distributed on cards) |
| Saldo livre de vários grupos | `POST /v3/pay/v2/app/company/balance/multiple` body `{card_group_ids:[...]}` | `[{card_group_id,amount}]` |

## Endpoints — escrita (todas provadas, "Approved")

### Pool → Grupo (depositar no centro de custo)

```
POST /v3/pay/accounts/balances/deposit
{"balance_account_id":"<group.balance_id>","amount":1,"description":"motivo livre"}
→ {"success":true,"data":{"transaction_id":"D7F63DE…","response_code":0,"response_code_message":"Approved"}}
```

### Grupo → Pool (devolver para a empresa)

```
POST /v3/pay/accounts/balances/withdrawal
{"balance_account_id":"<group.balance_id>","amount":0.5,"description":"motivo livre"}
→ {"success":true,"data":{"transaction_id":"BF752D…","response_code":0,"response_code_message":"Approved"}}
```

### Grupo → Cartão / Cartão → Grupo (carga e estorno — EM MASSA)

```
POST /v3/pay/company/transfers
[{"balance_account_id":"<card.balances[0].id>","amount":0.5,"type":"CREDIT"},
 {"balance_account_id":"<outro card>","amount":0.25,"type":"DEBIT"}]
→ {"success":true,"data":{
    "success":[{"balance_account_id":"…","transaction_id":"3E98580…",
                "user_name":"Ronaldo de carvalho","type":"CREDIT","amount":0.5,
                "response_code":0,"response_code_message":"Approved"}],
    "failure":[]}}
```

- **Array** = vários cartões numa chamada só (é o endpoint do "Carregar cartões
  em massa" da GUI). `CREDIT` = grupo→cartão; `DEBIT` = cartão→grupo.
- Resposta traz `success[]`/`failure[]` **por item** — dá pra reportar falhas
  individuais (saldo insuficiente no grupo, cartão bloqueado, etc.).
- `amount` é sempre positivo; a direção vem do `type`.

## Comportamento operacional observado

- **Rate-limit por cartão**: duas operações no mesmo cartão com poucos segundos
  de intervalo → HTTP 200 com `{"success":false,"errors":[{"code":147002002,
  "message":"Excesso de tentativas, tente novamente mais tarde"}]}`.
  Retry após ~30–60s aprova. **A automação precisa de backoff/retry por item
  e idealmente de janela entre movimentações no mesmo cartão.**
- **Saldos são cacheados por alguns segundos** em leituras
  (`/company/balance` demorou ~8s pra refletir o último withdrawal).
- `description` (deposit/withdrawal) é texto livre — usar pra trilha
  ("carga qz 2ª quinzena out/2026 — ref. planilha X").
- Na GUI a remoção no cartão é digitada como valor **negativo** no campo
  Movimentação → vira `type:"DEBIT"` no payload.
- Existe feature nativa **"Alocação Inteligente"**: após aprovação de relatório
  com forma de pagamento "Cartão VExpenses"/"Saque", o valor volta
  automaticamente ao cartão — ativada pelo suporte VExpenses, sem custo.
  Complementa (não substitui) a carga quinzenal programada.

## Mapa capturado (EQS — 23/10/2026)

- Pool EQS: R$ 2.977,35 — `GET /company/balance`
- 24 grupos de cartões (3 páginas). FINANCEIRO:
  `id=986fd1bb-7c94-40b9-ba06-ad0efcb9ab21`,
  `balance_id=d4bc9abb-a0c4-4d8a-b238-c70f8ab92c83`
- Cartões FINANCEIRO:
  - LETICIA …2341 — user `421ac7ba-c909-4832-9edb-7defefc904d9`,
    balance `6af5dfe6-2b91-43a1-aa8a-d48708a5217c`
  - Ronaldo …2405 — user `e2866e6b-35b8-4db1-ba47-ad48381c923d`,
    balance `a0aef983-8c61-4c42-a722-7e4e175ae43f`

## Prova executada (tudo revertido)

1. deposit R$1,00 pool→FINANCEIRO — Approved
2. transfers CREDIT R$0,50 → Ronaldo (GUI) — Approved
3. transfers DEBIT R$0,25 ← Ronaldo (GUI) — Approved
4. withdrawal R$0,50 FINANCEIRO→pool — Approved
5. transfers CREDIT+DEBIT R$0,01 via fetch puro (sem browser) — Approved
6. transfers CREDIT só com `laravel_token` — Approved
7. Limpeza: DEBIT R$0,25 + withdrawal R$0,50 → grupo 0,00, Ronaldo R$114,35,
   pool R$2.977,35 — **estado original restaurado**
