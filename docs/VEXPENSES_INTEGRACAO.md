# Integração VExpenses — documento mestre

> Consolidado de tudo que a aplicação faz com a VExpenses: autenticação (API key
> + `laravel_token` do banco), sync de dados, extrato/histórico de cartão,
> aprovações e movimentação de dinheiro real (Pay API / auto-carga).
> Atualizado em **23/10/2026**, refletindo o código em produção na VPS
> (`179.199.149.43`, PM2 `dashboard-financeiro` + `sync-worker`).
>
> Docs anteriores mais específicos: `VEXPENSES_API_DOCUMENTATION.md` (API v2,
> payloads), `VEXPENSES_PAY_API_AUTOCARGA.md` (contrato Pay capturado por rede),
> `ESPECIFICACAO_AUTOCARGA_QUINZENA.md` (spec da auto-carga).

---

## 1. Arquitetura geral

```
┌──────────────────────────────────────────────────────────────────┐
│  VExpenses                                                       │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐  │
│  │ API oficial REST v2      │   │ API interna (sessão web)      │  │
│  │ api.vexpenses.com/v2/*   │   │ api.vexpenses.com/v3/pay/*    │  │
│  │ auth: Authorization:KEY  │   │ api.vexpenses.com/web/*       │  │
│  │                          │   │ app.vexpenses.com (HTML/Excel)│  │
│  │                          │   │ auth: Cookie laravel_token    │  │
│  └───────────┬─────────────┘   └──────────────┬───────────────┘  │
└──────────────┼────────────────────────────────┼──────────────────┘
               │                                │
┌──────────────▼────────────────────────────────▼──────────────────┐
│  VPS 179.199.149.43                                               │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐  │
│  │ dashboard-financeiro     │   │ sync-worker (PM2, loop)       │  │
│  │ Next.js :3000            │   │ HOT 5min / WARM 45min /       │  │
│  │ rotas /api/* (on-demand) │   │ COLD 24h / autopilot 1x dia   │  │
│  └───────────┬─────────────┘   └──────────────┬───────────────┘  │
│              └───────────────► Neon Postgres ◄─┘                  │
│                                 (espelho + cache + auditoria)     │
└──────────────────────────────────────────────────────────────────┘
               ▲
               │ POST /api/vexpenses/update-laravel-token (secret)
┌──────────────┴───────────────┐
│ Extensão Chrome "Aery"        │  lê o cookie httpOnly laravel_token
│ na máquina de um operador     │  do browser logado em app.vexpenses.com
└──────────────────────────────┘
```

**Duas credenciais diferentes, para duas APIs diferentes:**

| API | Base | Autenticação | Origem da credencial |
|---|---|---|---|
| **v2 oficial** | `api.vexpenses.com/v2` | header `Authorization: <VEXPENSES_API_KEY>` | env `VEXPENSES_API_KEY` — chave estática gerada no portal VExpenses |
| **v3/web/Pay** | `api.vexpenses.com/v3`, `/web`, `app.vexpenses.com` | header `Cookie: laravel_token=…` | **banco** — tabela `vexpenses_tokens`, alimentada pela extensão Chrome |

A API v2 é a API pública documentada — cobre cadastro, relatórios e despesas
(leitura) e aprovação de relatórios (escrita). Tudo que a v2 **não** expõe
(saldos, extrato do cartão, etapa de aprovação em andamento, movimentação de
dinheiro) sai pela API interna que o próprio front `app.vexpenses.com` usa —
autenticada pela sessão Laravel de um usuário logado.

---

## 2. Autenticação

### 2.1 API v2 — `VEXPENSES_API_KEY`

- Header: `Authorization: <key>` + `Accept: application/json` (`lib/sync/client.ts` → `v2Headers()`; `lib/api/vexpenses-client.ts` → `getApiHeaders()`).
- Não expira, não rotaciona. Se ausente/inválida, a API responde 401/403.
- A mesma key também é enviada como `Authorization` em chamadas `/v2/reports/{id}/approve` (escrita funciona com a key sozinha — a sessão web não é necessária pra aprovar).

### 2.2 `laravel_token` — sessão web vinda do banco

Ciclo de vida completo:

```
Browser do operador (logado em app.vexpenses.com, com MFA)
  └─► Extensão Chrome "Aery" lê os cookies httpOnly
        laravel_token / laravel_session / XSRF-TOKEN  (a cada ~30min e a cada visita)
  └─► POST https://portal/api/vexpenses/update-laravel-token
        { laravel_token, laravel_session?, xsrf_token?, secret, source_label, company?, expires_at? }
        auth: body.secret === process.env.VEXPENSES_EXTENSION_SECRET (fail-closed)
        → UPSERT em vexpenses_tokens (por source_label+company, ou por token_id)
  └─► Consumidores server-side leem o token mais recente do banco:
        lib/api/laravel-token.ts        → getLaravelCookieString() (primeiro token)
        lib/api/vexpenses-token-validator.ts → getNextValidCookie() (rotação LRU)
```

**Tabela `vexpenses_tokens`** (Neon):

