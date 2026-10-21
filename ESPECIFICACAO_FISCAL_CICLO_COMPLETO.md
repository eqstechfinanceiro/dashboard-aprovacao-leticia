# ESPECIFICAÇÃO — Fiscal: ciclo completo de tratamento de notas

Data: 2026-08-19
Solicitante: Ítalo (setor fiscal / contas a pagar EQS-Bratec)
Escopo: dashboard `vexpenses-dashboard` (Next.js + Neon Postgres, deploy VPS `179.199.149.43`, `/var/www/dashboard-financeiro/vexpenses-dashboard`)

## 1. Contexto

O setor fiscal opera o dashboard em dois modos: **fila de trabalho** (kanban por tipo — mercadoria, serviço, vexpenses) e **histórico** (notas com decisão tomada). Hoje o fluxo de tratamento de uma nota com erro é:

1. Fiscal confirma erro → cria `resultados_conferencias` + notifica via Teams.
2. Contas a pagar **remove o título do borderô** no Protheus (pré-condição pra correção/cancelamento) — hoje a verificação é manual e lazy (só quando alguém expande a nota).
3. A nota é cancelada no ERP e **re-lançada corrigida** — hoje ninguém monitora se o re-lançamento aconteceu nem se veio correto. Notas `cancelado` são status TERMINAL no sync: ficam invisíveis.
4. Sem changelog/histórico de uso amigável — o `audit_log` existe mas é técnico e escondido atrás de um módulo restrito.

Este documento cobre quatro frentes:

- **F0 — Paridade de ações no kanban**: os botões do histórico (Confirmar corrigida, Cancelar nota, Desfazer…) devem aparecer nas views de mercadoria/serviço também.
- **F1 — Borderô em cache + batch**: verificação em lote no worker (tabela `fiscal_bordero_status`) + badge visível no card.
- **F2 — Módulo Contas a Pagar**: acesso restrito — enxergam **somente** notas em borderô aguardando remoção, com ação de confirmar remoção.
- **F3 — Monitor de canceladas**: job contínuo que detecta re-lançamento da nota no Protheus (SF1/SD1 + fingerprint) e re-confere contra o XML cacheado; alerta quando a correção chega.
- **F4 — Novidades + Histórico**: changelog versionado (com dot de não-lido) e página de histórico de atividades amigável — copiando o padrão do Portal Documentos.

---

## 2. Estado atual (mapa do código)

### 2.1 Ações por status — a assimetria a corrigir

`app/fiscal/page.tsx` — seção expandida do card:

- Bloco de ações só renderiza quando `view === 'historico'` (~linhas 1400+). Na view `fila` o card expandido só tem os formulários inline (`erroForm`, `cancelForm`, `corrigirForm`) e os botões primários de pendente.
- Função única de ação: `revisar(n.id, decisao, erro_tipo?, descricao?, motivo?)` → `POST /api/fiscal/revisar`.

`app/api/fiscal/revisar/route.ts` — máquina de estados server-side:

| Decisão | Origem permitida | Efeito |
|---|---|---|
| `confirmado_ok` | pendente, falha_tecnica, auto_ok_aviso | marca OK manual |
| `confirmado_erro` | pendente, falha_tecnica, auto_ok_aviso, confirmado_ok | cria linha em `resultados_conferencias` (fonte='fiscal'), dispara `enviarTeamsErroFiscal` |
| `cancelado` | confirmado_erro | grava `cancelled_by/at/motivo` |
| `corrigida` | confirmado_erro, cancelado | grava `corrigida_by/at/nota` + `corrigida_de` (origem) |
| `desfazer_correcao` | corrigida | volta pro status em `corrigida_de` |
| `pendente` | qualquer confirmado (desfazer) | limpa decisão; remove `resultados_conferencias` vinculada |

Todas as decisões já chamam `logAudit`. A transição `cancelado → corrigida` já existe — o monitor de F3 vai **sinalizar** essa transição, não automatizá-la (ver decisão D1).

### 2.2 Borderô — `checkTituloBordero` em `lib/conferencia/totvs.ts` (~L221)

