# Mapeamento: Colunas da Planilha CARGA QUINZENAL

**Objetivo:** Documentar de onde vem cada informação da planilha `CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx` (tabela `carga_1qz_planilha1`).

**Premissa:** A planilha de controle (`CONTROLE - VEXPENSES - MAIO - 2026.xlsb`) é o "banco de dados" intermediário que alimenta a CARGA QZ. Toda informação do controle vem da API, com exceção do campo `1ª QZ` (único dado manual).

**Metodologia:** Correlação verificada por CPF entre `carga_1qz_planilha1` e todas as abas do controle no SQLite (340 linhas, 340 CPFs únicos).

---

## Fluxo Geral de Dados

```
API VExpenses (/v2/team-members, /v2/expenses, /v2/reports, /v2/approval-flows)
        │
        ▼
CONTROLE (planilha intermediária / banco de dados)
    ├── PAINEL         → principal fornecedor de dados da CARGA QZ
    ├── AUX            → tabela de lookup: regional → gestor → diretor
    ├── QUINZENAS      → histórico de cargas por quinzena/mês
    ├── SALDO CARTAO   → extrato de movimentações do cartão
    └── ADICIONAIS     → aportes extras por colaborador
        │
        ▼
CARGA QZ (planilha final — interface de operação)
    + 1ª QZ (único valor inserido manualmente)
    + Fórmulas calculadas em cima dos dados acima
```

---

## Mapeamento Coluna a Coluna

### Coluna A — COLABORADOR
- **Fonte:** `controle_painel.colaborador`
- **Aba controle:** PAINEL
- **Via API:** ✅ `GET /v2/team-members` → campo `name`
- **Verificação:** Match 100% dos 340 CPFs
- **Chave de junção:** CPF

---

### Coluna B — CPF
- **Fonte:** `controle_painel.cpf`
- **Aba controle:** PAINEL
- **Via API:** ✅ `GET /v2/team-members` → campo `cpf`
- **Verificação:** Chave primária de correlação entre todas as abas

---

### Coluna C — SITUAÇÃO
- **Fonte:** `controle_painel.situação`
- **Aba controle:** PAINEL
- **Via API:** ✅ `GET /v2/team-members` → campo `active` (ATIVO/INATIVO)
- **Verificação:** Match 100%

---

### Coluna D — REGIONAL
- **Fonte:** `controle_painel.regional`
- **Aba controle:** PAINEL
- **Via API:** ⚠️ Derivado — não é campo direto da API
- **Lógica:** Obtido via `approval_flow.description` do colaborador (`/v2/approval-flows`), com mapeamento customizado. Também disponível em `controle_aux.regional` (35 regionais mapeadas).
- **Verificação:** Match 100% entre carga e painel

---

### Coluna E — CENTRO DE CUSTO
- **Fonte:** `controle_painel.centro_de_custo`
- **Aba controle:** PAINEL
- **Via API:** ✅ `GET /v2/team-members?include=costsCenters` → `costs_center.description`
- **Verificação:** Match 100%

---

### Coluna F — GESTOR
- **Fonte:** `controle_aux.gestor` (lookup por `regional`)
- **Aba controle:** AUX
- **Via API:** ⚠️ Não disponível diretamente — a tabela AUX (35 linhas) mapeia cada regional para um gestor e diretor responsável
- **Lógica:** `SELECT gestor FROM controle_aux WHERE regional = carga.regional`
- **Verificação:** Match 100% (confirmado por amostra de 5 CPFs de regionais diferentes)
- **Nota:** AUX é uma tabela de configuração mantida manualmente, mas os dados de regional que acionam o lookup vêm da API

---

### Coluna G — DIRETOR
- **Fonte:** `controle_aux.diretor` (lookup por `regional`)
- **Aba controle:** AUX
- **Via API:** ⚠️ Derivável — ver `docs/08-investigacao-diretor-regional.md`
- **Lógica:** Mesmo lookup da coluna F. Cada regional tem um diretor fixo na tabela AUX.
- **Verificação:** Match 100%

---

### Coluna H — SALDO REEMBOLSAR
- **Fonte:** Calculado a partir de `controle_painel.saldo_final`
- **Aba controle:** PAINEL
- **Via API:** ⚠️ Calculado (todos os insumos vêm da API)
- **Lógica:**
  ```
  SE painel.saldo_final < 0:
      saldo_reembolsar = abs(painel.saldo_final)
  SENÃO:
      saldo_reembolsar = 0
  ```