```sql
id SERIAL PK, laravel_token TEXT, laravel_session TEXT, xsrf_token TEXT,
source_label TEXT,                  -- ex.: 'chrome:leticia', identifica a origem
company TEXT DEFAULT 'eqs',         -- multi-empresa futuro; consumo filtra 'eqs'
updated_at TIMESTAMPTZ, expires_at TIMESTAMPTZ
```

- `expires_at` vem da extensão (`expires_at` epoch) ou default **+12h**.
- `GET /api/vexpenses/update-laravel-token` devolve inventário (sem segredos):
  `has_token`, `active_count`, `is_expired` por linha.

**Cookie montado** (`buildCookieString`):
`laravel_token=…; laravel_session=…; XSRF-TOKEN=…; language=pt-BR`
— na prática **`laravel_token` sozinho já autentica** leitura e escrita
(provado no contrato Pay); session/XSRF são enviados por completude.

### 2.3 Rotação, cooldown e validação de tokens

`lib/api/vexpenses-token-validator.ts` (usado por `vexpensesFetchWithRotation`):

- **Rotação LRU** entre os tokens válidos (`getNextValidCookie`) — distribui
  carga entre as sessões sincronizadas.
- **Cooldown 60s** por token ao receber 401/403/429 (`markTokenCooldownById`).
- **Validação periódica** (`validateAllTokens`, intervalo 5min): `GET
  app.vexpenses.com/inicio-colaborador` com `redirect:'manual'` —
  redirect para `/login` ⇒ sessão morta; resposta 200 ⇒ token vivo e os
  `Set-Cookie` da resposta **rotacionam as credenciais no banco**
  (expires_at renovado +8h). ⚠️ `validateAllTokens` hoje **não tem chamador**
  — a validação acontece implicitamente pelos erros 401/403 nas chamadas.

`lib/api/laravel-token.ts` é a versão simples (sempre o primeiro token ativo
de `company='eqs'`, cache 3min em memória, `clearLaravelTokenCache()` quando
o banco é atualizado). É o que `lib/vexpay/client.ts` (dinheiro) usa —
movimentação financeira não rotaciona entre sessões.

### 2.4 Keepalive

`GET /api/vexpenses/keepalive?secret=$CRON_SECRET` — re-bate cada token do
banco contra `/inicio-colaborador` e grava os cookies renovados
(+8h de `expires_at`), depois `clearLaravelTokenCache()`.

> ⚠️ **Bug conhecido**: o sync-worker chama `GET /api/vexpenses/keepalive`
> **sem** `?secret` (`worker/sync-worker.ts` WARM) → a rota responde **401**
> e `meta.keepalive=401` a cada ciclo. O keepalive efetivo é feito pela
> **extensão re-sincronizando** a cada ~30min enquanto o operador usa o
> portal. Fix trivial: passar `?secret=$CRON_SECRET` na chamada do worker.

### 2.5 Resiliência nas chamadas

- `lib/api/vexpenses-rate-limiter.ts` — fila global **5 req/s**, máx 500
  itens; `pause(60s)` em 429; usado por `rateLimitedFetch` e
  `vexpensesFetchWithRotation` (rotação de cookie + retry com backoff).
- `lib/sync/client.ts` → `fetchWithRetry` — retry em 429/5xx, backoff
  exponencial até 60s, máx 3 retries.
- `lib/vexpay/client.ts` → `vexFetch` — 401/403 ⇒ `VexpayAuthError`
  (403 ganha 1 retry de 2s antes — burst transitório), 429 ⇒ 1 retry de 3s.
- 403 transitório por **burst de leitura**: ~30+ requests em sequência ⇒ a
  API derruba a sessão ~30–60s e volta sozinha. Card-map usa concorrência
  ≤4 e ~300ms entre lotes por causa disso.

---

## 3. Mapa de endpoints VExpenses usados

### 3.1 API v2 oficial (`Authorization: API_KEY`)

| Endpoint | Uso na aplicação |
|---|---|
| `GET /v2/reports?include=user&per_page=10000` | Discovery — listing completo de relatórios (sync HOT). `lib/sync/reports.ts` |
| `GET /v2/reports/{id}?include=expenses[.user]` | Detalhe + despesas do relatório (sync de despesas, approve, auto-approve) |
| `GET /v2/reports/status/{status}?include=user` | Rota `/api/vexpenses/reports-enviado` (pendências ENVIADO) |
| `POST /v2/reports/{id}/approve` | Aprovação — body `{approver: <user_id>, comment, expenses: {expId: true}}`. Uma chamada aprova **uma etapa** |
| `PUT /v2/reports/{id}/pay` | Marcar relatório como pago (disponível; a quinzena usa freeze próprio) |
| `GET /v2/team-members?paginate=true&page&per_page` | Cadastro de colaboradores (sync WARM → `quinzena_cadastro`) |
| `GET /v2/team-members/{id}` / `/email/{email}` / `/parameters` | CRUD de membro (lib/api/api.ts) |
| `POST/PUT/DELETE /v2/team-members*` | Edição de cadastro (attach-cost-center / attach-projects) — lib/api/api.ts |
| `GET /v2/approval-flows?include=steps` | Fluxos de aprovação + aprovadores por etapa (`stepApprovers`, `entrance_value`) |
| `GET /v2/costs-centers`, `/v2/projects`, `/v2/expenses-type`, `/v2/currencies` | Dimensionais (centro de custo, projetos, tipos de despesa, moedas) |
| `POST /v2/advances` | Adiantamentos (lib/api/api.ts) |
| `GET /v2/expenses?search=date:a,b&searchFields=date:between` | Listagem de despesas — **exige** `search`/`searchFields` |

