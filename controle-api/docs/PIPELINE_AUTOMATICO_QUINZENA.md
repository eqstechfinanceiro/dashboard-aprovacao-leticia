# Pipeline Automático — Carga Quinzenal 100% Dinâmica

> Gerado em 17/06/2026 após investigação completa do codebase.
> Este documento descreve o estado atual de cada componente e o que falta para o pipeline funcionar de ponta a ponta sem intervenção manual (exceto as 3 colunas que são inerentemente manuais).

---

## 1. Visão Geral — Fórmula do PAINEL (motor do sistema)

```
SALDO PRESTAÇÃO  = (CARGA + TRANSFERÊNCIA - TARIFA) - PRESTAÇÃO_DE_CONTAS
SALDO FINAL      =  SALDO PRESTAÇÃO - SALDO CARTÃO

# Separação para a CARGA:
carga.SALDO FINAL      = max(SALDO FINAL, 0)
carga.SALDO REEMBOLSAR = max(-SALDO FINAL, 0)

# Fórmulas vivas da planilha CARGA:
CARGA PARCIAL = col_1qz - SALDO FINAL - SALDO CARTÃO - adiantamento
REEMBOLSO     = SALDO REEMBOLSAR × 0,5
CARGA FINAL   = max(CARGA PARCIAL, 0) + REEMBOLSO
```

---

## 2. Status de cada componente

### 2.1 PRESTAÇÃO DE CONTAS ✅ 100% automático (resolvido em 17/06/2026)

**Fonte:** API VExpenses `/v2/reports/{id}?include=expenses`  
**Tabelas Neon:**
- `prestacao_reports` — todos os reports aprovados
- `prestacao_expenses` — todas as despesas dos reports
- `prestacao_expense_snapshots` — valor histórico por (id_despesa, quinzena)
- `somase_snapshots` — **SOMASE agregado por (user_cpf, quinzena)** ← fonte final

**Script:** `src/download_prestacao_neon.py`

**Precisão validada:** 100% (R$ 0,00 de divergência, 493/493 CPFs, R$ 486.648,70 = R$ 486.648,70)

**Como atualizar numa nova quinzena:**
1. Baixar os reports aprovados no período via API (o script já faz isso idempotente)
2. Calcular o SOMASE por CPF para o novo snapshot
3. Inserir na `somase_snapshots` com a chave `(user_cpf, quinzena_nova)`

**Nota sobre IDs duplicados:** A planilha JUNHO tem 51 IDs de expenses que aparecem 2x (mesma linha duplicada). A tabela `somase_snapshots` resolve isso porque armazena o SOMASE agregado diretamente da planilha, sem depender de PKs por ID.

---

### 2.2 EXTRATO (CARGA / TRANSFERÊNCIA / TARIFA / SALDO CARTÃO) ✅ Script pronto

**Fonte:** API VExpenses v3 `/v3/pay/statement/excel-all`  
**Autenticação:** Token Laravel (cookie do browser) — expira periodicamente, precisa ser renovado manualmente no `.env` como `VEXPENSES_LARAVEL_TOKEN`  
**Tabela Neon:** `extrato_movimentacao`

**Script:** `src/download_extrato_neon.py`

**Uso:**
```bash
# Baixar período específico (ex: fechamento da 2ª QZ junho):
python src/download_extrato_neon.py --start 2026-05-26 --end 2026-06-25

# Baixar ano todo (default: 01/01 do ano atual → hoje):
python src/download_extrato_neon.py
```

**Estratégia:** chunks de 15 dias, idempotente (DELETE range + INSERT), retries automáticos.

**Estado atual:** 34.057 registros (11.279 snapshots), Jan–Jun/2026, validado.

**Mapeamento tipos → categorias do PAINEL:**

| Tipo no XLSX (extrato) | Condição | Categoria PAINEL |
|------------------------|----------|-----------------|
| `Transferência` | valor > 0 | **CARGA** |
| `Transferência` | valor < 0 | **TRANSFERÊNCIA** |
| `Taxa` | qualquer | **TARIFA** |
| `NULL` (Hora="-") | — | **SALDO CARTÃO** (snapshot) |
| `Compra`, `Saque`, `Pix`, `Estorno` | — | Prestação de contas (não entra no PAINEL) |

**Colunas da tabela `extrato_movimentacao`:**
```
id, data (DATE), hora, codigo_transacao, numero_cartao, grupo, usuario (nome),
tipo, descricao, valor NUMERIC(14,2), status, id_despesa, id_relatorio,
tipo_despesa, centro_custo, projeto, percentual_projeto,
is_snapshot BOOLEAN, created_at
```

> ⚠️ O extrato v3 NÃO tem CPF — só nome do usuário. O mapeamento nome→CPF é feito via `/v2/team-members` (99,4% de cobertura com fuzzy matching, `src/name_matcher.py`).

---

### 2.3 SALDO CARTÃO ✅ Disponível no Neon

