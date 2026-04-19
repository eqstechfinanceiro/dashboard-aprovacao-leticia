# Plano do Dashboard VExpenses — EQS (Letícia)

Este documento lista **todas as funcionalidades, abas, menus, botões, KPIs e cálculos** previstos para o dashboard. É o blueprint que vai guiar a implementação.

Base de dados: API pública VExpenses v2 (ver [`API-VExpenses.md`](./API-VExpenses.md)).
Fórmulas de saldo de caixa: ver [`Cash-Balance-Calculation.md`](./Cash-Balance-Calculation.md).

---

## 1. Objetivo do produto

Substituir/centralizar as atividades que hoje são feitas no painel oficial do VExpenses, entregando:

- **Velocidade** — dashboards carregados em segundos (cache agressivo no servidor).
- **Visão 360°** — aprovações, despesas, caixa, relatórios e colaboradores em um só lugar.
- **Insights acionáveis** — KPIs financeiros, tempo médio de aprovação, ranking por setor/colaborador.
- **Automação assistida por IA** — sugestões contextuais (ex.: "aprovar em lote relatórios de baixo risco", "colaborador X está há 15 dias sem enviar prestação").
- **Ações diretas** — aprovar, pagar, questionar, exportar, tudo sem sair do dashboard.

---

## 2. Stack técnica

| Camada | Escolha | Por quê |
|--------|---------|---------|
| Framework | **Next.js 14 (App Router) + TypeScript** | SSR/Server Components mantêm o `VEXPENSES_TOKEN` no servidor. |
| Estilo | **Tailwind CSS + shadcn/ui** | Design system pronto, acessível, dark mode, polido. |
| Gráficos | **Tremor + Recharts** | Componentes financeiros prontos (donut, bar, line, KPI cards). |
| Tabelas | **TanStack Table** | Ordenação, filtros e paginação em client-side para UX fluida. |
| Data fetching | **TanStack Query** (client) + `fetch` em Server Actions | Cache e revalidação evitando estourar o rate-limit de 100 req/min. |
| Formulários | **React Hook Form + Zod** | Validação tipada de aprovações e pagamentos. |
| IA | **Vercel AI SDK** + modelo a escolher (OpenAI/Claude) | Rules engine + resumos e sugestões em linguagem natural. |
| Persistência local | **SQLite via Drizzle ORM** (ou Supabase/Postgres em produção) | Histórico de advances (`POST /v2/advances` não tem `GET`), anotações internas, snapshots. |
| Autenticação do app | **NextAuth.js** (email magic-link + Google Workspace da EQS) | Só usuários autorizados entram. |
| Deploy | **Vercel** (preview automático por PR) | Zero-config, SSL, edge network. |

### Arquitetura de dados

```
Browser (React)
   │ GET /api/… (next.js route handler)
   ▼
Next.js Server
   │ uses VEXPENSES_TOKEN (env var, server-side only)
   │ caches responses (30–300s) via React Cache/revalidateTag
   ▼
VExpenses API v2   +   Local DB (SQLite/Postgres)
                         └─ advances history, notes, snapshots, AI memory
```

O token **nunca** chega ao navegador.

---

## 3. Layout geral

```
┌────────────────────────────────────────────────────────────────┐
│  Top bar: Logo EQS │ Busca global │ Filtros globais │ 🔔 │ IA │ │
├────────┬───────────────────────────────────────────────────────┤
│        │                                                       │
│ Side   │  Conteúdo da aba ativa                                │
│ nav    │                                                       │
│        │                                                       │
│        │                                                       │
└────────┴───────────────────────────────────────────────────────┘
```

### 3.1 Top bar (barra superior)

| Elemento | Função |
|----------|--------|
| **Logo EQS** | Link para Visão geral |
| **Busca global** (⌘K) | Busca cross-entities: colaborador, relatório, despesa, centro de custo, projeto |
| **Filtros globais** | Período (hoje / 7d / 30d / trimestre / ano / custom), Empresa pagadora, Centro de custo, Projeto — persistidos no `localStorage` |
| **🔔 Notificações** | Itens pendentes: "N relatórios aguardando sua aprovação", "X colaboradores com saldo negativo" |
| **🤖 IA Assistente** | Drawer lateral com sugestões e chat contextual |
| **👤 Perfil** | Usuário logado, preferências, logout |
| **☾ / ☀** | Toggle dark mode |

### 3.2 Side nav (menu lateral)

