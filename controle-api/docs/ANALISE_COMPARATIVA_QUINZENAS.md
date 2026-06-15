# Análise Comparativa das Planilhas entre Quinzenas

> Arquivos comparados:
> - **Carga 1ª QZ:** `CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx` (Planilha1, header linha 6)
> - **Carga 2ª QZ:** `CARGA 2 QZ MAIO 26 VEXPENSES EQS (1).xlsx` (2 QZ DE MAIO 26, header linha 4)
> - **Controle MAIO:** `CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx` (PAINEL, header linha 11)
> - **Controle JUNHO:** `CONTROLE - VEXPENSES - JUNHO - 2026.xlsx` (PAINEL, header linha 11)

---

## 1. Estrutura das Abas

### Planilha de Controle (ambos os meses — idêntica)
As 15 abas são as mesmas em MAIO e JUNHO:

| Aba | Propósito |
|-----|-----------|
| **PAINEL** | Visão consolidada de todos os colaboradores |
| **SALDO CARTAO** | Saldos dos cartões VExpenses por colaborador |
| **EXTRATO** | Histórico de transações (CARGA, TRANSFERÊNCIA, TARIFA) |
| **QUINZENAS** | Valores de 1ª QZ e 2ª QZ por colaborador |
| **BASE PREST** | Detalhes de cada despesa aprovada no VExpenses |
| **PAINEL PRESTAÇÕES** | Visão consolidada de prestações de contas |
| **ADICIONAIS** | Valores adicionais por colaborador |
| **ADICIONAL ITAÚ** | Adicionais via cartão Itaú |
| **REEMBOLSO** | Controle de reembolsos |
| **ESTORNO - SAQUE** | Estornos e saques |
| **SALDOS ADM EQS** | Saldos administrativos EQS |
| **AUX** | Tabela auxiliar (VLOOKUP de gestor/diretor por regional) |
| **Detalhes1/2/3** | Detalhes adicionais |

### Planilha de Carga (DIFERENÇA entre 1ª e 2ª QZ)

| Aba | 1ª QZ | 2ª QZ | Observação |
|-----|-------|-------|------------|
| Aba principal | `Planilha1` | `2 QZ DE MAIO 26` | Nome diferente |
| **STATUS CARTÃO** | ❌ ausente | ✅ presente | Nova aba na 2ª QZ com dados exportados da VExpenses |

---

## 2. Diferença de Colunas: Carga 1ª QZ vs 2ª QZ

### Colunas da 1ª QZ (17 campos)
`COLABORADOR | CPF | SITUAÇÃO | REGIONAL | CENTRO DE CUSTO | GESTOR | DIRETOR | SALDO REEMBOLSAR | SALDO FINAL | 1ª QZ | SALDO CARTAO | Adiantamento | CARGA PARCIAL | REEMBOLSO | Carga Final | obs | STATUS DO CARTÃO`

### Colunas da 2ª QZ (18 campos)
`COLABORADOR | CPF | SITUAÇÃO | CENTRO DE CUSTO | GESTOR | DIRETOR | SALDO PENDENTE PARCIAL | CARGA 1 QZ | SALDO FINAL | 2ª QZ | SALDO CARTAO | Adiantamento | CARGA PARCIAL | REEMBOLSO | Carga Final | obs | STATUS DO CARTÃO`

### Diferenças

| Só na 1ª QZ | Só na 2ª QZ | Observação |
|-------------|-------------|------------|
| `REGIONAL` | — | Removido na 2ª QZ |
| `SALDO REEMBOLSAR` | `SALDO PENDENTE PARCIAL` | Renomeado na 2ª QZ |
| `1ª QZ` | `2ª QZ` | Muda conforme a quinzena |
| — | `CARGA 1 QZ` | Campo novo: carrega o resultado da 1ª QZ para referência |

**Conclusão:** A 2ª QZ carrega o resultado da 1ª QZ como campo de referência (`CARGA 1 QZ`) e o campo de quinzena simplesmente muda de `1ª QZ` para `2ª QZ`. O `REGIONAL` é omitido na 2ª QZ mas vem do controle.

