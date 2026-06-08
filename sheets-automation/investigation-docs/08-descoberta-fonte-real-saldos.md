# DESCOBERTA CRÍTICA: Fonte Real dos Dados de Saldo

## 🎯 **DATA DA DESCOBERTA**
2026-05-21

## 🔍 **O QUE FOI DESCOBERTO**

Os dados de **SALDO FINAL, SALDO CARTÃO e SALDO REEMBOLSAR** **NÃO** provêm da API VExpenses. Eles são extraídos de um arquivo Excel externo mantido manualmente.

## 📁 **FONTE REAL DOS DADOS**

### Arquivo Fonte
- **Nome**: `CONTROLE - VEXPENSES - ABRIL- 2026.xlsb`
- **Localização**: `data/CONTROLE - VEXPENSES - ABRIL- 2026.xlsb`
- **Tipo**: Excel Binary Workbook (.xlsb)
- **Manutenção**: Manual (atualizado por pessoa/processo externo)

### Estrutura do Arquivo
O arquivo contém múltiplas abas (sheets), incluindo:
- **SALDO CARTAO**: Contém os dados de saldo do cartão por CPF e data
- **QUINZENAS**: Contém os valores de quinzena por período
- **ADICIONAIS**: Contém valores adicionais por mês
- **EXTRATO**: Contém dados de extrato bancário
- Outras abas de controle

## 🔬 **COMO OS DADOS SÃO EXTRAÍDOS**

### Processo Atual (implementado em `build-full-index.js`)
```javascript
// Linha 89: Lê o arquivo Excel
const wb2 = readXlsx('CONTROLE - VEXPENSES - ABRIL- 2026 (1).xlsb');

// Linha 129: Processa a aba SALDO CARTAO
const rows = sheetToRows(wb2.Sheets['SALDO CARTAO']);

// Linhas 132-159: Extrai dados das colunas
// Lado esquerdo: cols B-F (idx 1-5): CPF, VALOR, DATA, MÊS, EMPRESA
// Lado direito: cols J-M (idx 9-12): CPF, VALOR, DATA
```

### Uso na API (`route.ts`)
```typescript
// Linha 109: Carrega o índice que contém os dados de saldo
const saldoCartaoData: Record<string, any[]> = idx.saldoCartaoIdx || {};

// Linha 137-147: Função para buscar saldo cartão mais próximo
function getSaldoCartao(cpf: string): number | null {
  const entries = saldoCartaoData[cpf];
  if (!entries || entries.length === 0) return null;
  // Encontrar entrada mais próxima do endDate
  const valid = entries.filter((e: any) => e.data <= endDate);
  if (valid.length === 0) {
    return entries[0].valor;
  }
  return valid[valid.length - 1].valor;
}
```

## 📊 **EVIDÊNCIAS QUE COMPROVAM ESTA DESCOBERTA**

### 1. Análise do Código Fonte
- `build-full-index.js` (linhas 125-172): Mostra claramente que os dados de saldo são extraídos do arquivo Excel
- `route.ts` (linha 109): Usa `idx.saldoCartaoIdx` que é populado pelo script acima
- `route.ts` (linhas 197-201): Comentário confirma fórmula usando `PAINEL.saldoPrestacao`

### 2. Testes de API Realizados
Todos os testes de API falharam em encontrar dados de saldo:
- ✗ 23 endpoints testados (todos falharam: 405, 422, ou 404)
- ✗ Endpoints específicos por usuário (todos retornaram 404)
- ✗ Fórmulas matemáticas simples (melhor: 23.53% de precisão)
- ✗ Fórmulas matemáticas avançadas (melhor: 76.47% - maioria zeros)
- ✗ Combinações de filtros por payment_method_id (apenas matches falsos positivos com R$ 0,00)

### 3. Estrutura da Solução Híbrida Atual
A implementação atual em `route.ts` já usa uma abordagem híbrida:
- **Dados da API**: 1QZ, expenses, team members
- **Dados do Excel**: SALDO CARTÃO, SALDO FINAL, SALDO REEMBOLSAR
- **Dados históricos**: Fallback para `planilha-1qz-data.json`