Status de relatório observados: `ENVIADO`, `APROVADO`, `REPROVADO`, `PAGO`,
`REABERTO` (+ `DELETADO`, status interno nosso quando a API devolve 404).

Erros relevantes:
- `422 {"data":{"errors":{"approver":["…not an approver in this step…"]}}}` —
  o aprovador não pertence à etapa atual. Tratado com fallback/retry.
- `404` no detalhe ⇒ relatório deletado lá → `markReportDeleted` → `DELETADO`.

### 3.2 API interna web (`Cookie: laravel_token`)

| Endpoint | Uso |
|---|---|
| `GET app.vexpenses.com/inicio-colaborador` | Validação/keepalive de sessão (redirect→/login = expirado) |
| `GET api.vexpenses.com/web/approvals/{reportId}` | **Checagem live** "a sessão pode agir neste relatório agora?" — `success:false` (erro 110001001) = etapa de outro aprovador. Usado pelo auto-approve |
| `GET+POST app.vexpenses.com/admin/relatorio-acompanhamento-aprovacao[/excel]` | Excel admin de acompanhamento — **única fonte da etapa atual absoluta** de cada relatório ENVIADO (a v2 não expõe). GET página (pega `_token` CSRF) → POST form `status[]=ENVIADO&startDate&endDate` → XLSX parseado. `lib/api/approval-excel.ts` |
| `GET /v3/pay/statement/excel-all?start_date&end_date` | Extrato global de cartões → devolve URL S3 pré-assinada de XLSX (máx ~15 dias por chamada). `lib/sync/extrato.ts` |

### 3.3 VExpenses Pay — movimentação de dinheiro (`Cookie: laravel_token`)

Contrato capturado por rede em `docs/VEXPENSES_PAY_API_AUTOCARGA.md` e
provado end-to-end com valores reais (23/10/2026). Envelope padrão
`{success, data|errors}`; listas paginadas em `data.objects[]` + `total`.

**Leitura:**

| Endpoint | Resposta |
|---|---|
| `GET /v3/pay/company/balance` | Saldo do **pool EQS** `{data:{amount}}` |
| `GET /v3/pay/v2/app/card-groups?page&limit&ordenation_type=ASC` | Grupos `{id, name, balance_id}` (24 grupos) |
| `GET /v3/pay/v2/app/accounts?card_group_id={uuid}&page&limit` | Cartões do grupo `{individual:{user_id(uuid), user_name, account:{id,status,card_number,card_status,balances:[{id}]}}}`. **Sem `card_group_id` só retorna ~8 contas do gestor — discovery é sempre por grupo** |
| `GET /v3/pay/users/{uuid}` | `{name, cpf, email}` — **ponte autoritativa uuid→CPF** |
| `GET /v3/pay/accounts/balances/{balance_id}/amount` | Saldo de uma conta |
| `POST /v3/pay/v2/app/company/balance/multiple` `{card_group_ids:[…]}` | Saldo **livre** por grupo (não o já distribuído nos cartões) |
| `GET /v3/pay/v2/app/company/allocated-balance?card_group_id={uuid}` | Soma já alocada nos cartões do grupo |

**Escrita (todas provadas "Approved"):**

| Endpoint | Body | Efeito |
|---|---|---|
| `POST /v3/pay/accounts/balances/deposit` | `{balance_account_id:<grupo.balance_id>, amount, description}` | pool → grupo |
| `POST /v3/pay/accounts/balances/withdrawal` | `{balance_account_id:<grupo.balance_id>, amount, description}` | grupo → pool |
| `POST /v3/pay/company/transfers` | `[{balance_account_id:<cartão.balances[0].id>, amount, type:'CREDIT'|'DEBIT'}]` (array, vários cartões numa chamada) | grupo → cartão (CREDIT) / cartão → grupo (DEBIT) |

`transfers` retorna resultado **por item**:
`data.success[]` (`transaction_id`, `user_name`, `response_code:0 "Approved"`)
e `data.failure[]` (`code`, `message`). Falha no envelope inteiro
(`{success:false, errors:[…]}`) = erro da chamada (ex.: rate-limit global).

**Códigos de erro observados:**

| Código | Significado | Tratamento |
|---|---|---|
| `147002002` | "Excesso de tentativas" — mesmo cartão movimentado < ~60s atrás | retry 1× após ~60–65s |
| `152002002` | Saldo insuficiente na conta de origem (withdrawal/deposit) | abort + mensagem |
| `110001001` | (web/approvals) sessão não pode agir neste relatório agora | skip — etapa de outro aprovador |

