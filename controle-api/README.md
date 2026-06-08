# Controle API — Visualizador de Planilhas

Servidor local que expõe os dados das planilhas Excel via SQLite + interface web.

## Estrutura

```
controle-api/
├── data/
│   ├── CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx
│   ├── CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsb
│   └── spreadsheets.db         ← banco SQLite gerado
├── src/
│   ├── server.py               ← servidor FastAPI
│   └── static/
│       └── index.html          ← interface web
├── import_to_sqlite.py         ← script de importação
└── requirements.txt
```

## Como usar

### 1. Instalar dependências
```bash
pip install -r requirements.txt
```

### 2. (Re)gerar o banco SQLite
```bash
python import_to_sqlite.py
```

### 3. Iniciar o servidor
```bash
python src/server.py
```

Acesse: **http://localhost:8000**

## Verificação de Colunas vs. API

Clique em **"Verificar API"** na interface para abrir o painel de verificação.

| Cor | Significado |
|-----|-------------|
| 🟢 Verde | API retornou o dado e **bate** com a planilha |
| 🔴 Vermelho | API retornou mas o valor **diverge** da planilha |
| 🟡 Amarelo | Dado **não disponível** via API VExpenses |

### Resultados da Planilha1 (CARGA QZ)
| Coluna | Status | Fonte API |
|--------|--------|-----------|
| COLABORADOR (A) | 🟢 Verde | `team-members.name` (join por CPF) |
| CPF (B) | 🟢 Verde | `team-members.cpf` |
| SITUAÇÃO (C) | 🔴 Verificar | `team-members.active` (5 divergências) |
| CENTRO DE CUSTO (E) | 🔴 Verificar | `team-members.costsCenters` (23 divergências) |
| REGIONAL (D) | 🟡 Amarelo | Não disponível — derivado de outro sistema |
| GESTOR (F) | 🟡 Amarelo | Não disponível na API |
| DIRETOR (G) | 🟡 Amarelo | Não disponível na API |
| SALDO REEMBOLSAR (H) | 🟡 Amarelo | `/v2/balances` retorna 405 |
| SALDO FINAL (I) | 🟡 Amarelo | Saldo de cartão não exposto |
| 1ª QZ (J) | 🟡 Amarelo | Sistema externo à VExpenses |
| SALDO CARTAO (K) | 🟡 Amarelo | Saldo de cartão não exposto |
| Adiantamento (L) | 🟡 Amarelo | Não exposto diretamente |
| CARGA PARCIAL (M) | 🟡 Amarelo | Fórmula Excel (calculada) |
| REEMBOLSO (N) | 🟡 Amarelo | Fórmula Excel (calculada) |
| Carga Final (O) | 🟡 Amarelo | Fórmula Excel (calculada) |
| obs (P) | 🟡 Amarelo | Campo manual |
| STATUS DO CARTÃO (Q) | 🟡 Amarelo | `/v2/cards` retorna 405 |

### Adicionando checks para novas tabelas
1. Crie `src/checks/nome_da_tabela.py` com `ALL_CHECKS: list[ColumnCheck]`
2. Importe e registre em `src/checks/__init__.py`
3. Os checks aparecerão automaticamente no botão "Verificar API"

## API Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/sheets` | Lista todas as planilhas/abas com metadados e colunas |
| GET | `/api/sheets/{table}/data` | Dados paginados de uma tabela |
| GET | `/api/health` | Status do servidor e banco |
| GET | `/api/verify/tables` | Tabelas com checks de verificação definidos |
| POST | `/api/verify/{table}/run` | Executa verificação de colunas contra a API |
| GET | `/api/verify/{table}/cached` | Último resultado de verificação em cache |

### Parâmetros de `/data`
- `page` (int, default 1)
- `page_size` (int, default 100, max 1000)
- `search` (string, opcional) — busca em todos os campos

## Colunas por planilha

### CARGA 1 QZ (Planilha1)
- Cabeçalho: linha 6 | Dados: linhas 7–346
- ⚡ **Fórmulas** (calculadas no Excel, não vêm da API):
  - `CARGA PARCIAL` (M): `=1ªQZ - SALDO_FINAL - SALDO_CARTAO - Adiantamento`
  - `REEMBOLSO` (N): `=SALDO_REEMBOLSAR × 0,5`
  - `Carga Final` (O): `=MAX(0, CARGA_PARCIAL) + REEMBOLSO`
- ✅ **Dados/API**: COLABORADOR, CPF, SITUAÇÃO, REGIONAL, CENTRO DE CUSTO, GESTOR, DIRETOR, SALDO REEMBOLSAR, SALDO FINAL, 1ª QZ, SALDO CARTAO, Adiantamento, obs, STATUS DO CARTÃO

### CONTROLE (múltiplas abas)
- **PAINEL**: 721 linhas · ⚡ SALDO PRESTAÇÃO, SALDO FINAL, ADICIONAIS, SITUAÇÃO COLABORADOR
- **SALDO CARTAO #1**: transações de cartão (7.947 linhas)
- **SALDO CARTAO #2**: resumo por colaborador (606 linhas)
- **ADICIONAL ITAÚ**: 16 lançamentos
- **ADICIONAIS #1**: 620 adicionais individuais
- **ADICIONAIS #2**: 76 pedidos
- **QUINZENAS**: 11.065 registros de quinzenas
- **SALDOS ADM EQS**: 11 colaboradores · ⚡ TOTAL QZ_2025
- **EXTRATO**: 17.477 transações (carga/transferência/tarifa)
- **PAINEL PRESTAÇÕES #1/#2**: tabelas pivot
- **BASE PREST**: 60.317 registros de despesas VExpenses
- **REEMBOLSO**: 281 reembolsos
- **ESTORNO - SAQUE**: 3 registros
- **Detalhes 1/2/3**: drill-down de caixa fevereiro/2026
- **AUX**: tabela de referência regional/gestor/diretor
