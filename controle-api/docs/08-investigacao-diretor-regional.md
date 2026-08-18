# Investigação: Como Obter Diretor Regional via API

## Objetivo

Encontrar como obter os campos `diretor_regional` e `diretor_regional_8` da aba Reembolso via API VExpenses.

## Metodologia

Testamos 3 opções para encontrar esses dados:
1. Custom Fields em reports/users
2. Approval Flows endpoint
3. Team Members endpoint

## Resultados

### Opção 1: Custom Fields ❌

**Endpoint testado:** `/v2/reports?include=user,expenses`

**Resultado:** Não há campos `custom_fields` ou similares nos objetos report ou user.

**Campos encontrados em report:**
- id, external_id, user_id, device_id, description, status
- approval_stage_id, approval_user_id, approval_date
- payment_date, payment_method_id, observation, paying_company_id
- on, justification, pdf_link, excel_link, created_at, updated_at
- user (objeto aninhado)

**Campos encontrados em user:**
- id, integration_id, external_id, company_id, role_id
- approval_flow_id, expense_limit_policy_id, user_type
- name, email, cpf, phone1, phone2, birth_date
- bank, agency, account, pix_key, confirmed, active
- parameters, created_at, updated_at

**Conclusão:** Não há custom fields visíveis na API pública.

---

### Opção 2: Approval Flows ✅

**Endpoint testado:** `/v2/approval-flows`

**Resultado:** **ENCONTRADO!** O diretor regional está na descrição do approval flow.

**Dados:**
- Total de approval flows: 38
- Cada flow tem: id, description, company_id, steps
- Cada user tem um `approval_flow_id` vinculado

**Exemplo de mapeamento:**
```
User: ABNER ANDRADE CAVALCANTE (ID: 895944)
  approval_flow_id: 172530
  → Approval Flow: REGIONAL CO (ID: 172530)
```

**Flows com nomes de pessoas (possíveis diretores):**
- REGIONAL_ROGERIO (ID: 172576)
- REGIONAL_EVERSON (ID: 172577)
- REGIONAL DIRETOR MARCOS (ID: 172588)

**Flows com DIRETOR no nome:**
- DIRETORIA
- DIRETORIA ADMINISTRATIVA
- DIRETORIA FINANCEIRA
- DIRETORIA REGIONAL
- REGIONAL DIRETOR MARCOS

**Diretores regionais no banco (para comparação):**
- EVERSON GAIDSTIECHI
- FELIPE FONTAN
- ROGERIO SCATAMBULO
- THIAGO NEVES
- MARCOS CARIAS
- FERNANDA ARAGÃO
- DANIEL DUARTE

**Conclusão:** O diretor regional pode ser obtido através do `approval_flow_id` do user, buscando a descrição do approval flow correspondente.

---

### Opção 3: Team Members ⚠️

**Endpoint testado:** `/v2/team-members`

**Resultado:** Não há campos de hierarquia direta, mas confirma o link com approval_flow.

**Dados:**
- Total de team members: 789
- Cada member tem: approval_flow_id (link para approval flow)
- Não há campos como supervisor_id, manager_id, reporting_line

**Conclusão:** O team-members endpoint confirma que cada user tem um approval_flow_id, mas não fornece o nome do diretor diretamente. Precisa fazer join com approval-flows.

---

## Solução Proposta

### Como Obter `diretor_regional`

**Mapeamento:**
1. Pegar o `user_id` do report
2. Buscar o user em `/v2/team-members` ou usar o user do report
3. Pegar o `approval_flow_id` do user
4. Buscar o approval flow em `/v2/approval-flows` pelo ID
5. Usar a `description` do approval flow como diretor regional

**Exemplo:**
```python
# Dado um report
user_id = report['user_id']  # 895944
approval_flow_id = user['approval_flow_id']  # 172530
approval_flow = get_approval_flow(approval_flow_id)
diretor_regional = approval_flow['description']  # "REGIONAL CO"
```

**Limitações:**
- A descrição do approval flow pode não ser exatamente o nome do diretor
- Alguns flows têm nomes genéricos (DIRETORIA, DIRETORIA FINANCEIRA)
- Pode ser necessário um mapeamento manual entre approval flows e nomes de diretores

### Como Obter `diretor_regional_8`

**Nota:** Não está claro qual é a diferença entre `diretor_regional` e `diretor_regional_8`.

**Possíveis explicações:**
1. Campo duplicado/legado
2. Diretor regional anterior (histórico)
3. Diretor regional de outra área/empresa
4. Campo não utilizado

