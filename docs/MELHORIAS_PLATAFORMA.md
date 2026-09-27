# Plano de Melhorias — Portal Financeiro Aery

> **Status (set/2026) — implementado e em produção:**
> - ✅ A1.3 audit_log — tabela + `logAudit()` + `/audit-log` (freeze, aprovações, impacto, usuários, import QZ)
> - ✅ A2.1 sync-health — `/sync-health` + `/api/sync-health` (timeline HOT/WARM/COLD, erros, frescor)
> - ✅ A2.2 falha de sync notifica admins (notificação in-app, dedup por ciclo)
> - ✅ A4.3 pré-freeze checklist — `/api/quinzena-precheck` + modal (11 checks, erro bloqueia)
> - ✅ A4.4 diff pós-freeze — `/api/quinzena-diff` + modal (snapshot × recálculo)
> - ✅ B5 reconciliação extrato × prestação — `/api/quinzena-reconcile` + modal
> - ✅ C1/B2 central de notificações — tabela `notifications`, sino unificado, digest de aprovações + prestação parada 30d
> - ✅ Testes de fórmulas — `lib/quinzena/financials.test.ts` (17 testes, `npm run test:quinzena`)
> - ✅ B1 parcial — quinzena de um clique: `POST /api/quinzena-fechar` (precheck → freeze → XLSX em `private-downloads/` → notificação com download); falta o disparo por agenda

> Documento produzido após investigação completa da codebase (16 páginas, ~85 rotas
> de API, 2 workers PM2, integrações VExpenses/SharePoint/e2doc/Gemini OCR).
> Organizado por: **(A)** robustez da estrutura atual, **(B)** automações que tiram
> carga de trabalho das pessoas, **(C)** funcionalidades novas/inovadoras.
> Cada item traz impacto, esforço estimado e prioridade sugerida.

---

## A. Robustez e estrutura atual

### A1. Segurança — correções urgentes

| # | Problema encontrado | Melhoria | Impacto | Esforço |
|---|---|---|---|---|
| A1.1 | `JWT_SECRET` tem fallback `'dev-secret-change-in-production'` em `lib/auth/auth.ts` e `middleware.ts` | Falhar na inicialização se `JWT_SECRET` não estiver definido em produção (`if (!secret && NODE_ENV==='production') throw`) | **Crítico** — hoje qualquer um pode forjar tokens se souber o fallback | 30min |
| A1.2 | Login `/api/auth/login` sem rate-limit, sem lockout, sem log de tentativas | Contador de tentativas por email/IP em tabela `auth_attempts` — bloqueio de 15min após 5 falhas + registro de IP/user-agent | **Alto** — força bruta hoje é ilimitada | 2h |
| A1.3 | **Zero trilha de auditoria** — não existe tabela registrando quem aprovou/reprovou/congelou/exportou | Tabela `audit_log` (actor_id, ação, entidade, entity_id, antes/depois JSON, IP, timestamp) gravada nas rotas de approve/reject/freeze/status/patch de usuários | **Crítico** — em operação financeira, "quem aprovou esse relatório?" precisa ter resposta | 4h |
| A1.4 | `SUPORTE_ADMIN_EMAIL` hardcoded em `lib/suporte/db.ts` | Mover para `app_settings` ou env (`SUPPORT_ADMIN_EMAIL`) com fallback — hoje exige deploy pra trocar o responsável | Médio | 30min |
| A1.5 | Tokens JWT de 7 dias, sem revogação — usuário desativado continua com token válido | Checar `user.active` e `must_change_password` no banco a cada request crítico (ou denylist curta em cache) + encurtar expiração | **Alto** | 2h |
| A1.6 | Credenciais VExpenses commitadas no histórico git (já documentado em REFORMULACAO.md) | Rotacionar `VEXPENSES_API_KEY`, `LARAVEL_TOKEN`, `DATABASE_URL` | **Crítico** — dívida conhecida | 1h |
| A1.7 | Sessão compartilhada por cookie no mesmo host entre apps (porta 3000 × 3002 causam interferência) — observado em testes | Considerar prefixo de cookie por app (`vexp_auth_token` vs `portal_auth_token`) ou hosts distintos | Médio | 1h |

### A2. Observabilidade — hoje estamos "cegos" em produção