- **Verificação:** Padrão confirmado nos 74 casos com valor > 0. Exemplos:
  - CPF `06911519624`: `painel.saldo_final = -207.17` → `carga.saldo_reembolsar = 207.17` ✅
  - CPF `27494577858`: `painel.saldo_final = -573.30` → `carga.saldo_reembolsar = 573.30` ✅
- **Interpretação:** Saldo final negativo = colaborador gastou mais do que tinha no cartão = empresa deve reembolsá-lo

---

### Coluna I — SALDO FINAL
- **Fonte:** `controle_painel.saldo_final`
- **Aba controle:** PAINEL
- **Via API:** ⚠️ Calculado no PAINEL (todos os insumos vêm da API)
- **Lógica do PAINEL:**
  ```
  saldo_final = carga + transferencia + tarifa - prestação_de_contas - saldo_cartao
  ```
  Onde:
  - `carga` = total carregado no cartão VExpenses (`/v2/expenses` tipo CARGA)
  - `transferencia` = transferências realizadas (`/v2/expenses` tipo TRANSFERÊNCIA)
  - `tarifa` = tarifas bancárias
  - `prestação_de_contas` = despesas aprovadas nos relatórios (`/v2/reports`)
  - `saldo_cartao` = saldo atual do cartão
- **Verificação:** 260/340 match direto com `painel.saldo_final`. Os 80 mismatches apresentam diferenças com valores redondos (R$1.000, R$2.000, R$5.000), sugerindo adicionais do período ainda não incorporados na CARGA QZ no momento do snapshot.
- **Nota:** A CARGA QZ é gerada no início da quinzena com o saldo disponível naquele momento; o PAINEL é atualizado continuamente.

---

### Coluna J — 1ª QZ ⚠️ ÚNICO CAMPO MANUAL
- **Fonte:** **Entrada manual**
- **Via API:** ❌ Não vem da API nem da planilha de controle
- **Descrição:** Valor da carga a ser realizada na 1ª quinzena do mês. Definido operacionalmente (decisão da gestão financeira).
- **Histórico:** Disponível em `controle_quinzenas` (11.065 registros históricos com quinzena, mês, ano, regional), mas o valor do período atual é inserido manualmente antes de ser registrado no histórico.
- **Nota:** `controle_painel.col_1ª_qz` já contém o valor definido para a quinzena corrente — pode ser lido de lá após definido.

---

### Coluna K — SALDO CARTAO
- **Fonte:** `controle_painel.saldo_cartao`
- **Aba controle:** PAINEL (também disponível em `controle_saldo_cartao_resumo.valor`)
- **Via API:** ⚠️ Via extrato do cartão VExpenses
- **Verificação:** Match 100% entre `carga.saldo_cartao` e `painel.saldo_cartao`
- **Nota:** `controle_saldo_cartao_resumo` contém o mesmo valor (registro mais recente por CPF), confirmando a consistência entre as fontes.

---

### Coluna L — Adiantamento
- **Fonte:** A investigar — vem do sistema de alguma forma
- **Via API:** ⚠️ Pendente de investigação
- **Estado atual:** Apenas 5 CPFs com valor != 0 nos dados de maio/26. Não bate com `controle_adicionais` nem com `painel.adicionais` (ambos zerados para esses CPFs).
- **Hipótese:** Pode ser um adiantamento avulso registrado em outro módulo do sistema, ou entrada manual esporádica.
- **TODO:** Investigar origem desse campo em próxima sessão.

---

### Coluna M — CARGA PARCIAL (fórmula)
- **Tipo:** Fórmula Excel
- **Fórmula original:** `=1ª QZ - SALDO FINAL - SALDO CARTAO - Adiantamento`
- **Em código:** `carga_parcial = col_1qz - saldo_final - saldo_cartao - (adiantamento or 0)`
- **Via API:** ✅ Totalmente calculável com os dados das colunas acima

---

### Coluna N — REEMBOLSO (fórmula)
- **Tipo:** Fórmula Excel
- **Fórmula original:** `=SALDO REEMBOLSAR × $N$4` (célula N4 = 0.5, constante de 50%)
- **Em código:** `reembolso = saldo_reembolsar * 0.5`
- **Via API:** ✅ Totalmente calculável
- **Regra de negócio:** A empresa reembolsa 50% do saldo negativo do colaborador por quinzena

---

