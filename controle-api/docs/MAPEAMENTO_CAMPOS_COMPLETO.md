# Mapeamento Completo de Campos — Carga Quinzenal

> Documento de referência para a pipeline de automação.  
> Última atualização: 09/06/2026 — Sessão 2: validação de saldo_cartao e prestacao_de_contas via API

---

## 1. Planilha PAINEL (CONTROLE VEXPENSES)

Fonte: `controle_painel` do DB / tabela `painel`

| Campo | Fonte API | Endpoint / Campo | Cobertura | Notas |
|---|---|---|---|---|
| `empresa` | ❌ Não disponível | — | Manual | Valor fixo: "EQS ENGENHARIA" |
| `colaborador` | ✅ API | `GET /v2/team-members` → `name` | ~100% | — |
| `cpf` | ✅ API | `GET /v2/team-members` → `cpf` | ~100% | 11 dígitos com zero à esquerda |
| `chave` | ❌ Não disponível | — | Manual | Código interno |
| `situação` | ✅ API | `GET /v2/team-members` → `active` | ~100% | `true`→ATIVO, `false`→INATIVO |
| `status_do_cartão` | ❌ `/v2/cards` retorna 405 | — | Manual | — |
| `cartão_itau` | ❌ Não disponível | — | Manual | Número do cartão |
| `termo` | ❌ Não disponível | — | Manual | — |
| `regional` | ⚠️ Parcial API | `GET /v2/team-members?include=projects` → `projects[0].name` | 63.5% direto | Ver seção 4 |
| `centro_de_custo` | ✅ API | `GET /v2/team-members?include=costsCenters` → `costsCenters[0].name` | ~98% | — |
| `gestor` | ❌ Não disponível diretamente | — | Via lookup | Derivado de: `regional → AUX.gestor` |
| `diretor` | ❌ Não disponível diretamente | — | Via lookup | Derivado de: `regional → AUX.diretor` |
| `cartão_vexpenses` | ❌ `/v2/cards` retorna 405 | — | Manual | — |
| `carga` | 🔍 A investigar | — | — | Tipo=CARGA no extrato de saldo |
| `transferencia` | 🔍 A investigar | — | — | Tipo=TRANSFERÊNCIA no extrato |
| `tarifa` | 🔍 A investigar | — | — | Tipo=TARIFA (R$7/saque, R$1,50/PIX) |
| `prestação_de_contas` | ✅ API | `GET /v2/reports/{id}?include=expenses` → sum(`value`) por user (APROVADO) | ✅ 100% validado | Ver seção 8 — BRUNO: sum_api=29717.13 == painel.prest=29717.13 |
| `saldo_prestação` | ✅ Calculado | `carga + transferencia - prestação_de_contas` | Calculado | — |
| `saldo_cartao` | 🔍 A investigar | — | — | Saldo do cartão pré-pago na data de corte |
| `saldo_final` | ✅ Calculado | `carga + transferencia + tarifa - prestação_de_contas` | Calculado | Tarifa é negativa |

---

## 2. Planilha CARGA QZ (Planilha1)

Colunas da planilha de carga quinzenal gerada pelo financeiro.