## 🎯 **IMPACTO DESTA DESCOBERTA**

### Para 100% de Automação
**CONCLUSÃO**: É **IMPOSSÍVEL** alcançar 100% de automação usando apenas a API VExpenses, pois os dados de saldo não existem na API.

### Possibilidades Reais
1. **Automação Parcial (70-80%)**: Continuar usando abordagem híbrida
   - API para: 1QZ, expenses, dados cadastrais
   - Excel para: SALDO CARTÃO, SALDO FINAL, SALDO REEMBOLSAR

2. **Automação com Integração Adicional**:
   - Integrar com sistema bancário para obter saldos de cartão
   - Automatizar atualização do arquivo Excel via script
   - Criar API própria que expõe os dados do Excel

3. **Investigação da Fonte Original**:
   - Descobrir qual sistema/processo gera o arquivo Excel
   - Integrar diretamente com esse sistema
   - Eliminar a dependência do arquivo Excel manual

## 📋 **TESTES REALIZADOS NESTA INVESTIGAÇÃO**

### Testes de API
1. **23 endpoints não explorados** (`investigate-new-endpoints.js`)
   - Resultado: Todos falharam (405, 422, 404)

2. **Endpoints específicos por usuário** (`test-user-endpoints.js`)
   - Resultado: Todos retornaram 404

3. **Reports endpoint** (`test-reports-simple.js`)
   - Resultado: Não contém dados de saldo

### Testes de Fórmulas Matemáticas
1. **Fórmulas simples** (`test-formulas-exaustivas.js`)
   - Melhor resultado: 23.53% de precisão
   - A maioria dos matches era com valor R$ 0,00

2. **Fórmulas avançadas** (`test-advanced-formulas.js`)
   - Melhor resultado: 76.47% para SALDO REEMBOLSAR
   - Mas maioria dos matches era com valor R$ 0,00 (não significativo)

3. **Combinações de filtros** (`test-payment-method-combinations.js`)
   - Resultado: Apenas matches falsos positivos com R$ 0,00

### Testes de Payment Methods
1. **Descoberta de payment methods** (`investigate-payment-methods.js`)
   - 5 métodos encontrados: Cartão Itaú, Saque VExpenses, Cartão VExpenses, Pix VExpenses, Recurso Próprio

2. **Teste de somatórias por payment method** (`test-payment-method-sums.js`)
   - Resultado: Nenhuma correlação com saldos da planilha

3. **Teste de fórmula QZ1** (`test-qz1-formula.js`)
   - Hipótese: QZ1 = total expenses
   - Resultado: FALHOU - apenas 1.6% de matches

## ✅ **CONCLUSÃO FINAL**

### Certeza Absoluta
Os dados de **SALDO FINAL, SALDO CARTÃO e SALDO REEMBOLSAR** **NÃO** estão disponíveis na API VExpenses. Eles são mantidos em um arquivo Excel externo (`CONTROLE - VEXPENSES - ABRIL- 2026.xlsb`) que é atualizado manualmente.

### Implicações
1. **100% de automação via API VExpenses é IMPOSSÍVEL**
2. A solução atual (híbrida) é a melhor abordagem possível
3. Para 100% de automação, seria necessário:
   - Integrar com sistema que gera o arquivo Excel, OU
   - Integrar com sistema bancário para obter saldos, OU
   - Automatizar a atualização do arquivo Excel

### Recomendação
Manter a abordagem híbrida atual e documentar claramente esta limitação para o usuário. Investigar a possibilidade de integrar com a fonte original dos dados do Excel para futura automação completa.

---

**Status**: 🔍 **DESCOBERTA CONFIRMADA**  
**Fonte dos dados de saldo**: Arquivo Excel externo  
**Possibilidade de 100% automação via API**: **IMPOSSÍVEL**  
**Melhor abordagem atual**: Solução híbrida (API + Excel)