---

## 3. Aba Exclusiva da 2ª QZ: STATUS CARTÃO

A 2ª QZ possui uma aba extra `STATUS CARTÃO` com **605 linhas** exportadas diretamente da VExpenses:

| Campo | Conteúdo |
|-------|----------|
| `Nome` | Nome do colaborador |
| `E-mail` | E-mail cadastrado |
| `Tipo de usuário` | Normal / Administrador |
| `Status do Cartão` | Cartão ativo / Cartão Inativo / etc. |
| `Permissão de Uso` | Portador de Cartão / etc. |
| `Permissão de Gestão` | Sem permissão / etc. |
| `Cobrança` | (vazio na maioria) |

> **Isso confirma que `STATUS DO CARTÃO` vem de um export manual da VExpenses, não do controle.**
> Via API pode ser buscado com `GET /v2/team-members` → `data[].active` (boolean).

---

## 4. O que Muda no Controle entre MAIO e JUNHO

### Colaboradores
| | Quantidade |
|--|--|
| MAIO | 713 |
| JUNHO | 721 |
| Em ambos | 710 |
| Saíram no JUNHO | 3 (mudaram de CPF — mesmo colaborador com cadastro novo) |
| Novos em JUNHO | 11 |

**Importante:** Alguns "saíram" porque o CPF foi corrigido — ex: `MARCELO CARVALHO DA SILVA` saiu com um CPF e entrou com outro. Não são demissões.

### Campos que NÃO mudam (estáveis entre quinzenas)
| Campo | Observação |
|-------|------------|
| `COLABORADOR` | Nome não muda |
| `TERMO` | Status de adesão ao termo |
| `EMPRESA` | Sempre EQS |
| `CARTÃO ITAU` | N° do cartão |
| `CARTÃO VEXPENSES` | N° do cartão VExpenses |

### Campos que MUDAM entre quinzenas (financeiros — atualização automática)

| Campo | Diffs | Exemplo MAIO → JUNHO | Fonte provável |
|-------|------:|----------------------|----------------|
| `CARGA` | 332 | `231233.7` → `251377.7` | Extrato (acumulado) |
| `(-) PRESTAÇÃO DE CONTAS` | 342 | `190542.57` → `204812.11` | VExpenses API |
| `SALDO PRESTAÇÃO` | 437 | `-1025.01` → `-5727.55` | Calculado |
| `(-) SALDO CARTAO` | 395 | `58.0` → `5.0` | Snapshot do saldo |
| `SALDO FINAL` | 464 | `-1083.01` → `-5732.55` | Calculado |
| `TRANSFERENCIA` | 115 | `-40330.14` → `-50830.14` | Extrato |
| `(-) TARIFA` | 216 | `-1386.0` → `-1463.0` | Extrato |

### Campos que mudam — cadastrais (eventos ocasionais)

| Campo | Diffs | Exemplo MAIO → JUNHO | Observação |
|-------|------:|----------------------|------------|
| `SITUAÇÃO` | 23 | `ATIVO` → `INATIVO` | Desligamentos / contratações |
| `STATUS DO CARTÃO` | 20 | `Cartão não vinculado` → `Cartão Inativo` | Atualizado via VExpenses |
| `CENTRO DE CUSTO` | 33 | `CEF VALE SINOS RS` → `CEF METROPOLITANA RS` | Remanejamento de colaborador |
| `REGIONAL` | 1 | `COMERCIAL` → `REGIONAL SP` | Remanejamento |
| `GESTOR` | 1 | mudou | Remanejamento |
| `SITUAÇÃO COLABORADOR` | 79 | `BLOQUEADO` → `PROCESSADO` | Status de pagamento |

### Campos que mudam — QZ e adicionais