- Consulta **SEA** (`EA_NUM` zero-padded a 9 dígitos, `EA_PREFIXO`=série; campos `EA_NUMBOR/EA_DATABOR/EA_PORTADO/EA_AGEDEP/EA_NUMCON/EA_SITUACA/EA_OCORR/EA_FORNECE/EA_LOJA/EA_TIPO/EA_NUM/EA_PARCELA`) em cada tenant de `EMPRESAS` (`{EQS:'02,02', BRATEC:'11,01'}` em `lib/impacto/totvs.ts`).
- Join manual com **SE2** por `E2_NUM|E2_PARCELA` pra trazer `E2_BAIXA` (se pago).
- Filtro de fornecedor/loja é client-side (campos CHAR com padding).
- Linhas SEA **permanecem após pagamento** — `EA_SITUACA`/`E2_BAIXA` distinguem.
- Chamado hoje só por `GET /api/fiscal/bordero?nota_id=` (lazy, quando a nota expande).

**Bug conhecido a corrigir no batch**: a rota `/api/fiscal/bordero` passa `n.fornecedor` — para notas `tipo='servico'` esse campo guarda o **nome**, não o código SA2. O código certo está em `extra.fornecedor_cod` (mesmo helper `fornecedorCodigo` da página). Resultado: notas de serviço sempre retornam "fora de borderô". A versão batch deve normalizar o código por tipo.

### 2.3 Auth / módulos

- JWT cookie `vexp_auth_token` (jose HS256); `lib/auth/auth.ts`, `middleware.ts`.
- Roles: `admin` | `gestor` | `usuario`; grants por `app_users.allowed_modules` (jsonb).
- `API_MODULE_MAP` em `middleware.ts`: prefixo → módulos aceitos. `/api/fiscal` → `['fiscal','configuracoes']`.
- Gestores são read-only (whitelist de escrita não cobre fiscal).
- `RESTRICTED_MODULES`: configuracoes, aprovacao-dinamica, automacao-comprovantes, cartorios.
- `lib/nav-views.ts` → `SECTOR_VIEWS['contas-pagar']` já existe e hoje enxerga: pendencias, automacao-comprovantes, ferramentas-itau, cartorios, boletos — **não** fiscal. `itemInView` é filtro por interseção.
- `components/sidebar.tsx`: visível = `itemInView(view)` AND (`always` OR `canAccessModule`).

### 2.4 Worker — `worker/sync-worker.ts`

- HOT 5min / **WARM 45min** (syncConferencia + syncServicoDocs + syncImpacto + syncBoletos) / COLD diário.
- Advisory lock `pg_try_advisory_lock(8675309)`.
- `autopilotCheck` usa `getSetting`/`setSetting` como marcadores — mesmo padrão pro novo job.

### 2.5 Notificações in-app — `lib/sync/notifications.ts`

Tabela `notifications` (app_user_id × dedup_key UNIQUE) com semântica upsert/resolve/re-alerta. O sino do header já consome. `upsertNotification(userId, {type,title,body,link,dedupKey,details})` — pronto pra F3 e F2.

### 2.6 Referência Portal Documentos (`C:\Users\italo.medrado\Desktop\Projects\Camila\Portal Documentos`)

- **Changelog**: tabela `changelog_entries(version PK, seq INT, date, title, items JSONB[{tag:'feat'|'improve'|'fix',text}], updated_at, updated_by)`; rotas GET/POST/PATCH/DELETE com mutação admin-only; seed bundle inserido `ON CONFLICT DO NOTHING` (edições no banco sobrevivem a deploys); POST auto-atribui `seq = MIN(seq)-1` (novo primeiro); `useChangelog()` lê DB → fallback bundle; sidebar "Novidades" com `unreadDot` via `helpPrefs.lastSeenChangelog !== latestVersion`.
- **Histórico**: `historico.tsx` — feed de atividades com filtros debounced (cc, usuário, ação, período), paginação, badges coloridos por ação. Backend `getActivityFiltered(limit, offset, filtros)`.

---

## 3. Modelo de dados

### 3.1 `fiscal_bordero_status` (nova — F1/F2)