| # | Situação | Melhoria | Impacto | Esforço |
|---|---|---|---|---|
| A2.1 | `sync_runs` e `sync_run_errors` são gravados pelo worker mas **não têm nenhuma UI** — falhas ficam invisíveis até alguém reclamar | Página `/admin/sync-health` (só admin): timeline dos ciclos HOT/WARM/COLD, últimos erros, taxa de sucesso, gráfico de despesas sincronizadas por ciclo | **Alto** — uma quinzena errada nasce de um sync silenciosamente quebrado | 4h |
| A2.2 | Falha do worker/PM2 não notifica ninguém | Alerta automático: se `sync_runs` sem registro 'done' há >15min, ou ciclo termina 'error' → notificação in-app pro admin + (futuro) email/WhatsApp | **Alto** | 2h |
| A2.3 | Health endpoint existe (`/api/health`) mas não é monitorado externamente | Uptime check barato (cron externo ou UptimeRobot free) pingando a cada 5min; ou página de status interna que verifica: app, DB, worker vivo (heartbeat em `sync_runs`), token VExpenses válido, SharePoint conectado | Médio | 2h |
| A2.4 | Erros de frontend vão só pro console do usuário | Capturar `window.onerror`/React error boundary → gravar em `frontend_errors` → visível no painel de saúde | Médio | 2h |
| A2.5 | Logs do worker só no `pm2 logs` (volátil) | Rotacionar logs para arquivo/tabela; manter últimos N ciclos consultáveis na UI de sync-health | Baixo | 1h |

### A3. Qualidade e prevenção de regressão

| # | Situação | Melhoria | Impacto | Esforço |
|---|---|---|---|---|
| A3.1 | **Cálculos financeiros sem testes unitários** — `vexpenses-calculations.ts`, `quinzena-complete`, fórmulas de saldo/carga | Suite Vitest com casos reais já conhecidos (o erro de R$ 341, divergências de cartão, CPF edge-cases de name-resolve) — rodar em cada deploy | **Crítico** — regressão em cálculo = dinheiro errado | 6h |
| A3.2 | Só existem 2 specs Playwright (`auth`, `planilhas`) | Cobrir: login→módulos→403, quinzena freeze, posição de caixa (busca/filtros/Excel), suporte (permissões) | Alto | 4h |
| A3.3 | Sem CI — deploy é manual via scripts Python | GitHub Actions ou script único `deploy.sh`: typecheck → testes → build → upload → restart → health → rollback se health falhar | Alto | 4h |
| A3.4 | `worker/tsconfig.json` usa `include` explícito — arquivo novo fora da lista compila silenciosamente errado | Automatizar: `tsc -p worker --noEmit` no prebuild + validar que todo `lib/sync/*` está no include | Baixo | 30min |

### A4. Dados e integridade

| # | Problema | Melhoria | Impacto | Esforço |
|---|---|---|---|---|
| A4.1 | **`quinzena_controle_snapshot` está vazia** — `refreshCadastro` no WARM não encontra base pra popular (bug pré-existente identificado); cadastro real vem de `quinzena_cadastro` atualizado por tool manual (stale desde 25/08) | Corrigir o refresh pra popular a tabela, ou consolidar pra uma fonte só de cadastro — hoje a detecção de inativos depende da API `active=false` como gambiarra | **Alto** — cadastro desatualizado gera alerta errado e filtro Ativo/Inativo errado | 3h |
| A4.2 | Resolução nome→CPF depende de fuzzy match + aliases manuais (`lib/quinzena/name-resolve.ts`, `mapeamento_nomes.json`) | UI para revisar/salvar mapeamentos ambíguos uma única vez (tabela `name_aliases` editável) em vez de JSON no repo; logar matches de baixa confiança | Alto — match errado = saldo na pessoa errada | 4h |
| A4.3 | Freeze de quinzena não valida antes de congelar | **Relatório de pré-freeze**: ao clicar em congelar, rodar checklist automático (sync recente? despesas pendentes? divergências vs extrato? gestores faltantes?) e exigir confirmação listando os riscos | **Crítico** — é exatamente o medo do "freeze errado" | 4h |
| A4.4 | Sem comparação entre quinzenas congeladas | Diff entre freezes: "o que mudou entre o congelamento de hoje e o da última quinzena pra esse CPF" — detecta retroescritura de dados | Alto | 3h |
| A4.5 | Transações de cartão que liquidam tarde (late-settling) — COLD já cobre 30d, mas o **diff entre o que estava congelado e o que liquidou depois** não é destacado | Badge "mudou após freeze" na posição de caixa quando `saldo_cartao_hoje` diverge do congelado além de um threshold | Médio | 2h |

