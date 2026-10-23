# Especificação — Auto-carga Quinzenal VExpenses + Overrides Manuais

## 1. Contexto e motivação

A página `/quinzena-dinamica` calcula a carga quinzenal dos cartões VExpenses
(carga_parcial + reembolso → carga_final), o financeiro revisa, congela
(`quinzena_frozen_snapshots`) e a **carga efetiva no cartão ainda é feita à mão**
no portal da VExpenses.

Três mudanças de processo para as próximas quinzenas:

1. **Fim da regra de reembolso de 50%** — `reembolso` passa a nascer zerado.
2. **Revisão manual direta dos dois campos de resultado** (`carga_final` e
   `reembolso`) antes do congelamento, com rastreabilidade (quem/quando/cor
   própria/log no histórico).
3. **Auto-carga**: após congelar, um botão executa a movimentação de dinheiro
   real na VExpenses — pool EQS → grupo de cartões → cartão de cada
   colaborador — com salvaguardas (alertas por funcionário, bloqueio
   individual, override consciente) e restrição de quem pode disparar.

O contrato completo da API Pay já foi capturado e provado end-to-end em
`docs/VEXPENSES_PAY_API_AUTOCARGA.md` (deposit/withdrawal/transfers, auth por
`laravel_token` — o mesmo token que a extensão já sincroniza em
`vexpenses_tokens` e que `lib/api/laravel-token.ts` já rotaciona).

## 2. Estado atual (verificado no código)

### Fluxo da quinzena

- `app/quinzena-dinamica/page.tsx` (~1410 linhas): tabela com `EditCell`
  (edição inline) para `col_1qz`, `adiantamento`, `obs` →
  `saveField(cpf, field, value)` → `POST /api/quinzena-complete`.
- `POST /api/quinzena-complete` (`app/api/quinzena-complete/route.ts:621`):
  `ALLOWED_FIELDS = ['col_1qz','adiantamento','obs']` → upsert em
  `quinzena_manual_inputs` (PK lógica `cpf+year+month+quinzena`). Escopo de
  gestor respeitado (`getScopeForRequest` + `scope.cpfs`).
- `calcFinancials` (`lib/quinzena/financials.ts:76`):
  `carga_parcial = col_qz_efetivo − saldo_final_carga − saldo_cartao_carga − adiantamento`
  `reembolso = quinzena===1 ? max(0, saldo_reembolsar) × multiplier : 0`
  `carga_final = max(0, carga_parcial) + reembolso`
  — `status_cartao` contendo "pendente" zera tudo.
- Multiplicador vem de `quinzena_config.reembolso_multiplier`
  (default `0.5` quando não há linha pro período — `route.ts:156-163`).
- Freeze: `POST /api/quinzena-fechar` → precheck → `POST /api/quinzena-freeze`
  → copia as linhas calculadas pra `quinzena_frozen_snapshots` (1 row/cpf) →
  export XLSX → `logAudit('quinzena.fechar')`. `DELETE /api/quinzena-freeze`
  descongela. Gestor (`role==='gestor'`) é bloqueado nas duas ações.
- `EditCell` já é `readOnly` quando `isGestor || isFrozen` — overrides novos
  herdam a mesma regra.
- Otimista no cliente: `saveField` recalcula a linha localmente
  (`page.tsx:388-435`) — vai precisar replicar a precedência dos overrides.

### Persistência relevante (Neon — schema real consultado)

- `quinzena_manual_inputs(id, user_id, year, month, quinzena, obs, col_1qz,
  adiantamento, updated_at, cpf)` — `user_id` existe mas hoje não é escrito.
- `quinzena_frozen_snapshots(..., reembolso, carga_final,
  reembolso_multiplier, frozen_at, frozen_by)`.