| Ícone | Aba | Rota | Descrição curta |
|-------|-----|------|-----------------|
| 🏠 | **Visão geral** | `/` | KPIs do mês, alertas, highlights |
| ✅ | **Aprovações** | `/aprovacoes` | Fila de aprovação (meus + todos) |
| 📄 | **Relatórios** | `/relatorios` | Lista completa, filtros, status |
| 💸 | **Despesas** | `/despesas` | Drill-down por despesa |
| 💰 | **Caixa / Adiantamentos** | `/caixa` | Saldo por colaborador, a pagar/receber |
| 👥 | **Colaboradores** | `/colaboradores` | Cadastro, perfil individual, histórico |
| 🏢 | **Centros de custo** | `/centros-custo` | Visão por CC |
| 🧱 | **Projetos** | `/projetos` | Visão por projeto |
| 📊 | **Análises** | `/analises` | Gráficos avançados, tempo médio, forecasting |
| 🤖 | **IA Consultora** | `/ia` | Página dedicada da IA (conselhos, regras programáveis) |
| ⚙️ | **Configurações** | `/configuracoes` | Token, usuários do app, regras da IA |

---

## 4. Abas detalhadas

### 4.1 Visão geral (`/`)

Hero com KPI cards + timeline de pendências.

**KPIs do mês atual** (row de cards no topo, 6 cards):

1. **Relatórios aguardando aprovação** (`status=ENVIADO`) — badge colorido se > limite configurável
2. **Valor total a aprovar** (Σ `value` das despesas de relatórios ENVIADO)
3. **Tempo médio de aprovação** (dias entre `history.sent` e `history.approved` — média dos últimos 30d)
4. **Relatórios pagos no mês** (`status=APROVADO AND payment_date ∈ mês`)
5. **Valor total pago no mês**
6. **Saldo consolidado da empresa** (Σ saldo de todos os colaboradores, ver §6)

**Segunda linha — alerts**:
- "X colaboradores com saldo devedor" (clicável → filtra Caixa)
- "Y relatórios há mais de N dias sem aprovação" (clicável → filtra Aprovações)
- "Z despesas com rateio não configurado"

**Gráficos:**
- **Line chart**: valor aprovado × valor pago por mês (últimos 12 meses)
- **Bar chart**: top 10 centros de custo por valor de despesa no mês
- **Bar chart horizontal**: top 10 colaboradores por valor de despesa no mês
- **Donut**: distribuição de despesas por tipo (expense_type)
- **Stacked bar**: status de relatórios (ABERTO / ENVIADO / APROVADO / REPROVADO / REABERTO) no tempo

**Botões de ação rápida** (hero):
- "Aprovar em lote" → abre seleção em `/aprovacoes`
- "Exportar visão do mês" → XLSX com todas as métricas + listas
- "Abrir IA consultora" → abre drawer da IA já com contexto do mês

---

### 4.2 Aprovações (`/aprovacoes`)

**Sub-tabs:**
1. **Minha fila** — só relatórios onde o usuário logado é `approver` no passo atual (usa `approval_flows.steps[].groups[].approvers`)
2. **Fila geral** — todos em `status=ENVIADO`
3. **Reabertos / Reprovados** — `REABERTO` + `REPROVADO` (para follow-up)
4. **Histórico** — `APROVADO` + `PAGO`

**Tabela principal** (com filtros por status, CC, projeto, colaborador, período):

| Coluna | Descrição |
|--------|-----------|
| ID | `report.id` |
| Colaborador | `user.name` |
| Descrição | `report.description` |
| Centro de custo | via `paying_company_id` |
| Etapa | nome da etapa do fluxo (`approval_stage_id`) |
| Valor | Σ despesas |
| Nº despesas | count |
| Enviado há | `now - history.sent.timestampEvento` |
| Ações | ver detalhes / aprovar / reprovar / pagar / exportar |

**Painel lateral ao clicar numa linha** (drawer):
- Cabeçalho com status badge, valor total, botões: ✅ Aprovar • ❌ Reprovar • 💰 Pagar • 📄 PDF • 📊 Excel
- Timeline das etapas (aprovações passadas, atuais, pendentes)
- Lista de despesas aninhadas, cada uma com preview do comprovante (`reicept_url`)
- **Verificação automática de saldo** (do colaborador) antes de aprovar — veja §6
- Campo de comentário + botão "Aprovar" / "Reprovar"

**Aprovação em lote:**
- Checkbox por linha + barra flutuante "Aprovar N selecionados"
- Regra de segurança: só permite aprovar em lote relatórios da "Minha fila" que passarem na verificação de saldo e em regras customizáveis ("valor < X", "colaborador sem pendências", etc.)
- Confirmação obrigatória com número de relatórios e valor total