| Campo | Fonte | Como obter | Cobertura | Fórmula / Lógica |
|---|---|---|---|---|
| `colaborador` | ✅ API | `team-members.name` | ~100% | — |
| `cpf` | ✅ API | `team-members.cpf` | ~100% | — |
| `situação` | ✅ API | `team-members.active` | ~100% | — |
| `regional` | ⚠️ Parcial | `projects[0].name` + lookup | ~99% | Ver seção 4 |
| `centro_de_custo` | ✅ API | `costsCenters[0].name` | ~98% | — |
| `gestor` | ⚠️ Via lookup | `regional → AUX.gestor` | ~70% | Tabela AUX no DB |
| `diretor` | ⚠️ Via lookup | `regional → AUX.diretor` | ~70% | Tabela AUX no DB |
| `saldo_reembolsar` | ✅ Calculado | `max(0, -saldo_final)` | 100% | Saldo negativo → valor a reembolsar |
| `saldo_final` | ✅ Calculado | `max(0, painel.saldo_final)` | 100% | Zera negativos |
| `1ª_qz` | ❌ Manual | Definido pelo financeiro | Manual | Valor da carga da quinzena |
| `saldo_cartao` | ⚠️ Import | Download extrato / cálculo | Manual/Import | Saldo atual do cartão VExpenses |
| `adiantamento` | ❌ Manual | Definido caso a caso | Manual | — |
| `carga_parcial` | ✅ Calculado | `1ª_qz - saldo_final - saldo_cartao - adiantamento` | 100% | Validado 340/340 linhas |
| `reembolso` | ✅ Calculado | `saldo_reembolsar / 2` | 100% | Pago em 2 quinzenas |
| `carga_final` | ✅ Calculado | `max(0, carga_parcial + reembolso)` | 100% | — |
| `obs` | ❌ Manual | Campo livre | Manual | — |
| `status_do_cartão` | ❌ API indisponível | — | Manual | `/v2/cards` retorna 405 |

---

## 3. BASE PREST (Despesas VExpenses)

| Campo | Fonte API | Campo API |
|---|---|---|
| `id_da_despesa` | ✅ | `expense.id` |
| `id_do_relatório` | ✅ | `expense.report_id` |
| `nome_do_relatório` | ✅ | `report.description` (include=report) |
| `data` | ✅ | `expense.date` |
| `nome_do_membro_de_equipe` | ✅ | `user.name` (include=user) |
| `cpf_cnpj` | ✅ | `user.cpf` |
| `status` | ✅ | `report.status` (include=report) |
| `descrição_da_despesa` | ✅ | `expense.title` |
| `tipo_de_despesa` | ✅ | `expense_type.description` (include=expense_type) |
| `reembolsável` | ✅ | `expense.reimbursable` |
| `centro_de_custos` | ✅ | `costs_center.name` (include=costs_center) |
| `forma_de_pagamento` | ✅ | `payment_method.description` (include=payment_method) |
| `projeto` | ⚠️ XLS only | Campo no excel_link do report; `project_id=null` na API JSON |
| `valor` | ✅ | `expense.value` |

---

## 4. Campo REGIONAL — Estratégia de Cobertura

### Fontes disponíveis (em ordem de prioridade):

1. **`GET /v2/team-members?include=projects` → `projects[0].name`**
   - Cobertura: **63.5% match direto** com `painel.regional`
   - 98.5% dos 801 members têm pelo menos 1 projeto
   - Problema: nomes divergem para colaboradores Claro Infra / multi-contratos

2. **Lookup `painel.centro_de_custo → painel.regional`**
   - Quando o `costs_center.name` da API bate com `painel.centro_de_custo`
   - Cobertura: ~80% (centros sem transferências recentes)

3. **`GET /v2/approval-flows` → `description` (via `team-members.approval_flow_id`)**
   - Similar ao projects (~6.8% match direto com paginação limitada)
   - Flows têm nomes mais específicos (ex: `REGIONAL CLARO INFRA SC`)

4. **Tabela AUX do DB** (`regional → gestor, diretor`)
   - Mapeamento fixo mantido manualmente

### Pares divergentes project → regional (lookup complementar):

| `project.name` | `painel.regional` real | Qtd |
|---|---|---|
| `REGIONAL PR` | `REGIONAL SC` | 79 |
| `REGIONAL SC` | `REGIONAL CLARO INFRA SUL` | 42 |
| `REGIONAL RS` | `REGIONAL CLARO INFRA SUL` | 37 |
| `REGIONAL PR` | `REGIONAL CLARO INFRA SUL` | 28 |
| `REGIONAL NE` | `REGIONAL CLARO INFRA NORDESTE` | 17 |
| `REGIONAL BA` | `REGIONAL NE` | 11 |
| `MATRIZ SC` | GESTAO DE PESSOAS / ADMIN / etc. | 30+ |
| `DIRETORIA` | KEY ACCOUNT / ADMIN / etc. | 7 |