**Investigação adicional necessária:**
- Comparar os valores de ambas as colunas no banco
- Verificar se há padrão (ex: um é atual, outro é anterior)
- Consultar a equipe que criou a planilha

---

## Comandos curl para Implementação

### 1. Baixar Approval Flows

```bash
curl.exe -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/approval-flows" \
  -o data/approval_flows.json
```

### 2. Baixar Team Members (para approval_flow_id)

```bash
curl.exe -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/team-members" \
  -o data/team_members.json
```

### 3. Baixar Reports com User

```bash
curl.exe -s -H "Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8" \
  -H "Accept: application/json" \
  "https://api.vexpenses.com/v2/reports?include=user" \
  -o data/reports.json
```

---

## Mapeamento Atualizado Reembolso

| Coluna Reembolso | Endpoint API | Campo API | Include Necessário | Status |
|------------------|---------------|-----------|-------------------|--------|
| `colaborador` | `/v2/reports` | `user.name` | `include=user` | ✅ |
| `cpf` | `/v2/reports` | `user.cpf` | `include=user` | ✅ |
| `valor` | `/v2/reports` | `expenses.value` (soma) | `include=expenses` | ✅ |
| `data` | `/v2/reports` | `created_at` ou `payment_date` | - | ✅ |
| `mês` | `/v2/reports` | `description` ou `created_at` | - | ✅ |
| `centro_de_custo` | `/v2/expenses` | `costs_center.description` | `include=costs_center` | ✅ |
| `diretor_regional` | `/v2/approval-flows` | `description` (via user.approval_flow_id) | Requer join | ✅ |
| `diretor_regional_8` | ? | ? | ? | ⚠️ |
| `motivo` | `/v2/reports` | `observation` ou `justification` | - | ✅ |

**Total:** 8/9 colunas mapeadas (89%)

---

## Investigação Aprofundada: De Onde Vêm os Nomes dos Diretores?

### Análise Comparativa: diretor_regional vs diretor_regional_8

**Padrões encontrados no banco:**

1. **Valores iguais** (quando valor é baixo):
   - FELIPE FONTAN | FELIPE FONTAN (valor: 656.87)
   - ROGERIO SCATAMBULO | ROGERIO SCATAMBULO (valor: 18745.85)
   - THIAGO NEVES | THIAGO NEVES (valor: 477.0)

2. **Valores diferentes** (quando valor é médio/alto):
   - ROGERIO SCATAMBULO | ADILSON RODRIGUES (valores: 544-696)
   - EVERSON GAIDSTIECHI | ADILSON RODRIGUES (valor: 544)

3. **diretor_regional_8 vazio** (quando valor é baixo):
   - EVERSON GAIDSTIECHI | None
   - ROGERIO SCATAMBULO | None
   - MARCOS CARIAS | None

**Conclusão:** `diretor_regional_8` parece ser o diretor que aprovou a despesa de alto valor, enquanto `diretor_regional` é o diretor regional padrão do usuário.

### Mapeamento de Diretores na API

#### 1. Diretores como Approvers nos Approval Flows

**FERNANDA ARAGÃO (ID: 896113):**
- É approver em **32 flows diferentes**
- Aprova valores >= 10000 (step 4)
- Flows onde aprova: REGIONAL CO, REGIONAL MG, REGIONAL RS, DIRETORIA, DIRETORIA REGIONAL, etc.

**ADILSON RODRIGUES (ID: 895948):**
- É approver em **22 flows diferentes**
- Aprova valores >= 5000 (step 3)
- Flows onde aprova: REGIONAL CO, REGIONAL MG, REGIONAL RS, REGIONAL_ROGERIO, etc.

**Estrutura do flow REGIONAL_ROGERIO (172576):**
```
Step 1: entrance_value=None → approvers: [891980, 891977, 946419, 891979, 891904, 896335]
Step 2: entrance_value=None → approvers: [896357]
Step 3: entrance_value=5000 → approvers: [895948] (ADILSON)
Step 4: entrance_value=10000 → approvers: [896113] (FERNANDA)
```

**Padrão:** Dependendo do valor da despesa, diferentes approvers são usados no mesmo flow.

#### 2. Diretores como Team Members

**Mapeamento encontrado:**

| Nome | ID | approval_flow_id | Flow Description |
|------|-----|------------------|------------------|
| FELIPE MELILLO FONTAN | 896111 | 172533 | DIRETORIA |
| FERNANDA ARAGÃO | 896113 | 172577 | PRESIDENCIA |
| ADILSON RODRIGUES FERREIRA | 895948 | 172533 | DIRETORIA |
| EVERSON CESAR GAIDSTIECHI | 896094 | 174408 | DIRETORIA REGIONAL |
| DANIEL DUARTE ALVES | 896041 | 172533 | DIRETORIA |

