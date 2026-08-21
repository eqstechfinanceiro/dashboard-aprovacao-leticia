# Plano de Implementação - Migração para API VExpenses

## Objetivo
Substituir a planilha de controle Excel por uma aplicação web que:
1. Puxa dados dinamicamente da API VExpenses por quinzena
2. Realiza os mesmos cálculos do Excel automaticamente
3. Permite edição manual de campos específicos (1ª QZ, Adiantamento, obs)
4. Gera a planilha de carga quinzenal automaticamente

## Fase 1: Mapeamento de Endpoints da API VExpenses

### 1.1 Dados do Colaborador (Base do PAINEL)
**Endpoint necessário**: Lista de colaboradores ativos

```
GET /api/v1/colaboradores
```

**Campos esperados**:
- colaborador_id
- nome
- cpf
- situacao (ATIVO/INATIVO)
- regional
- centro_custo
- status_cartao
- cartao_vexpenses (SIM/NÃO)
- cartao_itau (número)
- termo (ASSINADO/PENDENTE)

**Correspondência PAINEL**:
- COLABORADOR ← nome
- CPF ← cpf
- SITUAÇÃO ← situacao
- REGIONAL ← regional
- CENTRO DE CUSTO ← centro_custo
- STATUS DO CARTÃO ← status_cartao
- CARTÃO VEXPENSES ← cartao_vexpenses
- CARTÃO ITAU ← cartao_itau
- TERMO ← termo

### 1.2 Tabela Auxiliar (AUX)
**Endpoint necessário**: Lista de regionais com gestor e diretor

```
GET /api/v1/regionais
```

**Campos esperados**:
- regional
- gestor
- diretor

**Correspondência AUX**:
- REGIONAL ← regional
- GESTOR ← gestor
- DIRETOR ← diretor

### 1.3 Extrato de Movimentações (EXTRATO)
**Endpoint necessário**: Extrato por período

```
GET /api/v1/extrato?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&colaborador_id={id}
```

**Campos esperados**:
- colaborador_id
- colaborador_nome
- tipo (CARGA, TRANSFERÊNCIA, TARIFA, PRESTAÇÃO DE CONTAS)
- valor
- data
- mes
- ano

**Correspondência EXTRATO**:
- COLABORADOR ← colaborador_nome
- TIPO ← tipo
- VALOR ← valor
- DATA ← data
- MÊS ← mes
- ANO ← ano

### 1.4 Quinzenas (QUINZENAS)
**Endpoint necessário**: Valores por quinzena

```
GET /api/v1/quinzenas?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&colaborador_id={id}
```

**Campos esperados**:
- colaborador_id
- colaborador_nome
- cpf
- valor
- quinzena (1ª QZ, 2ª QZ, ITAU)
- data
- mes
- ano

**Correspondência QUINZENAS**:
- COLABORADOR ← colaborador_nome
- CPF ← cpf
- VALOR ← valor
- QUINZENA ← quinzena
- DATA ← data
- MÊS ← mes
- ANO ← ano

### 1.5 Saldo do Cartão (SALDO CARTAO)
**Endpoint necessário**: Saldo atual do cartão

```
GET /api/v1/saldo-cartao?colaborador_id={id}
```

**Campos esperados**:
- colaborador_id
- colaborador_nome
- cpf
- valor
- data
- mes
- ano

**Correspondência SALDO CARTAO**:
- COLABORADOR ← colaborador_nome
- CPF ← cpf
- VALOR ← valor
- DATA ← data
- MÊS ← mes
- ANO ← ano

### 1.6 Prestações de Contas (BASE PREST)
**Endpoint necessário**: Prestações por período

```
GET /api/v1/prestacoes?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&colaborador_id={id}
```

**Campos esperados**:
- colaborador_id
- colaborador_nome
- cpf
- valor
- data
- mes
- centro_custo
- forma_pagamento

**Correspondência BASE PREST**:
- Nome do membro de equipe ← colaborador_nome
- CPF ← cpf
- Valor ← valor
- MÊS ← mes
- Centro de Custos ← centro_custo

### 1.7 Adicionais (ADICIONAIS)
**Endpoint necessário**: Adicionais por período

```
GET /api/v1/adicionais?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&colaborador_id={id}
```