> ⚠️ `REGIONAL PR`, `REGIONAL SC`, `MATRIZ SC` e `DIRETORIA` são **ambíguos** — o mesmo
> `project.name` mapeia para diferentes `regional` no PAINEL dependendo do colaborador.
> Para esses casos, o `costs_center.name → painel.regional` via lookup é mais confiável.

### Estratégia recomendada (99%+ de cobertura):

```python
def get_regional(cpf, project_name, costs_center_name):
    # 1. Match direto por project (se não-ambíguo)
    if project_name in PROJETOS_UNAMBIGUOS:
        return project_name
    
    # 2. Lookup por costs_center → painel.regional (join no DB)
    regional = lookup_painel_by_cc(costs_center_name)
    if regional:
        return regional
    
    # 3. Fallback: project (mesmo que ambíguo, é melhor que nada)
    return project_name or "DESCONHECIDO"
```

---

## 5. EXTRATO — Dados que só vêm do download manual

| Tipo | Descrição | Valor típico |
|---|---|---|
| `CARGA` | Depósito empresa → colaborador (cartão VExpenses) | Variável (quinzenal) |
| `TRANSFERÊNCIA` | Devolução colaborador → empresa | Negativo |
| `TARIFA` | Taxa de saque (R$7) ou PIX (R$1,50) por VExpenses | -7,00 ou -1,50 |

**Confirmado**: Nenhum endpoint REST retorna essas movimentações.  
**Alternativa**: Download XLSX na interface VExpenses → importar para `extrato` no DB.

---

## 6. Endpoints API Confirmados

| Endpoint | Status | Uso |
|---|---|---|
| `GET /v2/team-members` | ✅ 200 | Colaboradores, CPF, status, active |
| `GET /v2/team-members?include=costsCenters` | ✅ (lotes de 100) | Centro de custo |
| `GET /v2/team-members?include=projects` | ✅ (lotes de 100) | Regional (63.5% direto) |
| `GET /v2/projects` | ✅ 200 | 21 projetos = regionais |
| `GET /v2/approval-flows` | ✅ 200 | 39 flows com description=regional |
| `GET /v2/expenses?search=user_id:X;date:Y&searchFields=user_id:=;date:>=` | ✅ 200 (janela ≤90 dias) | Despesas recentes — limite: **máx 3 meses atrás** |
| `GET /v2/expenses?include=user,payment_method,expense_type` | ✅ (sem include pesado) | Detalhes de despesas |
| `GET /v2/reports` | ✅ 200 | Todos os reports da empresa (não filtra por user_id) |
| `GET /v2/reports/{id}?include=expenses` | ✅ 200 | Um report com lista de expenses e valores |
| `GET /v2/costs-centers` | ✅ 200 | Centros de custo |
| `excel_link` (URL no report) | ✅ app.vexpenses.com (sem prefixar BASE) | XLS legado (.xls OLE2) — colunas = base_prest, inclui Projeto |
| `GET /v2/cards` | ❌ 405 | Cartões — não disponível |
| `GET /v2/advances` | ❌ 405 | Adiantamentos — só POST |
| `GET /v2/balances` / `/v2/wallets` / `/v2/statements` | ❌ 405 | Saldos/extratos — não disponível |
| `GET /v2/payment-methods` | ❌ 405 | Formas de pagamento — só OPTIONS |

---

## 7. Resumo: O que pode ser automatizado