- `quinzena_cadastro(cpf, colaborador, situacao, status_cartao, regional,
  centro_custo, gestor, diretor)` — situacao×status_cartao reais:
  `ATIVO+Cartão ativo` 426 · `INATIVO+Cartão Inativo` 173 · `ATIVO+NULL` 77 ·
  `ATIVO+Cadastro pendente` 62 · `INATIVO+Cartão ativo` 39 ·
  `ATIVO+Cartão não vinculado` 26 · demais (PERÍCIA, APOSENTADORIA…).
- `quinzena_config(year, month, quinzena, reembolso_multiplier)`.
- `audit_log` (append-only) + `logAudit(request, {action, entity_type,
  entity_id, details})` — já alimenta a página `/audit-log`.
- `app_users(email, name, role, active)` — os três operadores existem:
  `italo.medrado@eqsengenharia.com.br` (id 1),
  `leticia@eqsengenharia.com.br` — **Leticia Agenita** (id 2),
  `andrey.reginaldo@eqsengenharia.com.br` (id 11).
  ⚠️ Existe também `leticia.silva@` (id 13) — a allowlist é por e-mail
  exato, nunca por nome.
- Middleware injeta `x-user-id/x-user-role/x-user-email/x-user-name` — é o que
  o backend usa pra identidade e auditoria.

### API VExpenses Pay (provada — ver doc de contrato)

- Auth: `Cookie: laravel_token=…` **sozinho** autentica leitura E escrita.
  `lib/api/laravel-token.ts` → `getLaravelCookieString()` já resolve
  rotação/cooldown — reusar.
- `GET /v3/pay/company/balance` → pool EQS `{amount}`.
- `GET /v3/pay/v2/app/card-groups?page&limit` → grupos `{id, name,
  balance_id}` (24 grupos, paginado).
- `GET /v3/pay/v2/app/accounts?card_group_id={uuid}&page&limit` → cartões
  `{individual.user_id(uuid), user_name, account.card_number, card_status,
  balances[].id}`. **Sem `card_group_id` só retorna ~8 contas do gestor —
  descoberta é obrigatoriamente por grupo.**
- `GET /v3/pay/users/{uuid}` → `{name, cpf, email, …}` — **ponte
  autoritativa uuid→CPF** (provada: Ronaldo → `05762523950`).
- `POST /v3/pay/accounts/balances/deposit`
  `{balance_account_id: group.balance_id, amount, description}` — pool→grupo.
- `POST /v3/pay/accounts/balances/withdrawal` — grupo→pool (não usado na
  auto-carga; documentado pra estorno futuro).
- `POST /v3/pay/company/transfers` — **array**:
  `[{balance_account_id: card.balances[0].id, amount, type:'CREDIT'|'DEBIT'}]`
  → `{data:{success:[{transaction_id,user_name,…}], failure:[…]}}` — resultado
  **por item**.
- Rate-limit por cartão: `success:false, errors:[{code:147002002,
  "Excesso de tentativas"}]` quando o mesmo cartão recebe >1 operação em
  <~60s → obrigatório retry com backoff/janela.
- Leituras de saldo têm cache de segundos — re-ler com folga.

### O buraco real

- `centro_custo` do cadastro (197 valores tipo `CLARO INFRA SC`) **não casa**
  com os nomes dos grupos VExpenses (`REGIONAL CLARO INFRA SC`, `FINANCEIRO`…).
  O grupo correto é **o do cartão**, descoberto via listagem por grupo —
  nunca derivado da planilha.
- Não existe hoje nenhum vínculo cpf→cartão/balance_id, nenhuma execução de
  dinheiro, nenhum override de `carga_final`/`reembolso`, nenhum registro de
  "quem editou" por campo.

## 3. Conceito / modelo de domínio

```
quinzena (year, month, quinzena)
├── manual_inputs          ── overrides de entrada (col_1qz, adiantamento, obs)
│   └── NOVO: reembolso_override, carga_final_override + metadados de edição
├── frozen_snapshots       ── verdade congelada (fonte da auto-carga)
├── card_map (NOVO)        ── índice cpf → cartão VExpenses (cache)
└── carga_runs/items (NOVO)── execução da auto-carga + resultado por CPF

Dinheiro (VExpenses):
Pool EQS ──deposit──▶ grupo.do(cartão) ──CREDIT──▶ cartão do colaborador
```

