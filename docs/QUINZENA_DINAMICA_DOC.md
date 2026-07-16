# Quinzena Dinâmica — Documentação Completa

## Visão Geral

A página **Quinzena Dinâmica** consolida dados financeiros de colaboradores em períodos quinzenais (1ª e 2ª quinzena de cada mês), replicando e automatizando o processo manual feito nas planilhas CARGA e CONTROLE.

---

## Estrutura dos Dados

### Planilhas de Referência (handmade, validadas)

#### CONTROLE (planilha dinâmica)
- **Atualizada continuamente** durante a quinzena
- Contém o **PAINEL** com fórmulas vivas que calculam saldos a partir de:
  - EXTRATO (cargas, transferências, tarifas)
  - BASE PREST (prestação de contas / despesas aprovadas)
  - SALDO CARTÃO (snapshots do extrato)
- **Colunas do PAINEL**: CARGA, TRANSFERÊNCIA, TARIFA, PRESTAÇÃO DE CONTAS, SALDO PRESTAÇÃO, SALDO CARTÃO, SALDO FINAL

#### CARGA (planilha de consolidação)
- **Gerada no fechamento** (dias 10 e 25)
- Cola valores do PAINEL + adiciona colunas manuais (1ª QZ, Adiantamento, OBS)
- **Fórmulas vivas**: CARGA PARCIAL, REEMBOLSO, Carga Final
- **Colunas coladas** (paste-value): SALDO FINAL, SALDO REEMBOLSAR, SALDO CARTÃO, etc.

### Estrutura das colunas CARGA (1ª QZ)

| Col (0-idx) | Nome | Tipo | Origem |
|---|---|---|---|
| 0 | COLABORADOR | texto | CONTROLE |
| 1 | CPF | texto | CONTROLE |
| 2 | SITUAÇÃO | texto | CONTROLE |
| 3 | REGIONAL | texto | CONTROLE |
| 4 | CENTRO DE CUSTO | texto | CONTROLE |
| 5 | GESTOR | texto | CONTROLE |
| 6 | DIRETOR | texto | CONTROLE |
| 7 | SALDO REEMBOLSAR | número | PAINEL (max(-sf, 0)) |
| 8 | SALDO FINAL | número | PAINEL (max(0, sf)) |
| 9 | 1ª QZ | número | Manual (input do financeiro) |
| 10 | SALDO CARTÃO | número | PAINEL |
| 11 | Adiantamento | número | Manual |
| 12 | CARGA PARCIAL | fórmula | =1ªQZ - SALDO FINAL - SALDO CARTÃO - Adiantamento |
| 13 | REEMBOLSO | fórmula | =SALDO REEMBOLSAR * $N$4 (multiplier) |
| 14 | Carga Final | **paste-value** | =max(0, CARGA PARCIAL) + REEMBOLSO (stale!) |
| 15 | obs | texto | Manual |
| 16 | STATUS DO CARTÃO | texto | CONTROLE/STATUS |

### Estrutura das colunas CARGA (2ª QZ)

Similar à 1ª QZ, mas:
- **Sem REEMBOLSO** (sempre 0 na 2ª QZ — reembolso é mensal único pago na 1ª QZ)
- **Sem SALDO REEMBOLSAR** em algumas planilhas (ex: Junho 2QZ)
- Coluna "2ª QZ" em vez de "1ª QZ"

**Nota**: A planilha de Maio 2QZ tem coluna A vazia, deslocando todas as colunas em 1.

---

## Fórmulas e Cálculos

### Fórmulas Confirmadas (validadas 100% nas planilhas)

```
SALDO FINAL (PAINEL) = SALDO PRESTAÇÃO - SALDO CARTÃO
  onde:
    SALDO PRESTAÇÃO = CARGA + TRANSFERÊNCIA - TARIFA - PRESTAÇÃO DE CONTAS
    SALDO CARTÃO = snapshot do extrato (is_snapshot=true)

CARGA (CARGA sheet):
  SALDO FINAL (col 8) = max(0, PAINEL.saldo_final)
  SALDO REEMBOLSAR (col 7) = max(-PAINEL.saldo_final, 0)
  → Quando SALDO REEMBOLSAR > 0, SALDO FINAL = 0

CARGA PARCIAL = 1ª QZ - SALDO FINAL - SALDO CARTÃO - ADIANTAMENTO
REEMBOLSO = max(0, SALDO REEMBOLSAR) * multiplier  (apenas 1ª QZ)
CARGA FINAL = max(0, CARGA PARCIAL) + REEMBOLSO
```

