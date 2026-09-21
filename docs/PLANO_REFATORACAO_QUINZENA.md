# Plano de Refatoração — Página /quinzena-dinamica

**Data:** 2026-06-15  
**Objetivo:** Substituir o fluxo atual (SQLite local → carga manual) por um fluxo completo baseado em Neon PostgreSQL + interface web editável com histórico de quinzenas.

---

## 1. Contexto e Estado Atual

### O que existe hoje

A página `/quinzena-dinamica` já funciona, mas com limitações sérias:

- **Dados de `saldo_final`, `saldo_cartao` e `status_do_cartão`** são estimados por ratios matemáticos hardcoded (`saldo_final_ratio: 0.8505`, etc.) — uma aproximação que não reflete os valores reais da planilha de controle.
- **Inputs manuais** (`col_1qz`, `adiantamento`, `obs`) já são salvos no Neon, na tabela `quinzena_manual_inputs`, mas só os três campos.
- **Os demais dados** (colaborador, CPF, situação, regional, centro de custo, gestor, diretor) já vêm da API VExpenses em tempo real.
- **Não existe histórico** — não é possível consultar quinzenas passadas com os valores reais.

### Por que refatorar

1. Os valores de `saldo_final`, `saldo_cartao` e `status_do_cartão` precisam vir da **planilha de controle** (atualizada quinzenalmente), não de uma estimativa.
2. A planilha de controle muda a cada quinzena — precisamos de um mecanismo de **importação de dados** para o Neon.
3. É necessário **navegar entre quinzenas** com dados históricos reais.
4. A interface precisa ser mais completa para o fluxo operacional real.

---

## 2. Mapeamento Completo dos Dados por Origem

### Planilha de Carga QZ (arquivo: `CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx`)
- **Aba:** Planilha1
- **Cabeçalho:** Linha 6
- **Dados:** Linhas 7 em diante (~346 linhas por quinzena)
- **Pré-cabeçalho:** Linha 4 tem constante `0.5` (multiplicador REEMBOLSO), Linha 5 tem SUBTOTAL de resumo

| Coluna | Campo | Origem | Editável | Observação |
|--------|-------|---------|----------|------------|
| A | COLABORADOR | API VExpenses (`team-members.name`) | Não | Join via CPF |
| B | CPF | API VExpenses (`team-members.cpf`) | Não | Chave de join |
| C | SITUAÇÃO | API VExpenses (`team-members.active`) | Não | ATIVO/INATIVO |
| D | REGIONAL | Inferência via centro de custo | Não | Extraído do nome do CC |
| E | CENTRO DE CUSTO | API VExpenses (`costs_center.name`) | Não | |
| F | GESTOR | API VExpenses / tabela AUX da planilha | Não | Via approval_flow |
| G | DIRETOR | API VExpenses / tabela AUX da planilha | Não | Via approval_flow |
| H | SALDO REEMBOLSAR | **Planilha de Controle (PAINEL)** | Não | `abs(saldo_final)` quando negativo |
| I | SALDO FINAL | **Planilha de Controle (PAINEL)** | Não | Campo `SALDO_FINAL` do PAINEL |
| J | 1ª QZ / 2ª QZ | **Manual** (usuário digita) | **Sim** | Valor de carga da quinzena |
| K | SALDO CARTAO | **Planilha de Controle (SALDO CARTAO resumo)** | Não | Último saldo do cartão por CPF |
| L | Adiantamento | **Manual** (usuário digita) | **Sim** | |
| M | CARGA PARCIAL | **Calculado**: `J - I - K - L` | Não | Fórmula Excel |
| N | REEMBOLSO | **Calculado**: `H * 0.5` | Não | Fórmula Excel |
| O | Carga Final | **Calculado**: `MAX(0, M) + N` | Não | Fórmula Excel |
| P | obs | **Manual** (usuário digita) | **Sim** | |
| Q | STATUS DO CARTÃO | **Planilha de Controle (PAINEL)** | Não | Status atual do cartão |

### Planilha de Controle (arquivo: `CONTROLE - VEXPENSES - MAIO - 2026.xlsx`)

