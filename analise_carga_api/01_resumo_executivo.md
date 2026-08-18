# Análise Carga Quinzenal — API-only

## Objetivo

Entender como gerar uma planilha **CARGA** a cada quinzena usando **apenas dados da API**, usando as planilhas CARGA/CONTROLE como referência e validação (não como fonte de dados).

## 1. Como a CARGA é construída (o que as planilhas fazem)

### A CARGA é um "print" do PAINEL do CONTROLE

Colunas A–L e Q da CARGA são **valores colados** (paste values) do PAINEL do CONTROLE. As únicas fórmulas vivas são:

1. **CARGA PARCIAL** = `1ª QZ - SALDO FINAL - SALDO CARTAO - Adiantamento`
2. **REEMBOLSO** = `SALDO REEMBOLSAR * multiplier` (só 1ª QZ)
3. **Carga Final** = `max(0, CARGA PARCIAL) + REEMBOLSO`

### O PAINEL (motor real) — fórmulas confirmadas

| Campo PAINEL | Fórmula na planilha | Fonte equivalente na API |
|---|---|---|
| CARGA | `SUMIFS(EXTRATO!L:L, "CARGA", colaborador)` | `extrato_movimentacao` — `Transferência` **positiva** |
| TRANSFERÊNCIA | `SUMIFS(EXTRATO, "TRANSFERÊNCIA", colaborador)` | `extrato_movimentacao` — `Transferência` **negativa** |
| (-) TARIFA | `SUMIFS(EXTRATO, "TARIFA", colaborador)` | `extrato_movimentacao` — `Taxa` |
| (-) PRESTAÇÃO DE CONTAS | `SUMIF('BASE PREST'!CPF, AA)` | `prestacao_reports` + `prestacao_expenses` (status APROVADO) |
| SALDO PRESTAÇÃO | `(CARGA + TRANSFERÊNCIA - TARIFA) - PRESTAÇÃO` | cálculo |
| (-) SALDO CARTAO | `VLOOKUP(CPF, 'SALDO CARTAO')` | snapshot de `extrato_movimentacao` (`is_snapshot=true`) |
| **SALDO FINAL** | `SALDO PRESTAÇÃO - SALDO CARTAO` | cálculo |

### CARGA vs PAINEL

A CARGA divide o `saldo_final` do PAINEL em duas colunas:

- `CARGA.SALDO FINAL` = `max(0, PAINEL.saldo_final)`
- `CARGA.SALDO REEMBOLSAR` = `max(-PAINEL.saldo_final, 0)`

Quando `SALDO REEMBOLSAR > 0`, `SALDO FINAL = 0` na CARGA.

## 2. Datas de quinzena (regra validada)

- **1ª QZ**: período 26 do mês anterior → 10 do mês atual (fechamento dia 10)
- **2ª QZ**: período 11 → 25 do mês atual (fechamento dia 25)

## 3. Fontes de dados API → valores da CARGA

| Campo CARGA | Fonte API | Como obter |
|---|---|---|
| COLABORADOR, CPF, SITUAÇÃO | `/v2/team-members` | `name`, `cpf`, `active` |
| CENTRO DE CUSTO | `/v2/team-members` (com `costsCenters`) | `costs_center.description` |
| REGIONAL, GESTOR, DIRETOR | não existe diretamente na API | copiado do snapshot anterior (lookup regional) |
| SALDO FINAL / SALDO REEMBOLSAR | PAINEL.saldo_final | `max(0, saldo_prestacao - saldo_cartao)` / `max(-..., 0)` |
| SALDO CARTAO | `extrato_movimentacao` snapshot | último `is_snapshot=true` <= data de fechamento |
| CARGA | `extrato_movimentacao` | `Transferência` positiva no período |
| TRANSFERÊNCIA | `extrato_movimentacao` | `Transferência` negativa no período (valor absoluto) |
| TARIFA | `extrato_movimentacao` | `Taxa` no período |
| PRESTAÇÃO DE CONTAS | `prestacao_reports` + `prestacao_expenses` | `status = 'APROVADO'` e `value` por CPF |
| 1ª QZ / 2ª QZ | input manual | `quinzena_manual_inputs` |
| Adiantamento | input manual | `quinzena_manual_inputs` |
| STATUS DO CARTÃO | cadastro | `team-members` ou snapshot anterior |
| Multiplier | `quinzena_config` | configurado por quinzena |

## 4. Problema central: SALDO FINAL é acumulado desde a criação do cartão