```sql
CREATE TABLE IF NOT EXISTS fiscal_bordero_status (
  nota_id        BIGINT PRIMARY KEY REFERENCES fiscal_notas(id) ON DELETE CASCADE,
  em_bordero     BOOLEAN NOT NULL DEFAULT FALSE,
  pago           BOOLEAN NOT NULL DEFAULT FALSE,
  borderos       JSONB NOT NULL DEFAULT '[]',   -- array do checkTituloBordero (banco/agência/conta/nº/data/situação/baixa)
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_error    TEXT,                          -- último erro do probe TOTVS (não derruba o cache anterior)
  -- fila de trabalho do contas a pagar:
  remocao_confirmada_at TIMESTAMPTZ,            -- ack manual "já removi do borderô"
  remocao_confirmada_by TEXT,
  removida_detectada_at TIMESTAMPTZ             -- auto: SEA sumiu na verificação seguinte
);
CREATE INDEX IF NOT EXISTS idx_fbs_fila ON fiscal_bordero_status(em_bordero, remocao_confirmada_at);
```

Semântica:
- `em_bordero=true` && `remocao_confirmada_at IS NULL` && `removida_detectada_at IS NULL` → **fila do contas a pagar**.
- SEA some na próxima verificação → `em_bordero=false`, `removida_detectada_at=NOW()` (remove da fila automaticamente; se já estava paga, `pago` sinaliza que não era removível — sai como "paga", não como "removida").
- Confirmado manualmente (`remocao_confirmada_at`) mas SEA ainda existe → segue na fila visual do fiscal com flag "remoção pendente de refletir" até o auto-detect. (Simplificação: o ack manual já basta pra sumir da fila do AP; o auto-detect é backstop. Ver D4.)

### 3.2 Monitor de canceladas — colunas em `fiscal_notas` (F3)

```sql
ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS monitor_fingerprint TEXT;
ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS monitor_status TEXT;
-- 'aguardando_exclusao' | 'excluida' | 'relancada_ok' | 'relancada_divergente' | 'erro_monitor'
ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS monitor_checked_at TIMESTAMPTZ;
ALTER TABLE fiscal_notas ADD COLUMN IF NOT EXISTS monitor_detail JSONB;
-- {ultimo_dtdigit, sf1_encontrada, checks_recompare, sefaz_sitdoc}
```

`monitor_fingerprint` = hash estável do estado TOTVS da nota: campos `F1_VALBRUT|F1_VALICMS|F1_VALIPI|F1_ICMSRET|F1_TIPO|F1_ESPECIE|F1_DTDIGIT` + por item `D1_COD|D1_QUANT|D1_VUNIT|D1_TOTAL|D1_TES|D1_CF|D1_ICMSRET|D1_CLASFIS` (ordenados por `D1_ITEM`). Gravado no upsert da conferência (mercadoria/vexpenses) e recalculado a cada passada do monitor. Mudança de fingerprint com SF1 ativa = **re-lançamento**.

### 3.3 `changelog_entries` (nova — F4)

Cópia fiel do Portal Documentos:

```sql
CREATE TABLE IF NOT EXISTS changelog_entries (
  version    TEXT PRIMARY KEY,
  seq        INT NOT NULL,
  date       DATE NOT NULL,
  title      TEXT NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]',  -- [{tag:'feat'|'improve'|'fix', text}]
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_changelog_seq ON changelog_entries(seq);
```

Seed bundle `lib/changelog/seed.ts` com as entregas recentes já conhecidas (protheus_capture, FGTS portal, fila fiscal, borderô, …) — inserido `ON CONFLICT DO NOTHING` na primeira chamada, igual ao Portal.

### 3.4 Histórico — reutiliza `audit_log`

Nenhuma tabela nova: a página `/historico` lê `audit_log` com filtros amigáveis. O `logAudit` já cobre `fiscal.*` (revisar), `quinzena.*`, `relatorio.*`, `impacto.*`, login… Garantir que os **novos** pontos (borderô batch auto-detects, monitor de re-lançamento, changelog CRUD) também chamem `logAudit` — com `user_id` nulo + `action` tipo `fiscal.bordero_removida_auto` quando for o worker (details carrega a nota).