Decisão de domínio central: **a linha da planilha casa com o cartão por CPF**
(bridge `user_id`→`cpf` via `/v3/pay/users/{uuid}`, cacheada em
`quinzena_card_map`). Nome é só fallback com flag de ambiguidade — dinheiro
não se transfere por nome parecido.

## 4. Modelo de dados

### 4.1 `quinzena_manual_inputs` — novas colunas

```sql
ALTER TABLE quinzena_manual_inputs
  ADD COLUMN IF NOT EXISTS reembolso_override     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS carga_final_override   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS reembolso_edited_by    TEXT,
  ADD COLUMN IF NOT EXISTS reembolso_edited_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carga_final_edited_by  TEXT,
  ADD COLUMN IF NOT EXISTS carga_final_edited_at  TIMESTAMPTZ;
```

`NULL` = sem override (usa a fórmula). `edited_by` guarda `x-user-email`;
`edited_at` o timestamp do último override. Apagar o valor (salvar vazio)
volta `NULL` — o metadado preserva quem apagou.

### 4.2 `quinzena_card_map` (nova)

```sql
CREATE TABLE IF NOT EXISTS quinzena_card_map (
  user_uuid          TEXT PRIMARY KEY,        -- individual.user_id da VExpenses
  cpf                VARCHAR(11),             -- de /v3/pay/users/{uuid} (pode ser NULL)
  vex_name           TEXT,                    -- user_name da conta
  balance_account_id TEXT NOT NULL,           -- balances[0].id — destino do CREDIT
  account_id         TEXT,                    -- account.id
  card_number        VARCHAR(4),              -- últimos 4 dígitos
  card_group_id      TEXT NOT NULL,           -- grupo dono do cartão
  card_status        TEXT,                    -- ACTIVE/BLOCKED/…
  account_status     TEXT,                    -- status da account
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_card_map_cpf ON quinzena_card_map(cpf);
```

Refreshed pelo preflight (accounts por grupo + users/{uuid} sob demanda).
Serve de cache: user_detail só se busca pra uuid ainda não mapeado.

### 4.3 `quinzena_carga_runs` + `quinzena_carga_items` (novas)

```sql
CREATE TABLE IF NOT EXISTS quinzena_carga_runs (
  id BIGSERIAL PRIMARY KEY,
  year INT NOT NULL, month INT NOT NULL, quinzena INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',   -- running|done|partial|failed|aborted
  triggered_by_email TEXT, triggered_by_name TEXT,
  pool_before NUMERIC(12,2), pool_after NUMERIC(12,2),
  total_planned NUMERIC(12,2), total_loaded NUMERIC(12,2),
  items_ok INT, items_failed INT, items_blocked INT, items_forced INT,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(), finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS quinzena_carga_items (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT REFERENCES quinzena_carga_runs(id) ON DELETE CASCADE,
  year INT NOT NULL, month INT NOT NULL, quinzena INT NOT NULL,  -- denormalizado p/ idempotência cross-run
  cpf VARCHAR(11), colaborador TEXT,
  card_group_id TEXT, balance_account_id TEXT,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,       -- ok|failed|blocked|skipped|forced_ok|forced_failed
  block_reason TEXT,          -- motivo do bloqueio quando aplicável
  forced BOOLEAN DEFAULT FALSE, forced_by TEXT,
  transaction_id TEXT,
  vex_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(), executed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_carga_items_run ON quinzena_carga_items(run_id);
-- guarda anti-dupla-carga: mesmo período+cpf carregado 1× com sucesso (D6)
CREATE UNIQUE INDEX IF NOT EXISTS uq_carga_loaded
  ON quinzena_carga_items(year, month, quinzena, cpf)
  WHERE status IN ('ok', 'forced_ok');
```

### 4.4 Reembolso zerado — compatibilidade