O PAINEL acumula CARGA + TRANSFERÊNCIA - TARIFA - PRESTAÇÃO desde a criação do cartão. A BASE PREST tem despesas de ago/2025 e antes. O extrato API começa em 2025-05-26. Não temos o histórico completo de todos os cartões.

### Consequência

Não é possível calcular `saldo_final` 100% apenas com os dados da API (2026+) **sem um ponto de partida histórico**. É necessário uma **âncora** (último `saldo_final` confiável) e calcular as novas quinzenas por **incremento**.

### Fórmula correta (âncora + incremento)

```
SALDO PRESTAÇÃO(âncora) = SALDO FINAL(âncora) + SALDO CARTAO(âncora)

SALDO PRESTAÇÃO(nova) = SALDO PRESTAÇÃO(âncora)
                      + Δ(CARGA + TRANSFERÊNCIA - TARIFA) no período
                      - Δ(PRESTAÇÃO) no período

SALDO FINAL(nova) = SALDO PRESTAÇÃO(nova) - SALDO CARTAO(nova)
```

## 5. Estado atual do banco de dados

### `quinzena_controle_snapshot`

| Período | Linhas | Import Source |
|---|---|---|
| 2026-05-1 | 720 | CONTROLE + CARGA MAIO 1QZ |
| 2026-05-2 | 720 | CONTROLE + CARGA MAIO 2QZ |
| 2026-06-1 | 720 | `api` (cadastro sem dados financeiros) |
| 2026-06-2 | 720 | `api` (cadastro sem dados financeiros) |

### Outras tabelas

- `extrato_movimentacao`: 63.112 registros
  - snapshots: 12.861
  - **458 snapshots com `valor NULL` (problema de dados)**
  - transferências, taxas, compras, saques, pix, estornos
- `prestacao_reports`: 7.512 (6.410 APROVADO)
- `prestacao_expenses`: 101.235
- `somase_snapshots`: 2.673 (por quinzena)
- `quinzena_config`: multipliers configurados (Jan 0.2, Mai 0.5, Jun 0.6)
- `quinzena_manual_inputs`: col_qz e adiantamentos para Março, Abril, Junho, Julho

## 6. Problemas encontrados

### 6.1 Snapshots com `valor NULL` no extrato

Há 458 registros `is_snapshot=true` com `valor NULL`. Isso quebra a leitura do `saldo_cartao` no `calcular_quinzena_neon.py`.

**Impacto:** `buscar_saldo_cartao()` falha com `TypeError: float() argument must be a string or a real number, not 'NoneType'`.

**Causa provável:** linhas do XLSX de extrato com `valor` em branco ou `NaN` foram importadas como `NULL` no banco.

**Ação recomendada:** limpar/validar os dados de extrato, garantir que todo snapshot tenha valor numérico, e proteger queries contra `NULL`.

### 6.2 `calcular_quinzena_neon.py` não usa âncora + incremento

O script usa:

- Prioridade 1: `saldo_final_carga` da planilha (quando existe)
- Prioridade 2: `saldo_final` do PAINEL do snapshot
- Prioridade 3: calcula `saldo_prestacao` a partir do extrato **do período** (não acumulado)

A prioridade 3 está errada para a regra acumulada do PAINEL. Deveria usar `saldo_prestacao` da quinzena anterior como âncora e somar o delta do período.

### 6.3 `app/api/quinzena-complete/route.ts` também não usa âncora + incremento

O endpoint calcula `saldo_prestacao` acumulado de 2026-01-01 até `end_date`. Isso assume que o saldo inicial em 2026-01-01 era zero, o que é falso para cartões com histórico pré-2026.

**Resultado:** o modo `calculado` diverge da planilha real.

### 6.4 Planilha CARGA JUNHO 1QZ tem valores "stale"

A CARGA 1QZ JUNHO analisada tem `Carga Final` com 3 casas decimais e valores que não batem com o multiplier 0.6. Exemplo ABNER:

- `SALDO REEMBOLSAR` = 227.55
- `CARGA PARCIAL` = 9.835,00
- `REEMBOLSO` = 136,53 (0.6 × 227.55)
- `Carga Final` na planilha = 9.948,775 (parece 0.5 × 227.55 = 113,775 + 9.835,00)

Isso confirma que a **CARGA Final na planilha é colada (stale)**: se o multiplier mudou de 0.5 para 0.6, os valores não atualizam. A API recalculando é mais confiável.

### 6.5 CARGA JUNHO 1QZ tem 382 linhas, mas snapshot do DB tem 720

