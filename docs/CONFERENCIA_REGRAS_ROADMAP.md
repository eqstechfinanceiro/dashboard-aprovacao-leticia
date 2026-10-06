# Conferência Contínua + Motor de Regras — Roadmap

> Doc mestre: o que já existe, o que vamos construir, como e em que ordem.
> Atualizar a coluna "Status" a cada entrega. Última atualização: 2026-10-06.

## 1. Objetivo

Eliminar o PC dedicado da conferência de notas (mercadoria/serviço/VExpenses),
rodar a conferência **continuamente na VPS**, nunca perder um lançamento por
janela de data (gap sexta → segunda), nunca falhar por falta de XML/PDF
(múltiplas fontes com fallback), e colocar **as regras de lançamento e de
conferência nas mãos do usuário** via página de gestão.

Resultado final visado: no fechamento da quinzena, um botão gera a quinzena
completa e correta — lançamento, conferência e exceções auditáveis num só lugar.

## 2. Mapa do estado atual

### 2.1 Componentes existentes

| Componente | Onde roda | O que faz | Depende de browser? |
|---|---|---|---|
| `conferencia-notas-mercadoria` (PC) | PC dedicado, `.vbs` diário | TOTVS REST (SF1+SA2, SD1+SB1) × XML SIEG → comparador → Excel + push | **Sim** — só o login SIEG (Playwright p/ cookie `COFRE.AUTH`); resto é `requests` |
| `download-notas-de-servico` | PC | TOTVS × PDF do portal → push | Parcial |
| `Lince` | PC | Lançamento de NFs no webapp (escrita) | **Sim** — escritas webapp |
| `protheus-reports-vex` | PC | Agilitas→Z01, lança recibos/notas (escrita) | **Sim** — escritas webapp |
| Dashboard fiscal | VPS | `fiscal_notas`/`fiscal_runs` + fila de revisão + revalidar + DANFE viewer | Não |
| Sync worker | VPS | warm cycle: impacto SE2, boletos SE2 via `genericQuery` | Não |
| `resultados_notas` | Postgres VPS | Log de notas por execução (legado) | — |

### 2.2 O que já está pronto e é reaproveitável

- **Todas as leituras TOTVS já são REST** (`genericQuery` com OAuth2 + cookie
  `TOTVS_PROXY_SH_001`, tenant `02,02`) — roda da VPS com zero browser.
  Client TS já existe: `lib/impacto/totvs.ts` / `lib/boletos/totvs.ts`.
- **SIEG**: downloads são `requests` puros; Playwright só no login para obter
  `COFRE.AUTH`. Chromium headless já roda na VPS (SharePoint usa).
- **`POST /api/fiscal/import`**: endpoint de máquina (`x-fiscal-secret`) com
  upsert idempotente por `(tipo, doc, serie, filial, emissao, fornecedor)`,
  `auto_status` (match/divergente/erro/pendente), `checks[]` campo a campo,
  `doc_path` (XML/PDF anexado), **revisão humana nunca sobrescrita**.
- **Fila de revisão fiscal** (`/fiscal`): UI de pendências/erros/confirmados,
  `fiscal/revisar`, `fiscal/revalidar`, `fiscal/importar-xml`, `fiscal/doc`.
- **`Z01_XMLNFE`**: campo memo da Z01 **contém o XML NF-e completo** para itens
  lançados via Agilitas (status "DS") — fonte de XML embutida no TOTVS.
- **`lib/fiscal/danfe-html.ts`**: renderiza DANFE a partir do XML — cobre a
  necessidade de PDF visual sem depender de fonte externa.
- **`USERLGI_PREFIX_MAP`**: decodifica quem lançou (bot vs humano) — auditoria.
- **Worker compilado** (`worker-dist`) com warm cycle agendado — ponto de
  entrada natural do sync de conferência.

### 2.3 Problemas que esse projeto resolve

| Problema | Causa hoje | Solução |
|---|---|---|
| Sexta lançada não confere segunda | Run diário no PC por janela de data; PC desliga | Ledger contínuo na VPS (§4) |
| "Falha técnica" por falta de XML | Fonte única: SIEG | Registry multi-fonte com fallback (§5) |
| Regra nova exige deploy de código | `tes_rules.py` hardcoded | Regras em tabelas + página (§6) |
| Lança de um jeito, confere de outro | Regras duplicadas em projetos distintos | Fonte única de regras no dashboard |
| Excel no PC como saída | Relatório local | Fila fiscal + export no dashboard |

## 3. Arquitetura alvo