**Botões do menu superior da aba:**
- "Regras de aprovação automática" → abre `/configuracoes#regras`
- "Exportar fila (XLSX)"
- "Sincronizar" (força refresh do cache)

---

### 4.3 Relatórios (`/relatorios`)

**Filtros de topo:**
- Período (`created_at` ou `approval_date`)
- Status (multi-select)
- Colaborador (autocomplete)
- Centro de custo
- Valor min/max
- Paging method, has observation, has justification, etc.

**Tabela** (igual à de Aprovações mas sem sub-tabs):
- Todas as colunas + export XLSX/CSV e saved views

**Detalhe do relatório (`/relatorios/:id`):**
- Header: status, aprovadores, datas, botões (PDF/Excel/Pagar/Reabrir)
- Abas internas:
  - **Despesas** — lista todas as despesas com rateio expandido
  - **Fluxo de aprovação** — timeline com cada `approval` e `history` event
  - **Anexos** — galeria dos `reicept_url` (lightbox)
  - **Rateio** — pie chart por `reimbursable_company_id`
  - **Mapa** (se houver `gps` no expense) — pinos das despesas
  - **IA** — resumo gerado da "saúde" do relatório

**Ações:**
- Aprovar • Reprovar • Pagar • Reabrir • Duplicar • Exportar

---

### 4.4 Despesas (`/despesas`)

Mesma lógica de Relatórios, mas a unidade é `Expense`.

**Filtros:**
- Período (`date`)
- Tipo de despesa
- Colaborador
- Relatório (pai)
- Centro de custo
- Método de pagamento
- `reimbursable` (sim/não)
- `rejected` (sim/não)
- Moeda
- Valor min/max
- Com/sem comprovante

**Visualizações:**
- **Tabela** (padrão)
- **Galeria** (cards com comprovante)
- **Mapa** (usando `gps` via `include=gps`)

**Bulk actions:**
- Exportar CSV/XLSX
- "Rejeitar selecionadas" (via API quando habilitada)
- "Marcar para revisão da IA"

---

### 4.5 Caixa / Adiantamentos (`/caixa`)

**Esta é a aba crítica mencionada pela Letícia.** Ver §6 e o doc [`Cash-Balance-Calculation.md`](./Cash-Balance-Calculation.md) para a fórmula exata.

**Cards do topo:**
- Saldo líquido global (Σ saldo colaboradores)
- Total em adiantamentos pendentes de prestação
- Colaboradores devedores
- Colaboradores credores
- Adiantamentos liberados no mês
- Prestações aprovadas no mês

**Tabela de colaboradores:**

| Coluna | Fonte |
|--------|-------|
| Colaborador | `user.name` + avatar |
| Centro de custo / Fluxo | `user.approval_flow_id` / `costsCenters` |
| **Adiantamentos recebidos** (Σ) | Registros locais de `POST /v2/advances` + reports com `include=advance` |
| **Consumo em despesas não-reembolsáveis** | Σ `expense.value` onde `payment_method.affects_advance=true` e `reimbursable=false` |
| **A receber (empresa → colaborador)** | Σ `expense.value` onde `reimbursable=true` e relatório `APROVADO` mas `payment_date IS NULL` |
| **Saldo líquido** | fórmula no §6 |
| **Status** | `DEVEDOR` / `QUITADO` / `CREDOR` (badge colorido) |
| **Última movimentação** | max data entre advances e expenses |
| **Ações** | "Liberar adiantamento" (bloqueado se devedor), "Solicitar prestação", "Ver extrato" |

**Filtros** (resposta direta ao pedido do usuário):
- "Mais devedores primeiro" / "Mais credores primeiro"
- "Sem movimentação há mais de N dias"
- "Com saldo acima/abaixo de R$ X"
- Centro de custo / Projeto / Tipo de usuário

**Drill-down do colaborador (`/caixa/:user_id`):**
- **Extrato** em formato contábil: data × histórico × entrada × saída × saldo acumulado
- Linha por linha:
  - Adiantamento creditado (`Advance.value`)
  - Despesa debitada (`expense.value` se `affects_advance`)
  - Reembolso pago (`expense.value` se `reimbursable` e `payment_date`)
- **Botão "Liberar adiantamento"** (abre modal):
  - Valida saldo primeiro — se DEVEDOR, mostra alerta ⚠ "Colaborador está devendo R$ X. Liberar mesmo assim?"
  - Campos: descrição, data, valor, moeda, `creator_user_id` (auto, usuário logado)
  - Ao confirmar, chama `POST /v2/advances` + salva cópia no DB local