---

## 4. APIs

### 4.1 Existente, sem mudança de contrato
- `POST /api/fiscal/revisar` — mesmo payload. Kanban passa a chamar as mesmas decisões.

### 4.2 `GET /api/fiscal/fila` — aditivo
- `LEFT JOIN fiscal_bordero_status bs ON bs.nota_id = n.id` → expõe `em_bordero`, `bordero_pago`, `bordero_checked_at` por nota (3 campos no select; o array `borderos` fica pro endpoint de detalhe pra não inchar a listagem).
- Novo scope `scope=borderos` não é necessário — a fila do AP vem do endpoint próprio (4.3).
- Ordenação/filtros inalterados.

### 4.3 `/api/borderos/*` — prefixo novo, módulo `borderos`

`API_MODULE_MAP`: `'/api/borderos'` → `['borderos']`. Rotas finas que reutilizam as libs:

| Rota | Método | Função |
|---|---|---|
| `/api/borderos/notas` | GET | Lista da fila: `em_bordero AND remocao_confirmada_at IS NULL AND removida_detectada_at IS NULL` (+filtro `?todas=1` pra ver histórico de removidas/pagas). Join com `fiscal_notas` pra doc/série/fornecedor/valor/emissão/review_status. |
| `/api/borderos/notas/[id]` | GET | Detalhe: `borderos[]` completo + dados da nota + link portal. |
| `/api/borderos/confirmar-remocao` | POST | `{nota_id, nota?}` → grava `remocao_confirmada_at/by`, `logAudit('fiscal.bordero_remocao_confirmada')`. |
| `/api/borderos/doc?id=` | GET | Proxy pro documento da nota (mesma lógica de `/api/fiscal/doc`) — necessário porque `/api/fiscal/*` continua fechado pro módulo `borderos`. |
| `/api/borderos/portal-link?id=` | GET | Redirect 302 pro deep link do portal EQS (mesma lógica de `/api/fiscal/portal-link`, reuso via extração pra lib). |

Refactor: extrair o corpo de `/api/fiscal/doc` e `/api/fiscal/portal-link` pra `lib/fiscal/doc-serve.ts` / reuso, evitando duplicação.

### 4.4 `POST /api/fiscal/bordero/refresh` (admin/fiscal)

Dispara `syncBorderoStatus()` fora do ciclo — resposta `{checked, em_bordero, removidas}`.

### 4.5 `/api/changelog` (F4) — port do Portal

- `GET /api/changelog` → entradas ordenadas (seq ASC = mais novo primeiro). Se tabela vazia, semeia do bundle e retorna.
- `POST /api/changelog` (admin) → `{version,date,title,items[]}`; `seq = COALESCE(MIN(seq),0)-1`.
- `PATCH /api/changelog/[version]` (admin) → edita title/items/date.
- `DELETE /api/changelog/[version]` (admin).

`API_MODULE_MAP`: `/api/changelog` → módulo `changelog` (novo, sempre concedido? Não — GET deve ser aberto a qualquer logado; mutações admin-only verificadas dentro da rota via `x-user-role`). Portanto `/api/changelog` entra no mapa como módulo sempre presente ou rota pós-auth sem module gate — seguir o padrão mais simples do middleware: registrar módulo `novidades` concedido a todo usuário por padrão no `DEFAULT_MODULES`/seed de usuários? **Decisão D2.**

### 4.6 `GET /api/historico` (F4)

Query params: `q` (usuário/email livre), `action`, `entity_type`, `from`, `to`, `page`, `per_page` (≤100). Retorna rows de `audit_log` + `total` + lista de `action`s distintas (pro dropdown). Gate: módulo `audit-log` existente (já restrito) — a página amigável e a técnica `/audit-log` dividem o mesmo grant. Ver D5.

---

## 5. UX

### 5.1 `/fiscal` — paridade de ações (F0)

- Remover o gate `view === 'historico'` do bloco de ações; renderizar por **status** (state machine), não por view:

