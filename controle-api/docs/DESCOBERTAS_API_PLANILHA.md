# Descobertas sobre API VExpenses e Planilha Carga Quinzenal

## 1. API VExpenses v2 - Descobertas e Limitações

### 1.1 Endpoints Disponíveis
- `/v2/team-members` — Lista membros da equipe
- `/v2/reports` — Lista relatórios de despesas
- `/v2/reports/{id}` — Detalhes de um relatório específico
- `/v2/expenses` — Lista despesas individuais

### 1.2 Limitações Importantes

#### Janela de Tempo de Expenses
- **Limitação:** `/v2/expenses` tem janela máxima de 3 meses
- **Impacto:** Não é possível buscar todas as despesas históricas de uma vez
- **Workaround:** Usar `/v2/reports` com `include=expenses` para despesas por relatório

#### Campos Não Disponíveis via API
- **`saldo_cartao`** — Não existe endpoint para saldo de cartão pré-pago
- **`carga`** — Não existe endpoint para recargas de cartão
- **`transferencia`** — Não existe endpoint para transferências
- **`tarifa`** — Não existe endpoint para tarifas
- **`1ª_qz`** — Campo manual da planilha, não disponível na API
- **`adiantamento`** — Campo manual da planilha
- **`obs`** — Campo manual da planilha

#### Campos Disponíveis via API
- **`centro_de_custos`** — `costs_center.name` (include=costs_center)
- **`forma_de_pagamento`** — `payment_method.description` (include=payment_method)
- **`projeto`** — Campo no `excel_link` do report; `project_id=null` na API JSON
- **`valor`** — `expense.value`

### 1.3 Problemas de API Encontrados

#### Erro 500 em `/v2/team-members`
- **Causa:** Parâmetro `include="costs_center,projects"` causa overload
- **Solução:** Remover o parâmetro `include` ou usar apenas um include por vez

#### Erro 403 (Bloqueio Incapsula)
- **Causa:** Firewall Incapsula da VExpenses bloqueando API_KEY
- **Possíveis motivos:**
  - Rate limiting por excesso de chamadas
  - API_KEY revogada ou expirada
  - Bloqueio de IP
- **Solução:** Verificar com VExpenses status da API_KEY

#### Erro 500 em `/v2/reports` com `include=expenses`
- **Causa:** Incluir expenses na query principal causa overhead
- **Solução:** Buscar reports sem include, depois buscar expenses individualmente

### 1.4 Estratégias de Otimização

#### Cache em Memória
- **Team-members:** Cache de 1 hora
- **Prestação de contas:** Cache de 1 hora com key por período
- **Benefício:** Evita chamadas repetidas em curto período

#### Processamento Paralelo
- **ThreadPoolExecutor:** 3 threads para buscar expenses de reports
- **Limite:** 3 threads para evitar rate limiting
- **Benefício:** Reduz tempo de processamento de 2000+ reports

#### Filtro de Data
- **`date:between`** em `/v2/reports` para pegar apenas reports da quinzena
- **Benefício:** Reduz número de reports a processar drasticamente

## 2. Estrutura da Planilha Carga Quinzenal

### 2.1 Campos Principais

#### Dados Cadastrais
- `colaborador` — Nome do colaborador
- `cpf` — CPF do colaborador
- `gestor` — Gestor direto
- `diretor` — Diretor
- `regional` — Regional
- `centro_de_custo` — Centro de custo
- `situação` — Situação do colaborador (ativo/inativo)
- `status_do_cartão` — Status do cartão VExpenses

#### Dados Financeiros
- `carga` — Valor de recarga do cartão
- `transferencia` — Valor de transferência
- `tarifa` — Valor de tarifas
- `saldo_cartao` — Saldo atual do cartão
- `prestação_de_contas` — Total de despesas aprovadas
- `1ª_qz` — Valor da primeira quinzena
- `2ª_qz` — Valor da segunda quinzena
- `adicionais` — Valores adicionais
- `itau` — Valor Itaú
- `adicional_itau` — Adicional Itaú

#### Campos Calculados
- `saldo_final` — Saldo final após cálculos
- `saldo_reembolsar` — Valor a reembolsar
- `carga_final` — Carga final
- `carga_parcial` — Carga parcial
- `prestação_de_contas` — (pode ser calculado via API)

### 2.2 Fórmulas Descobertas

#### Saldo Final
```
saldo_final = extrato_total - prestação_de_contas + saldo_cartao
onde:
extrato_total = carga + transferencia + tarifa
```

**Observação Importante:**
- Quando `prestação_de_contas` vem do DB, usar `painel.saldo_prestação` (já calculado corretamente)
- Quando `prestação_de_contas` vem da API, recalcular usando a fórmula acima

#### Saldo Reembolsar
```
saldo_reembolsar = saldo_final - (carga + transferencia + tarifa)
```

#### Carga Final
```
carga_final = carga + transferencia + tarifa
```

#### Carga Parcial
```
carga_parcial = carga - (1ª_qz + 2ª_qz)
```

