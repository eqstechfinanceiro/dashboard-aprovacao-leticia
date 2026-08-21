# Mapeamento de Colunas Confirmado — Importação para o Neon

> Gerado em 15/06/2026 após inspeção real com `inspect_all.py`.
> Este documento serve de referência para o script `src/import_to_neon.py`.

---

## Resultado da Inspeção

Todos os 4 arquivos foram inspecionados com `inspect_all.py`. As diferenças entre os arquivos foram confirmadas — não se deve assumir que planilhas de meses ou quinzenas diferentes têm a mesma estrutura.

---

## Planilhas de Carga

### CARGA 1ª QZ (`CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx`)

| Propriedade | Valor |
|---|---|
| Aba principal | `Planilha1` |
| Linha do cabeçalho **real** | **6** (linhas 1-5 são pré-cabeçalho) |
| Linha de dados | 7 em diante |
| Total de linhas | 346 (340 colaboradores) |
| Total de colunas | 17 |

**Pré-cabeçalho:**
- Linha 4: célula N4 = `0.5` (parâmetro do cálculo REEMBOLSO)
- Linha 5: SUBTOTAIs das colunas numéricas (H-O) — detectado como "cabeçalho" pelo `find_header_row` com threshold=5, por isso o script deve usar `header_row=6` fixo

**Colunas (índice 1-based):**

| Col | Nome | Índice 0-based | Tipo | Origem |
|-----|------|---------------|------|--------|
| 1 | COLABORADOR | 0 | Texto | PAINEL |
| 2 | CPF | 1 | Texto | PAINEL |
| 3 | SITUAÇÃO | 2 | Texto | PAINEL |
| 4 | REGIONAL | 3 | Texto | PAINEL |
| 5 | CENTRO DE CUSTO | 4 | Texto | PAINEL |
| 6 | GESTOR | 5 | Texto | PAINEL (via AUX) |
| 7 | DIRETOR | 6 | Texto | PAINEL (via AUX) |
| 8 | SALDO REEMBOLSAR | 7 | Numérico | Calculado |
| 9 | SALDO FINAL | 8 | Numérico | PAINEL |
| 10 | 1ª QZ | 9 | Numérico | **MANUAL** |
| 11 | SALDO CARTAO | 10 | Numérico | SALDO CARTAO resumo |
| 12 | Adiantamento | 11 | Numérico | **MANUAL** |
| 13 | CARGA PARCIAL | 12 | Numérico | Calculado: `1ªQZ - SF - SC - Adit` |
| 14 | REEMBOLSO | 13 | Numérico | Calculado: `SALDO_REEMBOLSAR × 0.5` |
| 15 | Carga Final | 14 | Numérico | Calculado: `max(0, CP) + REEM` |
| 16 | obs | 15 | Texto | **MANUAL** |
| 17 | STATUS DO CARTÃO | 16 | Texto | PAINEL |

---

### CARGA 2ª QZ (`CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx`)

| Propriedade | Valor |
|---|---|
| Aba principal | `2 QZ DE MAIO 26` |
| Aba extra | `STATUS CARTÃO` (exportado da VExpenses) |
| Linha do cabeçalho **real** | **4** (linhas 1-3 são pré-cabeçalho) |
| Linha de dados | 5 em diante |
| Total de linhas | 329 (325 colaboradores) |
| Total de colunas | **18** (diferente da 1ª QZ!) |

**Pré-cabeçalho:**
- Linha 2: total CARGA FINAL (col 16)
- Linha 3: subtotais das colunas H-O

**Colunas (índice 1-based) — DIFERENÇAS em relação à 1ª QZ:**

| Col | Nome | Índice 0-based | Diferença vs 1ª QZ |
|-----|------|---------------|-------------------|
| 1 | (vazia) | 0 | — |
| 2 | COLABORADOR | 1 | **col 1 na 1ª QZ, col 2 aqui** |
| 3 | CPF | 2 | **col 2 na 1ª QZ, col 3 aqui** |
| 4 | SITUAÇÃO | 3 | **deslocado +1** |
| 5 | CENTRO DE CUSTO | 4 | **REGIONAL ausente nesta QZ** |
| 6 | GESTOR | 5 | — |
| 7 | DIRETOR | 6 | — |
| 8 | SALDO PENDENTE PARCIAL | 7 | **renomeado** (era SALDO REEMBOLSAR) |
| 9 | CARGA 1 QZ | 8 | **campo novo** (referência da 1ª QZ) |
| 10 | SALDO FINAL | 9 | — |
| 11 | 2ª QZ | 10 | **era `1ª QZ`** |
| 12 | SALDO CARTAO | 11 | — |
| 13 | Adiantamento | 12 | — |
| 14 | CARGA PARCIAL | 13 | — |
| 15 | REEMBOLSO | 14 | — |
| 16 | Carga Final | 15 | — |
| 17 | obs | 16 | — |
| 18 | STATUS DO CARTÃO | 17 | — |