`quinzena_config` continua como está. A mudança é só no **default**:
período sem linha em `quinzena_config` → `reembolso_multiplier = 0`
(antes `0.5`). Períodos com linha configurada mantêm o valor gravado —
histórico e possíveis exceções preservados. Snapshots congelados não são
tocados (já guardam `reembolso` materializado).

## 5. APIs

Todas sob `/api/`, mesmo padrão de auth/escopo do projeto (headers
`x-user-*` do middleware; `getScopeForRequest` pra gestor).

### 5.1 `POST /api/quinzena-complete` — extensão dos campos manuais

`ALLOWED_FIELDS` passa a incluir `reembolso` e `carga_final`
(valores enviados pela UI; backend grava em `*_override`).

- Body: `{cpf, year, month, quinzena, field, value}` — `value=null` limpa
  o override.
- **Rejeita 409 se o período estiver congelado** (checar
  `quinzena_frozen_snapshots` — override é pré-freeze por contrato).
- Escopo de gestor igual aos campos atuais (decisão D8).
- Validação: `reembolso`/`carga_final` numérico ≥ 0 ou null.
- Efeitos: upsert em `quinzena_manual_inputs` (`*_override`,
  `*_edited_by = x-user-email`, `*_edited_at = NOW()`) +
  `logAudit('quinzena.edit_override', entity_type='quinzena',
  entity_id='{y}-{m}-Q{q}:{cpf}', details={field, old_value, new_value,
  colaborador})`.
- `GET` passa a devolver por linha: `reembolso_override`,
  `carga_final_override`, `reembolso_edit {by, at}`, `carga_final_edit
  {by, at}` — e aplica a precedência (§7) antes de responder.

### 5.2 `GET /api/quinzena-autocarga/preflight?year&month&quinzena`

Gate: período **congelado** + usuário na allowlist (D5).

Retorna o plano completo sem executar nada:

```json
{
  "pool": 2977.35,
  "total_to_load": 12345.67,
  "pool_sufficient": true,
  "groups": [{"card_group_id":"…","name":"FINANCEIRO","needed":500.00,
              "available":0.75,"deposit":499.25}],
  "loads": [{"cpf":"…","colaborador":"…","amount":250.00,
             "card":"…2405","card_group":"FINANCEIRO"}],
  "blocked": [{"cpf":"…","colaborador":"…","amount":120.00,
               "reason":"funcionario_inativo",
               "detail":"situacao=INATIVO","forceable":true},
              {"cpf":"…","colaborador":"…","amount":80.00,
               "reason":"sem_cartao","detail":"nenhum cartão encontrado",
               "forceable":false}],
  "already_loaded": [{"cpf":"…","colaborador":"…","amount":…,
                      "transaction_id":"…"}],
  "card_map": {"resolved_by_cpf": 118, "resolved_by_name": 3, "unresolved": 5}
}
```

`forceable=false` quando não existe destino físico (sem cartão / sem
`balance_account_id`) — forçar é impossível, não só desaconselhado.

### 5.3 `POST /api/quinzena-autocarga/execute` `{year,month,quinzena}`

Gate: allowlist + congelado. Executa o plano:

1. Re-roda o preflight no servidor (nunca confia no plano do cliente).
2. Aborta inteiro (antes de qualquer dinheiro) se `pool < total_to_load`
   ou se não houver token válido.
3. Cria `quinzena_carga_runs` (status `running`, `pool_before`).
4. Por grupo: `deposit(amount=needed−available)` (se >0) →
   `transfers([{balance_account_id, amount, type:'CREDIT'}, …])`.
   Itens do retorno `failure[]` → retry 1× após 60s (rate-limit 147002002);
   falha definitiva grava `status='failed'` + `vex_response`.
5. Idempotência: CPF já `ok`/`forced_ok` numa run anterior do mesmo
   período é pulado (`skipped` + referência à transaction original).
6. Fecha a run: `pool_after`, contadores, `status`
   (`done`|`partial`|`failed`) + `logAudit('quinzena.autocarga')`.

