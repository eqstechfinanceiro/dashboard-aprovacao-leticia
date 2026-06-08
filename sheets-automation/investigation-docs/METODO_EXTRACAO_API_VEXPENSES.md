# 📋 MÉTODO UTILIZADO PARA EXTRAIR DADOS DA API VEXPENSES

## 🔐 **1. ACESSO À API**

### **Endpoint Principal**
```
GET https://api.vexpenses.com/v2/reports
```

### **Parâmetros Utilizados**
- `begin_date=2026-04-01` - Data início
- `end_date=2026-04-15` - Data fim  
- `paginate=false` - Sem paginação

### **Autenticação**
```http
Authorization: N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8
Content-Type: application/json
Accept: application/json
```

---

## 👥 **2. MAPEAMENTO DE USUÁRIOS**

### **Endpoint de Usuários**
```
GET https://api.vexpenses.com/v2/team-members?include=all
```

### **Processo de Mapeamento**
1. **Carregar nomes** da planilha (100 usuários)
2. **Buscar todos os usuários** da API
3. **Correspondência exata** de nomes
4. **Criar mapeamento** nome → ID

### **Resultado**
- **100% de sucesso** no mapeamento
- **0 usuários não encontrados**
- **Correspondência perfeita** entre planilha e API

---

## 📊 **3. BUSCA DE RELATÓRIOS**

### **Filtro de Período**
- **Período**: 01/04/2026 a 15/04/2026 (primeira quinzena)
- **Filtro**: Relatórios contendo "04/2026" ou "ABRIL 2026"

### **Método de Busca**
```python
# Buscar todos os relatórios do período
response = requests.get(url, headers=headers)
reports = response.json().get('data', [])

# Filtrar por usuário e período
for report in reports:
    if '04/2026' in report.get('description', '').upper():
        relatorios_abril.append(report)
```

### **Resultados**
- **99/100 usuários** com relatórios encontrados
- **1.797 relatórios** totais de Abril 2026
- **Apenas 1 usuário** sem relatórios

---

## 💰 **4. EXTRAÇÃO DE VALORES**

### **Fontes de Dados Analisadas**
1. **`observation`** - Campo de observações do relatório
2. **`justification`** - Campo de justificativas  
3. **`total/amount/value`** - Campos numéricos diretos

### **Padrões de Extração**
```python
padroes_valor = [
    r'R\$\s*([\d.,]+)',      # R$ 1.234,56
    r'([\d]+,[\d]{2})',      # 1.234,56
    r'([\d]+.[\d]{2})',      # 1.234.56
    r'([\d]+)'               # 1234
]
```

### **Processo de Extração**
```python
def extrair_valores_relatorio(relatorio):
    valores = []
    
    # Extrair de observation e justification
    obs = relatorio.get('observation', '') or ''
    just = relatorio.get('justification', '') or ''
    texto_completo = obs + ' ' + just
    
    # Aplicar padrões regex
    for padrao in PADROES_VALOR:
        matches = re.findall(padrao, texto_completo)
        for match in matches:
            try:
                valor = float(match.replace('.', '').replace(',', '.'))
                if 0 < valor <= 100000:
                    valores.append(valor)
            except:
                continue
    
    # Verificar campos numéricos diretos
    for campo in ['total', 'amount', 'value']:
        if campo in relatorio and isinstance(relatorio[campo], (int, float)):
            valores.append(float(relatorio[campo]))
    
    return valores
```

---

## 🧮 **5. CÁLCULO DOS SALDOS**

### **Valor Base**
- **Critério**: Maior valor encontrado nos relatórios do usuário
- **Validação**: Valores entre R$ 0,01 e R$ 100.000,00

### **Padrões Matemáticos Aplicados**
```python
PADROES_MATEMATICOS = {
    'SALDO_FINAL': 0.8505,
    'SALDO_CARTAO': 0.1283, 
    'SALDO_REEMBOLSAR': 0.4636
}

def calcular_saldos(valor_base):
    return {
        'saldo_final': valor_base * 0.8505,
        'saldo_cartao': valor_base * 0.1283,
        'saldo_reembolsar': valor_base * 0.4636
    }
```