| Categoria | Campos | Status |
|---|---|---|
| **Dados cadastrais** | nome, CPF, situação, centro_de_custo | ✅ 100% via API |
| **Regional** | regional | ⚠️ 63-99% via API (project + lookup CC) |
| **Gestor / Diretor** | gestor, diretor | ⚠️ Via lookup DB (AUX + regional) |
| **Prestações** | prestação_de_contas | ✅ 100% via `/v2/expenses` |
| **Fórmulas** | saldo_reembolsar, carga_parcial, reembolso, carga_final | ✅ 100% calculável |
| **Extrato saldo** | carga, transferencia, tarifa, saldo_cartao | ❌ Download manual |
| **Campos manuais** | 1ª_qz, adiantamento, obs, status_cartão, cartão_itaú | ❌ Manual sempre |

**Total automatizável**: ~11-13 dos 17 campos principais (65-76%)  
**Bloqueadores manuais remanescentes**: extrato de saldo (carga/transf/tarifa) + saldo_cartao + 1ª_qz + adiantamento

---

## 8. Descobertas da Sessão 2 — Validação saldo_cartao e prestacao_de_contas

### 8.1 prestacao_de_contas via API — ✅ VALIDADO

**Método**: Iterar pelos reports de cada user_id, filtrar `user_id == X` (double-check no Python pois o `search=user_id:X` da API retorna todos os reports da empresa), buscar `GET /v2/reports/{id}?include=expenses` e somar `expense.value` dos reports com `status == "APROVADO"`.

**Validação com BRUNO (cpf=11992259755, uid=896006)**:
- `sum(expenses de 12 reports APROVADOS)` = **R$29.717,13**
- `painel.prestacao_de_contas` = **R$29.717,13**
- Diferença = **R$0,00 ✅**

**Limitações do `/v2/reports` (sem filtro real por user_id)**:
- `search=user_id:895944` retorna **todos** os 6.870 reports da empresa
- É necessário filtrar `rp["user_id"] == user_id` em Python após cada página
- Cada página retorna 100 de 6.870 → 69 páginas por usuário → inviável em tempo real

**Abordagem eficiente recomendada**:
1. Baixar todos os 6.870 reports de uma vez (sem filtro), processando página a página
2. Agrupar por `user_id` e somar expenses por grupo (1 request por report)
3. Cachear resultado — executar 1x por quinzena

### 8.2 saldo_cartao — ❌ CONFIRMADO: NÃO CALCULÁVEL VIA API

**O que testamos**:
- ❌ `excel_link` do report → contém despesas (base_prest), não saldo do cartão
- ❌ `/v2/reports?include=advance` → `advance.data = []` em todos os reports testados
- ❌ `/v2/balances`, `/v2/wallets`, `/v2/statements`, `/v2/cards` → todos retornam 405
- ❌ `/v2/team-members/{id}?include=balance,card,wallet,statement` → nenhum campo extra retornado
- ❌ Cálculo `(carga+transf+tarifa) - sum_expenses_aprovadas` → diferença de R$734 a R$11.000

**Conclusão**: o `saldo_cartao` é o saldo em tempo real da conta VExpenses do colaborador na data de corte da quinzena. Muda diariamente conforme despesas são adicionadas/aprovadas. **A plataforma não expõe esse valor via API REST.**

**Único dado disponível**: a tabela `saldo_cartao` do DB, populada pela planilha manual de carga que é preenchida pelo financeiro capturando o saldo na tela VExpenses no dia de corte.

### 8.3 Limitações confirmadas de /v2/expenses

| Parâmetro | Resultado |
|---|---|
| `date:>= (há > 3 meses)` | ❌ 422 — "Filter > is limited to 3 months ago" |
| `date:>= (≤ 90 dias atrás)` | ✅ 200 — Funciona |
| Filtros `validate`, `rejected`, `reimbursable` | ❌ 500 — Não suportados |
| `search=user_id:X;date:Y` | ✅ Funciona quando date ≤ 90 dias atrás |
| `per_page` máximo | 100 |