Resposta: resumo da run + arrays por status (pra UI mostrar o que deu
certo/errado por pessoa).

### 5.4 `POST /api/quinzena-autocarga/force` `{year,month,quinzena,cpf}`

Gate: allowlist + congelado + `forceable=true` no preflight atual.

- Recalcula preflight, acha o item bloqueado, deposita no grupo do cartão
  se preciso, `transfers` de 1 item.
- Grava item `forced_ok|forced_failed` + `forced_by` +
  `logAudit('quinzena.autocarga_force', details={cpf, reason_original,
  amount, transaction_id})`.

### 5.5 `GET /api/quinzena-autocarga/status?year&month&quinzena`

Última run + itens (join por cpf) — alimenta badges "carregado/bloqueado/
falhou" nas linhas e o estado do botão ("Auto-carga" → "Reexecutar
falhas" → "Carga concluída").

### 5.6 Permissão (D5)

```ts
const AUTOCARGA_ALLOWED = new Set([
  'italo.medrado@eqsengenharia.com.br',
  'leticia@eqsengenharia.com.br',
  'andrey.reginaldo@eqsengenharia.com.br',
]);
// guard: AUTOCARGA_ALLOWED.has(request.headers.get('x-user-email') ?? '')
```

Server-side em TODOS os endpoints acima (403 fora da lista). A UI esconde
o botão pra quem não pode, mas a segurança real é no servidor — o mesmo
padrão do gate de gestor do freeze.

## 6. UX / UI

### 6.1 Colunas editáveis (pré-freeze)

- `REEMBOLSO` e `CARGA FINAL` viram `EditCell` (mesmo componente de
  `col_1qz`), `readOnly={isGestor || isFrozen}` igual aos campos manuais
  atuais (gestor: ver D8).
- **Cor diferente**: override presente → `bg-amber-100 text-amber-900` +
  `font-semibold` + marcador `●` antes do valor (vs. azul calculado e
  âmbar claro dos campos manuais de entrada).
- **Tooltip** (`title` nativo): `"Editado manualmente por {name}
  ({email}) em {dd/mm/aaaa hh:mm} — valor calculado: R$ {x}"`.
- Legenda da página ganha um chip: `Override manual` (âmbar forte).

### 6.2 Botão Auto-carga

- Posição: header ao lado de Congelar/Descongelar, visível **só quando**
  `is_frozen` **e** usuário na allowlist (checada via `GET
  .../status` — que já devolve `can_autocarga: true/false`).
- Estados: `Auto-carga` → após run: `Reexecutar (N falhas)` /
  `Carga concluída ✓` (disabled).
- Ícone `Zap`/`Banknote`; cor `emerald`.

### 6.3 Modal Auto-carga (`components/autocarga-modal.tsx`)

Fluxo em 3 telas, espelhando o `FreezePrecheckModal`:

1. **Preflight** (spinner): "Resolvendo cartões…"
2. **Revisão**:
   - Cards: `Pool EQS R$ x` · `Total a carregar R$ y` · `N cargas · M
     bloqueadas`
   - Lista "Serão carregados" (nome, cartão …1234, valor, grupo)
   - Lista "Bloqueados" com motivo por linha + botão **"Carregar mesmo
     assim"** (só `forceable`; `sem_cartao` mostra motivo sem botão)
   - Alerta vermelho se `pool < total`.
   - `[Cancelar] [Executar carga de N cartões — R$ total]`
3. **Execução/resultado**: progress por grupo → resumo
   `✓ ok · ✗ falharam (com retry)` + lista de falhas com botão "Tentar
   novamente" por item (reusa `/force` pra retry de falha? Não — falha de
   rede/rate-limit não é bloqueio: reusar `execute` que só pega
   pendentes).

### 6.4 Alertas por motivo (micro-copy)