#### Aba: PAINEL
- **Cabeçalho:** Linha 11 (atenção — linhas 1-10 são pré-cabeçalho/configuração)
- **Dados:** Linha 12 em diante (~721 linhas)
- **Campos usados para a carga QZ:**
  - `SALDO_FINAL` (coluna T) — fórmula `=R-S`
  - `SALDO_PRESTACAO` (coluna R) — fórmula `=N+O+P+Q`
  - `STATUS DO CARTÃO` (coluna da aba PAINEL)
  - `SITUAÇÃO` / `SITUACAO_COLABORADOR`
  - `CPF` — chave de join

#### Aba: SALDO CARTAO (Resumo)
- **Cabeçalho:** Linha 4
- **Dados:** Linha 5 em diante (~606 linhas)
- **Colunas:** J a N (segunda tabela na mesma aba)
- **Campo usado:** Último saldo do cartão por CPF → `SALDO_CARTAO` da carga

---

## 3. Schema do Banco Neon (Tabelas Novas)

### Tabelas existentes (não mexer)
- `api_cache` — cache da API VExpenses
- `preload_stats` — estatísticas de preload
- `quinzena_manual_inputs` — inputs manuais (já existente, será expandida)

### Novas tabelas a criar

#### `quinzena_controle_snapshot`
Armazena os dados importados da planilha de controle para cada quinzena. É o "snapshot" do PAINEL + SALDO CARTAO resumo no momento do fechamento.

```sql
CREATE TABLE quinzena_controle_snapshot (
  id                  SERIAL PRIMARY KEY,
  year                INTEGER NOT NULL,
  month               INTEGER NOT NULL,
  quinzena            INTEGER NOT NULL,  -- 1 ou 2
  cpf                 VARCHAR(20) NOT NULL,
  colaborador         VARCHAR(255),
  situacao            VARCHAR(50),
  status_cartao       VARCHAR(100),
  saldo_final         NUMERIC(12,2),     -- Do PAINEL, coluna T
  saldo_prestacao     NUMERIC(12,2),     -- Do PAINEL, coluna R
  saldo_cartao        NUMERIC(12,2),     -- Da aba SALDO CARTAO resumo
  regional            VARCHAR(100),
  centro_custo        VARCHAR(255),
  gestor              VARCHAR(255),
  diretor             VARCHAR(255),
  imported_at         TIMESTAMPTZ DEFAULT NOW(),
  import_source       VARCHAR(255),      -- Nome do arquivo importado
  UNIQUE(year, month, quinzena, cpf)
);
```

#### `quinzena_manual_inputs` (expandir a existente)
A tabela atual tem apenas 3 campos. Vamos verificar se precisa de migração ou se adicionamos colunas.

```sql
-- Já existe:
-- id, user_id (int), year, month, quinzena, obs, col_1qz, adiantamento, updated_at

-- Problema: usa user_id (int do VExpenses) mas o snapshot usa CPF.
-- Precisamos garantir consistência. Adicionar cpf como coluna opcional:
ALTER TABLE quinzena_manual_inputs ADD COLUMN IF NOT EXISTS cpf VARCHAR(20);
```

#### `quinzena_import_log`
Rastreia cada importação de planilha (auditoria).

```sql
CREATE TABLE quinzena_import_log (
  id              SERIAL PRIMARY KEY,
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL,
  quinzena        INTEGER NOT NULL,
  filename        VARCHAR(500) NOT NULL,
  rows_imported   INTEGER,
  rows_failed     INTEGER,
  status          VARCHAR(50),   -- 'success', 'partial', 'failed'
  error_details   JSONB,
  imported_at     TIMESTAMPTZ DEFAULT NOW(),
  imported_by     VARCHAR(255)
);
```

---

## 4. Fluxo de Dados Refatorado