---

## B. Automações — tirar trabalho manual das pessoas

### B1. "Quinzena de um clique" (o objetivo final declarado) ✅ parcial (manual)

Hoje: gerar a quinzena envolve sync, checar dados, congelar, exportar Excel, revisar.

**Implementado (botão):** `POST /api/quinzena-fechar` orquestra precheck →
freeze → export XLSX → salva em `private-downloads/` → notifica admins com
link de download. O modal de pré-freeze virou o fluxo de um clique: confirmar
congela e gera a planilha, exibindo o botão "Baixar planilha da quinzena".
Idempotente (já congelada → re-exporta; notificação dedupada), auditado
(`quinzena.fechar`), bloqueia gestor e aborta em erros de precheck.

Falta (agenda): os passos 1 e 2 abaixo — disparo automático por cron no dia D
e relatório D-1.

1. **D-1 (véspera do fechamento)**: sync completo forçado + relatório de pré-freeze
   automático + alerta pro responsável: "amanhã fecha a quinzena; 3 pendências
   encontradas: X despesas sem OCR, Y divergências de extrato, Z inativos com saldo"
2. **Dia D, horário configurável**: sync → validação → freeze → geração do Excel →
   arquivo salvo + notificação "quinzena 09/2026-2ª pronta" com link de download
3. **Guard-rails**: se a validação falhar, **não congela** — dispara alerta com a
   lista de problemas pra correção humana
4. Fallback manual: botão "Gerar quinzena agora" executa o mesmo pipeline sob demanda

**Resultado:** o usuário literalmente só baixa o Excel pronto — como pedido.

Impacto: **Crítico** · Esforço: 1–2 dias · Prioridade: **P0**

### B2. Digest automático para gestores

Cada gestor recebe (in-app bell já existe; estender para email/WhatsApp):

- **Segunda-feira**: "Você tem N relatórios esperando sua aprovação (o mais antigo tem X dias)"
- **Inativo com saldo**: já existe in-app — falta canal externo pra quem não abre o dashboard todo dia
- **Pré-fechamento**: "Sua equipe tem R$ X a prestar contas e Y despesas sem comprovante"

Implementação: tabela `notification_channels` (email/whatsapp webhook) +
templates por tipo; fila de envio no worker (mesma infra de `comprovantes_runs`).

Impacto: Alto · Esforço: 4–6h · Prioridade: **P1**

### B3. Auto-rejeição / triagem de despesas inválidas

Hoje o auto-approve só aprova o que está 100% ok. O complemento:

- Despesa **sem comprovante** há >N dias → mover pra fila "devolver ao usuário" com
  comentário automático ("falta comprovante legível")
- OCR extraiu valor/data divergente do lançado → flag `suspeita_divergencia` +
  destaque na aprovação dinâmica
- Comprovante duplicado (mesma chave NF/mesma foto em outra despesa) → já existe
  `batch-duplicates` — promover pra alerta automático na fila do gestor
- Fim de semana/feriado em tipo de despesa incompatível (ex: "estacionamento" em
  domingo) → flag de revisão

Impacto: Alto · Esforço: 6h · Prioridade: **P1**

### B4. Lembretes automáticos de prestação de contas

- Funcionário com `caixas_abertos` e `dias_caixa_aberto > 30` → notificação semanal
  escalonada (30d aviso, 45d cobrança, 60d escala pro gestor + diretor)
- Mensagem gerada automaticamente com o detalhe (quanto falta prestar, qual caixa)
- Resolve boa parte dos R$ 127k parados em prestação que a investigação revelou

Impacto: Alto · Esforço: 3h · Prioridade: **P1**

### B5. Reconciliação automática extrato × prestação

Job no COLD (diário): para cada CPF, compara o que o extrato diz que foi gasto no
cartão vs. o que aparece prestado em relatórios — divergências viram alerta
"extrato sem prestação" / "prestação sem extrato" por valor e data.
Hoje essa conferência é feita manualmente na planilha.

Impacto: Alto · Esforço: 6h · Prioridade: **P1**

### B6. Follow-up de chamados de suporte