| reason | Texto |
|---|---|
| `sem_cartao` | "Sem cartão VExpenses vinculado — regularize o cadastro" |
| `cartao_inativo` | "Cartão {status} — a carga pode ser recusada pela operadora" |
| `funcionario_inativo` | "Funcionário {situacao} — confirme se deve receber" |
| `cadastro_pendente` | "Cadastro pendente/reprovado na VExpenses" |
| `cpf_nao_encontrado` | "Cartão encontrado por nome — CPF não confere" |
| `nome_ambiguo` | "Mais de um cartão possível — resolva manualmente" |
| `valor_invalido` | "Carga final ≤ 0 — nada a carregar" |

## 7. Regras de negócio

### 7.1 Precedência dos valores (linha, pré-freeze)

```
reembolso_efetivo   = reembolso_override ?? reembolso_calculado
                    (reembolso_calculado = 0 quando multiplier=0 — novo default)
carga_final_efetiva = carga_final_override
                      ?? max(0, carga_parcial) + reembolso_efetivo
```

- Override de `carga_final` **não** altera `carga_parcial` (o usuário edita
  o resultado, não a fórmula). Recalculo otimista na UI espelha isso.
- `status_cartao` pendente continua zerando a **fórmula**, mas um override
  manual explícito vence (foi decisão humana, auditada).
- Freeze passa a gravar os valores **efetivos** (override aplicado) nos
  campos `reembolso`/`carga_final` do snapshot — o snapshot continua sendo
  a verdade única.

### 7.2 Classificação do preflight (ordem de precedência)

Só entram candidatos com `carga_final_efetiva > 0` (das
`frozen_snapshots`):

1. `valor_invalido` — valor ≤0/NaN (não forceable, não bloqueante)
2. `sem_cartao` — sem match em `card_map` ou `status_cartao` contém
   "não vinculado"/"pendente"/"reprovado" (não forceable)
3. `funcionario_inativo` — `situacao ≠ 'ATIVO'` (forceable)
4. `cartao_inativo` — `card_status/account_status ≠ ACTIVE` (forceable)
5. `cpf_nao_encontrado` — resolvido por nome, cpf divergente/ausente
   (forceable)
6. ok → `loads[]`

`funcionario_inativo` vem antes de `cartao_inativo` — a razão mais grave
(pessoa desligada) é a que aparece.

### 7.3 Execução

- `deposit` por grupo = `max(0, Σ cargas do grupo − saldo disponível do
  grupo)` (lido na hora). Se já houver saldo suficiente, pula o depósito —
  não infla o grupo à toa.
- `transfers` por grupo em **uma chamada-array**; falha `147002002`
  (rate-limit) → espera ~60s e reenvia **só os itens que falharam**;
  2ª falha → `failed` definitivo com `vex_response` gravada.
- Descrição/motivo nos depósitos: `Carga {q}ª QZ {mm}/{yyyy} — auto-carga
  (run {id})` — trilha cruzada com `transaction_id` por item.
- Abort-once: pool insuficiente, token expirado sem outro válido, ou erro
  no **primeiro** depósito → aborta run inteira (`status='aborted'`).
  Depósito falhando no meio → grupo afetado marca seus itens `failed`,
  demais grupos seguem (falha é por grupo, não global).

## 8. Fluxos de ponta a ponta

### Caminho feliz

1. Financeiro abre a quinzena corrente → revisa → edita `Carga Final` de
   2 colaboradores (ficam âmbar, tooltip com nome/hora) → Congelar.
2. `leticia@` (allowlist) vê botão **Auto-carga** → abre modal →
   preflight lista "118 cargas R$ 32.450,00" + "3 bloqueados (2 inativos,
   1 sem cartão)".
3. Executa → run grava depósitos por grupo + transfers → resultado
   "116 ✓ · 2 falharam (rate-limit, reenviadas 1× ✓)" → badges
   "carregado" nas linhas + audit.

### Bordas

- **Sem cartão**: aparece bloqueado sem botão de forçar; se o cadastro for
  regularizado, próximo preflight resolve.
- **Funcionário demitido com carga pendurada**: bloqueado;
  `Carregar mesmo assim` → item `forced_ok` + audit com `forced_by`.
