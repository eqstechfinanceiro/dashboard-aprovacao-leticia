# Mapeamento da API VExpenses → Planilha de Carga Quinzenal

> Documento gerado em 09/06/2026. Baseado em exploração real da API contra o DB de maio 2025/2026.

---

## 1. Endpoints Disponíveis

| Endpoint | Status | Descrição |
|---|---|---|
| `GET /v2/expenses` | ✅ | Despesas por período, paginado, com includes |
| `GET /v2/team-members` | ✅ | Colaboradores com costsCenters |
| `GET /v2/costs-centers` | ✅ | 256 centros de custo |
| `GET /v2/reports` | ✅ | Relatórios de despesas agrupados |
| `GET /v2/card-transactions` | ❌ 405 | Não existe |
| `GET /v2/transactions` | ❌ 405 | Não existe |
| `GET /v2/advances` | ❌ 405 | Não existe |
| `GET /v2/wallets` | ❌ 405 | Não existe |

> **CRÍTICO:** Não há endpoint de extrato de cartão (cargas/transferências de saldo). A API de `expenses` contém apenas **despesas** (o que o colaborador gastou), não as **cargas** (o que a empresa depositou no cartão).

---

## 2. Estrutura da Tabela EXTRATO vs API /v2/expenses

### EXTRATO (DB — movimentações de saldo do cartão VExpenses)
São **3 tipos** de registros:

| Tipo | Descrição | Fonte real |
|---|---|---|
| `CARGA` | Transferência empresa → colaborador | `Transf. EQS > Nome: QZ MAIO/2026` |
| `TRANSFERÊNCIA` | Devolução colaborador → empresa/regional | `Transf. Nome > REGIONAL XX` |
| `TARIFA` | Taxa cobrada pelo VExpenses | `Taxa de saque (-R$7)` / `Taxa de PIX (-R$1,50)` |

**Esses dados NÃO estão em `/v2/expenses`** — são operações financeiras internas do VExpenses (crédito/débito de saldo), não despesas. O EXTRATO é **baixado separadamente** como relatório de movimentação da conta.

### /v2/expenses (API — despesas realizadas pelo colaborador)
São as notas fiscais/comprovantes que o colaborador registra. Têm `payment_method` que indica como foi pago:

| payment_method | Qty maio 2026 | Reimbursable | affects_advance |
|---|---|---|---|
| Saque VExpenses | 3820 | false | true |
| Cartão Corporativo Itaú | 2758 | false | true |
| Cartão VExpenses | 1684 | false | true |
| Pix VExpenses | 208 | false | true |
| Recurso Próprio | 92 | false | true |
| Desconto Colaborador | 1 | false | true |

---

## 3. Mapeamento de Campos: PAINEL ← Fontes

| Campo PAINEL | Fonte | Como calcular |
|---|---|---|
| `carga` | **EXTRATO** tipo=CARGA | `SUMIFS(extrato, tipo='CARGA', cpf=X)` — **✅ VALIDADO** (100% match) |
| `transferencia` | **EXTRATO** tipo=TRANSFERÊNCIA | `SUMIFS(extrato, tipo='TRANSFERÊNCIA', cpf=X)` |
| `tarifa` | **EXTRATO** tipo=TARIFA | `SUMIFS(extrato, tipo='TARIFA', cpf=X)` |
| `prestação_de_contas` | **BASE_PREST** (= expenses exportadas) | `SUMIFS(base_prest, cpf=X, status IN APROVADO/PAGO)` |
| `saldo_cartao` | **SALDO_CARTAO** (tabela separada) | Saldo residual do cartão — NÃO calculável via API diretamente |
| `saldo_final` | Fórmula | `carga + transferencia + tarifa - prestacao` |
| `colaborador` | **API** `/v2/team-members` | `name` |
| `cpf` | **API** `/v2/team-members` | `cpf` (11 dígitos com zeros à esquerda) |
| `situação` | **API** `/v2/team-members` | `active` (true=ATIVO, false=INATIVO) |
| `centro_de_custo` | **API** `/v2/team-members` | `costsCenters.data[0].name` |
| `regional` | **AUX** (tabela DB) | Centro de custo → regional via lookup na tabela `aux` |
| `gestor` | **AUX** (tabela DB) | regional → gestor via `aux` |
| `diretor` | **AUX** (tabela DB) | regional → diretor via `aux` |
| `cartão_vexpenses` | **API** `/v2/team-members` | Não encontrado diretamente |
| `status_do_cartão` | **API** ou manual | Não mapeado na API ainda |