**Campos esperados**:
- colaborador_id
- colaborador_nome
- cpf
- valor
- data
- mes
- ano

**Correspondência ADICIONAIS**:
- COLABORADOR ← colaborador_nome
- CPF ← cpf
- VALOR ← valor
- DATA ← data
- MÊS ← mes
- ANO ← ano

### 1.8 Adicional Itaú (ADICIONAL ITAÚ)
**Endpoint necessário**: Adicionais Itaú por período

```
GET /api/v1/adicionais-itau?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&colaborador_id={id}
```

**Campos esperados**:
- colaborador_id
- colaborador_nome
- cpf
- valor
- data
- mes

**Correspondência ADICIONAL ITAÚ**:
- COLABORADOR ← colaborador_nome
- CPF ← cpf
- ADICIONADO ← valor
- DATA ← data
- MÊS ← mes

## Fase 2: Arquitetura da Aplicação

### 2.1 Stack Tecnológico

**Backend**:
- Python (FastAPI ou Flask)
- Banco de dados: PostgreSQL ou SQLite
- ORM: SQLAlchemy
- Autenticação: JWT

**Frontend**:
- React.js
- TailwindCSS para estilização
- shadcn/ui para componentes
- React Query para gerenciamento de dados

**Infraestrutura**:
- Docker para containerização
- Nginx como proxy reverso
- PostgreSQL como banco de dados

### 2.2 Estrutura de Diretórios

```
planilha-carga-quinzenal/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── endpoints/
│   │   │   │   │   ├── colaboradores.py
│   │   │   │   │   ├── quinzenas.py
│   │   │   │   │   ├── calculos.py
│   │   │   │   │   └── carga.py
│   │   │   │   └── deps.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── vexpenses_client.py
│   │   ├── models/
│   │   │   ├── colaborador.py
│   │   │   ├── quinzena.py
│   │   │   ├── carga.py
│   │   │   └── regional.py
│   │   ├── services/
│   │   │   ├── vexpenses_service.py
│   │   │   ├── calculo_service.py
│   │   │   └── carga_service.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CargaTable.tsx
│   │   │   ├── FiltroQuinzena.tsx
│   │   │   └── ManualInput.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   └── CargaQuinzenal.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml
```

## Fase 3: Lógica de Cálculos (Python)

### 3.1 Serviço de Cálculos