**Gráficos:**
- Line: saldo consolidado da empresa ao longo do tempo
- Bar: top 20 colaboradores por saldo absoluto (verde credor / vermelho devedor)
- Heatmap: centros de custo × meses por volume de caixa

---

### 4.6 Colaboradores (`/colaboradores`)

**Tabela** com todos os campos relevantes de `User` + coluna de saldo calculado.

**Detalhe do colaborador (`/colaboradores/:id`):**
- Ficha cadastral (dados pessoais, bancários, vínculos)
- Extrato de caixa (atalho para `/caixa/:id`)
- Histórico de relatórios (aprovados, reprovados, abertos)
- Gráfico de despesas mensais
- Centros de custo e projetos vinculados (`include=costsCenters,projects`)
- Fluxo de aprovação a que pertence (`approval_flow_id` expandido)
- Parâmetros customizados (`parameters`)
- Ações: editar (`PUT /v2/team-members/:id`), desativar, vincular CC/Projeto

**Ações em lote:**
- Exportar ficha
- Enviar convite / resetar senha (se exposto)

---

### 4.7 Centros de custo (`/centros-custo`)

- Tabela: `id`, `name`, `integration_id`, vinculado a `approval_flow_id`, colaboradores ativos, nº relatórios no mês, valor total mês
- Detalhe: lista de relatórios/despesas desse CC, KPIs financeiros, comparativo com outros CC
- Ações: editar, ativar/desativar

### 4.8 Projetos (`/projetos`)

Mesma estrutura que Centros de custo (já que `Project` tem shape parecido) + campos de endereço/empresa.

### 4.9 Análises (`/analises`)

Dashboards analíticos mais profundos — filtros independentes, não condicionados pelo filtro global.

**Gráficos e relatórios:**

- **Tempo médio de aprovação por etapa** — boxplot por `approval_flows.steps[].order`
- **Tempo médio de aprovação por setor** (centro de custo) — ranking
- **Taxa de reprovação** — global e por colaborador/setor
- **SLA de aprovação** — % de relatórios aprovados em ≤ N dias (N configurável)
- **Sazonalidade** — despesas por mês/tipo
- **Curva ABC de despesas** — Pareto por tipo ou colaborador
- **Análise de rateio** — % médio por empresa em despesas rateadas
- **Volumetria de documentos** — nº de comprovantes sem OCR, com OCR, com erro
- **Forecast do mês** — projeção até fim do mês baseada no ritmo atual

**Export:**
- Qualquer gráfico → PNG/SVG/CSV
- Qualquer tabela → XLSX/CSV

---

### 4.10 IA Consultora (`/ia`)

**Objetivo:** transformar dados em conselhos acionáveis.

Duas partes:

#### 4.10.1 Regras programáveis (no-code, UI)

Editor visual (tipo Zapier) de condições → ações. Exemplos de regras prontas:

| Regra | Condição | Ação sugerida |
|-------|----------|---------------|
| Aprovar baixo risco | `valor < R$ 300` E `colaborador quitado` E `tipo ∈ [ALMOÇO, PEDAGIO]` | Sugerir aprovação em lote |
| Colaborador risco | `reprovações nos últimos 30d ≥ 3` | Alertar gestor |
| Adiantamento atrasado | `advance.release_date < 60d` E `sem prestação` | Criar notificação |
| Saldo inconsistente | `saldo devedor > R$ 5k` | Bloquear novos adiantamentos |
| Tempo excessivo | `relatório ENVIADO há > 7 dias` | Cutucar aprovador |
| Despesa duplicada | `mesmo valor + data + tipo no mesmo colaborador em 7d` | Sinalizar possível duplicata |

Cada regra: ativar/desativar, editar, testar ("ver matches atuais"), ver histórico de disparos.

#### 4.10.2 Chat contextual

Drawer + página. O modelo recebe como contexto:

- Filtros globais ativos
- Métricas do mês
- Dados do colaborador/relatório em foco (se houver)

Perguntas suportadas:

- "Quanto a empresa pagou de despesas reembolsáveis este mês?"
- "Qual colaborador tem mais relatórios reprovados?"
- "Quanto devo liberar de adiantamento para o ANDREY sem estourar o limite?"
- "Liste os 5 centros de custo com pior SLA de aprovação"
- "Resuma este relatório em 3 bullets"
- "Crie um email para o colaborador X pedindo prestação de contas"

Botões rápidos na home da aba:
- "Resumir o dia", "Sugerir aprovações em lote", "Detectar duplicatas", "Gerar email de cobrança"

### 4.11 Configurações (`/configuracoes`)