- Chamado `pendente` há >48h → lembrete pro responsável do suporte
- Resposta do suporte sem retorno do usuário há >7d → auto-concluir com mensagem
- Pesquisa de satisfação de 1 clique ao concluir (resolveu? 👍/👎)

Impacto: Médio · Esforço: 2h · Prioridade: P2

### B7. Cadastro e offboarding

- Inativo detectado na API (`active=false`) mas ainda aparecendo em
  approval-flows → alerta "inativo ainda consta como aprovador/participante de fluxo"
- Sugestão de fluxo de desligamento: zerar saldos → remover de fluxos → gerar
  relatório final do colaborador → checklist marcável

Impacto: Médio · Esforço: 4h · Prioridade: P2

---

## C. Funcionalidades novas e inovadoras

### C1. Central de notificações unificada

Hoje existem alertas de inativos (bell) — transformar num **notification center
genérico**: tipos (`inativo_com_saldo`, `sync_error`, `freeze_reminder`,
`chamado_respondido`, `quinzena_pronta`, `prestacao_atrasada`), severidade,
link de ação direta, e preferências por usuário (o que quer receber e por onde —
in-app/email/WhatsApp). É a espinha dorsal de quase todas as automações da seção B.

Impacto: Alto · Esforço: 4h · Prioridade: **P1** (habilita B2, B4, A2.2)

### C2. Assistente de quinzena com IA

No `quinzena-dinamica`/`quinzena-complete`, um painel lateral "Copiloto da
quinzena" (Gemini, já temos integração) que responde em linguagem natural:

- "Por que o saldo do João deu divergente?" → explica: carga X, gastou Y, extrato
  mostra Z no dia 12 depois do corte
- "O que falta pra essa quinzena fechar perfeita?" → checklist inteligente com
  os dados reais do momento
- "Resume o que mudou vs. quinzena passada" → diff narrado

Impacto: Alto (diferencial competitivo) · Esforço: 8h · Prioridade: P2

### C3. Score de saúde financeira por colaborador

Semáforo por pessoa na posição de caixa combinando: dias sem prestar, % de
despesas rejeitadas, divergência extrato×prestação, despesas sem comprovante.
Gestor ordena por "quem precisa de atenção" em vez de ler 800 linhas.

Impacto: Médio · Esforço: 4h · Prioridade: P2

### C4. Projeção e orçamento por centro de custo

- Gasto médio por CC/regional nos últimos N meses + projeção da quinzena corrente
  ("com o ritmo atual, CLARO INFRA MG fecha em R$ X")
- Alerta quando um CC estoura >20% da média histórica
- Base para orçamento futuro

Impacto: Médio · Esforço: 5h · Prioridade: P2

### C5. Timeline de auditoria por relatório

Página/modal mostrando a vida do relatório: criado → despesas → OCR de cada
comprovante (com thumbnail) → auditoria bot → aprovações por etapa → pago.
Hoje isso está espalhado em várias telas; consolidar acelera disputas e
esclarecimentos ("por que foi pago isso?").

Impacto: Médio · Esforço: 4h · Prioridade: P2

### C6. Modo "preparar fechamento" na posição de caixa

Wizard de 3 passos: (1) pendências críticas a resolver, (2) prévia dos números
da quinzena, (3) congelar + exportar. É a UX do "um clique" mesmo antes da
automação completa do B1.

Impacto: Alto · Esforço: 6h · Prioridade: **P1**

### C7. Busca global (Ctrl+K)

Command palette no header: busca colaborador (vai pra posição de caixa filtrada),
relatório #, chamado #, CPF, ação ("congelar quinzena", "exportar"). Dashboard com
800+ pessoas pede navegação por busca.

Impacto: Médio · Esforço: 4h · Prioridade: P3

### C8. Anexos e evidências nas prestações

Permitir anexar comprovante direto pela plataforma quando uma despesa está sem
imagem (upload → vincula na despesa VExpenses via API) — hoje o usuário sai do
portal, abre o VExpenses, anexa, volta.

Impacto: Médio · Esforço: 5h · Prioridade: P3

### C9. Dark mode refinado + acessibilidade

Já existe tema dark, mas surgem bugs de contraste em classes não mapeadas
(caso do `bg-blue-50/50` corrigido). Auditoria de todas as classes com opacidade
não cobertas + lint rule proibindo classes sem override no tema escuro.
Atalhos de teclado e navegação por teclado nas tabelas grandes.