## 3. Estrutura do Banco de Dados

### 3.1 Tabelas Principais

#### `painel`
- **Propósito:** Visão consolidada de todos os dados
- **Campos importantes:**
  - `saldo_prestação` — Saldo final calculado corretamente (inclui ajustes manuais)
  - `prestação_de_contas` — Total de despesas aprovadas
  - `saldo_cartao` — Saldo do cartão
  - `carga`, `transferencia`, `tarifa` — Componentes do extrato
  - `1ª_qz`, `2ª_qz` — Valores por quinzena
  - Dados cadastrais (colaborador, gestor, diretor, etc.)

#### `saldo_cartao`
- **Propósito:** Snapshot histórico de saldos de cartão
- **Estrutura:** Múltiplas seções (`_1`, `_2`, `_3`, etc.) para diferentes períodos
- **Campos:**
  - `cpf_1`, `valor_1`, `data_1` — Seção atual
  - `cpf_2`, `valor_2`, `data_2` — Seção anterior
  - etc.
- **Uso:** `valor_1` representa o saldo mais recente

#### `extrato`
- **Propósito:** Histórico de transações (carga, transferência, tarifa)
- **Campos:**
  - `cpf` — CPF do colaborador
  - `tipo` — Tipo de transação (CARGA, TRANSFERÊNCIA, TARIFA)
  - `valor` — Valor da transação
  - `data` — Data da transação (serial Excel)
- **Filtro:** Filtrar por `data` dentro do intervalo da quinzena

#### `quinzenas`
- **Propósito:** Valores específicos por quinzena
- **Campos:**
  - `cpf` — CPF do colaborador
  - `quinzena` — Identificador da quinzena (1ª QZ, 2ª QZ, ITAU)
  - `mês` — Mês (MAIO, ABRIL, etc.)
  - `ano` — Ano
  - `valor` — Valor da quinzena
  - `data` — Data de corte
- **Uso:** `valor` de `1ª QZ` específico da quinzena solicitada

#### `base_prest`
- **Propósito:** Detalhes de despesas aprovadas (importado do Excel)
- **Campos:**
  - `id_da_despesa` — ID da despesa na API
  - `id_do_relatório` — ID do report na API
  - `cpf_cnpj` — CPF do colaborador
  - `valor` — Valor da despesa
  - `status` — Status (Aprovado)
  - `data` — Data da despesa
- **Limitação:** Não tem campo de quinzena para filtrar por período

#### `carga_quinzenal_excel`
- **Propósito:** Cópia da planilha Excel original
- **Uso:** Validação e comparação de dados gerados

### 3.2 Relações Entre Tabelas

```
painel (visão consolidada)
├── saldo_cartao (snapshot de saldos)
├── extrato (histórico de transações)
├── quinzenas (valores por quinzena)
└── base_prest (detalhes de despesas)
```

## 4. Fluxo de Dados

### 4.1 Dados Atualmente Importados do Excel

**Origem:** Importação de planilhas Excel via `importar_planilhas.py`

1. **`EXTRATO`** → tabela `extrato`
   - CARGA, TRANSFERÊNCIA, TARIFA
   - 🔍 Endpoints de movimentações não investigados ainda

2. **`SALDO CARTAO`** → tabela `saldo_cartao`
   - Saldo atual do cartão pré-pago
   - 🔍 Endpoints de saldo não investigados ainda

3. **`1ª_qz`** → tabela `quinzenas`
   - Campo preenchido pelo gestor

4. **`adiantamento`** → tabela `painel`
   - Campo preenchido pelo gestor

5. **`obs`** → tabela `painel`
   - Campo preenchido pelo gestor

### 4.2 Dados que Podem Ser Obtidos via API

1. **`prestação_de_contas`** → `/v2/reports` com `include=expenses`
   - Total de despesas aprovadas
   - 100% calculável via API
   - **Limitação:** Deve filtrar por data da quinzena

2. **Dados cadastrais** → `/v2/team-members`
   - `colaborador`, `regional`, `centro_de_custo`, `situação`, `status_do_cartão`
   - Disponível via API
   - **Limitação:** Erro 500 com `include=costs_center,projects`

3. **`projeto`** → `/v2/reports/{id}` (excel_link)
   - Campo no excel_link do report
   - `project_id=null` na API JSON
   - **Limitação:** Não disponível no JSON padrão

## 5. Cálculo de Intervalo de Quinzena

### 5.1 Regras

#### 1ª Quinzena
- **Data início:** 1º do mês
- **Data fim:** 11 do mês
- **Ajuste:** Se cair no fim de semana, avança para segunda-feira

#### 2ª Quinzena
- **Data início:** 12 do mês
- **Data fim:** 25 do mês
- **Ajuste:** Se cair no fim de semana, avança para segunda-feira

### 5.2 Exemplos