| Status | Ações no card expandido |
|---|---|
| `pendente`, `falha_tecnica`, `auto_ok_aviso` | Confirmar OK · Confirmar erro (abre erroForm) |
| `confirmado_ok` | Reverter (→confirmado_erro ou pendente, mesmo conjunto do histórico) |
| `confirmado_erro` | Marcar corrigida · Cancelar nota · Reverter p/ pendente |
| `cancelado` | Marcar corrigida · Desfazer cancelamento + **chip do monitor** (F3) |
| `corrigida` | Desfazer correção |

- O formulário inline de cancelamento/correção já existe — só expor os gatilhos.
- **Badge "Em borderô"** (amber) no cabeçalho do card quando `em_bordero` — visível sem expandir; expandindo, o box de borderô lê o **cache** primeiro (`bordero_checked_at`), com botão "reverificar agora" (lazy call existente como fallback/refresh).
- Card `cancelado` mostra `monitor_status` traduzido: "Aguardando exclusão no ERP" · "Excluída — aguardando re-lançamento" · "Re-lançada — confere com o XML" (verde) · "Re-lançada — ainda divergente" (vermelho) · "Erro ao monitorar".

### 5.2 `/borderos` — página Contas a Pagar (F2)

- Sidebar: novo item **Borderôs** (ícone `Landmark`), módulo `borderos`, `SECTOR_VIEWS['contas-pagar']` += `'borderos'`, categoria Operacional.
- Conteúdo = **somente** a fila: tabela NF, fornecedor (nome + código), CNPJ, valor, emissão, empresa, status fiscal (Erro confirmado / Cancelada), borderô nº + data + banco/agência/conta, flag **Paga** (linha travada, tooltip "título já baixado — requer estorno, não remoção"), ações: `Abrir no portal` (redirect) · `Ver doc` · `Confirmar remoção` (modal com obs opcional).
- Toggle "Mostrar resolvidas" pra ver removidas/pagas/confirmadas recentes.
- Header da página: "Atualizado há X min" + botão "Reverificar agora" (chama refresh — autorizar `borderos` na rota de refresh ou criar `/api/borderos/refresh` espelho).
- **Zero** ação fiscal aqui — nada de confirmar erro/cancelar.

### 5.3 `/novidades` (F4)

Port do Portal Documentos: timeline vertical por versão, badges coloridas por tag (`feat`/`improve`/`fix`), edição inline admin (adicionar versão, editar, excluir). Sidebar com `unreadDot` (localStorage `lastSeenChangelog` — ver D2).

### 5.4 `/historico` (F4)

Port do Portal: filtros debounced (usuário, ação [dropdown das actions existentes], tipo de entidade, período), tabela paginada (25/pág) com badges por família de action (`fiscal.*` azul, `quinzena.*` índigo, `relatorio.*` verde/vermelho, `bordero.*` amber, `changelog.*` cinza, `auth.*` slate), expansão do `details` JSON. Labels PT-BR amigáveis por action (mapa `ACTION_LABELS`). Link do sidebar: label "Histórico", módulo `audit-log` (ou novo `historico` — D5).

---

## 6. Regras de negócio

### F1 — Batch de borderô (`lib/fiscal/bordero-monitor.ts` → `syncBorderoStatus()`)

- **Alvo**: `fiscal_notas` com `review_status IN ('pendente','falha_tecnica','confirmado_erro','cancelado')` **OR** nota com linha `em_bordero=true` (continua vigiando até detectar remoção/pagamento, mesmo depois de corrigida).
- Execução: a cada warmCycle (45min) — atrás de `getSetting('bordero_last_run')` com jitter pra não colidir com syncConferencia.
- Agrupamento por empresa (`extra->>'empresa'` → tenant). Uma query SEA por tenant com `EA_NUM IN (docs)`; match client-side por (doc, série, fornecedor, loja) normalizados.
- **Fornecedor por tipo** (corrige o bug): mercadoria/vexpenses → `fornecedor` (código); servico → `extra.fornecedor_cod || extra.recno`. Se faltar código → pula e marca `check_error`.
- Upsert em `fiscal_bordero_status`; transições:
  - SEA apareceu → `em_bordero=true`, zera `removida_detectada_at`.
  - SEA sumiu onde antes `em_bordero=true` → `em_bordero=false`, `removida_detectada_at=NOW()`, `logAudit('fiscal.bordero_removida_auto')` + `upsertNotification` pra usuários fiscais (`dedupKey='fiscal:bordero:{nota_id}'`).
  - `E2_BAIXA` preenchida → `pago=true` (notifica também — nota em borderô paga muda o tratamento).