Impacto: Baixo · Esforço: 3h · Prioridade: P3

---

## D. Melhorias de UX pontuais (quick wins)

- **Filtros persistem na URL** (`?situacao=inativos&search=carlos`) — link
  compartilhável e F5 não perde o contexto · 1h
- **Exportar Excel respeita os filtros ativos** e inclui aba "resumo" com KPIs · 1h
- **Skeleton loading** nas tabelas em vez de spinner de página inteira · 1h
- **Paginação/virtualização** — 804 linhas renderizadas de uma vez travam PCs
  fracos (tabela da posição de caixa) · 3h
- **Confirmação com resumo** antes de ações destrutivas (congelar, excluir) · 1h
- **Empty states informativos** ("nenhum resultado — limpar filtros") · 30min
- **Badge no menu lateral** com count de pendências por módulo · 2h

---

## E. Roadmap sugerido

| Fase | Itens | Por quê |
|---|---|---|
| **Sprint 1 — Segurança e visibilidade** | A1.1, A1.2, A1.3, A1.5, A1.6, A2.1, A2.2 | Barato, protege o que já existe |
| **Sprint 2 — A quinzena de um clique** | A4.3 (pré-freeze), B1 (autopilot), A4.1 (cadastro), C6 (wizard) | O objetivo declarado do produto |
| **Sprint 3 — Automação de cobrança** | C1 (notification center), B2 (digest), B4 (lembretes), B5 (reconciliação) | Reduz R$ parado e trabalho manual |
| **Sprint 4 — Qualidade e escala** | A3.1 (testes de cálculo), A3.3 (CI), D (quick wins), A4.2 (aliases UI) | Sustentabilidade |
| **Sprint 5 — Inovação** | C2 (copiloto), C3 (score), C4 (projeção), C7 (Ctrl+K) | Diferencial |

---

## Bugs conhecidos pendentes (encontrados nesta investigação)

1. `quinzena_controle_snapshot` vazia — `refreshCadastro` não encontra base (A4.1)
2. `quinzena_cadastro` stale desde 25/08 — só tools manuais escrevem nela
3. Cookie de auth compartilhado entre apps no mesmo host causa interferência (A1.7)
4. Tabela de 804 linhas sem virtualização pode engasgar máquinas fracas (D)

---

## Changelog — implementado

### v26.3.6
- **Foto de perfil** — upload/remover no header (menu do usuário), armazenada em `app_users.avatar` (BYTEA) com mime + `avatar_updated_at`; validação por magic bytes (PNG/JPEG/WebP/GIF), máx. 3 MB; servida por `GET /api/auth/avatar/:id` (autenticado, cache privado); metadados `has_avatar`/`avatar_v` em `/api/auth/me` pra cache-busting. Padrão copiado do Portal Documentos.
- **Trocar senha voluntária** — item "Trocar senha" no menu do usuário; middleware não redireciona mais `/change-password`; API agora exige a senha atual quando não é primeiro acesso (antes uma sessão roubada trocava a senha sem saber a antiga).
- **Gate ao vivo de etapa (auto-approve)** — antes de tentar aprovar, o bot chama `GET /web/approvals/{id}` com o cookie Laravel: erro `110001001` = etapa de outro aprovador → `waitingNextStep` + log `skipped_step`, sem desperdiçar a chamada 422 na V2. Fallback pro comportamento antigo em falha de rede.
- **Botões de revisão renomeados** — "Revisar pendências" (só as pendentes/reprovadas), "Ver todas as despesas", "Conferir despesas" (pré-aprovação).
- **Multi-reprovação de despesas** — cards de despesa têm toggle "Reprovar" (marca local, borda vermelha + badge "Será reprovada"); painel de reprovação mostra "N marcadas — as outras X serão aprovadas", justificativa auto-preenchida com os motivos do bot; um clique reprova o relatório inteiro. Bug corrigido: `exp.expense_id` da V2 é o id do relatório — payload passou a usar `exp.id` (id real da despesa).
- **Supressão do popup de inativos** — admins da whitelist de aprovadores etapa 1 (Letícia, Letícia Silva, Italo, Andrey, Stefani, Kamily) veem "Não mostrar novamente"; flag `inactive_popup_dismissed` por usuário.