**Comportamento operacional provado:**
- Saldos lidos são **cacheados alguns segundos** na VExpenses (~8s) — re-ler com folga.
- `deposit` usa **delta** (`necessário − saldo livre do grupo`) — se o grupo já tem saldo, deposita 0 (provado: REGIONAL MG com R$0,20 livre → depósito R$0,00).
- **Cartão BLOCKED aceita CREDIT** — o bloqueio é de gasto, não de recebimento. O dinheiro fica preso no cartão até desbloqueio (achado do E2E — alerta correto ao usuário).
- Na GUI, remoção do cartão = valor negativo no campo → vira `type:"DEBIT"`.

**Modelo de dinheiro:**

```
Pool EQS ──deposit──▶ Grupo (centro de custo, balance_id) ──CREDIT──▶ Cartão do colaborador (balances[0].id)
   ▲                     │                                                  │
   └─────withdrawal──────┘◀──────────────────DEBIT─────────────────────────┘
```

---

## 4. Sync worker — pipeline de dados

`worker/sync-worker.ts` (PM2 `sync-worker`, processo dedicado fora do Next).
Ciclo serializado por **advisory lock** Postgres (`pg_try_advisory_lock
8675309`) — nunca dois ciclos concorrentes. Durabilidade em `sync_runs` +
`sync_run_errors`; runs órfãs de restart são marcadas `error` no boot.

### Tiers

| Tier | Intervalo | O que faz |
|---|---|---|
| **HOT** | 5 min | `runGlobalSync(quick)`: listing v2 completo → upsert `prestacao_reports` + reconciliação de despesas por relatório mutável (`prestacao_expenses`); `runAutoAudit` (OCR/auditoria bot); `runAutoApprove` (se habilitado) |
| **WARM** | 45 min | keepalive (⚠️ ver §2.4 — retorna 401 hoje), `downloadExtrato(incremental, overlap 2d)`, `refreshCadastro`, `generateInactiveAlerts`, notificações (digest aprovações, prestação parada, falhas de sync), syncs TOTVS/fiscal (impacto SE2, boletos, conferência SF1×XML, serviço-docs, borderô, canceladas) |
| **COLD** | 24 h | `downloadExtrato(incremental, overlap 30d)` — pega transações de cartão que liquidam tarde |
| **autopilot** | 1×/dia nos dias 10/24 (D-1 → relatório) e 11/25 (D → `quinzena-fechar`, opcional `?autocarga=1`) | Fechamento automático da quinzena |

### 4.1 Relatórios e despesas (v2)

- `syncReportsFromApi` — `GET /v2/reports?include=user&per_page=10000`,
  upsert em `prestacao_reports` (guarda `raw_data` JSON completo),
  diff de status → `report_status_history` (toda transição registrada:
  REPROVADO→ENVIADO em reenvio etc.), marcação `DELETADO` quando o relatório
  some da listing (guard: só confia se listing > 1000).
- `syncReportExpenses` — por relatório: detalhe `?include=expenses.user` →
  reconcilia `prestacao_expenses` (insert/update por valor/comprovante/data,
  delete dos que sumiram). 404 → `DELETADO`. Despesa alterada/removida limpa
  sua linha em `expense_audit_results` (reauditar).
- `quick` mode só reprocessa relatórios mutáveis (não-finais ou <45 dias).

**Tabelas alimentadas:** `prestacao_reports`, `prestacao_expenses`,
`report_status_history`, `somase_snapshots`, `prestacao_expense_snapshots`,
`expense_audit_results`, `auto_approve_log`, `report_approvals`.

### 4.2 Extrato de cartão / histórico (`extrato_movimentacao`)

`lib/sync/extrato.ts` — **o extrato é o histórico de cartão**. Não é API v2:
é o download do extrato Excel global da conta Pay.

- `GET /v3/pay/statement/excel-all?start_date&end_date` → `{data:{url}}` S3
  pré-assinada → download XLSX → parse. Limite ~15 dias por chamada →
  split em chunks de 15d, **3 tentativas por chunk** com backoff 5s/10s.
- **All-or-nothing**: se qualquer chunk falha após retries, a sync aborta
  inteira e **nenhum dado é tocado** — o dataset anterior permanece.
- Janela: incremental = `MAX(data) − overlap` (2d WARM / 30d COLD);
  tabela vazia → `ano-1-01-01` até hoje.
- Persistência: upsert por `(data, hora, codigo_transacao, is_snapshot)`
  com `ON CONFLICT DO UPDATE` (dedup por chave dentro do INSERT — a última
  ocorrência vence); depois `DELETE` das linhas do range que **não** vieram
  no novo extrato (insert-then-delete — nunca fica sem dados).
- Colunas: `data, hora, codigo_transacao, numero_cartao, grupo, usuario,
  tipo, descricao, valor, status, id_despesa, id_relatorio, tipo_despesa,
  centro_custo, projeto, percentual_projeto, is_snapshot`.