```
                 ┌─────────────────────────── VPS ───────────────────────────┐
                 │                                                           │
   TOTVS REST ◄──┤  Conferência Worker (warm cycle / cron dedicado)           │
   (SF1/SD1)     │     │                                                     │
                 │     ├─► Fonte docs: SIEG ▸ Z01_XMLNFE ▸ VExp attach ▸ ...  │
                 │     ├─► Motor regras: lê regras do Postgres                │
                 │     ├─► Comparador: checks campo a campo                   │
                 │     └─► fiscal_notas (ledger) + fiscal_runs                │
                 │                                                           │
                 │  Dashboard Next.js                                        │
                 │     ├─► /fiscal (fila de revisão — já existe)              │
                 │     ├─► /regras (NOVO: abas Lançamento + Conferência)      │
                 │     └─► /api/regras/{lancamento,conferencia} (máquina)     │
                 └───────────────────────────────────────────────────────────┘
                                    ▲                          │
                 PC (apenas escritas) │                          ▼
   Lince / reports-vex ──► TOTVS webapp        Postgres: regras_*, fiscal_*
   (lê regras via API no start de cada run)
```

## 4. Bloco 1 — Conferência contínua na VPS

### 4.1 Modelo: ciclo curto + dedup — não existe mais "dia a dia"

A conferência roda em **intervalo curto** (configurável; alvo inicial
~30–60 min), não mais de um dia pro outro. Cada nota é um item de estado:

- A cada ciclo, o worker consulta TOTVS (SF1, espécies fiscais) numa janela
  com sobreposição (ex.: últimos 14 dias) e **upserta** cada documento em
  `fiscal_notas` (chave já existente por doc+serie+filial+emissão+fornecedor)
  como `pendente` se nunca conferida.