```python
# services/calculo_service.py

class CalculoService:
    def __init__(self, vexpenses_client):
        self.vexpenses = vexpenses_client
    
    def calcular_painel(self, colaborador_id, data_inicio, data_fim):
        """Calcula todos os campos do PAINEL para um colaborador"""
        
        # Buscar dados da API
        colaborador = self.vexpenses.get_colaborador(colaborador_id)
        regional = self.vexpenses.get_regional(colaborador['regional'])
        extrato = self.vexpenses.get_extrato(colaborador_id, data_inicio, data_fim)
        quinzenas = self.vexpenses.get_quinzenas(colaborador_id, data_inicio, data_fim)
        saldo_cartao = self.vexpenses.get_saldo_cartao(colaborador_id)
        prestacoes = self.vexpenses.get_prestacoes(colaborador_id, data_inicio, data_fim)
        adicionais = self.vexpenses.get_adicionais(colaborador_id, data_inicio, data_fim)
        adicional_itau = self.vexpenses.get_adicionais_itau(colaborador_id, data_inicio, data_fim)
        
        # Calcular campos
        carga = self._calcular_carga(extrato, colaborador['nome'])
        transferencia = self._calcular_transferencia(extrato, colaborador['nome'])
        tarifa = self._calcular_tarifa(extrato, colaborador['nome'])
        prestacao_contas = self._calcular_prestacao_contas(prestacoes, colaborador['cpf'])
        saldo_prestacao = carga + transferencia + tarifa - prestacao_contas
        saldo_cartao_valor = saldo_cartao['valor'] if saldo_cartao else 0
        saldo_final = saldo_prestacao - saldo_cartao_valor
        
        primeira_qz = self._calcular_quinzena(quinzenas, colaborador['cpf'], '1ª QZ')
        segunda_qz = self._calcular_quinzena(quinzenas, colaborador['cpf'], '2ª QZ')
        itau = self._calcular_quinzena(quinzenas, colaborador['cpf'], 'ITAU')
        adicionais_valor = self._calcular_adicionais(adicionais, colaborador['cpf'])
        adicional_itau_valor = self._calcular_adicional_itau(adicional_itau, colaborador['cpf'])
        
        situacao_colaborador = 'PROCESSADO' if (primeira_qz + segunda_qz >= saldo_final) else 'BLOQUEADO'
        cartao_cred_itau = 'SIM' if itau > 0 else 'NÃO'
        
        return {
            'EMPRESA': 'EQS',
            'COLABORADOR': colaborador['nome'],
            'CPF': colaborador['cpf'],
            'CHAVE': self._calcular_chave(colaborador['cpf']),
            'SITUAÇÃO': colaborador['situacao'],
            'STATUS DO CARTÃO': colaborador['status_cartao'],
            'CARTÃO ITAU': colaborador['cartao_itau'],
            'TERMO': colaborador['termo'],
            'REGIONAL': colaborador['regional'],
            'CENTRO DE CUSTO': colaborador['centro_custo'],
            'GESTOR': regional['gestor'],
            'DIRETOR': regional['diretor'],
            'CARTÃO VEXPENSES': colaborador['cartao_vexpenses'],
            'CARGA': carga,
            'TRANSFERENCIA': transferencia,
            '(-) TARIFA': tarifa,
            '(-) PRESTAÇÃO DE CONTAS': prestacao_contas,
            'SALDO PRESTAÇÃO': saldo_prestacao,
            '(-) SALDO CARTAO': saldo_cartao_valor,
            'SALDO FINAL': saldo_final,
            '1ª QZ': primeira_qz,
            '2ª QZ': segunda_qz,
            'ADICIONAIS': adicionais_valor,
            'SITUAÇÃO COLABORADOR': situacao_colaborador,
            'CARTÃO CRED. ITAU': cartao_cred_itau,
            'ITAU': itau,
            'ADICIONAL ITAU': adicional_itau_valor
        }
    
    def _calcular_chave(self, cpf):
        """Calcula CHAVE = LEFT(CPF,3)&RIGHT(CPF,3)"""
        cpf_str = str(int(cpf))
        return cpf_str[:3] + cpf_str[-3:]
    
    def _calcular_carga(self, extrato, colaborador_nome):
        """Soma de transações do tipo CARGA"""
        return sum(t['valor'] for t in extrato if t['tipo'] == 'CARGA' and t['colaborador_nome'] == colaborador_nome)
    
    def _calcular_transferencia(self, extrato, colaborador_nome):
        """Soma de transações do tipo TRANSFERÊNCIA"""
        return sum(t['valor'] for t in extrato if t['tipo'] == 'TRANSFERÊNCIA' and t['colaborador_nome'] == colaborador_nome)
    
    def _calcular_tarifa(self, extrato, colaborador_nome):
        """Soma de transações do tipo TARIFA"""
        return sum(t['valor'] for t in extrato if t['tipo'] == 'TARIFA' and t['colaborador_nome'] == colaborador_nome)
    
    def _calcular_prestacao_contas(self, prestacoes, cpf):
        """Soma de prestações de contas por CPF"""
        return sum(p['valor'] for p in prestacoes if p['cpf'] == cpf)
    
    def _calcular_quinzena(self, quinzenas, cpf, tipo_quinzena):
        """Soma de valores por quinzena e CPF"""
        return sum(q['valor'] for q in quinzenas if q['cpf'] == cpf and q['quinzena'] == tipo_quinzena)
    
    def _calcular_adicionais(self, adicionais, cpf):
        """Soma de adicionais por CPF"""
        return sum(a['valor'] for a in adicionais if a['cpf'] == cpf)
    
    def _calcular_adicional_itau(self, adicional_itau, cpf):
        """Soma de adicional Itaú por CPF"""
        return sum(a['valor'] for a in adicional_itau if a['cpf'] == cpf)
    
    def calcular_carga_quinzenal(self, colaborador_id, primeira_qz_manual, adiantamento_manual, obs_manual):
        """Calcula a planilha de carga quinzenal"""
        
        # Buscar dados do PAINEL calculado
        painel = self.calcular_painel(colaborador_id, data_inicio, data_fim)
        
        # Calcular campos da carga
        saldo_reembolsar = 0  # A definir - pode vir de outra fonte
        saldo_cartao = painel['(-) SALDO CARTAO']
        saldo_final = painel['SALDO FINAL']
        
        carga_parcial = primeira_qz_manual - saldo_final - saldo_cartao - adiantamento_manual
        if carga_parcial < 0:
            carga_parcial = 0
        
        reembolso = saldo_reembolsar * 0.5  # Parâmetro fixo
        carga_final = carga_parcial + reembolso
        
        return {
            'COLABORADOR': painel['COLABORADOR'],
            'CPF': painel['CPF'],
            'SITUAÇÃO': painel['SITUAÇÃO'],
            'REGIONAL': painel['REGIONAL'],
            'CENTRO DE CUSTO': painel['CENTRO DE CUSTO'],
            'GESTOR': painel['GESTOR'],
            'DIRETOR': painel['DIRETOR'],
            'SALDO REEMBOLSAR': saldo_reembolsar,
            'SALDO FINAL': saldo_final,
            '1ª QZ': primeira_qz_manual,
            'SALDO CARTAO': saldo_cartao,
            'Adiantamento': adiantamento_manual,
            'CARGA PARCIAL': carga_parcial,
            'REEMBOLSO': reembolso,
            'Carga Final': carga_final,
            'obs': obs_manual,
            'STATUS DO CARTÃO': painel['STATUS DO CARTÃO']
        }
```