**Aba STATUS CARTÃO:**
- Cabeçalho: linha 2
- Dados: linha 3 em diante
- 605 linhas (exportado direto da VExpenses)
- Colunas: Nome (col 3), E-mail (4), Tipo de usuário (5), **Status do Cartão** (6), Permissão de Uso (7), Permissão de Gestão (8)

---

## Planilhas de Controle

### Aba PAINEL — MAIO e JUNHO (idêntica estrutura)

| Propriedade | Valor |
|---|---|
| Linha do cabeçalho | **11** |
| Linha de dados | 12 em diante |
| MAIO: total de linhas | 732 (720 colaboradores) |
| JUNHO: total de linhas | 739 (727 colaboradores) |
| Total de colunas declaradas | 27 |

> ⚠️ `max_column` reportado como 149 pelo openpyxl (colunas ocultas/extras do Excel).
> Usar apenas as 27 primeiras colunas significativas.

**Colunas relevantes para importação (índice 0-based):**

| Índice | Col Excel | Nome | Usado em |
|--------|-----------|------|----------|
| 1 | B | COLABORADOR | snapshot |
| 2 | C | CPF | snapshot (chave) |
| 4 | E | SITUAÇÃO | snapshot |
| 5 | F | STATUS DO CARTÃO | snapshot |
| 8 | I | REGIONAL | snapshot |
| 9 | J | CENTRO DE CUSTO | snapshot |
| 10 | K | GESTOR | snapshot |
| 11 | L | DIRETOR | snapshot |
| 17 | R | SALDO PRESTAÇÃO | snapshot |
| 18 | S | (-) SALDO CARTAO | snapshot (fallback) |
| 19 | T | SALDO FINAL | snapshot |

**Parâmetros na planilha:**
- Linha 7, col 22-23: ANO = 2026
- Linha 8, col 22-23: MÊS = "MAIO" / "JUNHO"
- Linha 10: totais das colunas numéricas (linha de subtotais)

---

### Aba SALDO CARTAO — MAIO e JUNHO (idêntica estrutura)

A aba contém **duas tabelas lado a lado**:

**Tabela 1 (transações individuais):** cols B-G (índices 1-6)
- Cabeçalho: linha 4
- Dados: linha 5 em diante
- MAIO: 7.946 transações, JUNHO: 8.292 transações
- Colunas: PORTADOR, CPF, VALOR, DATA, MÊS, EMPRESA

**Tabela 2 (resumo por colaborador — usada para importação):** cols J-M (índices 9-12)
- Cabeçalho: linha 4 (mesma linha que tabela 1)
- Dados: linha 5 em diante
- MAIO: 606 CPFs únicos, JUNHO: ~614 CPFs
- Colunas relevantes:

| Índice 0-based | Col Excel | Nome |
|---------------|-----------|------|
| 9 | J | PORTADOR (nome) |
| 10 | K | CPF |
| 11 | L | VALOR (saldo atual) |
| 12 | M | DATA |

> ⚠️ MAIO tem col 14 extra com o valor duplicado. JUNHO não tem essa col 14.
> O script usa apenas os índices 9-12 — compatível com ambos os meses.

---

### Aba AUX (idêntica nos dois meses)

- Cabeçalho: linha 2
- Dados: linha 3 em diante (~35 registros)
- Colunas (índice 0-based):
  - 1: REGIONAL
  - 2: GESTOR
  - 3: DIRETOR
  - 4: REGIONAL2 (alternativa)

---

## Tabelas no Neon Criadas

```sql
-- Snapshot do controle por quinzena
quinzena_controle_snapshot (
  id, year, month, quinzena, cpf,
  colaborador, situacao, status_cartao,
  regional, centro_custo, gestor, diretor,
  saldo_prestacao, saldo_cartao, saldo_final,
  import_source, imported_at
  UNIQUE(year, month, quinzena, cpf)
)

-- Log de cada importação
quinzena_import_log (
  id, year, month, quinzena, filename,
  rows_imported, rows_skipped, rows_failed,
  status, error_details, imported_at
)

-- Expandida: adicionado campo cpf
quinzena_manual_inputs (
  ..., cpf VARCHAR(20)  -- campo novo
)
```

---

## Dados Importados

| Período | QZ | Fonte | Linhas | Status |
|---------|-----|-------|--------|--------|
| Maio 2026 | 1 | CONTROLE MAIO | 720 | ✅ success |
| Maio 2026 | 2 | CONTROLE MAIO | 720 | ✅ success |

---

## Como Importar um Novo Mês

```bash
# Do diretório controle-api/:
python src/import_to_neon.py \
  --controle "data/CONTROLE - VEXPENSES - JUNHO - 2026.xlsx" \
  --year 2026 --month 6 --quinzena 1

python src/import_to_neon.py \
  --controle "data/CONTROLE - VEXPENSES - JUNHO - 2026.xlsx" \
  --year 2026 --month 6 --quinzena 2

# Testar sem gravar:
python src/import_to_neon.py --controle "data/..." --year 2026 --month 6 --quinzena 1 --dry-run
```

O script usa UPSERT — reimportar um período existente atualiza os dados sem duplicar.