- **Dedup antes de conferir**: nota em `auto_ok` ou com decisão humana
  (`confirmado_ok`/`confirmado_erro`/`cancelado`) **nunca é reprocessada** —
  o ciclo só toca o que está `pendente` ou `falha_tecnica` elegível a retry.
  Reconferência deliberada só acontece por ação explícita ("reconferir com
  regras atuais" após edição de regra — §7.4).
- Estados: `pendente → auto_ok | pendente(divergência) | falha_tecnica →
  confirmado_ok | confirmado_erro | cancelado`.
- **Nada some por janela**: nota não resolvida continua `pendente` para o
  próximo ciclo. PC ligado ou não, feriado ou fim de semana — a fila só
  esvazia quando cada nota tem veredicto.
- `falha_tecnica` reprocessa com backoff exponencial (XML pode chegar
  atrasado na fonte; nota recém-lançada pode estar em consolidação).
- **Escopo = tudo que foi lançado** — por bot **e** por humano (SF1 não
  distingue origem; `USERLGI` decodifica quem lançou pra auditoria).

### 4.2 Itens de implementação

| # | Item | Status |
|---|---|---|
| 4.1 | Portar queries `totvs_mercadoria_api.py` (SF1/SA2 + SD1/SB1) para `lib/conferencia/totvs.ts` (EQS + BRATEC, espécies configuráveis) | Pendente |
| 4.2 | Portar `comparator.py` para `lib/conferencia/comparator.ts` — regras informativas × divergentes vindas do banco (§6) | Pendente |
| 4.3 | `lib/conferencia/fontes.ts` — registry de fontes XML/PDF (§5) | Pendente |
| 4.4 | Worker `syncConferencia()` no warm cycle (ou cron próprio): descobrir docs → baixar fonte → comparar → gravar `fiscal_notas`/`fiscal_runs` | Pendente |
| 4.5 | Backfill: reconciliar `fiscal_notas` legado × SF1 real — marcar notas nunca conferidas | Pendente |
| 4.6 | Desligar `.vbs` do PC quando paridade provada (2 semanas em paralelo) | Pendente |

### 4.3 Paridade e validação

- Rodar comparador novo × `comparator.py` no **mesmo lote** de notas e diffar
  resultado campo a campo até 100% igual antes de ligar em produção.
- Métrica de sucesso: 0 notas `pendente` por falta de fonte após 72h;
  divergências = conjunto idêntico ao do PC.

## 5. Bloco 2 — Fontes múltiplas de XML/PDF

### 5.1 Registry de fontes

`lib/conferencia/fontes.ts` implementa a cadeia: para cada nota, tenta fontes
em **ordem de prioridade configurável** (regra editável na página §6), com
cache por `chave_acesso` em disco/tabela. Uma fonte falhou → próxima. Todas
falharam → `falha_tecnica` com `auto_resumo` listando tentativas.

| Fonte | O que entrega | Cobertura | Disponível hoje? |
|---|---|---|---|
| **SIEG** | XML por chave | Todas as NF-e — fonte atual | Sim — `requests` + login Playwright p/ `COFRE.AUTH` |
| **TOTVS `Z01_XMLNFE`** | XML completo embutido | Itens Agilitas lançados ("DS") | Sim — mesmo genericQuery, zero auth extra |
| **VExpenses attachments** | PDF/imagem do comprovante (`Z01_JSON.reicept_url`) | Recibos/notas anexadas pelo usuário | Sim — já baixado no auto-audit |
| **Cache launcher** | XML baixado pelo Lince/reports-vex antes do lançamento | Tudo que o bot lançou | Sim — unificar em store da VPS |
| **SharePoint books** | NFs nos books mensais por CC | Esporádica (docs contratuais) | Sim — índice já existe |
| **Email fornecedor** | XML anexo | Alto potencial | Futuro — caixa dedicada + parser |
| **APIs pagas** (Arquivei, Nuvem Fiscal) | XML/DANFE por CNPJ | Quase total | Futuro — custo/validação |
| ~~SEFAZ DistDFe~~ | — | — | **Descartado** — empresa não possui certificado A1 |

### 5.2 Regras operacionais

- **Cache central** `fiscal_docs (chave_acesso, fonte, path, fetched_at)` —
  qualquer automação que obtenha um XML deposita; conferência consome sem
  refetch. Lince/reports-vex passam a depositar também.
- **PDF**: quando a fonte entrega só XML, `danfe-html` renderiza o DANFE —
  toda nota conferida tem representação visual.
- **Métrica por fonte**: contador de hits/falhas por fonte por ciclo — visível
  na página de regras (saúde das fontes).

## 6. Bloco 3 — Motor de regras + página `/regras`

### 6.1 Princípio

**O algoritmo fica no código; os dados viram regra editável.** A ordem de
avaliação (reescrita → código → casos especiais → padrão → DIFAL) permanece
procedural; todas as tabelas de decisão migram para o Postgres.

### 6.2 Modelo de dados (tabelas tipadas — não JSON solto)

| Tabela | Conteúdo | Consumidor |
|---|---|---|
| `regras_natureza` | `natureza → codigo(0-8)`, `reescrita_para`, empresa, ativa | Lançamento |
| `regras_tes` | `codigo × ctrl_imposto × empresa → tes` (+ `tes_difal`) | Lançamento |
| `regras_listas` | `tipo` (centros_especiais / itens_especiais / naturezas_usiminas), `valor`, empresa | Lançamento |
| `regras_especiais` | `nome` (usiminas), `match` (centro, naturezas), `mapa` (tes→tes) | Lançamento |
| `regras_conferencia` | `campo`, `severidade` (info/divergente), `tolerancia`, `ativo`, `tipo_nota` | Conferência |
| `regras_fontes` | `fonte`, `prioridade`, `timeout_s`, `habilitada` | Conferência/fontes |
| `regras_audit` | `quem`, `quando`, `antes`, `depois` (todo save gera linha) | Ambos |

`regras_version()` = `max(updated_at)` — consumidores fazem cache por versão.

### 6.3 Página `/regras` (módulo novo, admin-gated)

- **Aba Lançamento**: grid de naturezas (natureza → código, reescrita);
  matriz TES editável (código × ctrl_imposto × empresa); listas editáveis
  (centros especiais, itens especiais); bloco de exceções (USIMINAS).
- **Aba Conferência**: por `tipo_nota` (mercadoria/serviço/vexpenses): campos
  conferidos com severidade (informativo × divergente), tolerâncias
  (R$ 0,05, ±dias), ordem das fontes de documentos, janela de reprocessamento.
- Indicador de saúde: hits/falhas por fonte, último ciclo do worker.
- **Toda edição gera `logAudit`** — rastreável quem mudou qual regra quando.

### 6.4 Consumo pelas automações

- `GET /api/regras/lancamento?empresa=` e `GET /api/regras/conferencia?tipo=`
  — secret escopado `x-rules-secret` (mesmo padrão de `FISCAL_IMPORT_SECRET`),
  retorna pacote de regras + `version`.
- Lince / reports-vex / worker de conferência **baixam o pacote no start do
  run**; falha de rede → cache local da última versão (fail-open com warning
  visível — nunca lança com regra velha sem avisar).
- **Gate de paridade** antes do go-live do Lince-por-API: rodar
  `tes_rules.py` vs regras do banco em todas as combinações
  (natureza × ctrl_imposto × empresa × CC/produto/CFOP/aliq) — só ligar com
  100% de equivalência.

## 7. Bloco 4 — Fila fiscal (melhorias na superfície)

| # | Item | Status |
|---|---|---|
| 7.1 | Coluna "fonte do documento" + link direto pro XML/PDF na linha da nota | Pendente |
| 7.2 | Filtro por motivo de `falha_tecnica` (sem fonte × parse × timeout) | Pendente |
| 7.3 | Card de cobertura: % conferido por empresa/tipo/janela — "o que ainda não foi verificado" em destaque | Pendente |
| 7.4 | Ação em massa: revalidar divergentes após edição de regra (botão "reconferir com regras atuais") | Pendente |

## 8. Sequência de implementação (fases)

| Fase | Conteúdo | Depende de | Status |
|---|---|---|---|
| **F1** | Conferência mercadoria na VPS: portar queries + comparator (regras hardcoded ainda) + ledger em `fiscal_notas` + SIEG na VPS | — | Pendente |
| **F2** | Registry de fontes: SIEG + Z01_XMLNFE + VExpenses + cache launcher; métricas por fonte | F1 | Pendente |
| **F3** | Tabelas de regras + seed a partir de `tes_rules.py` + endpoints de leitura + paridade automatizada | — (paralelo a F1) | Pendente |
| **F4** | Página `/regras` (2 abas) + audit de edição | F3 | Pendente |
| **F5** | Conferência passa a ler regras do banco; Lince/reports-vex consomem `/api/regras/lancamento` | F3, F4 | Pendente |
| **F6** | Serviço (download-notas-de-servico) migrado p/ mesma esteira; fontes futuras (e-mail fornecedor, APIs pagas) | F1–F5 | Pendente |
| **F7** | Paralelo 2 semanas → desligar `.vbs`/jobs do PC (conferência); escritas continuam no PC | F1–F2 | Pendente |

## 9. O que já está feito (base)

- [x] Client TOTVS REST em TS com tenants EQS/BRATEC (`lib/impacto/totvs.ts`, `lib/boletos/totvs.ts`)
- [x] Warm cycle no worker da VPS executando syncs TOTVS agendados
- [x] `fiscal_notas`/`fiscal_runs` com upsert idempotente, checks campo a campo, doc anexado, revisão humana preservada, retenção 90d
- [x] Fila de revisão fiscal + revalidar + importar XML + viewer DANFE
- [x] Endpoint de máquina `/api/fiscal/import` (`x-fiscal-secret`) já consumido pelos runners do PC
- [x] SIEG com login Playwright + downloads por `requests` (cookie `COFRE.AUTH`)
- [x] `Z01_XMLNFE` identificado como fonte embutida de XML
- [x] Classificação de doc (nfe/recibo + chave) via dashboard já integrada ao reports-vex
- [x] Decodificação de `F1_USERLGI` (quem lançou) mapeada

## 10. Pendente — checklist de execução

- [ ] `lib/conferencia/totvs.ts` — queries SF1/SD1 com espécies e empresas configuráveis
- [ ] `lib/conferencia/comparator.ts` — port fiel do `comparator.py`
- [ ] `lib/conferencia/fontes.ts` — registry + cache `fiscal_docs`
- [ ] Login SIEG headless na VPS + renovação de cookie (reuso do handler)
- [ ] `syncConferencia()` no worker + watermark + backoff de `falha_tecnica`
- [ ] Tabelas `regras_*` + seed exato de `tes_rules.py` + `comparator` defaults
- [ ] `GET /api/regras/{lancamento,conferencia}` com secret escopado
- [ ] Página `/regras` — abas Lançamento/Conferência + audit
- [ ] Teste de paridade regras (banco × `tes_rules.py`) — 100% antes do F5
- [ ] Client `rules_client.py` no Lince/reports-vex (cache + fail-open warning)
- [ ] Métricas por fonte na página (hits/falhas)
- [ ] Backfill reconciliando `fiscal_notas` legado × SF1
- [ ] 2 semanas em paralelo → desativar `.vbs` do PC

## 11. Decisões em aberto / riscos

| Item | Decisão | Status |
|---|---|---|
| Certificado A1 (DistDFe) | Empresa **não tem** — DistDFe descartado; cobertura vem de SIEG + Z01 + attachments + caches (+ futuras: e-mail, API paga) | **Decidido** |
| e2doc como fonte | **Não se aplica** — NFs não são arquivadas no e2doc (fora de escopo) | **Decidido** |
| ExecAuto/REST de escrita TOTVS | Se existir, até lançamento sai do PC — investigação separada | A investigar |
| SIEG na VPS | Cookies por CNPJ? Rate limit diário? Login 2FA? | A testar em produção |
| Escopo da conferência | **Tudo que foi lançado** — bot e humano (SF1 é fonte completa); ciclo curto com dedup, não mais diário | **Decidido** |
| Intervalo do ciclo | Alvo inicial 30–60 min — ajustável por regra/config na página | A calibrar no piloto |
| Regra "parcial" do Lince | Itens especiais/DIFAL dependem de dados do grid/XML — conferir que todos os inputs existem via REST (D1_TES leitura ok; `tes_atual` do grid → ler SF4/SD1) | A validar |

> **Regra de ouro** (herdada do projeto): nenhum item novo entra em produção
> sem teste real — endpoint com request, página com Playwright, worker com
> ciclo observado nos logs.