| Quinzena | Mês | Ano | Data Início | Data Fim |
|----------|-----|-----|-------------|----------|
| 1ª QZ | MAIO | 2026 | 2026-05-01 | 2026-05-11 |
| 2ª QZ | MAIO | 2026 | 2026-05-12 | 2026-05-25 |
| 1ª QZ | ABRIL | 2026 | 2026-04-01 | 2026-04-13 (ajustado) |
| 2ª QZ | ABRIL | 2026 | 2026-04-12 | 2026-04-27 (ajustado) |

## 6. Estratégia de Automação

### 6.1 O Que Pode Ser Automatizado

1. **Dados cadastrais** — Via `/v2/team-members`
2. **Prestação de contas** — Via `/v2/reports` com filtro de data
3. **Cálculos derivados** — saldo_final, saldo_reembolsar, etc.

### 6.2 O Que Ainda Precisa de Investigação

1. **`saldo_cartao`** — 🔍 Endpoints de saldo a explorar
2. **`carga`, `transferencia`, `tarifa`** — 🔍 Endpoints de movimentações a explorar
3. **`1ª_qz`** — Campo preenchido pelo gestor
4. **`adiantamento`** — Campo preenchido pelo gestor
5. **`obs`** — Campo preenchido pelo gestor

### 6.3 Modo de Operação

#### Modo DB (`--apenas-db`)
- Usa apenas dados importados do Excel
- Funciona offline
- **Vantagem:** Não depende da API
- **Limitação:** Dados ficam desatualizados se não importar

#### Modo API (padrão)
- Combina dados do DB com dados da API
- **Prioridade:** API > DB para dados cadastrais e prestação de contas
- **Fallback:** DB se API falhar
- **Vantagem:** Dados mais atualizados
- **Limitação:** Depende de disponibilidade da API

## 7. Problemas Conhecidos e Soluções

### 7.1 Valores Estáticos Independente do Período
**Problema:** Valores não mudavam ao mudar quinzena/mês/ano

**Causa:** Filtro de data não estava sendo aplicado no extrato

**Solução:**
- Implementar `calcular_intervalo_quinzena()` para calcular data_inicio e data_fim
- Filtrar `extrato` por `data >= data_inicio AND data <= data_fim`
- Filtrar `quinzenas` por `quinzena`, `mês`, `ano`

### 7.2 Lentidão no Processamento de Reports
**Problema:** 2000+ reports levavam muito tempo para processar

**Causa:** Chamadas sequenciais para cada report

**Solução:**
- Implementar ThreadPoolExecutor com 3 threads
- Reduzir de 10 para 3 threads para evitar rate limiting
- Adicionar cache em memória com TTL de 1 hora

### 7.3 Erro 500 em Team-Members
**Problema:** `/v2/team-members` retornava erro 500

**Causa:** Parâmetro `include="costs_center,projects"` causava overload

**Solução:** Remover o parâmetro `include`

### 7.4 Erro 403 (Bloqueio Incapsula)
**Problema:** API retornando erro 403 em todos os endpoints

**Causa:** Firewall Incapsula bloqueando API_KEY

**Solução:** Verificar com VExpenses:
- Status da API_KEY
- Configuração de rate limiting
- Bloqueio de IP

## 8. Recomendações

### 8.1 Para Automação Completa

1. **Negociar com VExpenses:**
   - Endpoint para saldo de cartão pré-pago
   - Endpoint para histórico de recargas/transferências/tarifas
   - Aumentar limite de rate limiting

2. **Implementar:**
   - Sistema de fila para processamento assíncrono
   - Retry automático com backoff exponencial
   - Monitoramento de status da API

### 8.2 Para Operação Atual

1. **Usar modo DB** enquanto API estiver bloqueada
2. **Importar planilhas regularmente** para manter dados atualizados
3. **Implementar cache agressivo** para reduzir chamadas à API
4. **Monitorar status da API** para detectar quando voltar a funcionar

## 9. Scripts Úteis

### 9.1 Geração de Carga Quinzenal
```bash
# Modo DB (offline)
python backend/scripts/gerar_carga_quinzenal.py --apenas-db --quinzena "1ª QZ" --mes "MAIO" --ano "2026"

# Modo API (online)
python backend/scripts/gerar_carga_quinzenal.py --quinzena "1ª QZ" --mes "MAIO" --ano "2026"
```

### 9.2 Teste de API
```bash
python teste/testar_api_key.py
```

### 9.3 Validação vs Excel
```bash
python teste/validar_saida_vs_excel.py
```

## 10. Conclusão

A automação da carga quinzenal é **parcialmente possível**:

**Automatizável:**
- Dados cadastrais (via API)
- Prestação de contas (via API)
- Cálculos derivados

**Requer importação manual:**
- Saldo de cartão
- Extrato (carga/transferencia/tarifa)
- Campos manuais (1ª_qz, adiantamento, obs)

**Limitações da API:**
- Janela de 3 meses para expenses
- Sem endpoint para saldo de cartão
- Suscetível a rate limiting e bloqueios

**Recomendação:** Usar modo híbrido (DB + API) enquanto negocia novos endpoints com VExpenses.
