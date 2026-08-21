# Mapeamento de Colunas Reembolso → API VExpenses

## Visão Geral

Este documento mapeia todas as 9 colunas da tabela `controle_reembolso` para os respectivos endpoints e campos da API VExpenses v2.

**Nota:** A aba Reembolso contém dados agregados de reports por usuário/mês, não dados individuais de expenses.

## Estratégia de Acesso

**Endpoint Principal:** `/v2/reports` com includes aninhados
**Endpoint Secundário:** `/v2/expenses` para detalhes das despesas dentro dos reports

## Mapeamento Completo

| Coluna Reembolso | Endpoint API | Campo API | Include Necessário | Observações |
|------------------|---------------|-----------|-------------------|-------------|
| `colaborador` | `/v2/reports` | `user.name` | `include=user` | Nome do usuário via reports.user |
| `cpf` | `/v2/reports` | `user.cpf` | `include=user` | CPF do usuário via reports.user |
| `valor` | `/v2/reports` | `expenses.value` (soma) | `include=expenses` | Soma dos valores das expenses do report |
| `data` | `/v2/reports` | `created_at` ou `payment_date` | - | Data do report (formato Excel) |
| `mês` | `/v2/reports` | `description` ou `created_at` | - | Extraído da descrição (ex: "CAIXA 06/2025") |
| `centro_de_custo` | `/v2/expenses` | `costs_center.description` | `include=costs_center` | Centro de custo das expenses |
| `diretor_regional` | `/v2/approval-flows` | `description` (via user.approval_flow_id) | Requer join | Obtido via approval_flow.description do usuário |
| `diretor_regional_8` | Inferido | Lógica baseada em valor + approval flow | Inferido | valor < 5000: diretor_regional; 5000-10000: ADILSON; >=10000: FERNANDA |
| `motivo` | `/v2/reports` | `observation` ou `justification` | - | Observação/justificação do report |

## Limitações Conhecidas

### Campos Inferidos

- `diretor_regional` - Obtido via `user.approval_flow_id` → `approval_flow.description`
- `diretor_regional_8` - Inferido baseado no valor da despesa:
  - valor < 5000: usa o mesmo diretor_regional
  - 5000 <= valor < 10000: ADILSON RODRIGUES (approver step 3)
  - valor >= 10000: FERNANDA ARAGÃO (approver step 4)

**Nota:** A inferência de `diretor_regional_8` é baseada na estrutura de approval flows e pode não ser 100% precisa se os flows forem alterados.

### Dados Agregados

- `valor` - Precisa ser calculado somando os valores das expenses dentro do report
- `centro_de_custo` - Pode variar entre expenses do mesmo report (precisa lógica de agregação)

## Estratégia de Busca

### Por Período (Mês)

```bash
GET /v2/reports?search=created_at:2025-07-01,2025-07-31&searchFields=created_at:between&include=user,expenses&paginate=true&page=1&per_page=200
```

### Por Usuário

```bash
GET /v2/reports?search=user_id:895944&searchFields=user_id:=&include=user,expenses&paginate=true&page=1&per_page=200
```

### Por Status

```bash
GET /v2/reports?search=status:APROVADO&searchFields=status:=&include=user,expenses&paginate=true&page=1&per_page=200
```

## Exemplo de Requisição Completa

```bash
curl.exe -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/reports?include=user,expenses&paginate=true&page=1&per_page=200"
```

## Campos Disponíveis em Reports

- `id` - ID do relatório
- `description` - Nome/descrição (ex: "CAIXA 06/2025")
- `status` - Status (APROVADO, REPROVADO, etc)
- `user_id` - ID do usuário
- `payment_date` - Data de pagamento
- `observation` - Observação
- `justification` - Justificação
- `created_at` - Data de criação
- `updated_at` - Data de atualização
- `pdf_link` - Link para PDF
- `excel_link` - Link para Excel
- `user` - Dados do usuário (nome, cpf, email, etc)
- `expenses` - Lista de expenses do report (quando incluído)

## Resumo

- **9 de 9 colunas** mapeadas (100%)
- **2 colunas** inferidas via approval flows: `diretor_regional`, `diretor_regional_8`
- **2 endpoints** utilizados: `/v2/reports`, `/v2/approval-flows`
- **2 includes** disponíveis em reports (user, expenses)
- **1 endpoint adicional** para approval flows
- **Inferência:** `diretor_regional_8` usa lógica baseada em valor da despesa