- **Pool insuficiente**: modal mostra déficit antes de executar; execute
  re-checa no servidor e aborta sem mover 1 centavo.
- **Re-run**: itens `ok`/`forced_ok` não repetem (índice único); modal
  mostra "já carregados" separado.
- **Descongelar após carga**: `DELETE quinzena-freeze` passa a responder
  warning `run_exists: true` e UI pede confirmação explícita —
  descongelar NÃO desfaz dinheiro.
- **Token vencido**: `getLaravelCookieString()` retorna null → execute
  aborta com mensagem acionável ("Sincronize o token pela extensão").

## 9. Fases de entrega

### P0 — essencial (o pedido inteiro, fatiável em 3 commits)

- **P0a** Reembolso zero + overrides editáveis
  (`reembolso`/`carga_final`): colunas no `manual_inputs`, `POST`
  estendido, `GET` com precedência + metadados, `EditCell` nas duas
  colunas, cor/tooltip, audit `quinzena.edit_override`, freeze gravando
  valor efetivo, guard "não edita congelado".
- **P0b** `quinzena_card_map` + lib `lib/vexpay/` (cookie → client dos 5
  endpoints do contrato) + `preflight` completo.
- **P0c** `execute` + `force` + `status` + runs/items + modal na página +
  allowlist + idempotência.

### P1 — valor agregado

- Badges por linha ("carregado/bloqueado/falhou") vindos de `/status`.
- Export XLSX com coluna `STATUS CARGA`/`transaction_id`.
- Botão "Reexecutar falhas" dedicado (hoje coberto por re-execute).
- Aviso no `DELETE` de freeze quando existe run (borda §8) — se não
  couber no P0c, vai aqui.

### P2 — aprendizado/polish

- Estorno/reverso (DEBIT) pela UI quando uma carga sair errada.
- Notificação `notifyAdmins` ao fim da run (padrão já usado no fechar).
- Agendamento opcional "auto-carga ao congelar" por período.
- Relatório de divergência planilha×executado (usa `transaction_id`).

## 10. Decisões abertas

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Reembolso zero: default `0` na ausência de linha em `quinzena_config` (vs. coluna `active`/hardcode no `calcFinancials`) | **Default 0** — período sem config simplesmente não gera reembolso; config explícita continua honrada (escape hatch) e histórico congelado intacto |
| D2 | Onde guardar overrides: colunas novas em `quinzena_manual_inputs` vs. tabela `quinzena_overrides` própria | **Colunas na `manual_inputs`** — mesma PK, mesmo upsert, metadados por campo já previstos |
| D3 | Matching pessoa→cartão: cpf-bridge (`/v3/pay/users/{uuid}`) vs. nome normalizado | **CPF-bridge com cache** (`quinzena_card_map`); nome só como fallback flaggeado — dinheiro não se transfere por nome parecido |
| D4 | Depósito no grupo: exato do total vs. delta (necessário − saldo do grupo) | **Delta** — respeita saldo que já estiver no grupo, não infla à toa |
| D5 | Allowlist: emails hardcoded vs. coluna `can_autocarga` em `app_users` | **Hardcoded server-side** (3 emails) — requisito é fechado e explícito; promover pra coluna só se a lista crescer |
| D6 | Idempotência: único por (run,cpf) vs. único por (período,cpf,ok) | **Colunas de período nos itens + unique parcial `WHERE status IN ('ok','forced_ok')`** — proteção vale entre runs |
| D7 | Retry de `147002002`: reenviar lote inteiro vs. só falhas | **Só os itens falhados**, 1 retry após ~60s |
| D8 | Gestor pode editar `carga_final`/`reembolso` in-scope? | **Não** — overrides mexem no valor final que vira dinheiro: restringir a não-gestores (admins). Col_1qz/adiantamento continuam como estão |
| D9 | `reembolso_override` aceita negativo (retenção)? | **Não** — reembolso ≥0 e carga_final ≥0; negativo → 400 |
| D10 | Auto-carga exige `data_mode='frozen'` | **Sim** — a planilha congelada é a única fonte auditável do valor que sai do caixa |