### Coluna O — Carga Final (fórmula)
- **Tipo:** Fórmula Excel
- **Fórmula original:** `=IF(CARGA PARCIAL < 0, 0, CARGA PARCIAL) + REEMBOLSO`
- **Em código:** `carga_final = max(0, carga_parcial) + reembolso`
- **Via API:** ✅ Totalmente calculável
- **Regra de negócio:** Carga parcial negativa é zerada (não se desconta do colaborador); sempre soma o reembolso

---

### Coluna P — obs
- **Fonte:** Campo de anotação manual
- **Via API:** ❌ Não automatizável
- **Descrição:** Observações livres sobre o colaborador ou a operação da quinzena

---

### Coluna Q — STATUS DO CARTÃO
- **Fonte:** `controle_painel.status_do_cartão`
- **Aba controle:** PAINEL
- **Via API:** ⚠️ Via extrato/histórico do cartão
- **Verificação:** Match 100%
- **Valores:** "Cartão ativo", "Cartão bloqueado", etc.

---

## Resumo de Status por Coluna

| Col | Campo | Status | Fonte Principal |
|-----|-------|--------|-----------------|
| A | COLABORADOR | ✅ API | `painel` ← `/v2/team-members` |
| B | CPF | ✅ API | `painel` ← `/v2/team-members` |
| C | SITUAÇÃO | ✅ API | `painel` ← `team-members.active` |
| D | REGIONAL | ⚠️ Derivado | `painel` ← `approval_flows` |
| E | CENTRO DE CUSTO | ✅ API | `painel` ← `team-members.costs_center` |
| F | GESTOR | ⚠️ Lookup | `controle_aux` (regional → gestor) |
| G | DIRETOR | ⚠️ Lookup | `controle_aux` (regional → diretor) |
| H | SALDO REEMBOLSAR | ⚠️ Calculado | `abs(painel.saldo_final)` quando < 0 |
| I | SALDO FINAL | ⚠️ Calculado | `painel.saldo_final` |
| J | 1ª QZ | ❌ Manual | Entrada manual (único campo externo) |
| K | SALDO CARTAO | ⚠️ Via extrato | `painel.saldo_cartao` |
| L | Adiantamento | 🔍 A investigar | Origem pendente |
| M | CARGA PARCIAL | ✅ Fórmula | `J - I - K - L` |
| N | REEMBOLSO | ✅ Fórmula | `H × 0.5` |
| O | Carga Final | ✅ Fórmula | `max(0, M) + N` |
| P | obs | ❌ Manual | Campo de anotação |
| Q | STATUS DO CARTÃO | ⚠️ Via extrato | `painel.status_do_cartão` |

**Legenda:**
- ✅ **API** — dado direto de endpoint VExpenses
- ⚠️ **Derivado/Calculado** — insumos vêm da API, mas requer transformação ou lookup
- ❌ **Manual** — não automatizável via API
- 🔍 **A investigar** — origem ainda não confirmada

---

## Abas do Controle Utilizadas pela CARGA QZ

| Aba Controle | Tabela SQLite | Papel |
|---|---|---|
| **PAINEL** | `controle_painel` | Principal fornecedor — quase todas as colunas |
| **AUX** | `controle_aux` | Lookup regional → gestor/diretor (35 regionais) |
| **QUINZENAS** | `controle_quinzenas` | Histórico de cargas por quinzena (referência) |
| **SALDO CARTAO RESUMO** | `controle_saldo_cartao_resumo` | Saldo atual do cartão (backup do painel) |

### Abas do Controle NÃO utilizadas diretamente pela CARGA QZ
| Aba | Motivo |
|---|---|
| REEMBOLSO | Dados já consolidados no `painel.saldo_prestação` |
| ADICIONAIS | Dados já consolidados no `painel.adicionais` |
| ADICIONAL ITAÚ | Consolidado em `painel.adicional_itau` |
| DETALHES 1/2/3 | Nível de detalhe de despesas individuais (não agregado) |
| BASE PRESTAÇÕES | Nível de detalhe de despesas (não agregado) |
| EXTRATO | Transações brutas (base para calcular saldos do PAINEL) |
| SALDOS ADM | Colaboradores administrativos (universo diferente) |

---

## Próximos Passos

1. **Investigar `adiantamento` (col L)** — identificar a aba/sistema de origem
2. **Implementar gerador de CARGA QZ** — função que monta a planilha a partir do PAINEL + AUX + valor de `1ª QZ`
3. **Validar `saldo_final`** — entender os 80 casos de divergência (adicionais do período corrente)