### Multiplier do Reembolso (VARIA POR MÊS!)

| Mês | Quinzena | Multiplier | Fonte |
|---|---|---|---|
| Janeiro 2026 | 1QZ | 0.2 | CARGA 1QZ JANEIRO (célula N4) |
| Maio 2026 | 1QZ | 0.5 | CARGA 1QZ MAIO (célula N4) |
| Junho 2026 | 1QZ | 0.6 | CARGA 1QZ JUNHO (célula N4) |
| Qualquer mês | 2QZ | 0 (sempre) | Regra de negócio |

**IMPORTANTE**: O multiplier muda a cada mês. A API lê o valor da tabela `quinzena_config`.

### Regras de Negócio

1. **Cadastro pendente**: Se `status_cartao` contém "pendente", então `carga_parcial = 0`, `carga_final = 0`
2. **Reembolso mensal único**: Pago apenas na 1ª QZ, sempre 0 na 2ª QZ
3. **Carga Final não negativa**: `max(0, carga_parcial) + reembolso`

### ⚠️ Carga Final na planilha é STALE

A coluna "Carga Final" (col 14) na planilha CARGA é um **paste-value** (valor colado), não uma fórmula viva. Isso significa que se o multiplier do reembolso for alterado após a planilha ser gerada, a coluna Carga Final ficará desatualizada.

**A API calcula Carga Final dinamicamente** usando a fórmula correta com o multiplier atual, sendo mais confiável que a planilha.

---

## Fontes de Dados na Plataforma

### Banco de Dados (Aiven PostgreSQL)

#### `quinzena_controle_snapshot`
Armazena os dados consolidados por CPF por quinzena.
- **import_source**: Identifica a origem ('api' = pipeline automático, nome do arquivo = importado de planilha)
- **Campos PAINEL**: saldo_prestacao, saldo_cartao, saldo_final (podem ser negativos)
- **Campos CARGA**: col_qz, saldo_reembolsar, saldo_final_carga, saldo_cartao_carga

#### `quinzena_manual_inputs`
Inputs manuais editáveis na plataforma:
- `col_1qz`: Valor da quinzena (1ª ou 2ª QZ)
- `adiantamento`: Adiantamento
- `obs`: Observações

#### `quinzena_config` (NOVO)
Configurações por quinzena:
- `reembolso_multiplier`: Multiplicador do reembolso (0.2, 0.5, 0.6, etc.)

#### `extrato_movimentacao`
Extrato de cartões (63k+ registros, Mai 2025 – Jul 2026):
- `is_snapshot = true`: Saldo do cartão em uma data
- `is_snapshot = false`: Transações (cargas, transferências, tarifas, compras)

#### `somase_snapshots`
Soma de despesas aprovadas por CPF por quinzena (prestação de contas).

#### `prestacao_reports` / `prestacao_expenses`
Relatórios e despesas da API v2 (para cálculo de prestação de contas).

---

## API: `/api/quinzena-complete`

### Fluxo de Dados

1. **Ler multiplier** da tabela `quinzena_config` (default: 0.5)
2. **Buscar snapshots** em `quinzena_controle_snapshot` (filtra `import_source != 'api'`)
3. **Buscar inputs manuais** em `quinzena_manual_inputs`
4. Se não há snapshot → **Modo Calculado** (usa extrato + âncora)
5. Se há snapshot → **Modo Snapshot** (usa dados importados da planilha)
6. **Calcular** carga_parcial, reembolso, carga_final para cada linha

### Modo Snapshot vs Modo Calculado

- **Snapshot**: Dados importados de planilhas CARGA/CONTROLE. Confiável, validado.
- **Calculado**: Dados calculados via extrato Neon + âncora do snapshot anterior. Usado para quinzenas futuras sem planilha importada.

### Parâmetros

```
GET /api/quinzena-complete?year=2026&month=6&quinzena=1
```

### Resposta

```json
{
  "data_mode": "snapshot" | "calculado",
  "reembolso_multiplier": 0.6,
  "period": { "year": 2026, "month": 6, "quinzena": 1, ... },
  "statistics": { "total_rows": 337, "total_carga_final": 227899.82, ... },
  "data": [ { "cpf": "...", "colaborador": "...", "carga_final": 9971.53, ... } ]
}
```

---