**`is_snapshot`**: linhas sem `tipo`/com `hora='-'` são o **saldo do cartão
naquele dia** (snapshot diário que a VExpenses embute no extrato), não
transações. São cumulativas e nunca deletadas. O cálculo quinzenal usa:

- `saldo_cartao_controle`: último `is_snapshot` até dia 01 do mês;
- `saldo_cartao_carga`: último `is_snapshot` até o fechamento (11 ou 25) —
  o "saldo real" do cartão na data de carga.

**Tipos de linha** (`tipo`): `Transferência` (carga/descarga — valor>0 =
carga no cartão; valor<0 = transferência pra fora), `Taxa`, `Estorno de
taxa`, e transferências cujo `descricao` bate `estorno.*taxa|CHARGEBACK_`
entram como tarifa no cálculo. O nome do titular vem em `usuario`
(string livre — resolvido pra CPF por `resolveCpfByName`: match exato
normalizado → aliases manuais → fuzzy bigram ≥0.88 → prefixo único ≥10
chars).

### 4.3 Cadastro (`refreshCadastro` — WARM)

`/v2/team-members` paginado → merge em `quinzena_cadastro` (insere membros
novos com CPF; `active:false` ⇒ `INATIVO`, nunca sobrescreve
colaborador/regional/gestor da planilha) + merge da **situação do RH**
(`eqs_funcionarios` — RH não-ATIVO vence, pois a VExpenses mantém cartão
ativo após demissão) + seed da `quinzena_controle_snapshot` do período
corrente (`import_source='api'`).

### 4.4 Somase snapshots (`lib/sync/somase.ts`)

Snapshot por quinzena da soma de despesas prestadas (relatórios
APROVADO+ENVIADO até o cutoff, excluindo pagamento por cartão
`payment_method_id=627401` e relatórios FATURA/CARTAO). Sempre faz o
snapshot da quinzena **anterior** também se faltar — o delta
(atual−anterior) fica temporalmente consistente.

### 4.5 Aprovações — o que sabemos sobre o fluxo

- A v2 **não expõe** a etapa atual de um relatório em andamento
  (`approval_stage_id` é opaco; o history feed só emite `approved` no
  passo **final**). A etapa é derivada de duas fontes:
  1. `approval_stage_id` transições persistidas (incremental por report);
  2. **Excel admin** `/admin/relatorio-acompanhamento-aprovacao/excel` —
     a fonte absoluta (`waitingStep`), cacheada 10min
     (`vexpenses-data:excel-step-map`).
- `waitingStep` derivado do Excel: última linha `Aprovado`+step N ⇒
  esperando N+1; `Enviado` ⇒ 1; `Reaberto` ⇒ 0 (precisa reenvio).
- `GET /web/approvals/{id}` = checagem **live** se a sessão pode aprovar
  agora (eliminando probes que davam 422).

**Aprovação manual** (`POST /api/aprovacao-dinamica/approve`):
resolve quem aprova — se o usuário logado é aprovador da etapa atual do
fluxo daquele relatório, sai **com a identidade dele**; senão cai no
aprovador default (**Letícia — user_id 891904**, etapa 1). 422
"not an approver in this step" no id próprio ⇒ retry 1× com o default.
Grava `report_approvals`, invalida caches, `audit_log`.
A **rejeição** (`/reject`) usa o **mesmo endpoint** `/v2/reports/{id}/approve`
(comentário de reprovação + payload de despesas vindo do cliente).

**Auto-approve** (`runAutoApprove`, WARM/HOT, flag `auto_approve_enabled`):
relatórios ENVIADO, não-FATURA/CARTAO, sem despesa em cartão (627401) e
**todas** as despesas `APROVADO_BOT` em `expense_audit_results` + etapa
atual = 1 (Letícia) ⇒ aprova como 891904 com comentário
*"Despesa aprovada automaticamente pelo Aery Bot"*. Se o relatório avançou
pra etapa de outro aprovador ⇒ `skipped_step` (nunca tenta outro
aprovador). Uma aprovação = uma etapa; o status real pós-aprovação é
re-lido e persistido.

### 4.6 Alertas e notificações

- `generateInactiveAlerts` (WARM): funcionários INATIVO/etc. com
  `saldo_prestacao`/`saldo_cartao`/`saldo_reembolsar` > 0 no snapshot →
  notificação + tabela própria.
- `notifyAdmins`/`upsertNotification`: sininho in-app na tabela
  `notifications` com `dedup_key` (re-alert se valor subiu >10%).
- `generateSyncFailureNotifications`, `generateApprovalDigest`,
  `generatePrestacaoStaleNotifications` no WARM.

---

## 5. Auto-carga quinzenal (dinheiro real)

Feature completa (spec `ESPECIFICACAO_AUTOCARGA_QUINZENA.md`, deploy out/2026).
Após o financeiro **congelar** a quinzena, a carga dos cartões é executada
pela API Pay — com revisão humana, bloqueios inteligentes e estorno.