- Erros TOTVS: guarda `check_error`, **não** sobrescreve `em_bordero`/`borderos` (cache resiliente).

### F2 — Acesso contas a pagar

- Novo módulo `borderos` (label "Borderôs — Contas a Pagar"). Fora de `RESTRICTED_MODULES` (concessão livre pelo admin).
- Grants: usuários do setor recebem `borderos` no `allowed_modules` + `sector_view='contas-pagar'` (já filtra o resto da nav).
- Escopo estrito: só veem notas `em_bordero` pendentes de remoção. **Não** veem fila fiscal, histórico, nem detalhes de checks.
- Escrita: `POST /api/borderos/confirmar-remocao` — role `usuario` permitido (module-gated, não precisa de exceção gestor).

### F3 — Monitor de canceladas (`lib/fiscal/cancelada-monitor.ts` → `syncCanceladaMonitor()`)

- **Alvo**: `review_status='cancelado'` && `cancelled_at > NOW() - INTERVAL '180 days'` (janela de vigilância; configurável via setting).
- Cadência: warmCycle junto ao borderô (mesma passada TOTVS — `syncFiscalMonitor` chama os dois).
- Por nota:
  1. `fetchNfByIdentidade(doc, serie, fornecedorCodigo, loja, empresa)` — nova query em `lib/conferencia/totvs.ts`: SF1 (incluindo `D_E_L_E_T_`, `F1_DTDIGIT`) + SD1 da nota exata, sem janela de data.
  2. Sem SF1 ativa → `monitor_status='excluida'` (aguardando re-lançamento).
  3. SF1 ativa:
     - fingerprint igual ao gravado → `monitor_status='aguardando_exclusao'` (ainda não mexeram — a nota cancelada no dash continua lançada).
     - fingerprint **mudou** → re-lançamento. Se houver XML em cache (`doc_cache`), roda `compareNf(header, items, xml, tesOverride)`:
       - match total → `monitor_status='relancada_ok'`
       - divergente → `monitor_status='relancada_divergente'` (checks novos em `monitor_detail.checks_recompare`)
       - sem XML → `monitor_status='relancada_divergente'` conservador? Não: `relancada_pendente` — fingerprint mudou mas não dá pra afirmar. **Usar `relancada_divergente` apenas com compare real; sem XML → `relancada_pendente`** (adicionar ao enum).
  4. Transição pra `relancada_*` → `upsertNotification` usuários com módulo `fiscal` (`dedupKey='fiscal:relancada:{nota_id}'`, link `/fiscal?nota={id}`), `logAudit('fiscal.relancada_detectada')`.
  5. `excluida` → aparece `relancada_*`: mesma notificação.
- Nunca muda `review_status` sozinho — o humano confirma "corrigida" (D1).

### F0 — Paridade

- Mesma máquina de estados, mesma `revisar()`. Nenhuma regra nova — só renderização.

### F4

- Changelog: GET aberto a logados; mutações admin (`x-user-role==='admin'` na rota). Seed `ON CONFLICT DO NOTHING`.
- Histórico: mesmo grant `audit-log`; leitura apenas.

---

## 7. Fluxos

### Fluxo A — tratar nota com erro (caminho feliz)
1. Fiscal vê card na fila (badge "Em borderô" se aplicável).
2. Confirma erro → Teams + `resultados_conferencias`.
3. Batch de borderô marca a nota → entra na fila `/borderos` do contas a pagar.
4. AP abre no portal, remove o título no Protheus, clica "Confirmar remoção" (ou o auto-detect pega na próxima passada).
5. Fiscal cancela a nota no dash (status `cancelado`) → monitor entra em cena.
6. ERP exclui e re-lança → monitor detecta `relancada_ok/divergente` → notificação no sino.
7. Fiscal expande, vê compare novo, marca "corrigida" (corrigida_de='cancelado'). Fim.