| Campo | Diffs | Observação |
|-------|------:|------------|
| `1ª QZ` | 20 | Valor atualizado manualmente por quinzena |
| `2ª QZ` | 18 | Valor atualizado manualmente por quinzena |
| `ADICIONAIS` | 710 | Mudança de tipo (float → int), valor mantido = 0 |
| `CARTÃO CRED. ITAU` | 224 | Atualização de elegibilidade |
| `ITAU` | 710 | Mudança de tipo (float → int) |
| `ADICIONAL ITAU` | 1 | Alteração pontual |

---

## 5. Correspondência de Campos: Carga → Controle (PAINEL)

| Campo na Carga | Campo no PAINEL | Tipo | Atualiza? |
|----------------|----------------|------|-----------|
| `COLABORADOR` | `COLABORADOR` | Cadastral | ❌ Estável |
| `CPF` | `CPF` | Cadastral | ❌ Estável |
| `SITUAÇÃO` | `SITUAÇÃO` | Cadastral | ⚠ Ocasional (desligamentos) |
| `REGIONAL` | `REGIONAL` | Cadastral | ⚠ Ocasional (remanejamento) |
| `CENTRO DE CUSTO` | `CENTRO DE CUSTO` | Cadastral | ⚠ Ocasional (remanejamento) |
| `GESTOR` | `GESTOR` | Calculado (AUX) | ⚠ Ocasional |
| `DIRETOR` | `DIRETOR` | Calculado (AUX) | ⚠ Ocasional |
| `SALDO FINAL` | `SALDO FINAL` | Calculado | ✅ Todo mês |
| `SALDO CARTAO` | `(-) SALDO CARTAO` | Snapshot | ✅ Todo mês |
| `STATUS DO CARTÃO` | `STATUS DO CARTÃO` | VExpenses export | ✅ Todo mês |
| `1ª QZ` / `2ª QZ` | `1ª QZ` / `2ª QZ` | Manual | ✅ Toda quinzena |
| `Adiantamento` | — | Manual | ✅ Toda quinzena |
| `obs` | — | Manual | ✅ Toda quinzena |
| `SALDO REEMBOLSAR` | — | Calculado na carga | ⚙ Fórmula |
| `CARGA PARCIAL` | — | Calculado na carga | ⚙ Fórmula |
| `REEMBOLSO` | — | Calculado na carga | ⚙ Fórmula |
| `Carga Final` | — | Calculado na carga | ⚙ Fórmula |

---

## 6. O que Precisamos para Gerar a Carga Automaticamente

### Campos que já temos (via DB atualizado do controle)
- `COLABORADOR`, `CPF`, `SITUAÇÃO`, `REGIONAL`, `CENTRO DE CUSTO`, `GESTOR`, `DIRETOR`
- `CARGA`, `TRANSFERENCIA`, `(-) TARIFA` (da aba EXTRATO)
- `(-) SALDO CARTAO` (da aba SALDO CARTAO)
- `SALDO PRESTAÇÃO` / `SALDO FINAL` (do PAINEL)
- `1ª QZ`, `2ª QZ` (da aba QUINZENAS)

### Campos automatizáveis via API VExpenses
- `(-) PRESTAÇÃO DE CONTAS` → `GET /v2/reports` (status=3, filtrado por data)
- `STATUS DO CARTÃO` → `GET /v2/team-members` → `active` field (ou aba STATUS CARTÃO exportada)
- `SITUAÇÃO` → `GET /v2/team-members` → `active` field

### Campos ainda manuais
- `1ª QZ` / `2ª QZ` — valor de carga decidido pelo gestor
- `Adiantamento` — input manual
- `obs` — input manual

### Campos calculados (fórmulas puras)
- `SALDO REEMBOLSAR` = valor oriundo do PAINEL (`SALDO PRESTAÇÃO`)
- `CARGA PARCIAL` = `1ª QZ - SALDO FINAL - SALDO CARTAO - Adiantamento`
- `REEMBOLSO` = `SALDO REEMBOLSAR × 0.5`
- `Carga Final` = `max(CARGA PARCIAL, 0) + REEMBOLSO`
