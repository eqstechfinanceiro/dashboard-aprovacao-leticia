# Objetivo do Projeto - Migração de Dados VExpenses

## Objetivo Principal

Migrar a fonte de dados da planilha de carga quinzenal de um Excel manual (planilha de controle) para dados dinâmicos da API VExpenses.

## Contexto Atual

### Planilha de Carga Quinzenal
- Arquivo: `CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx`
- 341 linhas de colaboradores
- Campos preenchidos manualmente: **Adiantamento**, **1ª QZ**, **OBS**
- Demais campos: Preenchidos automaticamente a partir da planilha de controle

### Planilha de Controle
- Arquivo: `CONTROLE - VEXPENSES - MAIO - 2026 (1).xlsx`
- Contém 160.116 fórmulas distribuídas em 9 abas
- Fonte atual dos dados para a planilha de carga
- Abas principais: PAINEL, QUINZENAS, SALDO CARTAO, REEMBOLSO, EXTRATO, etc.

## Mapeamento de Campos - Origem dos Dados

### Campos da Planilha de Carga vs Origem

| Campo Carga | Origem (Planilha Controle) | Aba | Campo Correspondente | Tipo | Observação |
|-------------|---------------------------|-----|---------------------|------|------------|
| COLABORADOR | PAINEL | PAINEL | COLABORADOR | Direto | Nome do colaborador |
| CPF | PAINEL | PAINEL | CPF | Direto | CPF do colaborador |
| SITUAÇÃO | PAINEL | PAINEL | SITUAÇÃO | Direto | ATIVO/INATIVO |
| REGIONAL | PAINEL | PAINEL | REGIONAL | Direto | Regional do colaborador |
| CENTRO DE CUSTO | PAINEL | PAINEL | CENTRO DE CUSTO | Direto | Centro de custo |
| GESTOR | PAINEL | PAINEL | GESTOR | Calculado (VLOOKUP AUX) | Busca na tabela AUX |
| DIRETOR | PAINEL | PAINEL | DIRETOR | Calculado (VLOOKUP AUX) | Busca na tabela AUX |
| SALDO REEMBOLSAR | **NÃO EXISTE** | - | - | Calculado na Carga | Fórmula: `=SUBTOTAL(9,H7:H346)` |
| SALDO FINAL | PAINEL | PAINEL | SALDO FINAL | Calculado | `=SUBTOTAL(9,PAINEL[SALDO FINAL])` |
| 1ª QZ | **MANUAL** | - | - | Manual | Preenchido manualmente |
| SALDO CARTAO | **NÃO EXISTE** | - | - | Calculado na Carga | Fórmula na carga |
| Adiantamento | **MANUAL** | - | - | Manual | Preenchido manualmente |
| CARGA PARCIAL | **NÃO EXISTE** | - | - | Calculado na Carga | Fórmula: `1ª QZ - SALDO FINAL - SALDO CARTAO - Adiantamento` |
| REEMBOLSO | **NÃO EXISTE** | - | - | Calculado na Carga | Fórmula: `SALDO REEMBOLSAR * $N$4` |
| Carga Final | **NÃO EXISTE** | - | - | Calculado na Carga | Fórmula condicional |
| obs | **MANUAL** | - | - | Manual | Preenchido manualmente |
| STATUS DO CARTÃO | PAINEL | PAINEL | STATUS DO CARTÃO | Direto | Status do cartão |

### Descobertas Importantes

1. **Interseção de CPFs**: Todos os 340 CPFs da planilha de carga existem no PAINEL (interseção 100%)
2. **Campos não existentes no PAINEL**: SALDO REEMBOLSAR, SALDO CARTAO, CARGA PARCIAL, REEMBOLSO, Carga Final são calculados DENTRO da planilha de carga, não importados do controle
3. **Campos manuais**: Apenas 3 campos são preenchidos manualmente na carga: Adiantamento, 1ª QZ, obs
4. **Fórmulas da Carga**: A planilha de carga tem suas próprias fórmulas para calcular campos que não vêm do PAINEL