**Fonte:** `extrato_movimentacao` WHERE `is_snapshot = TRUE`  
**Lógica:** pegar o snapshot mais recente (`MAX(data) WHERE data <= data_fechamento`) por usuário  
**Cobertura:** ~89,8% match exato vs planilha; divergências pequenas = arredondamento; grandes = transações entre snapshot e fechamento

**Query para cálculo:**
```sql
SELECT m.usuario, m.valor AS saldo_cartao, m.data AS data_snapshot
FROM extrato_movimentacao m
WHERE m.is_snapshot = TRUE
  AND m.data = (
      SELECT MAX(m2.data) FROM extrato_movimentacao m2
      WHERE m2.usuario = m.usuario
        AND m2.is_snapshot = TRUE
        AND m2.data <= :data_fechamento
  )
```

---

### 2.4 SNAPSHOTS DO CONTROLE (dados cadastrais) ⚠️ Semi-automático

**Tabela Neon:** `quinzena_controle_snapshot`  
**Colunas:** `year, month, quinzena, cpf, colaborador, situacao, status_cartao, regional, centro_custo, gestor, diretor, saldo_prestacao, saldo_cartao, saldo_final, col_qz, saldo_reembolsar, saldo_final_carga, saldo_cartao_carga`

**Script atual:** `src/import_to_neon.py` — importa da planilha CONTROLE (.xlsx)

**Estado:** ainda depende do upload manual da planilha CONTROLE. Dados cadastrais (colaborador, CPF, regional, gestor, diretor) podem ser obtidos 100% via API `/v2/team-members`.

**Dados importados:** Maio/2026 QZ1 e QZ2 (720 colaboradores cada).

---

### 2.5 ENTRADAS MANUAIS ❌ Inerentemente manual (by design)

Estas 3 colunas **nunca serão automáticas** — são decisões de negócio tomadas pela Leticia a cada quinzena:

| Campo | Descrição |
|-------|-----------|
| `col_1qz` / `col_2qz` | Valor da carga a receber nessa quinzena (por CPF) |
| `adiantamento` | Adiantamento eventual (quase sempre 0) |
| `obs` | Observações livres |

**Interface:** arquivo `data/manuais.json` por CPF:
```json
{
  "01696239478": {"col_1qz": 1750, "adiantamento": 0, "obs": ""},
  "07024923610": {"col_1qz": 700,  "adiantamento": 0, "obs": ""}
}
```

---

## 3. Regra de Quinzenas (validada em `regra_quinzena.json`)

```python
def get_periodo_quinzena(ano: int, mes: int, quinzena: int) -> tuple[str, str]:
    """Retorna (data_inicio, data_fim) para download do extrato."""
    if quinzena == 1:
        mes_ant = mes - 1 if mes > 1 else 12
        ano_ant = ano if mes > 1 else ano - 1
        return f"{ano_ant}-{mes_ant:02d}-26", f"{ano}-{mes:02d}-10"
    else:  # quinzena == 2
        return f"{ano}-{mes:02d}-11", f"{ano}-{mes:02d}-25"

def get_data_fechamento(ano: int, mes: int, quinzena: int) -> str:
    """Data de fechamento (dia em que o snapshot do cartão é capturado)."""
    if quinzena == 1:
        return f"{ano}-{mes:02d}-10"
    else:
        return f"{ano}-{mes:02d}-25"
```

**Exemplos validados:**
- 1ª QZ MAIO/2026: 26/04 → 10/05, fechamento 10/05 → 862 transações, CARGA R$ 360.533,50
- 2ª QZ MAIO/2026: 11/05 → 25/05, fechamento 25/05 → 12 transações

---

## 4. Scripts existentes e seus papéis

| Script | Papel | Estado |
|--------|-------|--------|
| `src/download_extrato_neon.py` | Baixa XLSX da API v3, normaliza e insere em `extrato_movimentacao` | ✅ Pronto |
| `src/download_prestacao_neon.py` | Baixa expenses de reports aprovados via API v2 | ✅ Pronto |
| `src/import_to_neon.py` | Importa planilha CONTROLE + CARGA para `quinzena_controle_snapshot` | ⚠️ Depende de .xlsx manual |
| `src/gerar_carga_qz.py` | Gera planilha CARGA QZ a partir do SQLite | ⚠️ Usa SQLite, não Neon |
| `gerar_carga_qz_final.py` | Versão alternativa que usa `extrato.db` | ⚠️ Legado/SQLite |
| `testes/calcular_delta_prestacao.py` | Calcula Δ(PRESTAÇÃO) entre quinzenas com 100% de precisão | ✅ Validado |
| `testes/criar_e_popular_snapshots.py` | Popula `prestacao_expense_snapshots` e `somase_snapshots` | ✅ Pronto |

---

## 5. O que falta para o pipeline ser 100% automático

### Passo 1 — Coletar extrato (CARGA/TRANSF/TARIFA/SALDO CARTÃO)
```bash
# JÁ EXISTE. Apenas executar com as datas da quinzena:
python src/download_extrato_neon.py \
  --start <data_inicio_qz> \
  --end <data_fechamento_qz>
```
**Bloqueio:** token Laravel expira. Decisão do usuário: renovar manualmente no `.env`.

