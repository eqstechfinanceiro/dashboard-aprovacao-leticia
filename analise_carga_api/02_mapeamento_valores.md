# Mapeamento Completo: CARGA/CONTROLE → Dados da API

## Carga Quinzenal — estrutura real (verificado na planilha)

A planilha CARGA tem as seguintes colunas (índice 0-based):

| Idx | Nome | Tipo | Origem |
|---|---|---|---|
| 0 | COLABORADOR | texto | CONTROLE / cadastro |
| 1 | CPF | texto | CONTROLE / cadastro |
| 2 | SITUAÇÃO | texto | CONTROLE / cadastro |
| 3 | REGIONAL | texto | CONTROLE / cadastro |
| 4 | CENTRO DE CUSTO | texto | CONTROLE / cadastro |
| 5 | GESTOR | texto | CONTROLE / cadastro |
| 6 | DIRETOR | texto | CONTROLE / cadastro |
| 7 | SALDO REEMBOLSAR | número | PAINEL `max(-saldo_final, 0)` |
| 8 | SALDO FINAL | número | PAINEL `max(saldo_final, 0)` |
| 9 | 1ª QZ | número | manual |
| 10 | SALDO CARTAO | número | PAINEL snapshot |
| 11 | Adiantamento | número | manual |
| 12 | CARGA PARCIAL | fórmula | `1ªQZ - SALDO FINAL - SALDO CARTAO - Adiantamento` |
| 13 | REEMBOLSO | fórmula | `SALDO REEMBOLSAR * multiplier` (só 1QZ) |
| 14 | Carga Final | fórmula | `max(0, CARGA PARCIAL) + REEMBOLSO` |
| 15 | obs | texto | manual |
| 16 | STATUS DO CARTÃO | texto | CONTROLE / cadastro |

## Painel — fórmulas confirmadas

A planilha CONTROLE aba PAINEL tem as seguintes colunas principais:

| Coluna | Fórmula real | Fonte API |
|---|---|---|
| CARGA | `SUMIFS(EXTRATO!L:L, "CARGA", colaborador)` | `extrato_movimentacao` `tipo='Transferência' AND valor > 0` |
| TRANSFERENCIA | `SUMIFS(EXTRATO!L:L, "TRANSFERÊNCIA", colaborador)` | `extrato_movimentacao` `tipo='Transferência' AND valor < 0` |
| (-) TARIFA | `SUMIFS(EXTRATO!L:L, "TARIFA", colaborador)` | `extrato_movimentacao` `tipo='Taxa'` |
| (-) PRESTAÇÃO DE CONTAS | `SUMIF('BASE PREST'!J:J, CPF, 'BASE PREST'!AA:AA)` | `prestacao_reports` JOIN `prestacao_expenses` `status='APROVADO'` |
| SALDO PRESTAÇÃO | `CARGA + TRANSFERENCIA - TARIFA - PRESTAÇÃO` | cálculo acumulado |
| (-) SALDO CARTAO | `VLOOKUP(CPF, 'SALDO CARTAO'!K:L, 2, 0)` | `extrato_movimentacao` `is_snapshot=true` último <= fechamento |
| SALDO FINAL | `SALDO PRESTAÇÃO - SALDO CARTAO` | cálculo |
| 1ª QZ | `SUMIFS(QUINZENAS, quinzena="1ª QZ", mês, ano)` | manual / `quinzena_manual_inputs` |

## Transformação CARGA ← PAINEL

```text
PAINEL.saldo_final  = saldo_prestacao - saldo_cartao

CARGA.SALDO REEMBOLSAR  = max(-PAINEL.saldo_final, 0)
CARGA.SALDO FINAL       = max( PAINEL.saldo_final, 0)
CARGA.SALDO CARTAO      = saldo_cartao

CARGA.CARGA PARCIAL = col_qz - CARGA.SALDO FINAL - CARGA.SALDO CARTAO - adiantamento
CARGA.REEMBOLSO     = CARGA.SALDO REEMBOLSAR * multiplier  (só 1QZ)
CARGA.CARGA FINAL   = max(0, CARGA.CARGA PARCIAL) + CARGA.REEMBOLSO
```

## Regras de negócio

