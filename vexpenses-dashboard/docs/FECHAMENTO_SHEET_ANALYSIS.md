# FECHAMENTO - Análise da Planilha de Prestação de Contas

## Visão Geral

A planilha **FECHAMENTO - \<Colaborador\>.xlsx** é um relatório individual por colaborador que consolida:

1. **FECHAMENTO** — Dashboard mensal com saldo acumulado
2. **EXTRATO** — Transações do cartão (cargas, saques, taxas, transferências)
3. **PREST. CONTAS** — Despesas de relatórios (expenses) agrupadas por report

---

## Sheet 1: FECHAMENTO (Dashboard)

### Estrutura

- **B4**: Título "FECHAMENTO DE PRESTAÇÃO DE CONTAS"
- **B6**: Nome do colaborador
- **Row 7**: Headers da tabela
- **Rows 8-22**: Dados mensais (Maio/2025 → Julho/2026)
- **Rows 25-30**: Resumo final

### Colunas (Row 7)

| Col | Header      | Fórmula                                                                                         |
|-----|-------------|-------------------------------------------------------------------------------------------------|
| B   | Ano         | Valor fixo (2025, 2026...)                                                                      |
| C   | Mês         | Valor fixo ("MAIO", "JUNHO"...)                                                                 |
| D   | Carga       | `SUMIFS(EXTRATO!I:I, EXTRATO!G:G, "Carga", EXTRATO!B:B, <mês>, EXTRATO!A:A, <ano>)`           |
| E   | Transferência | `SUMIFS(EXTRATO!I:I, EXTRATO!G:G, "Transferência", EXTRATO!B:B, <mês>, EXTRATO!A:A, <ano>)` |
| F   | Taxa        | `SUMIFS(EXTRATO!I:I, EXTRATO!G:G, "Taxa", EXTRATO!B:B, <mês>, EXTRATO!A:A, <ano>)`            |
| G   | Prest. Contas | `SUMIFS('PREST. CONTAS'!AB:AB, 'PREST. CONTAS'!B:B, <mês>, 'PREST. CONTAS'!A:A, <ano>, status <> "Aberto", status <> "Reprovado")` |
| H   | Saldo       | `=D+E+F-G` (Carga + Transferência + Taxa − Prest. Contas)                                      |
| I   | Acumulado   | `=H + I(linha anterior)` (saldo corrente acumulado)                                            |

### Resumo Final (Rows 25-30)

| Label                          | Célula | Fórmula/Valor                     | Descrição                              |
|--------------------------------|--------|-----------------------------------|----------------------------------------|
| SALDO FINAL                    | H25    | `=H23`                            | Soma total de todos os meses           |
| (+) SALDO DISPONIVEL           | H26    | `=D23+E23+F23`                    | Total Carga + Transf. + Taxa           |
| (-) PRESTAÇÃO DE CONTAS        | H27    | `=G23`                            | Total prestação de contas              |
| = FECHAMENTO PRESTE CONTAS     | H28    | `=H26-H27`                        | Saldo disponível - prestação           |
| = SALDO CARTÃO                 | H29    | **Manual** (ex: 3)               | Saldo atual do cartão (input manual)   |
| FECHAMENTO FINAL - SALDO PENDENTE | H30 | `=H28-H29`                       | Saldo final líquido                    |

### Painel Lateral (K/L)

| Status    | Valor                              |
|-----------|-------------------------------------|
| Aberto    | Soma despesas com status "Aberto"   |
| Aprovado  | Soma despesas com status "Aprovado" |
| Total Geral | Soma de todos                     |

**Legenda**: Negativo = A Reembolsar | Positivo = A Prestar

---

## Sheet 2: EXTRATO (Transações do Cartão)

### Origem
Exportado da API v3: `GET /v3/pay/statement/excel-all` (token Laravel cookie).

### Colunas

| Col | Header                | Conteúdo                                    |
|-----|-----------------------|---------------------------------------------|
| A   | ANO                   | `=YEAR(C)` (fórmula)                        |
| B   | MÊS                   | `=UPPER(TEXT(C,"MMMM"))` (fórmula)          |
| C   | Data                  | Datetime completo                           |
| D   | Hora                  | String de hora                              |
| E   | Código de Transação   | Hash ID único                               |
| F   | Usuário               | Nome do colaborador                         |
| G   | Tipo                  | **Carga**, **Saque**, **Taxa**, **Transferência** |
| H   | Descrição             | Descrição human-readable                    |
| I   | Valor                 | Numérico (positivo = crédito, negativo = débito) |

### Tipos de Transação

| Tipo           | Descrição                                    | Sinal  |
|----------------|----------------------------------------------|--------|
| Carga          | Transf. EQS → colaborador (quinzena)         | Positivo |
| Transferência  | Transf. colaborador → EQS (devolução)        | Negativo |
| Saque          | Saque ATM                                    | Negativo |
| Taxa           | Taxa de saque                                | Negativo (sempre -R$ 7) |