### Fluxo B — nota paga antes da remoção
Batch detecta `E2_BAIXA` → `pago=true` → notificação "nota em borderô foi paga — requer estorno" + linha na `/borderos` com flag Paga.

### Fluxo C — contas a pagar
Login → sidebar só mostra itens do setor + Borderôs → fila de remoção → portal/doc → confirmar.

---

## 8. Fases

### P0 (MVP)
- F0: paridade de ações no kanban + badge borderô no card.
- F1: tabela + `syncBorderoStatus` no warmCycle + cache no box expandido + fix do fornecedor servico.
- F2: módulo `borderos`, página `/borderos`, rotas `/api/borderos/*`, concessão pra usuários AP.

### P1
- F3: fingerprint + `fetchNfByIdentidade` + `syncCanceladaMonitor` + notificações + chip no card.
- F4: `/novidades` completo (tabela, rotas, seed, dot).

### P2
- F4: `/historico` amigável sobre audit_log.
- Server-side `lastSeenChangelog` (por usuário, cross-device).
- Re-verificação manual por nota na `/borderos` (refresh single).
- Digest Teams semanal de canceladas sem re-lançamento.

---

## 9. Decisões abertas

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | `relancada_ok` auto-marca `corrigida`? | (a) só flag+notifica (b) auto-transição | **(a)** — compare pode ter falso-positivo em borda (CST/TES); humano confirma. |
| D2 | Unread dot do changelog | (a) localStorage (b) pref server-side | **(a) no P1**, (b) no P2 (Portal usa pref; localStorage é metade do código). |
| D3 | Módulo pra contas a pagar | (a) novo `borderos` (b) `fiscal` + filtro duro | **(a)** — module-gate por prefixo já existe; filtro dentro de `fiscal` vazaria fila/checks. |
| D4 | Fila AP some no ack manual ou no auto-detect? | (a) some no ack (b) fica até SEA sumir | **(a)** — o trabalho deles é "remover", não "garantir que o ERP refletiu"; auto-detect é backstop pra quem esquece de clicar. |
| D5 | `/historico` — grant | (a) módulo `audit-log` existente (b) novo `historico` | **(a)** — mesmos dados, grant já restrito; renomear label na sidebar pra "Histórico". |
| D6 | Canceladas de `servico`/`vexpenses` no monitor | (a) todas (b) só mercadoria | **(a)** — serviço também é SF1; vexpenses monitora por chave. Se `fetchNfByIdentidade` não achar, `erro_monitor` e segue. |
| D7 | Quem recebe notificação de relançamento | (a) users com módulo fiscal (b) quem cancelou | **(a)**, com `body` citando quem cancelou. |
| D8 | Gestor pode confirmar remoção de borderô? | (a) sim (b) não | **(a)** — whitelist de escrita adiciona `/api/borderos` pra gestor, ou trata como usuario-module (seguir padrão atual: gestor read-only → **não**, manter read-only; revisar se pedirem). **Decidir na implementação.** |

---

## 10. Critérios de aceite

**F0**
- [ ] Card expandido na view `fila` (mercadoria E serviço) mostra exatamente as mesmas ações que no histórico, conforme tabela §5.1.
- [ ] Ações disparam `revisar()` idêntico — sem API nova, sem duplicar lógica.
- [ ] Badge "Em borderô" visível sem expandir quando cache diz `em_bordero`.

**F1**
- [ ] `fiscal_bordero_status` criada via ensure; `syncBorderoStatus` roda no warmCycle (log `[bordero] checked=N em_bordero=M`).
- [ ] Nota de serviço com título em SEA aparece `em_bordero` (bug do fornecedor corrigido).
- [ ] Remoção no Protheus → próxima passada marca `removida_detectada_at` + notificação.
- [ ] Falha TOTVS não zera o cache (`check_error` preenchido, estado anterior preservado).

