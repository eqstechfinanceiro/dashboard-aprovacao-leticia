---
description: Workflow para investigação sistemática de APIs complexas com múltiplas rotas, filtros e necessidade de mesclagem/cálculo de dados
---

# Workflow de Investigação de API

## Objetivo
Investigar APIs complexas que requerem múltiplas requisições, filtros avançados, mesclagem de dados de diferentes rotas e cálculos para extrair informações específicas.

## Quando Usar
- Precisar descobrir como obter um dado específico que não está disponível diretamente em um endpoint
- Precisar entender a estrutura de dados da API
- Precisar identificar quais endpoints combinar para chegar na informação desejada
- Precisar descobrir filtros e parâmetros disponíveis
- Precisar validar se um dado está disponível via API ou se requer workaround

## Passos

### 1. Definir o Objetivo da Investigação
- Escrever claramente qual dado ou informação você precisa obter
- Identificar se é um dado simples (um endpoint) ou complexo (requer mesclagem/cálculo)
- Documentar o contexto: para que servirá esse dado?

### 2. Mapear Endpoints Disponíveis
- Ler a documentação da API (docs/01-api-endpoints-completos.md)
- Listar todos os endpoints GET disponíveis
- Identificar quais endpoints retornam dados relacionados ao objetivo
- Documentar os campos disponíveis em cada endpoint

### 3. Analisar Estrutura de Dados
- Para cada endpoint relevante, fazer uma requisição de teste
- Examinar a estrutura JSON da resposta
- Identificar campos que podem ser usados para cruzamento de dados (IDs, chaves estrangeiras)
- Documentar os relacionamentos entre endpoints (ex: expense tem user_id, costs_center_id, etc)

### 4. Testar Filtros Disponíveis
- Consultar docs/03-filtros-e-acesso-dados.md para filtros conhecidos
- Testar filtros por campo específico (ex: user_id, date, costs_center_id)
- Testar operadores disponíveis (between, =, >=, <=, >, <)
- Testar combinação de múltiplos filtros com searchJoin (and/or)
- Documentar quais filtros funcionam e quais não

### 5. Identificar Necessidade de Mesclagem
- Verificar se o dado desejado está disponível diretamente em algum endpoint
- Se não estiver, identificar quais endpoints precisam ser combinados
- Mapear as chaves de relacionamento (ex: user_id em expenses → id em team-members)
- Documentar a estratégia de mesclagem (join por ID, cruzamento de listas, etc)

### 6. Implementar Estratégia de Mesclagem
- Criar script Python para buscar dados dos endpoints necessários
- Implementar lógica de mesclagem (dicionários, listas, pandas se necessário)
- Testar com dados reais
- Validar se o resultado é o esperado

### 7. Testar Cálculos Necessários
- Se o dado requer cálculo (ex: totais, médias, agregações), implementar a lógica
- Testar com diferentes cenários
- Validar resultados com dados conhecidos
- Documentar a fórmula/cálculo usado

### 8. Verificar Limitações da API
- Consultar docs/04-limitacoes-e-workarounds.md
- Identificar se o dado desejado está bloqueado (405) ou não disponível
- Se não disponível, documentar workarounds possíveis
- Considerar combinação API + dados locais (planilhas, JSON)

### 9. Documentar Descobertas
- Criar documento em docs/ com nome descritivo (ex: 06-investigacao-[tema].md)
- Incluir:
  - Objetivo da investigação
  - Endpoints testados
  - Estrutura de dados encontrada
  - Filtros que funcionam
  - Estratégia de mesclagem usada
  - Cálculos implementados
  - Limitações encontradas
  - Workarounds aplicados
  - Código de exemplo

### 10. Criar Script Reutilizável
- Se a estratégia for bem-sucedida, criar script em src/ ou temp/
- Seguir padrões do projeto (logging, type hints, tratamento de erros)
- Incluir documentação clara
- Testar com diferentes parâmetros

## Exemplo Prático

### Objetivo: Obter total de despesas por usuário em uma quinzena

1. **Definir objetivo**: Preciso do total gasto por cada usuário entre 01/04/2026 e 15/04/2026

2. **Mapear endpoints**:
   - `/v2/expenses` - tem user_id, value, date
   - `/v2/team-members` - tem id, name

3. **Estrutura de dados**:
   - expenses: id, user_id, value, date
   - team-members: id, name

4. **Testar filtros**:
   - `search: date:2026-04-01,2026-04-15` com `searchFields: date:between` ✓
   - `include: user` para trazer nome do usuário ✓

5. **Mesclagem**:
   - Buscar expenses do período com include=user
   - Agrupar por user_id
   - Somar values por usuário

6. **Cálculo**:
   - Para cada usuário: sum(expense.value for expense in user_expenses)

7. **Limitações**:
   - Nenhuma para este caso

8. **Documentar**: Criar docs/06-investigacao-total-por-usuario.md

9. **Script**: Criar temp/calculate_total_by_user.py

## Ferramentas Úteis

### Para testar endpoints:
```bash
# Via curl
curl -H "Authorization: YOUR_KEY" "https://api.vexpenses.com/v2/expenses?search=date:2026-04-01,2026-04-15&searchFields=date:between"

# Via Python (usando api_client.py)
python -c "from src.api_client import get_expenses_by_period; print(get_expenses_by_period('2026-04-01', '2026-04-15'))"
```

### Para analisar JSON:
```python
import json
with open('data/expenses.json', 'r') as f:
    data = json.load(f)
    print(json.dumps(data, indent=2))
```

### Para mesclagem de dados:
```python
# Dicionário para lookup rápido
users_dict = {u['id']: u for u in team_members}
for expense in expenses:
    user = users_dict.get(expense['user_id'])
    # fazer algo com user
```

## Padrões do Projeto

### Estrutura de scripts:
- Imports no topo
- Type hints em todos os parâmetros
- Docstrings em todas as funções
- Logging com níveis apropriados
- Tratamento de erros com try/except

### Cache:
- Usar api_client.py que já tem cache em memória
- Respeitar TTLs definidos
- Usar load_*_from_file quando disponível

### Documentação:
- Criar arquivos em docs/ com prefixo numérico
- Usar markdown com seções claras
- Incluir exemplos de código
- Documentar limitações e workarounds

## Checklist de Validação

Antes de concluir a investigação:

- [ ] Objetivo está claramente definido
- [ ] Todos os endpoints relevantes foram testados
- [ ] Estrutura de dados foi documentada
- [ ] Filtros foram validados
- [ ] Estratégia de mesclagem foi implementada e testada
- [ ] Cálculos foram validados com dados conhecidos
- [ ] Limitações foram identificadas
- [ ] Workarounds foram documentados (se necessário)
- [ ] Descobertas foram documentadas em docs/
- [ ] Script reutilizável foi criado (se aplicável)