## 11. Critérios de aceite

**Overrides**
- [ ] Reembolso calcula `0` num período sem linha em `quinzena_config`
      (e continua calculando 50% se a config existir — legado).
- [ ] Editar `Carga Final` de uma linha pré-freeze: valor fica âmbar,
      tooltip mostra quem/quando, refresh persiste, `audit_log` tem
      `quinzena.edit_override` com old→new.
- [ ] Override limpo (salvar vazio) volta ao valor calculado.
- [ ] Freeze grava o valor **efetivo** (override) no snapshot.
- [ ] Editar em período congelado → 409, sem escrita.
- [ ] Gestor NÃO consegue editar override mesmo in-scope (403).

**Auto-carga**
- [ ] Botão invisível pra usuário fora da allowlist e antes do freeze;
      `POST` direto sem allowlist → 403.
- [ ] Preflight classifica corretamente: sem cartão / cartão inativo /
      funcionário inativo / pendente — com `forceable` correto.
- [ ] Execute deposita o delta certo por grupo e transfere por CPF
      (transação real de R$0,01 aprovada no cartão de teste).
- [ ] `success:false`/`failure[]` por item vira `failed` com motivo;
      rate-limit é retentado 1×.
- [ ] Re-run não duplica carga (item `ok` anterior vira `skipped`).
- [ ] `Carregar mesmo assim` em `funcionario_inativo` executa e grava
      `forced_ok` + `forced_by` + audit.
- [ ] Pool insuficiente → abort sem nenhuma chamada de dinheiro.
- [ ] `audit_log` registra `quinzena.autocarga` (totais, run_id) e
      `quinzena.autocarga_force` por forçado.
- [ ] Saldos conferem: `pool_after = pool_before − Σ carregado` e cada
      `balance_account_id` creditado conferido por leitura.

## 12. Plano de testes E2E

**Semântica cuidadosa**: a auto-carga move dinheiro real. E2E usa período
sintético + valores de centavos nos cartões de teste reais (Ronaldo/Letícia
— FINANCEIRO, consentimento já dado):

1. **Massa**: inserir 2 linhas em `quinzena_frozen_snapshots`
   (year=2030, month=1, quinzena=1, CPFs do Ronaldo/Letícia,
   `carga_final=0.01`) + 1 linha de CPF inexistente no card_map
   (`carga_final=0.05`, vira `sem_cartao`) + 1 linha `carga_final=0`
   (vira `valor_invalido`).
2. **Preflight real**: `GET .../preflight?year=2030&month=1&quinzena=1`
   → assert plano: 2 loads, 1 `sem_cartao` não-forceable, 1
   `valor_invalido`, depósito FINANCEIRO = 0.02.
3. **Execute real**: `POST .../execute` → assert depósito + transfers
   aprovados, itens `ok`, `pool` reduziu 0.02, audit gravado.
4. **Idempotência**: re-execute → tudo `skipped`, zero novas chamadas.
5. **Force**: executar `force` no CPF sem cartão → 409 (não forceable);
   forçar um `funcionario_inativo` sintético (linha extra com
   situacao=INATIVO + CPF do Ronaldo → `forced_ok`).
6. **Permissão**: repetir `execute` com usuário não-allowlist → 403.
7. **Limpeza**: DEBIT/withdrawal dos centavos de volta ao pool (chamadas
   já documentadas no contrato); apagar a massa sintética.
8. **UI** (Playwright): modal abre, lista cargas/bloqueados, botão some
   pra usuário fora da allowlist, cor/tooltip do override renderizam,
      execute dispara da UI e reflete resultado.

Massa de dados: cartões reais FINANCEIRO (Ronaldo …2405 balance
`a0aef983-…`, Letícia …2341 `6af5dfe6-…`) + grupo `986fd1bb-…` /
`d4bc9abb-…` — já documentados no contrato.