1. **Cadastro pendente**: `status_cartao` contém "pendente" → `carga_parcial = 0`, `carga_final = 0`.
2. **Reembolso mensal único**: só 1QZ, sempre 0 na 2QZ.
3. **Carga Final não negativa**: `max(0, carga_parcial) + reembolso`.
4. **Multiplier varia por mês**: Jan 0.2, Mai 0.5, Jun 0.6. Armazenado em `quinzena_config`.

## Janela temporal por quinzena

| Quinzena | Início | Fim | Fechamento | Próxima fecha (cutoff) |
|---|---|---|---|---|
| 1QZ mês M | 26/M-1 | 10/M | 10/M | 25/M |
| 2QZ mês M | 11/M | 25/M | 25/M | 10/M+1 |

A planilha PAINEL de uma quinzena é finalizada quando a **próxima quinzena fecha** (cutoff).

## Fontes API — detalhamento

### 1. Extrato (v3/pay/statement/excel-all)

Endpoint: `GET /v3/pay/statement/excel-all?start_date=...&end_date=...`
Autenticação: cookie `laravel_token`

Colunas do XLSX:

```
Data, Hora, Código de Transação, Número do Cartão, Grupo, Usuário, Tipo,
Descrição, Valor, Status, ID da Despesa, ID do Relatório, Tipo de Despesa,
Centro de Custo, Projeto, Percentual de projeto
```

- **Snapshot** (`is_snapshot=true`): `tipo` é NULL e `hora` = `-`. `valor` = saldo do cartão naquele dia.
- **CARGA**: `tipo='Transferência'` e `valor > 0` (Regional → pessoa)
- **TRANSFERÊNCIA**: `tipo='Transferência'` e `valor < 0` (pessoa → Regional)
- **TARIFA**: `tipo='Taxa'`
- **Compra / Saque / Pix / Estorno**: não entram diretamente no PAINEL como carga; vão para prestação de contas via reports.

### 2. Prestação de contas (v2/reports + v2/expenses)

Endpoint reports: `GET /v2/reports?paginate=true&include=user`
Endpoint expenses: `GET /v2/reports/{id}?include=expenses`
Autenticação: `VEXPENSES_API_KEY`

- `prestacao_reports`: todos os reports (status, user_cpf, etc.)
- `prestacao_expenses`: todas as despesas (value, report_id)
- `status='APROVADO'` → entra no somase
- `value` = coluna AA da BASE PREST

### 3. Cadastro (v2/team-members)

Endpoint: `GET /v2/team-members?paginate=true&include=costsCenters`
Autenticação: `VEXPENSES_API_KEY`

- `name` → COLABORADOR
- `cpf` → CPF
- `active` → SITUAÇÃO (true=ATIVO, false=INATIVO)
- `costsCenters.data[0].name` → CENTRO DE CUSTO
- REGIONAL, GESTOR, DIRETOR não vêm diretamente → lookup tabela `aux`

## Problemas de matching

O extrato v3 não tem CPF, só o nome do usuário. O cadastro v2 tem nome e CPF. O matching é feito por nome normalizado:

1. Match exato (uppercase, sem acento)
2. Fuzzy bigram similarity >= 0.88

Casos problemáticos conhecidos:

- CLEBERSON DO → DOS
- EVERDON → EVERSON
- LUIZ → LUIS
- GOMEA → GOMES
- WILSON extra DE
- Nomes completamente diferentes (cartões substituídos/cancelados): CHARLYTON, JEAN LUCAS, JOSE CLEBER, PRISCILA, SAMUEL, FRANCIELLY

## Quais campos a API não fornece

| Campo | Status | Solução |
|---|---|---|
| 1ª QZ / 2ª QZ | manual | `quinzena_manual_inputs` |
| Adiantamento | manual | `quinzena_manual_inputs` |
| Multiplier | manual | `quinzena_config` |
| REGIONAL | indireto | lookup centro_custo → regional via tabela `aux` |
| GESTOR | indireto | lookup regional → gestor via tabela `aux` |
| DIRETOR | indireto | lookup regional → diretor via tabela `aux` |
| STATUS DO CARTÃO | indireto | snapshot anterior ou API |
| SALDO FINAL / PRESTAÇÃO | parcial | API desde 2025-05-26, mas precisa de âncora histórica |