### 5.1 Fonte da verdade

- **Valores**: `quinzena_frozen_snapshots` (snapshot congelado — única
  fonte auditável; `carga_final` já com overrides manuais aplicados).
- **Destino**: `quinzena_card_map` — índice `user_uuid → cpf/balance_account_id`
  construído por discovery obrigatório por grupo
  (`listCardGroups` → `listGroupAccounts` → `getPayUser(uuid)` só pra
  uuid novo — CPF é estável, cacheado). Prune de cartões mortos só se
  ≥50 vistos (proteção contra API paginando vazio).

### 5.2 Classificação do plano (`buildCargaPlan`, ordem de precedência)

Candidatos = linhas congeladas com `carga_final > 0` e ainda não
carregadas no período:

1. `valor_invalido` (≤0/NaN) — não forceable
2. `sem_cartao` (sem match ou `status_cartao` "não vinculado/pendente/reprovado") — não forceable
3. `funcionario_inativo` (`situacao ≠ ATIVO` — RH/demissão) — forceable
4. `cadastro_pendente` — forceable
5. `cartao_inativo` (`card_status`/`account_status` ≠ ACTIVE, pt-BR e inglês) — forceable
6. `cpf_nao_encontrado` (match por nome, CPF divergente/ausente) — forceable
7. `nome_ambiguo` (>1 cartão ativo mesmo CPF/nome) — não forceable
8. ok → `loads[]`

Match autoritativo por **CPF** (uuid→cpf do `/v3/pay/users/{uuid}`);
nome normalizado é só fallback flaggeado. Nunca se transfere dinheiro por
"nome parecido".

### 5.3 Endpoints internos (`/api/quinzena-autocarga/*`)

Gate comum: header `x-user-email` ∈ allowlist
(`italo.medrado@`, `leticia@`, `andrey.reginaldo@eqsengenharia.com.br` —
`lib/autocarga/allowlist.ts`, 403 fora). `status`/`reconcile` leem o header
mas `status` não 403 (devolve `can_autocarga` pra UI esconder o botão).

| Rota | Verbo | Função |
|---|---|---|
| `preflight` | GET | Plano completo sem mover dinheiro: pool, total, grupos (needed/available/deposit), loads, blocked (motivo+forceable), already_loaded, stats do card_map |
| `execute` | POST | Executa: re-monta o plano no servidor (nunca confia no cliente) → aborta se pool < total → run `running` → por grupo: `deposit(delta)` + `transfers` → retry único de itens rate-limited após 60s → persiste itens + fecha run + audit + `notifyAdmins` |
| `force` | POST | "Carregar mesmo assim" num item `forceable`: deposita delta no grupo do cartão + `transfers` 1 item → `forced_ok`/`forced_failed` + `forced_by` + audit |
| `reverse` | POST | Estorno: `transfers DEBIT` cartão→grupo (+65s retry) → `withdrawal` grupo→pool (best-effort — se falhar, fica livre no grupo) → item `status='estornado'` + `estornado_by/at` + txs + audit. Aceita `{cpf}` ou `{all:true}` |
| `status` | GET | `can_autocarga`, última run, último estado por CPF (badges da UI). Marca run `running` >20min como `failed` (órfã de restart) |
| `reconcile` | GET | Divergência planilha×executado: `nao_carregado`, `valor_divergente`, `estornado`, `falhou`, `bloqueado`, `fora_da_planilha` + summary (snapshot_total vs loaded_total) |

### 5.4 Idempotência e guards

- **Índice único parcial** `uq_carga_loaded (year,month,quinzena,cpf)
  WHERE status IN ('ok','forced_ok')` — dupla carga é impossível no banco,
  mesmo entre runs. `estornado` **sai** do índice → o CPF volta a ser
  carregável. `failed`/`blocked` viram candidatos de novo no preflight.
- `hasActiveRun` — run `running` <20min no período ⇒ 409 (anti duplo-disparo
  operador×agendamento). Runs velhas são órfãs (restart PM2) e não bloqueiam.
- `execute` aborta **antes de mover 1 centavo** se: pool insuficiente,
  token vencido (`VexpayAuthError` → "Sincronize o token pela extensão"),
  ou grupo sem `balance_id`.
- Falha é **por grupo**: depósito de um grupo falhando marca os itens
  dele `failed`, os demais seguem.
- Guard de **descongelar**: `DELETE /api/quinzena-freeze` ⇒ 409
  `run_exists` quando há run no período — UI exige confirmação
  (`confirm_run=1`). Descongelar **não** desfaz dinheiro.
- Descrição/trilha em cada operação: `Carga {q}a QZ mm/yyyy — auto-carga
  (run N)` / `— forçada` / `Estorno auto-carga …` + `transaction_id`
  gravado por item (`vex_response` JSONB guarda a resposta crua).

### 5.5 Agendamento ("auto-carga ao congelar")