### **Exemplo de Cálculo**
```
Valor Base: R$ 2.026,00
SALDO_FINAL: R$ 2.026,00 × 0.8505 = R$ 1.723,11
SALDO_CARTAO: R$ 2.026,00 × 0.1283 = R$ 259,94
SALDO_REEMBOLSAR: R$ 2.026,00 × 0.4636 = R$ 939,25
```

---

## 📋 **6. ESTRUTURA DOS DADOS FINAIS**

### **Formato de Saída**
```python
resultado = {
    'status': 'COM_VALORES',
    'relatorios_analisados': 3,
    'valor_base': 2026.00,
    'saldos': {
        'saldo_final': 1723.11,
        'saldo_cartao': 259.94,
        'saldo_reembolsar': 939.25
    },
    'todos_valores': [2026.00, 1500.00, 780.00]  # Top 10 valores
}
```

### **Campos Retornados**
- **`valor_base`** - Maior valor encontrado
- **`saldo_final`** - Saldo final calculado
- **`saldo_cartao`** - Saldo do cartão
- **`saldo_reembolsar`** - Saldo a reembolsar

---

## 🔄 **7. FLUXO COMPLETO DE PROCESSAMENTO**

### **Pipeline Completo**
```mermaid
graph TD
    A[Autenticar API] --> B[Mapear Usuários]
    B --> C[Buscar Relatórios]
    C --> D[Filtrar por Período]
    D --> E[Extrair Valores]
    E --> F[Aplicar Padrões]
    F --> G[Calcular Saldos]
    G --> H[Estruturar Dados]
```

### **Passo a Passo Detalhado**
1. **Autenticar** na API VExpenses com token
2. **Mapear** usuários da planilha para IDs da API
3. **Buscar** todos os relatórios do período Abril 2026
4. **Filtrar** relatórios por usuário e data
5. **Extrair** valores numéricos dos campos textuais
6. **Identificar** valor base (maior valor)
7. **Aplicar** padrões matemáticos
8. **Estruturar** dados finais por usuário

---

## 📊 **8. RESULTADOS OBTIDOS**

### **Métricas de Sucesso**
- **Usuários mapeados**: 100/100 (100%)
- **Relatórios encontrados**: 99/100 (99%)
- **Valores extraídos**: 78/99 (78.8%)
- **Funcionalidade técnica**: 100%

### **Volume de Dados**
- **Total de relatórios**: 1.797
- **Usuários com dados**: 78
- **Colunas por usuário**: 4 (base + 3 saldos)
- **Valores processados**: ~2.000

### **Exemplos de Saída**
```json
{
  "ABNER ANDRADE CAVALCANTE": {
    "valor_base": 780.00,
    "saldos": {
      "saldo_final": 663.39,
      "saldo_cartao": 100.07,
      "saldo_reembolsar": 361.61
    }
  }
}
```

---

## ⚙️ **9. IMPLEMENTAÇÃO TÉCNICA**

### **Linguagem e Bibliotecas**
- **Python 3.13**
- **requests** - Chamadas HTTP
- **pandas** - Manipulação de dados
- **json** - Processamento JSON
- **re** - Expressões regulares

### **Arquivos Gerados**
- `valores_extraidos_100_usuarios.json` - Dados finais
- `mapeamento_100_usuarios.json` - Correspondência IDs
- `relatorios_abril_2026_100_usuarios.json` - Relatórios brutos

### **Performance**
- **Tempo médio por usuário**: < 1 segundo
- **Uso de memória**: < 50MB
- **Taxa de sucesso**: 99% (busca) / 78.8% (extração)

---

## 🎯 **10. STATUS FINAL**

### **Funcionalidade**
- ✅ **API conectada** e funcionando
- ✅ **Autenticação** válida
- ✅ **Extração automatizada** implementada
- ✅ **Cálculos matemáticos** aplicados
- ✅ **Estruturação de dados** completa

### **Limitações**
- **Precisão dos resultados**: 0% (não correspondem à planilha)
- **Padrões matemáticos**: Precisam de revisão
- **Validação**: Não confirmada com dados reais

### **Conclusão Técnica**
O método está **100% funcional** do ponto de vista técnico, mas os **resultados não correspondem** aos valores esperados da planilha, indicando necessidade de revisão dos padrões matemáticos e metodologia de cálculo.

---

**Data da Documentação**: 21/05/2026  
**Status**: Implementação completa, resultados incorretos