- **Conta VExpenses**: validar token, ver limites (`x-ratelimit-remaining`)
- **Usuários do app**: quem acessa o dashboard, papéis (admin, aprovador, auditor, leitor)
- **Regras da IA**: ver/editar
- **Notificações**: e-mail / Slack / Teams
- **Preferências**: moeda padrão, formato de data, timezone, valor-limite para alertas
- **Cache / Sincronização**: TTL do cache, forçar refresh
- **Export**: agendar export semanal por e-mail

---

## 5. Botões globais e atalhos

### Atalhos de teclado

| Tecla | Ação |
|-------|------|
| `⌘K` | Busca global |
| `g a` | Ir para Aprovações |
| `g c` | Ir para Caixa |
| `g r` | Ir para Relatórios |
| `?` | Mostrar cheat-sheet de atalhos |
| `a` | Aprovar item em foco |
| `x` | Reprovar item em foco |
| `j/k` | Navegar na tabela |

### Barra superior (resumo)

```
[EQS logo]  [🔍 Busca]  [📅 Período]  [Ctrl-K]   [🔔 3]  [🤖 IA]  [👤 LETICIA ▼]
```

---

## 6. Cálculo de saldo de caixa por colaborador

**Resposta direta ao pedido da Letícia:** o saldo serve para decidir se um colaborador pode receber um novo adiantamento.

Regras inferidas dos dados da API:

- Cada **expense** tem `payment_method` com dois flags:
  - `affects_advance: true` → a despesa consome o adiantamento (caixa) do colaborador.
  - `reimbursable: true` → a empresa deve reembolsar o colaborador.
- **Advances** (`POST /v2/advances`) são as entradas de caixa para o colaborador. Como não há `GET /v2/advances` público, mantemos um **log local** de cada advance criada pelo dashboard + consumimos `include=advance` em `/v2/reports` para os advances já existentes no VExpenses.
- Relatórios têm `status`, `approval_date` e `payment_date`.

Fórmula simplificada para cada colaborador:

```
Saldo = Σ Adiantamentos_recebidos
      − Σ Despesas_consumindo_caixa(aprovadas)   // payment_method.affects_advance && report.status = APROVADO
      + Σ Reembolsos_pagos_ao_colaborador        // reimbursable && payment_date != null
```

Leitura:

- `Saldo > 0` → **DEVEDOR** (colaborador está com dinheiro da empresa que ainda não prestou contas). **Bloqueia** novos adiantamentos por padrão.
- `Saldo = 0` → **QUITADO**.
- `Saldo < 0` → **CREDOR** (a empresa deve reembolsos ao colaborador).

Consulte [`Cash-Balance-Calculation.md`](./Cash-Balance-Calculation.md) para os casos de borda (despesas em análise, relatórios reabertos, reembolsáveis não pagos, conversão de moeda, rateios).

---

## 7. Não-funcional

- **Performance**: meta de FCP < 1.5s em 3G, TTI < 3s. Paginação + SWR + cache de 5 min em rotas pesadas.
- **Segurança**:
  - Token só no servidor.
  - Autenticação do dashboard com 2FA obrigatório.
  - Logs de auditoria de toda ação de escrita (`approve`, `pay`, `advance`).
- **Acessibilidade**: WCAG AA (shadcn/ui já é acessível por padrão).
- **Internacionalização**: PT-BR primário, EN secundário (formatos de número, data, moeda via `Intl`).
- **Dark/Light**: ambos, persistido por usuário.
- **Responsivo**: desktop-first, mas tabelas viram cards em ≤ md.

---

## 8. Roadmap de entrega sugerido

| Sprint | Entrega |
|--------|---------|
| **0 — Fundação** | Bootstrap Next.js + shadcn/ui + auth + proxy da API + layout base com top bar e side nav |
| **1 — Visão geral + Relatórios** | Home com KPIs do mês + aba Relatórios (lista + detalhe) |
| **2 — Aprovações** | Minha fila, ações de aprovar/reprovar/pagar, aprovação em lote |
| **3 — Caixa** | Modelo de dados local + cálculo de saldo + aba Caixa + liberação de adiantamento |
| **4 — Despesas** | Drill-down de despesas, galeria de comprovantes, mapa |
| **5 — Análises** | Gráficos avançados, tempo médio de aprovação, exports |
| **6 — IA** | Regras programáveis + chat contextual |
| **7 — Polish** | Acessibilidade, performance, mobile, testes E2E |

---

## 9. Próximos passos

1. Validar este plano com a Letícia (ajustes, remoções, prioridades).
2. Merge deste PR.
3. Iniciar Sprint 0 (bootstrap do Next.js + sidebar + primeira chamada à API).