A planilha `CARGA 1 QZ JUNHO 26 VEXPENSES EQS.xlsx` tem 382 colaboradores com dados. O DB `quinzena_controle_snapshot` para 2026-06-1 tem 720 linhas importadas como `api` (sem dados financeiros).

**Impacto:** o dashboard filtra `import_source != 'api'`, então cai em modo `calculado` com os 720 cadastros do CONTROLE. Mas a CARGA real tem 382 linhas. Isso gera divergência de base (número de colaboradores) e valores.

## 7. O que precisa ser feito para gerar CARGA 100% API

### 7.1 Corrigir a qualidade do extrato

1. Identificar e corrigir os 458 snapshots com `valor NULL`.
2. Rebaixar o extrato se necessário.
3. Validar que todo snapshot tem `valor` numérico.

### 7.2 Implementar o cálculo por âncora + incremento

Para cada quinzena `Q`:

1. Pegar a quinzena anterior `Q-1` como âncora.
2. Obter `saldo_prestacao_ancora` e `saldo_cartao_ancora` do snapshot da âncora.
3. Calcular delta do período da quinzena `Q`:
   - `delta_carga` = soma `Transferência` positiva no período
   - `delta_transferencia` = soma `Transferência` negativa (abs) no período
   - `delta_tarifa` = soma `Taxa` no período
   - `delta_prestacao` = soma `value` de reports APROVADOS no período
4. `saldo_prestacao_q = saldo_prestacao_ancora + delta_carga - delta_transferencia - delta_tarifa - delta_prestacao`
5. `saldo_cartao_q = último snapshot <= data_fechamento`
6. `saldo_final_q = saldo_prestacao_q - saldo_cartao_q`
7. Aplicar `max(0, saldo_final_q)` e `max(-saldo_final_q, 0)` para CARGA.
8. Aplicar fórmulas vivas: CARGA PARCIAL, REEMBOLSO, CARGA FINAL.

### 7.3 Snapshotar saldo_prestacao e saldo_final a cada quinzena

Criar tabelas `quinzena_painel_snapshot` (ou colunas na `quinzena_controle_snapshot`) para guardar `saldo_prestacao` e `saldo_final` calculados por CPF a cada quinzena. Isso permite usar a quinzena `Q` como âncora para `Q+1`.

### 7.4 Inputs manuais

- `col_qz` (1ª QZ / 2ª QZ) continua manual (não vem da API).
- `adiantamento` continua manual.
- `multiplier` configurado em `quinzena_config` por quinzena.

### 7.5 Dados cadastrais

- REGIONAL, GESTOR, DIRETOR não vêm diretamente da API v2.
- Solução: manter a tabela `aux` (centro_custo → regional → gestor/diretor) e copiar do último snapshot.
- Na primeira quinzena 100% API, precisa de pelo menos um snapshot anterior como base de cadastro.

## 8. Validação sugerida

### Passo a passo

1. Usar Maio 1QZ como âncora (já importado da planilha, confiável).
2. Calcular Maio 2QZ via API (âncora + incremento).
3. Comparar com a planilha `CARGA 2 QZ MAIO 26 VEXPENSES EQS.xlsx`.
4. Ajustar cutoff, matching nome→CPF, e regras até atingir 100% (ou o menor erro possível).
5. Depois, usar Maio 2QZ como âncora para calcular Junho 1QZ, e comparar.

### Métricas

- Match por CPF: `saldo_final`, `saldo_cartao`, `carga_parcial`, `reembolso`, `carga_final`.
- Totais: `total_carga_final`, `total_saldo_final`, `total_col_qz`.
- Divergências: listar CPFs com diffs e explicar (tarifas, estornos, nomes não mapeados, cutoff).

## 9. Conclusão

É **possível** gerar CARGA 100% API, mas **não** dá para calcular `saldo_final` do zero com apenas os dados de 2026. A solução é:

- Usar **âncora** (último PAINEL confiável, pode vir de uma planilha importada).
- A cada quinzena, calcular **incrementos** (CARGA, TRANSFERÊNCIA, TARIFA, PRESTAÇÃO) com API.
- Snapshotar o resultado para servir de âncora para a próxima quinzena.
- Corrigir problemas de dados (snapshots NULL, matching nome→CPF, cutoff).
- Manter inputs manuais (`col_qz`, `adiantamento`, `multiplier`) e cadastrais (regional/gestor/diretor).

As planilhas CARGA/CONTROLE devem ser usadas apenas para **validação** e para obter a **âncora inicial**. Depois disso, o sistema pode rodar sozinho com API.