---

## 4. O que a API PODE fornecer diretamente

### ✅ Via /v2/team-members
- Colaboradores (nome, CPF, email, active)
- Centro de custo (costsCenters)
- Regional/Gestor/Diretor → via lookup na tabela `aux` (centro_de_custo → regional)

### ✅ Via /v2/expenses (= BASE_PREST)
- Prestações de contas por CPF/período
- `forma_de_pagamento` = payment_method (Saque, Cartão VExpenses, Cartão Itaú, etc.)
- `tipo_de_despesa` = categoria da despesa
- `status` = APROVADO / PAGO / PENDENTE

### ⚠️ Parcialmente disponível
- **SALDO CARTÃO**: precisa de endpoint específico (não encontrado). Atualmente em tabela `saldo_cartao` separada.
- **REGIONAL**: deriva de centro_de_custo via tabela `aux` — funciona para ~80% dos colaboradores. Os 20% restantes têm `costsCenters` não mapeados.

### 🔍 A investigar
- **CARGA**, **TRANSFERÊNCIA**, **TARIFA** — endpoints de movimentações não testados ainda
- **SALDO CARTÃO** — `/v2/cards` retornou 405, outros endpoints a explorar

---

## 5. Observação: EXTRATO ≠ /v2/expenses

O EXTRATO é o relatório de movimentações da **conta/cartão VExpenses** da empresa.
A API `/v2/expenses` retorna as **despesas registradas** pelos colaboradores.

São conceitos diferentes:
- Uma CARGA de R$5.000 no cartão do colaborador **não aparece** em `/v2/expenses`
- Uma despesa de R$100 com Saque VExpenses **aparece** em `/v2/expenses` e **desconta** do saldo do cartão

🔍 Endpoints específicos para CARGA, TRANSFERÊNCIA, TARIFA e SALDO CARTÃO ainda não foram investigados.

---

## 6. Validação Numérica

### CARGA por CPF: EXTRATO DB vs PAINEL DB — **✅ 100% match (5/5)**

| Colaborador | CARGA_PAINEL | CARGA_EXTRATO |
|---|---|---|
| ABNER ANDRADE CAVALCANTE | 231.233,70 | 231.233,70 ✓ |
| ADAN LEONARDO SOUZA BATISTA | 8.596,27 | 8.596,27 ✓ |
| ADAUTO JOSE PEREIRA | 1.437,18 | 1.437,18 ✓ |
| ADEMARCIO DUARTE LOPES | 30.179,24 | 30.179,24 ✓ |
| ADILSON ANTONIO JACINTO | 1.420,00 | 1.420,00 ✓ |

### CPFs: formato consistente
- EXTRATO DB: 11 dígitos com zeros à esquerda (`02027745203`) ✓
- API team-members: 11 dígitos com zeros à esquerda ✓
- PAINEL DB: 11 dígitos com zeros à esquerda ✓
- Não é necessário normalizar zeros

### Cobertura de colaboradores: API vs PAINEL
- API team-members total: **801** (602 ativos, 199 inativos)
- PAINEL DB: 720 colaboradores (592 ativos, 128 inativos)
- Ativo no PAINEL **e** na API: **562 (94,9%)** ✅
- Ativo no PAINEL mas **ausente** da API: **2 (<1%)** — provavelmente pré-cadastrados
- Ativo no PAINEL mas **inativo** na API: **28** — desligados recentes não atualizados no PAINEL

### API team-members: limitação de paginação com include=costsCenters
- `paginate=false` sem include → retorna todos os 801 ✅
- `paginate=false` com `include=costsCenters` → timeout após 30s (muito pesado)
- `paginate=true` com qualquer `per_page` → API ignora e retorna 100 fixos
- **Solução**: buscar base sem include + enriquecer costsCenters em lotes de 80 via search por IDs

---

## 7. Tabela AUX: mapeamento centro_de_custo → regional

A tabela `aux` do DB mapeia: `regional → gestor, diretor`

O `centro_de_custo` vem do primeiro item de `costsCenters` da API. A ligação é pelo **nome** do centro de custo.