## Fase 4: Interface Web

### 4.1 Página Principal - Dashboard

**Componentes**:
1. **Filtro de Período**
   - Seleção de mês/ano
   - Seleção de quinzena (1ª ou 2ª)
   - Botão "Gerar Carga"

2. **Tabela de Carga Quinzenal**
   - 17 colunas como na planilha Excel
   - Campos editáveis: 1ª QZ, Adiantamento, obs
   - Cálculos automáticos em tempo real
   - Exportação para Excel/CSV

3. **Resumo**
   - Total de colaboradores
   - Total da carga
   - Total de reembolsos
   - Status dos colaboradores (PROCESSADO/BLOQUEADO)

### 4.2 Componente de Edição Manual

```tsx
// components/ManualInput.tsx

interface ManualInputProps {
  colaborador: Colaborador;
  onUpdate: (campo: string, valor: any) => void;
}

export function ManualInput({ colaborador, onUpdate }: ManualInputProps) {
  return (
    <div className="flex gap-2">
      <Input
        type="number"
        placeholder="1ª QZ"
        value={colaborador.primeira_qz || ''}
        onChange={(e) => onUpdate('primeira_qz', parseFloat(e.target.value))}
        className="w-24"
      />
      <Input
        type="number"
        placeholder="Adiantamento"
        value={colaborador.adiantamento || ''}
        onChange={(e) => onUpdate('adiantamento', parseFloat(e.target.value))}
        className="w-24"
      />
      <Input
        type="text"
        placeholder="Observação"
        value={colaborador.obs || ''}
        onChange={(e) => onUpdate('obs', e.target.value)}
        className="w-48"
      />
    </div>
  );
}
```

### 4.3 Fluxo de Uso

1. **Usuário seleciona período**
   - Escolhe mês/ano (ex: Maio/2026)
   - Escolhe quinzena (1ª ou 2ª)
   - Clica em "Gerar Carga"

2. **Sistema busca dados da API**
   - Busca todos os colaboradores ativos
   - Para cada colaborador, busca dados da API VExpenses
   - Calcula todos os campos automaticamente

3. **Sistema exibe tabela**
   - Mostra todos os colaboradores com dados calculados
   - Campos manuais (1ª QZ, Adiantamento, obs) ficam vazios ou com valores padrão

4. **Usuário edita campos manuais**
   - Preenche 1ª QZ para cada colaborador
   - Preenche Adiantamento se necessário
   - Adiciona observações
   - Sistema recalcula CARGA PARCIAL, REEMBOLSO e Carga Final em tempo real

5. **Usuário exporta**
   - Exporta para Excel (formato igual ao original)
   - Ou salva no banco de dados para histórico

## Fase 5: Armazenamento de Dados

### 5.1 Banco de Dados

**Tabelas**:

```sql
-- Colaboradores
CREATE TABLE colaboradores (
    id SERIAL PRIMARY KEY,
    colaborador_id VARCHAR(50) UNIQUE,
    nome VARCHAR(255),
    cpf VARCHAR(20),
    situacao VARCHAR(20),
    regional VARCHAR(100),
    centro_custo VARCHAR(100),
    status_cartao VARCHAR(50),
    cartao_vexpenses VARCHAR(10),
    cartao_itau VARCHAR(20),
    termo VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Regionais (tabela auxiliar)
CREATE TABLE regionais (
    id SERIAL PRIMARY KEY,
    regional VARCHAR(100) UNIQUE,
    gestor VARCHAR(255),
    diretor VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Cargas Quinzenais
CREATE TABLE cargas_quinzenais (
    id SERIAL PRIMARY KEY,
    colaborador_id INTEGER REFERENCES colaboradores(id),
    mes INTEGER,
    ano INTEGER,
    quinzena VARCHAR(10), -- '1ª QZ' ou '2ª QZ'
    primeira_qz DECIMAL(10,2),
    adiantamento DECIMAL(10,2),
    obs TEXT,
    saldo_reembolsar DECIMAL(10,2),
    saldo_final DECIMAL(10,2),
    saldo_cartao DECIMAL(10,2),
    carga_parcial DECIMAL(10,2),
    reembolso DECIMAL(10,2),
    carga_final DECIMAL(10,2),
    situacao_colaborador VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Histórico de Sincronização
CREATE TABLE sincronizacoes (
    id SERIAL PRIMARY KEY,
    mes INTEGER,
    ano INTEGER,
    quinzena VARCHAR(10),
    data_sincronizacao TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20), -- 'SUCESSO', 'ERRO'
    mensagem TEXT
);
```

### 5.2 Cache de Dados da API

Para evitar chamadas excessivas à API:
- Cache de colaboradores: 24 horas
- Cache de regionais: 24 horas
- Cache de extrato/quinzenas: 1 hora (por período)

## Fase 6: Próximos Passos Imediatos

### 6.1 Obter Documentação da API VExpenses
- [ ] Solicitar documentação completa da API
- [ ] Obter credenciais de acesso (API key, tokens)
- [ ] Testar endpoints em ambiente de sandbox
- [ ] Validar estrutura de dados retornados

### 6.2 Criar Protótipo do Backend
- [ ] Configurar projeto FastAPI
- [ ] Implementar cliente VExpenses
- [ ] Implementar serviço de cálculos
- [ ] Criar endpoints para teste

### 6.3 Criar Protótipo do Frontend
- [ ] Configurar projeto React
- [ ] Criar componente de filtro de período
- [ ] Criar tabela de carga
- [ ] Implementar edição manual
- [ ] Implementar cálculos em tempo real

### 6.4 Validação
- [ ] Comparar dados da API com planilha atual
- [ ] Validar cálculos contra Excel
- [ ] Testar com dados reais de uma quinzena
- [ ] Ajustar lógicas se necessário

## Fase 7: Considerações Importantes

### 7.1 Tratamento de Erros
- Falha na API: usar cache ou dados anteriores
- Campos vazios: tratar como 0 ou null
- Inconsistências: alertar o usuário

### 7.2 Performance
- Buscar dados em lote quando possível
- Usar cache inteligente
- Processamento assíncrono para cálculos pesados

### 7.3 Segurança
- Autenticação de usuários
- Criptografia de dados sensíveis (CPF)
- Logs de auditoria

### 7.4 Manutenibilidade
- Código modular e testável
- Documentação de APIs
- Monitoramento de erros

## Resumo

**O que puxar da API:**
1. Colaboradores (dados básicos)
2. Regionais (gestor/diretor)
3. Extrato (CARGA, TRANSFERÊNCIA, TARIFA)
4. Quinzenas (1ª QZ, 2ª QZ, ITAU)
5. Saldo do cartão
6. Prestações de contas
7. Adicionais
8. Adicional Itaú

**Como apresentar:**
- Interface web com tabela editável
- Filtro por mês/ano e quinzena
- Cálculos automáticos em tempo real
- Exportação para Excel

**Campos manuais:**
- 1ª QZ: input numérico editável
- Adiantamento: input numérico editável
- obs: input de texto editável
- Recálculo automático ao alterar valores