- `POST /api/quinzena-fechar` aceita `{autocarga:true}` → após o freeze
  (**só quando `frozenNow=true`**, i.e. congelou agora — em já-congelado
  não dispara) chama `void executeAutoCarga(...)` fire-and-forget com o
  ator do request (ou `autopilot@` se veio por cron).
- `GET /api/cron/quinzena-autopilot?autocarga=1` repassa a flag — o worker
  pode agendar carga no fechamento automático dos dias 11/25.
- A run aparece `running` no `/status` e a UI acompanha.

### 5.6 Schema (Neon)

```sql
quinzena_card_map(user_uuid PK, cpf, vex_name, balance_account_id,
                  account_id, card_number, card_group_id, card_group_name,
                  card_status, account_status, updated_at)

quinzena_carga_runs(id, year, month, quinzena,
                    status running|done|partial|failed|aborted,
                    triggered_by_email/name, pool_before/after,
                    total_planned/loaded, items_ok/failed/blocked/forced,
                    error, started_at, finished_at)

quinzena_carga_items(id, run_id→runs CASCADE, year, month, quinzena,
                     cpf, colaborador, card_group_id, balance_account_id,
                     amount, status ok|failed|blocked|skipped|
                              forced_ok|forced_failed|estornado,
                     block_reason, forced, forced_by, transaction_id,
                     vex_response JSONB, executed_at,
                     estornado_at, estornado_by, estorno_tx, estorno_pool_tx)
UNIQUE (year,month,quinzena,cpf) WHERE status IN ('ok','forced_ok')
```

### 5.7 Rastreabilidade

Toda ação grava `audit_log` (`quinzena.autocarga`,
`quinzena.autocarga_force`, `quinzena.autocarga_estorno`,
`quinzena.fechar` com `autocarga_scheduled`) e a UI expõe:
badges por linha (dot+tooltip com tx), colunas `STATUS CARGA` +
`TRANSACTION ID` no export XLSX, modal 3-telas (preflight → revisão com
"Carregar mesmo assim" → resultado com "Reexecutar falhas" + estorno por
linha), bloco de divergências (reconcile).

---

## 6. Camada de dados local (Neon)

### Cache `api_cache`

`lib/db/neon-cache.ts` — cache persistente em Postgres (sobrevive a
restart; compartilhado entre rotas). `getWithStale` = SWR: responde stale
(>50% do TTL) e dispara refresh em background. TTLs por tipo:
`historical` 30d, `config` 24h, `reports` 24h, `current-month` 1h,
default 24h. Chaves `vexpenses-data:*` — `invalidateCache()` após
escritas (approve/reject/auto-approve limpam as listas).

### Tabelas-espelho principais

| Tabela | Fonte | Conteúdo |
|---|---|---|
| `prestacao_reports` | v2 listing+detail | Relatórios (espelho completo + `raw_data`) |
| `prestacao_expenses` | v2 detail | Despesas por relatório (reconciliadas) |
| `report_status_history` | diffs do sync | Histórico de transições de status |
| `extrato_movimentacao` | v3 statement XLSX | Movimentações + snapshots diários de saldo de cartão |
| `quinzena_cadastro` | v2 team-members + RH | Cadastro canônico CPF→colaborador/situação/status_cartao |
| `quinzena_controle_snapshot` | cadastro+planilha | Snapshot por período (saldos de controle) |
| `quinzena_manual_inputs` | UI | Overrides (col_1qz, adiantamento, obs, reembolso_override, carga_final_override + *_edited_by/at) |
| `quinzena_frozen_snapshots` | freeze | Planilha congelada — fonte da auto-carga |
| `quinzena_card_map` | Pay discovery | uuid→cpf→cartão/balance |
| `quinzena_carga_runs`/`_items` | auto-carga | Execuções e resultado por CPF |
| `somase_snapshots`/`prestacao_expense_snapshots` | somase | Totais de prestação por quinzena |
| `vexpenses_tokens` | extensão | Sessões laravel |
| `api_cache` | rotas | Cache SWR |
| `notifications`, `audit_log`, `sync_runs`/`_errors`, `settings` | interno | Sininho, auditoria, durabilidade do worker, feature flags |

### Cálculo quinzenal (resumo)

`GET /api/quinzena-complete` monta a linha por CPF:
`saldo_prestacao = carga − transf − tarifa − somase` (extrato cumulativo
até o `financial_cutoff` = dia 30 do mês anterior) · `saldo_final =
saldo_prestacao − saldo_cartao_controle` · `carga_parcial =
col_qz_efetivo − saldo_final_carga − saldo_cartao_carga − adiantamento` ·
`reembolso = quinzena===1 ? max(0, −saldo_final) × multiplier : 0`
(default do multiplier = **0** quando não há linha em `quinzena_config`)
· `carga_final = max(0, carga_parcial) + reembolso_efetivo`
(overrides vencem a fórmula). `status_cartao` "pendente" zera a fórmula
(mas override explícito vence — decisão humana auditada).

Datas da quinzena: 1ª = dia 26 do mês anterior → dia 10, fecha dia 11;
2ª = dia 11 → 25, fecha dia 25.

---

## 7. Variáveis de ambiente relevantes