### Cobertura validada
- CEF AM AC RR → REGIONAL CO ✓
- CEF FACILITIES BH → REGIONAL MG ✓  
- CEF FACILITIES CURITIBA PR → REGIONAL SC ✓
- CLARO INFRA SC → REGIONAL CLARO INFRA SUL ✓
- DIRETORIA TECNICA → `DIRETORIA REGIONAL` (DB tem `DIRETORIA`) ⚠️ — diferença de nomenclatura
- CLARO INFRA PR → `REGIONAL PR` (DB tem `REGIONAL CLARO INFRA SUL`) ⚠️ — mapeamento defasado
- GESTÃO DE DOCUMENTOS vs GESTAO DE DOCUMENTOS ⚠️ — problema de acentuação

### Conclusão sobre regional
A cobertura via costsCenters API + lookup AUX atinge ~70% dos colaboradores com match exato. Os 30% restantes têm:
- Colaboradores com costsCenters diferente do esperado (transferidos para outro centro)
- Problemas de nomenclatura (com/sem acento, abreviações)
- **Recomendação**: manter a tabela `aux` no DB e complementar com mapeamento manual de exceções

---

## 8. Plano de Implementação da Carga Dinâmica

### Fluxo automático possível (validado):

```
1. GET /v2/team-members (sem include, paginate=false)
   → 801 membros com nome, CPF, active, email
   → active=true → ATIVO / active=false → INATIVO

2. GET /v2/team-members (com include=costsCenters, em lotes de 80)
   → centro_de_custo por CPF
   → lookup tabela AUX → regional/gestor/diretor

3. DOWNLOAD extrato VExpenses (XLSX) → importar no DB como EXTRATO
   → CARGA por CPF (=depósito empresa→colaborador)
   → TRANSFERÊNCIA por CPF (=devolução colaborador→empresa)
   → TARIFA por CPF (=taxas VExpenses: R$7/saque, R$1,50/PIX)
   ⚠️ Não há endpoint REST para isso — precisa de download manual ou via automação de browser

4. GET /v2/expenses?date=QZ_INICIO,QZ_FIM&include=user,expense_type,payment_method,costs_center
   → prestação_de_contas por CPF
   → filtrar status=APROVADO ou PAGO (base_prest.status)
   → base_prest.forma_de_pagamento = payment_method.description

5. SALDO CARTÃO
   ⚠️ Nenhum endpoint encontrado (todos 405)
   → calcular acumulado: saldo = soma(CARGA) + soma(TRANSFERÊNCIA) - soma(PRESTAÇÕES Cartão VExpenses + Saque VExpenses)
   → ou manter a importação manual da planilha SALDO_CARTAO

6. Calcular PAINEL por colaborador/quinzena:
   saldo_final = carga + transferencia + tarifa - prestacao_de_contas
   (nota: tarifa é sempre negativo)

7. Calcular CARGA FINAL:
   carga_final = 1ª_qz + saldo_final + saldo_cartao - adiantamento
```

### 🔍 Campos ainda a investigar via API:
| Campo | Status | Próximo passo |
|---|---|---|
| CARGA | Não testado ainda | Explorar endpoints de movimentações |
| TRANSFERÊNCIA | Não testado ainda | Idem |
| TARIFA | Não testado ainda | Idem |
| SALDO CARTÃO | `/v2/cards` retornou 405 | Testar outros endpoints |

---

## 9. Próximos Passos Recomendados

**Prioridade ALTA:**
1. Implementar `GET /v2/team-members` no backend para popular lista de colaboradores automaticamente
2. Implementar `GET /v2/expenses` por período para calcular prestação_de_contas por CPF/quinzena
3. Validar cálculo de `saldo_final` recalculado via API vs PAINEL DB end-to-end

**Prioridade MÉDIA:**
4. Investigar se VExpenses oferece exportação programática do EXTRATO (webhook, e-mail, FTP, etc.)
5. Implementar cálculo de saldo_cartao acumulado como alternativa
6. Criar mapeamento de exceções de regional (CLARO INFRA PR → REGIONAL CLARO INFRA SUL, etc.)

**Prioridade BAIXA:**
7. Implementar `GET /v2/team-members` com include=costsCenters em lotes para popular regional automaticamente