**F2**
- [ ] Usuário só-`borderos` faz login: sidebar mostra Borderôs (+itens do setor), `/fiscal` e `/api/fiscal/*` retornam 403.
- [ ] `/borderos` lista apenas `em_bordero` pendentes; confirmar remoção grava audit + some da fila.
- [ ] Nota paga aparece com flag e não permite confirmação cega (aviso de estorno).

**F3**
- [ ] Nota cancelada → SF1 excluída → `monitor_status='excluida'`.
- [ ] Re-lançamento idêntico → `relancada_ok` + notificação; divergente → `relancada_divergente` com checks novos.
- [ ] Sem re-lançamento: `aguardando_exclusao`; chip correto no card.
- [ ] Nenhum `review_status` alterado pelo monitor.

**F4**
- [ ] `/novidades` lista versões do seed + CRUD admin; dot some após abrir a página.
- [ ] Edição no banco sobrevive a deploy (seed `ON CONFLICT DO NOTHING`).
- [ ] `/historico` pagina audit_log com filtros funcionando.

---

## 11. Plano E2E

1. **F0**: Playwright — login fiscal → `/fiscal` view mercadoria → expandir card `confirmado_erro` → assert botões "Marcar corrigida"/"Cancelar nota" → clicar e validar transição (nota de teste).
2. **F1**: probe no VPS (`_probe_bordero.py` padrão paramiko) — rodar `syncBorderoStatus()` via node + `worker-dist` → `SELECT * FROM fiscal_bordero_status`; seedar nota com SEA conhecida → assert em_bordero; remover SEA? (não podemos — assert via nota que sabemos estar fora).
3. **F2**: criar usuário teste só-`borderos` → Playwright login → assert nav restrita + fila + confirmar-remocao → assert `audit_log` + sumiu da fila.
4. **F3**: escolher nota cancelada real → rodar `syncCanceladaMonitor()` via probe → assert fingerprint gravado e status; simular re-lançamento alterando fingerprint gravado (UPDATE manual) → próxima passada deve detectar `relancada_*` + notificação no sino.
5. **F4**: GET `/api/changelog` (seed) → POST versão teste → PATCH → DELETE; Playwright dot na sidebar.
6. Regressão: `npm run build` limpo; `pm2 restart dashboard-financeiro`; health 200; worker não quebra no ciclo (log pm2).

---

## 12. Arquivos tocados (previsão)

| Arquivo | Mudança |
|---|---|
| `app/fiscal/page.tsx` | F0 paridade + badge + chip monitor (~remover gate, reordenar bloco) |
| `lib/fiscal/bordero-monitor.ts` | **novo** — batch F1 |
| `lib/fiscal/cancelada-monitor.ts` | **novo** — F3 |
| `lib/conferencia/totvs.ts` | +`fetchNfByIdentidade`, +`fetchBorderoBatch` (versão IN) |
| `lib/fiscal/fiscal-db.ts` | ensure das novas colunas/tabela |
| `app/api/fiscal/fila/route.ts` | join bordero_status |
| `app/api/borderos/**` | **novo** — 5 rotas |
| `app/borderos/page.tsx` | **novo** — página AP |
| `worker/sync-worker.ts` | `syncFiscalMonitor` no warmCycle |
| `middleware.ts` | `API_MODULE_MAP` + `/api/borderos`, `/api/changelog` |
| `lib/auth/auth.ts` | `MODULES`/`DEFAULT_MODULES` + `borderos`, `novidades` |
| `lib/nav-views.ts` | `SECTOR_VIEWS['contas-pagar']` += borderos; view do item |
| `components/sidebar.tsx` | itens Borderôs, Novidades (unreadDot), Histórico |
| `lib/changelog/seed.ts` + `app/api/changelog/**` + `app/novidades/page.tsx` | **novo** — F4 |
| `app/historico/page.tsx` + `app/api/historico/route.ts` | **novo** — F4 |
| `app/api/fiscal/doc` + `portal-link` | extrair corpo pra lib (reuso em `/api/borderos`) |
| `lib/sync/notifications.ts` | reuso direto |

Deploy usual: rsync fontes `.ts` → `npm run build` no VPS → `pm2 restart dashboard-financeiro` (+ worker já roda compiled — `worker-dist` commitado).