## Períodos Disponíveis na Plataforma

| Período | Modo | Rows | Total Carga Final | Total Saldo Final | Total Col QZ |
|---|---|---|---|---|---|
| Maio 1QZ | snapshot | 720 | R$ 266.066,14 | R$ 417.448,74 | R$ 494.920,00 |
| Maio 2QZ | snapshot | 720 | R$ 267.736,57 | R$ 417.448,74 | R$ 452.340,00 |
| Junho 1QZ | snapshot | 337 | R$ 227.899,82 | R$ 366.597,59 | R$ 434.810,00 |
| Junho 2QZ | snapshot | 315 | R$ 215.224,60 | R$ 343.418,76 | R$ 467.210,00 |

**Notas**:
- Maio tem 720 rows (todos os colaboradores do CONTROLE, incluindo sem CARGA)
- Junho tem 337/315 rows (apenas colaboradores na CARGA, pois os demais foram filtrados)
- O total_saldo_final do API pode diferir da planilha porque o API usa o PAINEL saldo_final (pode ser negativo), enquanto a planilha CARGA usa max(0, sf)

---

## Validação

### Validação de Fórmulas (Junho 1QZ)
- **100% match** entre API e cálculo manual para todos os CPFs testados
- Fórmula: `carga_final = max(0, col_qz - saldo_final_carga - saldo_cartao_carga - adiantamento) + (max(0, saldo_reembolsar) * multiplier)`

### Validação de Totais (DB vs Sheet)
- **June 2QZ**: 100% match (carga_final, saldo_final, col_qz)
- **June 1QZ**: col_qz 100% match. Carga_final difere porque a API usa o multiplier correto (0.6) enquanto a planilha tem valores stale (0.5)
- **May 1QZ/2QZ**: Diferenças esperadas porque o API inclui 720 rows (todos do CONTROLE) vs 340/325 da CARGA

---

## Limitações Conhecidas

1. **Carga Final na planilha é stale**: A coluna Carga Final é paste-value, não fórmula viva. Se o multiplier mudar, a planilha fica desatualizada. A API é mais confiável.

2. **Saldo Final PAINEL vs CARGA**: O API mostra o PAINEL saldo_final (pode ser negativo), enquanto a planilha CARGA mostra max(0, sf). Totais não batem diretamente.

3. **Multiplier varia por mês**: Precisa ser configurado manualmente na tabela `quinzena_config` para cada nova quinzena.

4. **col_qz é sempre manual**: O valor da quinzena (1ª QZ / 2ª QZ) é inputado pelo financeiro. Não vem da API nem é calculado automaticamente.

5. **Dados cadastrais**: Regional, centro_custo, gestor, diretor não existem na API v2. São copiados do último snapshot importado de planilha.

6. **Períodos sem planilha**: Para quinzenas futuras sem planilha importada, o sistema usa modo "calculado" (extrato + âncora). Precisão ~92.5% (validado em Maio 2QZ).

---

## Como Importar Nova Quinzena

### Opção 1: Via planilha CARGA (recomendado para quinzenas passadas)

1. Coloque a planilha CARGA na pasta `data/`
2. Execute script Python para importar:
   ```python
   python import_june_db.py  # adaptar caminho
   ```
3. Importe manual inputs (col_qz, adiantamento)
4. Configure o multiplier em `quinzena_config`

### Opção 2: Via Pipeline automático (para quinzenas futuras)

1. Execute o pipeline na página Configurações
2. O pipeline baixa extrato, reports, expenses e calcula somase
3. Dados cadastrais são copiados do último snapshot
4. col_qz precisa ser inputado manualmente na plataforma

---

## Tabelas no Banco de Dados

| Tabela | Registros | Descrição |
|---|---|---|
| quinzena_controle_snapshot | 2.880 | Snapshots por CPF por quinzena |
| quinzena_manual_inputs | 2.274 | Inputs manuais (col_qz, adiantamento, obs) |
| quinzena_config | 5 | Configurações por quinzena (multiplier) |
| extrato_movimentacao | 63.112 | Extrato de cartões |
| somase_snapshots | 2.674 | Soma de despesas por CPF por quinzena |
| prestacao_reports | 7.512 | Relatórios da API v2 |
| prestacao_expenses | 101.235 | Despesas da API v2 |
| prestacao_expense_snapshots | 117.934 | Snapshots de despesas por quinzena |
| pipeline_status | 61 | Status das execuções do pipeline |