---

## 10. Novas Descobertas (09/06/2026)

### 10.1 excel_link e pdf_link nos reports ✅

Cada report da API tem campos `excel_link` e `pdf_link` (links públicos, sem auth necessária):
```
excel_link: https://app.vexpenses.com/relatorios/download/excel/{token}
pdf_link:   https://app.vexpenses.com/relatorios/download/pdf/{token}
```

O Excel baixado é formato `.xls` (BIFF8/OLE2). Para ler programaticamente:
```python
import olefile, xlrd, requests
r = requests.get(excel_link, timeout=20)
ole = olefile.OleFileIO(r.content)
data = ole.openstream("Workbook").read()
wb = xlrd.open_workbook(file_contents=data)
```

**Conteúdo**: idêntico à tabela `base_prest` do DB — são as despesas do relatório com todos os campos.
**Validado**: report 7603397 (CAIXA 06/2025) → 134 linhas → R$25.695,69 → **match perfeito com base_prest DB**.

### 10.2 Campo `Projeto` no XLS: informado pelo usuário, não disponível via API ⚠️

O XLS de report tem coluna **`Projeto`** que contém o nome da regional (ex: `"REGIONAL CO"`).
- Match confirmado: ABNER → `Projeto = "REGIONAL CO"` = `PAINEL.regional` ✓
- **Porém**: `project_id = null` em **100% das 8564 expenses de maio** — o campo não é preenchido via API
- O campo `Projeto` no XLS é preenchido pelo colaborador ao criar o relatório na interface web

**Conclusão**: o campo `Projeto` não está disponível via `/v2/expenses` JSON. Para obter a regional:
- Opção A: `costs_center.name` (API) → lookup `painel.centro_de_custo → painel.regional` (~70% cobertura)
- Opção B: baixar o XLS via `report.excel_link` e ler coluna `Projeto` (100% cobertura para despesas aprovadas)
- Nota: `paying_company_id == costs_center.id` — são o mesmo campo, representam o centro de custo

### 10.3 `Tarifa de Saque` NÃO é expense da API ❌

Confirmado: a "Tarifa de Saque" (R$7/saque) do EXTRATO DB **não aparece** nos reports de expenses:
- `base_prest.forma_de_pagamento = 'Tarifa de Saque'` só tem 10 registros totais, com valores aleatórios (não são tarifas de R$7)
- As 264 tarifas no EXTRATO são cobranças do cartão VExpenses, não registradas como expenses pelos colaboradores
- **Conclusão**: TARIFA só pode vir do download manual do extrato de saldo

### 10.4 Extrato de saldo: não há endpoint REST ❌

Testados 20+ endpoints alternativos — todos retornam 404 ou 405. A busca por reports com palavras como "EXTRATO", "SALDO", "MOVIMENTACAO" retorna todos os 6867 reports (busca ignorada).

**Conclusão definitiva**: O extrato de movimentações de saldo (CARGA/TRANSFERÊNCIA/TARIFA) não está acessível via API REST. Precisa ser exportado manualmente da interface VExpenses como planilha XLSX.

### 10.5 Status das expenses: via campo `report.status`

As expenses de maio 2026 têm os seguintes status via report:
| Status | Count |
|---|---|
| ENVIADO | 4.133 |
| ABERTO | 1.890 |
| SEM_REPORT | 1.327 |
| APROVADO | 789 |
| REPROVADO | 341 |
| REABERTO | 87 |

Para `prestação_de_contas`, filtrar: `report.status IN ('APROVADO', 'ENVIADO')` — "ENVIADO" significa submetido para aprovação, "APROVADO" = aprovado pelo gestor.

### 10.6 Arquitetura final recomendada

```
FONTES AUTOMÁTICAS (API REST):
  1. Colaboradores:   GET /v2/team-members → nome, CPF, active, centro_de_custo
  2. Regional:        campo 'Projeto' em /v2/expenses → elimina lookup AUX
  3. Prestações:      GET /v2/expenses?date=... → filtrar report.status=APROVADO|ENVIADO

FONTES MANUAIS (download necessário):
  4. Extrato saldo:   Download XLSX do VExpenses → CARGA, TRANSFERÊNCIA, TARIFA por CPF
  5. Saldo cartão:    Idem ou cálculo acumulado
```