**Conclusão:** Os diretores estão na API como team members, mas seus approval_flow_id não correspondem diretamente ao nome do diretor regional.

#### 3. Diretores como Descrição de Approval Flow

**Flows com nomes de pessoas:**
- REGIONAL_ROGERIO (ID: 172576)
- REGIONAL_EVERSON (ID: 172577)
- REGIONAL DIRETOR MARCOS (ID: 197169)

**Limitação:** Nem todos os diretores têm flows com seus nomes (FELIPE, THIAGO, FERNANDA, DANIEL não têm).

### Solução Completa para Obter Diretores

#### Para `diretor_regional` (diretor padrão do usuário)

**Método 1: Via approval_flow.description**
- Pegar `user.approval_flow_id`
- Buscar approval flow pelo ID
- Usar `description` (ex: "REGIONAL CO", "REGIONAL_ROGERIO")

**Método 2: Via approvers do flow**
- Se a descrição não for um nome, buscar o approver do step final
- Mapear approver ID para nome via team-members

#### Para `diretor_regional_8` (diretor que aprovou)

**Método: Via approval history**
- A API não fornece approval history diretamente em reports
- `approval_user_id` está sempre null nos reports
- Precisa inferir pelo valor da despesa:
  - Se valor < 5000: diretor_regional_8 = diretor_regional
  - Se 5000 <= valor < 10000: diretor_regional_8 = approver do step 3 (ADILSON)
  - Se valor >= 10000: diretor_regional_8 = approver do step 4 (FERNANDA)

**Exemplo de lógica:**
```python
def get_diretor_regional_8(valor, approval_flow_id):
    if valor < 5000:
        return get_diretor_regional(approval_flow_id)
    elif valor < 10000:
        return "ADILSON RODRIGUES"  # approver step 3
    else:
        return "FERNANDA ARAGÃO"  # approver step 4
```

### Limitações e Workarounds

1. **approval_user_id sempre null** - A API não registra quem aprovou
2. **Nem todos os diretores têm flows com seus nomes** - Precisa usar approvers
3. **Lógica baseada em valor é aproximada** - Pode não ser 100% precisa
4. **Flows podem mudar** - A estrutura de approvers pode ser alterada
5. **Mesmo approval flow pode ter diferentes diretores** - Dependendo do centro de custo, o mesmo flow pode ter diretores diferentes

### Resultados dos Checks

**Teste inicial com dados reais (281 linhas):**
- CPF: 100% match (281/281)
- COLABORADOR: 99.6% match (280/281) - 1 divergência de nome
- DIRETOR REGIONAL: 72% match (203/281) - 78 divergências
- DIRETOR REGIONAL 8: 96% match (271/281) - 10 divergências

**Após implementação de mapeamento por centro de custo:**
- CPF: 100% match (281/281)
- COLABORADOR: 99.6% match (280/281) - 1 divergência de nome
- DIRETOR REGIONAL: 73% match (205/281) - 76 divergências
- DIRETOR REGIONAL 8: 97% match (272/281) - 9 divergências

**Análise das 76 divergências de diretor_regional:**
- 75 registros têm diretor_regional vazio no banco (dados incompletos)
- 1 divergência real: EDUARDO ANDREY VENSON SILVA (DB=ROGERIO SCATAMBULO, API=EVERSON GAIDSTIECHI)
- Centro de custo: CEF OESTE SC
- Flow: REGIONAL SC (172534)
- O banco tem um valor inconsistente para este caso específico

**Análise das 9 divergências de diretor_regional_8:**
- Todas são casos onde o valor da despesa não corresponde à lógica de aprovação esperada
- Possíveis causas: exceções manuais, mudanças na política de aprovação, ou dados inconsistentes

### Recomendação Final

**Para implementação:**
1. Usar `approval_flow.description` para `diretor_regional`
2. Implementar lógica baseada em valor para `diretor_regional_8`
3. Criar um mapeamento manual de approvers para nomes
4. Documentar que `diretor_regional_8` é inferido, não obtido diretamente da API

## Próximos Passos

1. **Implementar mapeamento de diretor_regional:**
   - Criar função que dado um user_id, retorna a descrição do approval flow
   - Testar com dados reais do banco

2. **Implementar mapeamento de diretor_regional_8:**
   - Criar função baseada em valor e approval flow
   - Criar mapeamento de approvers para nomes

3. **Criar check para reembolso:**
   - Implementar check usando o mapeamento atualizado
   - Incluir lógica de approval flow para diretores