### Pivot Table (Cols K-P)
Tabela dinâmica sumarizando Valor por ano/mês × tipo.

### Observações
- **Sem snapshot rows** — apenas transações reais
- Colunas J em diante contêm o pivot table

---

## Sheet 3: PREST. CONTAS (Despesas/Relatórios)

### Origem
Exportado da API v2: `GET /v2/reports` (filter por user) + `GET /v2/expenses` (por report).

### Colunas (29 total)

| Col | Header                    | Conteúdo                                    |
|-----|---------------------------|---------------------------------------------|
| A   | Ano                       | `=YEAR(F)` (fórmula)                        |
| B   | Mês                       | `=UPPER(TEXT(F,"MMMM"))` (fórmula)          |
| C   | ID da Despesa             | Expense ID da API                           |
| D   | ID do Relatório           | Report ID da API                            |
| E   | Nome do relatório         | Ex: "CAIXA 07/2026"                         |
| F   | Data                      | Data da despesa                             |
| G   | Nome do membro            | Nome do colaborador (UPPER)                 |
| H   | CPF/CNPJ                  | CPF do colaborador                          |
| I   | Status                    | **Aberto**, **Aprovado** (ou Reprovado)     |
| J   | Data de Pagamento         | (vazio se não pago)                         |
| K   | Descrição da despesa      | Ex: "Material", "Pedágio"                   |
| L   | Tipo de Despesa           | MATERIAL, PEDAGIO, ESTACIONAMENTO, etc.     |
| M   | Reembolsável              | "Sim" / "Não"                               |
| N   | Anotação da Despesa       | Texto livre                                 |
| O   | Anotação de Rateio        | (vazio geralmente)                          |
| P   | Centro de Custos         | Ex: "CEF SP SUL"                            |
| Q   | Forma de pagamento        | "Saque VExpenses", "Tarifa de Saque"        |
| R   | Projeto                   | Ex: "REGIONAL SP"                           |
| S   | Percentual de projeto     | 1 (100%)                                    |
| T-U | GPS fields                | (vazio)                                     |
| V-W | KM fields                 | (vazio)                                     |
| X   | Moeda do Relatório        | "BRL"                                       |
| Y   | Valor                     | Valor original da despesa                   |
| Z   | Moeda da Conversão        | (vazio = BRL)                               |
| AA  | Valor Convertido          | (vazio = mesmo que Y)                       |
| AB  | **Valor Total**           | Valor usado no SUMIFS do FECHAMENTO         |
| AC  | Ultrapassou Política      | "Sim" / "Não"                               |

### Filtro do FECHAMENTO
A coluna G (Prest. Contas) do FECHAMENTO soma APENAS despesas onde:
- Status **≠** "Aberto"
- Status **≠** "Reprovado"

Ou seja, apenas despesas **Aprovadas** ou **Pagas** entram no cálculo do saldo.

---

## Como o Relatório é Construído

```
EXTRATO (API v3)          PREST. CONTAS (API v2)
     │                          │
     ▼                          ▼
  SUMIFS por mês            SUMIFS por mês
  (Carga, Transf., Taxa)    (Status ≠ Aberto/Reprovado)
     │                          │
     └─────────┬────────────────┘
               ▼
         FECHAMENTO
    Saldo = Carga + Transf. + Taxa - Prest.Contas
    Acumulado = Saldo + Acumulado anterior
               ▼
         Resumo Final
    Saldo Final = Saldo Acumulado Total
    Saldo Disponível = Total Carga + Transf. + Taxa
    Fechamento = Saldo Disponível - Prest. Contas
    Saldo Cartão = INPUT MANUAL
    Fechamento Final = Fechamento - Saldo Cartão
```

## Como Obter os Dados via API

| Sheet          | API                          | Endpoint                                    |
|----------------|------------------------------|---------------------------------------------|
| EXTRATO        | VExpenses API v3             | `GET /v3/pay/statement/excel-all`           |
| PREST. CONTAS  | VExpenses API v2             | `GET /v2/reports` + `GET /v2/expenses`      |
| FECHAMENTO     | Calculado                    | Agregação dos dados acima                   |

### Tabelas Neon Disponíveis

- `extrato_movimentacao` — dados do extrato (coluna `usuario` = nome)
- `prestacao_reports` — relatórios
- `prestacao_expense_snapshots` — snapshots de despesas
- `somase_snapshots` — somas por CPF

## Implementação no Dashboard

- **Página**: `/fechamento` — seleção de colaborador, tabelas dinâmicas, export XLSX + PDF
- **API**: `/api/fechamento?userId=X` — retorna todos os dados consolidados