```
A cada quinzena (dia 11 e dia 25):
┌─────────────────────────────────────────────────────────────┐
│  1. Usuário faz upload da planilha de controle atualizada   │
│     (CONTROLE - VEXPENSES - MÊS - ANO.xlsx)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Script de importação (Python ou API route Next.js)      │
│     Lê: aba PAINEL (linha 11+) → saldo_final, status_cartão │
│     Lê: aba SALDO CARTAO resumo (J4+) → saldo_cartao        │
│     Salva: quinzena_controle_snapshot                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Página /quinzena-dinamica                               │
│     Busca snapshot do Neon por (year, month, quinzena)      │
│     + Dados da API VExpenses (colaborador, CC, gestor)      │
│     + Manual inputs do Neon (col_1qz, adiantamento, obs)    │
│     Calcula: carga_parcial, reembolso, carga_final           │
│     Exibe: tabela completa editável                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Usuário edita células (col_1qz, adiantamento, obs)      │
│     POST → salva quinzena_manual_inputs                     │
│     Cálculos atualizados em tempo real                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Exportar CSV / XLSX da carga quinzenal pronta           │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Etapas de Implementação (ordem de execução)

### Etapa 1 — Investigação profunda das planilhas reais
**Objetivo:** Confirmar exatamente qual linha cada campo começa, quais colunas usar, e validar o schema proposto contra os arquivos reais.

Tarefas:
- [ ] Rodar script Python que lê `CONTROLE - VEXPENSES - MAIO - 2026.xlsx`:
  - Aba PAINEL: confirmar linha do cabeçalho (esperado: 11), mapear índice de cada coluna relevante
  - Aba SALDO CARTAO: confirmar posição da segunda tabela (esperado: cols J-N, linha 4)
- [ ] Fazer o mesmo para a 2ª quinzena (`CARGA 2 QZ MAIO 26 VEXPENSES EQS.xlsx`) se existir
- [ ] Documentar o resultado em `controle-api/docs/mapeamento-colunas-neon.md`

### Etapa 2 — Criar tabelas no Neon
**Objetivo:** Preparar o banco para receber os dados.

Tarefas:
- [ ] Criar `quinzena_controle_snapshot` via MCP Neon
- [ ] Criar `quinzena_import_log` via MCP Neon
- [ ] Adicionar coluna `cpf` em `quinzena_manual_inputs`
- [ ] Atualizar `vexpenses-dashboard/lib/neon.ts` com os `CREATE TABLE IF NOT EXISTS` das novas tabelas

### Etapa 3 — Script de importação (Python, em controle-api)
**Objetivo:** Ler as planilhas Excel e popular o Neon.

Tarefas:
- [ ] Criar `controle-api/src/import_to_neon.py`:
  - Parâmetros: `--file`, `--year`, `--month`, `--quinzena`
  - Lê aba PAINEL (linha 11+): cpf, colaborador, situação, saldo_final, status_cartão
  - Lê aba SALDO CARTAO resumo (cols J-N, linha 4+): cpf, saldo_cartao
  - Faz join por CPF, resolve conflitos
  - Insere/atualiza `quinzena_controle_snapshot` (UPSERT por year+month+quinzena+cpf)
  - Registra em `quinzena_import_log`
- [ ] Usar `NEON_DATABASE_URL` do `.env` (mesma connection string do dashboard)
- [ ] Testar com os arquivos de maio 2026 (1ª e 2ª quinzena)

### Etapa 4 — Nova API route no Next.js
**Objetivo:** Substituir a lógica atual de estimativa por consulta real ao Neon.

Tarefas:
- [ ] Refatorar `vexpenses-dashboard/app/api/quinzena-complete/route.ts`:
  - **GET**: Busca `quinzena_controle_snapshot` por (year, month, quinzena), join com manual_inputs, merge com API VExpenses (colaborador, CC, gestor, diretor)
  - **POST**: Salva manual inputs (col_1qz, adiantamento, obs) por CPF+período
  - Remover os `SALDO_PATTERNS` hardcoded
  - Retornar `has_snapshot: boolean` para a UI saber se os dados reais estão disponíveis
- [ ] Criar `vexpenses-dashboard/app/api/quinzena/snapshots/route.ts`:
  - **GET**: Lista todas as quinzenas que têm snapshot no banco (para o seletor de períodos)
  - Retorna: `[{ year, month, quinzena, imported_at, rows_count }]`

### Etapa 5 — Refatoração da página /quinzena-dinamica
**Objetivo:** Interface completa com histórico e edição.

Tarefas:
- [ ] **Seletor de quinzena** — dropdown que lista as quinzenas disponíveis no banco (usa `/api/quinzena/snapshots`)
  - Para quinzenas sem snapshot: exibe aviso "dados estimados" com badge visual
  - Para quinzenas com snapshot: exibe badge "dados reais"
- [ ] **Tabela principal** — colunas com cores por tipo de dado:
  - Azul: dados da API VExpenses
  - Verde: dados da planilha de controle importada
  - Amarelo: campos manuais (editáveis inline)
  - Cinza: campos calculados (read-only)
- [ ] **Edição inline** — ao clicar em `col_1qz`, `adiantamento` ou `obs`, o campo vira um input
  - Auto-save com debounce (500ms após parar de digitar)
  - Indicador visual de "salvando..." / "salvo"
  - Recalcula `carga_parcial`, `reembolso`, `carga_final` em tempo real no frontend
- [ ] **Painel de upload** (opcional nesta fase, pode ser manual via script) — ou botão que chama o script de importação
- [ ] **Exportar CSV/XLSX** — já existe, manter e ajustar colunas para o novo formato
- [ ] **Resumo de totais** — rodapé com somas de: carga_final, reembolso, saldo_final

### Etapa 6 — Dados das duas quinzenas de maio (histórico inicial)
**Objetivo:** Popular o banco com os dados já existentes.

Tarefas:
- [ ] Importar `CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx` → quinzena 1, mês 5, ano 2026
- [ ] Importar dados da 2ª quinzena de maio (se arquivo disponível)
- [ ] Validar que os dados aparecem corretamente na página

---

## 6. Decisões de Arquitetura

### Onde fica a lógica de importação?
**Python (`controle-api/src/import_to_neon.py`)** — pois:
- já tem o ambiente Python configurado com `openpyxl` e `pyxlsb`
- a leitura de XLSB complexo é mais madura no ecossistema Python
- separação clara: controle-api é a ferramenta de dados, dashboard é a interface

Alternativa futura: API route Next.js com `xlsx` npm package para upload direto pelo browser (Etapa 5, opcional).

### Join por CPF vs. user_id VExpenses
Usamos **CPF** como chave de join entre planilha e API, pois:
- CPF é a chave natural presente em todas as planilhas
- O `user_id` do VExpenses não está nas planilhas de controle
- A tabela `quinzena_manual_inputs` atual usa `user_id` — adicionamos `cpf` como coluna adicional para compatibilidade

### Cálculos: frontend ou backend?
**Frontend** — os cálculos de `carga_parcial`, `reembolso` e `carga_final` são simples e precisam ser reativos à edição. A API retorna os dados brutos e o frontend calcula:
```typescript
const saldo_reembolsar = saldo_final < 0 ? Math.abs(saldo_final) : 0
const reembolso = saldo_reembolsar * 0.5
const carga_parcial = col_1qz - saldo_final - saldo_cartao - adiantamento
const carga_final = Math.max(0, carga_parcial) + reembolso
```

---

## 7. O que NÃO muda

- A estrutura de cache da API VExpenses (`api_cache`, `preload_stats`) — não toca
- Os dados de colaborador, centro de custo, gestor, diretor — continuam vindo da API VExpenses em tempo real
- O `controle-api/src/server.py` e toda a lógica de verificação da `controle-api` — continuam funcionando separado
- As outras páginas do dashboard (`/despesas`, `/aprovacoes`, etc.) — não são afetadas

---

## 8. Arquivos que serão modificados

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `vexpenses-dashboard/lib/neon.ts` | Modificar | Adicionar `CREATE TABLE` das novas tabelas |
| `vexpenses-dashboard/app/api/quinzena-complete/route.ts` | Refatorar | Substituir estimativas por consulta ao Neon |
| `vexpenses-dashboard/app/api/quinzena/snapshots/route.ts` | Criar | Listar quinzenas disponíveis |
| `vexpenses-dashboard/app/quinzena-dinamica/page.tsx` | Refatorar | Seletor de quinzena, edição inline, badges |
| `controle-api/src/import_to_neon.py` | Criar | Script de importação Excel → Neon |
| `controle-api/requirements.txt` | Modificar | Adicionar `psycopg2-binary` ou `asyncpg` |

---

## 9. Próximos Passos Imediatos

1. **Este prompt:** Plano concluído ✅
2. **Próximo prompt:** Investigar as planilhas reais com Python — confirmar estrutura exata das colunas (Etapa 1)
3. **Depois:** Criar tabelas no Neon (Etapa 2)
4. **Depois:** Script de importação (Etapa 3)
5. **Depois:** Refatorar API route (Etapa 4)
6. **Depois:** Refatorar página (Etapa 5)
7. **Depois:** Importar dados de maio (Etapa 6) e validar tudo end-to-end