### Campos Calculados (Fórmulas)

Os seguintes campos são calculados através de fórmulas complexas no Excel:

1. **SALDO REEMBOLSAR**: `=SUBTOTAL(9,PAINEL[SALDO REEMBOLSAR])`
2. **SALDO FINAL**: `=SUBTOTAL(9,PAINEL[SALDO FINAL])`
3. **SALDO CARTAO**: `=SUBTOTAL(9,PAINEL[SALDO CARTAO])`
4. **CARGA PARCIAL**: Fórmula complexa envolvendo 1ª QZ, SALDO FINAL, SALDO CARTAO e Adiantamento
5. **REEMBOLSO**: Soma de CARGA PARCIAL e REEMBOLSO
6. **Carga Final**: Fórmula condicional baseada em CARGA PARCIAL

## Etapas do Projeto

### Fase 1: Mapeamento Completo de Campos
- [ ] Correlacionar TODOS os campos da planilha de carga com suas origens
- [ ] Documentar cada fórmula do Excel e sua lógica
- [ ] Identificar dependências entre abas (VLOOKUPs, referências cruzadas)
- [ ] Mapear campos calculados vs campos diretos da API

### Fase 2: Exploração da API VExpenses
- [ ] Documentar endpoints da API VExpenses
- [ ] Identificar quais dados estão disponíveis na API
- [ ] Criar scripts para puxar dados da API por quinzena
- [ ] Validar dados da API vs dados atuais do Excel

### Fase 3: Validação de Dados
- [ ] Comparar dados da API com planilha de controle
- [ ] Identificar discrepâncias
- [ ] Mapear campos da API para campos da planilha de carga
- [ ] Criar regras de validação

### Fase 4: Implementação da Migração
- [ ] Criar script para puxar dados da API por quinzena
- [ ] Implementar lógica de cálculo dos campos (substituindo fórmulas Excel)
- [ ] Manter campos manuais (Adiantamento, 1ª QZ, OBS)
- [ ] Gerar planilha de carga a partir da API

### Fase 5: Testes e Homologação
- [ ] Testar com dados reais de uma quinzena
- [ ] Validar resultados contra planilha atual
- [ ] Ajustar lógicas de cálculo se necessário
- [ ] Documentar processo de geração

## Estrutura de Dados da API (a preencher)

### Endpoint: Relatório por Quinzena
```
GET /api/v1/reports/quinzenal?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
```

**Campos esperados (a confirmar):**
- colaborador_id
- colaborador_nome
- colaborador_cpf
- regional
- centro_custo
- gestor
- diretor
- saldo_reembolsar
- saldo_final
- saldo_cartao
- reembolso
- status_cartao
- situacao

### Campos Manuais (não da API)
- adiantamento
- quinzena_valor (1ª QZ)
- observacoes (OBS)

## Scripts Necessários

### 1. `mapear_campos.py`
Correlaciona campos da carga com origens no controle e na API.

### 2. `validar_api.py`
Puxa dados da API e compara com planilha de controle.

### 3. `gerar_carga_api.py`
Gera planilha de carga a partir da API + campos manuais.

### 4. `comparar_cargas.py`
Compara carga gerada via API vs carga manual atual.

## Próximos Passos Imediatos

1. **Mapear campos**: Criar script que mostra de onde vem cada campo da carga
2. **Explorar API**: Obter documentação da API VExpenses e testar endpoints
3. **Validar**: Comparar dados da API com controle para garantir consistência
4. **Implementar**: Criar script de geração de carga via API

## Observações Importantes

- A planilha de controle tem fórmulas que dependem de outras abas (EXTRATO, AUX, etc.)
- Alguns campos usam VLOOKUP para buscar dados em tabelas auxiliares
- A lógica de cálculo do Excel precisa ser replicada em Python
- Campos manuais devem continuar sendo editáveis após geração via API
- A API deve fornecer dados por quinzena (data início e data fim)