| Var | Uso |
|---|---|
| `VEXPENSES_API_KEY` | Auth da API v2 (todas as leituras + approve) |
| `VEXPENSES_EXTENSION_SECRET` | Secret que a extensão manda no body do update-laravel-token (fail-closed) |
| `NEON_DATABASE_URL` | Postgres Neon (espelho de tudo) |
| `CRON_SECRET` | Rotas de cron (`keepalive`, `quinzena-autopilot` via `x-cron-secret`) |
| `NEXT_PUBLIC_API_URL` | Base da API (default `https://api.vexpenses.com`) |
| `APP_BASE_URL` | Base interna p/ chamadas do worker às rotas Next (default `http://localhost:3000`) |
| `JWT_SECRET` | Sessão do próprio dashboard (cookie `vexp_auth_token` — auth do app, não da VExpenses) |

Legado: `VEXPENSES_LARAVEL_TOKEN`/`VEXPENSES_LARAVEL_SESSION` existem no
`.env.local` mas **não são lidos** — o token real sempre vem do banco.

---

## 8. Gotchas operacionais (todos observados em produção)

1. **Token é o ponto único de falha da camada web/Pay.** Extensão não
   sincronizou ⇒ `VexpayAuthError` ⇒ auto-carga aborta antes de mover
   dinheiro (correto). Sintoma no banco: `vexpenses_tokens.expires_at`
   vencido. Solução: operador loga no `app.vexpenses.com` com a extensão.
2. **Keepalive do worker retorna 401** (rota exige `?secret`) — quem
   mantém a sessão viva hoje é a extensão; o endpoint funciona quando
   chamado com o secret.
3. **403 transitório em burst** — espaçar leituras Pay (conc ≤4, ~300ms).
4. **`147002002`** = mesmo cartão <60s ⇒ DEBIT de estorno espera 65s;
   transfers em massa fazem retry único após 60s.
5. **Envelope Laravel** — listas são `data.objects[]` (não `data[]`);
   ler errado devolve lista vazia silenciosamente.
6. **Discovery de cartões é por grupo** — `accounts` sem `card_group_id`
   só devolve ~8 contas do gestor.
7. **Nome ≠ identidade** — extrato traz `usuario` como texto; a ponte
   pra dinheiro é SEMPRE `user_uuid → cpf` (nunca nome). No extrato
   (saldo), a resolução nome→CPF é a cadeia exato→alias→fuzzy→prefixo.
8. **Cartão BLOCKED recebe CREDIT** — dinheiro entra e fica preso; a
   classificação `cartao_inativo` + confirmação de force cobre isso.
9. **Saldo lido é cacheado ~8s** — `execute` dorme 3s antes de re-ler
   pool; `reverse` dorme 3s antes do withdrawal.
10. **Aprovação = 1 etapa por chamada** — re-ler status depois
    (`APROVADO` só no último passo); 422 not-an-approver ⇒ pular.
11. **Extrato é all-or-nothing por chunk** — sync abortada preserva o
    dataset anterior; linhas novas entram antes das velhas saírem.
12. **Descongelar não desfaz dinheiro** — por isso o guard `run_exists`.

---

## 9. Mapa rápido de arquivos

| Arquivo | Papel |
|---|---|
| `lib/api/laravel-token.ts` | Cookie string do 1º token ativo (leitura de DB, cache 3min) |
| `lib/api/vexpenses-token-validator.ts` | Pool de tokens: rotação LRU, cooldown, validação/refresh |
| `lib/api/vexpenses-rate-limiter.ts` | Fila 5 req/s + pause em 429 |
| `lib/api/vexpenses-client.ts` | `vexpensesFetchWithRotation`, headers v2/web |
| `lib/api/vexpenses-data.ts` | Camada de dados cacheada (team-members, flows, tracking, resolveApproverForUser) |
| `lib/api/approval-excel.ts` | Excel admin de acompanhamento (etapa absoluta) |
| `lib/vexpay/client.ts` | Cliente Pay (pool/grupo/cartão, deposit/withdrawal/transfers) |
| `lib/sync/*` | Pipeline: reports, expenses, extrato, cadastro, somase, auto-approve, auto-audit, inactive-alerts, notifications |
| `lib/autocarga/*` | Domínio da auto-carga: plan, execute, card-map, records, tables, allowlist |
| `worker/sync-worker.ts` | Loop HOT/WARM/COLD + autopilot (PM2 `sync-worker`) |
| `app/api/vexpenses/*` | Rotas proxy/token (update-laravel-token, keepalive, reports, reports-enviado, approval-tracking…) |
| `app/api/quinzena-autocarga/*` | preflight/execute/force/reverse/status/reconcile |
| `app/api/aprovacao-dinamica/*` | approve/reject/audit/auto-approve + fila |
| `app/api/quinzena-{complete,precheck,freeze,fechar,export}` | Ciclo da quinzena (calcular→conferir→congelar→exportar→carregar) |
| `tools/extension/` | Extensão Chrome que alimenta `vexpenses_tokens` |