### Passo 2 — Coletar PRESTAÇÃO DE CONTAS
```bash
# JÁ EXISTE. Baixa reports aprovados e expenses:
python src/download_prestacao_neon.py
# Depois popular o somase_snapshots com a nova quinzena:
python testes/criar_e_popular_snapshots.py  # ← adaptar para receber quinzena como parâmetro
```

### Passo 3 — Calcular SOMASE por CPF da nova quinzena e inserir em `somase_snapshots`
**FALTA:** adaptar `criar_e_popular_snapshots.py` para receber quinzena como parâmetro CLI e trabalhar sem depender da planilha CONTROLE (usando apenas a BASE PREST via Neon).

### Passo 4 — Calcular CARGA/TRANSFERÊNCIA/TARIFA por CPF do período
**FALTA:** um script que:
1. Leia `extrato_movimentacao` para o período da quinzena
2. Mapeia `usuario` → `cpf` via `mapeamento_nomes.json` + `/v2/team-members`
3. Agrupe por CPF: `CARGA = SUM(valor) WHERE tipo='Transferência' AND valor > 0`, etc.
4. Insira resultado numa tabela `extrato_quinzena_snapshot (cpf, quinzena, carga, transferencia, tarifa, saldo_cartao)`

### Passo 5 — Calcular SALDO FINAL por CPF
**FALTA:** script que:
1. Leia `somase_snapshots` (prestação de contas por CPF)
2. Leia `extrato_quinzena_snapshot` (carga/transf/tarifa/saldo_cartao por CPF)
3. Aplique a fórmula do PAINEL
4. Use âncora da quinzena anterior (de `quinzena_controle_snapshot`) para o SALDO PRESTAÇÃO acumulado

### Passo 6 — Gerar planilha CARGA QZ (output final)
**FALTA:** versão do `src/gerar_carga_qz.py` que leia 100% do Neon (não SQLite) e aceite `manuais.json` como entrada.

### Passo 7 (futuro) — Cron automático nos dias de fechamento
- Dias 10 e 25 de cada mês: disparar Passos 1-2 automaticamente
- Token Laravel: único ponto de intervenção manual

---

## 6. Tabelas Neon — estado atual

| Tabela | Linhas | Descrição |
|--------|--------|-----------|
| `extrato_movimentacao` | ~34.057 | XLSX extrato v3, Jan–Jun/2026 |
| `prestacao_reports` | ~9.500+ | Reports aprovados (v2 API) |
| `prestacao_expenses` | ~66.000+ | Despesas dos reports |
| `prestacao_expense_snapshots` | 126.285 | Valor por (id_despesa, quinzena) |
| `somase_snapshots` | 983 | **SOMASE por (user_cpf, quinzena)** — fonte de verdade |
| `quinzena_controle_snapshot` | 1.440 | Snapshot PAINEL de planilhas importadas |
| `quinzena_manual_inputs` | 0 | Destino de inputs manuais (vazia) |
| `quinzena_import_log` | — | Log de importações |

---

## 7. Sequência de execução numa nova quinzena (ex: 1ª QZ JULHO/2026)

```
DATA DE FECHAMENTO: 10/07/2026

1. [MANUAL] Atualizar VEXPENSES_LARAVEL_TOKEN no .env se expirou

2. [AUTO] Baixar extrato:
   python src/download_extrato_neon.py --start 2026-06-26 --end 2026-07-10

3. [AUTO] Baixar prestação de contas (reports + expenses):
   python src/download_prestacao_neon.py

4. [AUTO] Gerar SOMASE snapshot da nova quinzena:
   python testes/criar_e_popular_snapshots.py --quinzena 2026-07-1
   (⚠️ este script precisa ser adaptado para CLI e para ler da BASE PREST via API,
    não da planilha .xlsx)

5. [MANUAL] Preencher data/manuais.json com col_1qz por CPF

6. [AUTO] Gerar planilha CARGA QZ:
   python src/gerar_carga_qz.py --manuais data/manuais.json --output data/carga_julio_1qz.xlsx
   (⚠️ este script precisa ser adaptado para ler do Neon, não do SQLite)
```

---

## 8. Próximos passos priorizados

| Prioridade | Tarefa | Complexidade |
|-----------|--------|-------------|
| 🔴 Alta | Criar `extrato_quinzena_snapshot`: agregar CARGA/TRANSF/TARIFA/SALDO_CARTÃO por CPF+quinzena | Média |
| 🔴 Alta | Adaptar `criar_e_popular_snapshots.py` para CLI + sem dependência de .xlsx | Baixa |
| 🟡 Média | Reescrever `gerar_carga_qz.py` lendo 100% do Neon (substituir SQLite) | Média |
| 🟡 Média | Criar script `calcular_saldo_final_neon.py` aplicando fórmula âncora+incremento | Média |
| 🟢 Baixa | Cron Railway nos dias 10 e 25 disparando os passos 2-4 automaticamente | Alta |
| 🟢 Baixa | Interface web no dashboard para upload de manuais.json e visualização do resultado | Alta |
