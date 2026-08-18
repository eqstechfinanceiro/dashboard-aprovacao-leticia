
O que a planilha de carga precisa — campo a campo
Campos cadastrais (já confirmados na API ✅)
Esses já temos via GET /v2/team-members:

name → COLABORADOR
cpf → CPF
active → SITUAÇÃO (true/false)
O que realmente precisamos investigar na API
São 4 grupos de dados financeiros que ainda não sabemos se existem:

1. SALDO DO CARTÃO (por colaborador, na data de corte)
Por que precisa: É um input direto na fórmula CARGA PARCIAL = 1ª QZ - SALDO PRESTAÇÃO - SALDO CARTAO - Adiantamento

Exemplo real (ABNER, MAIO 2026):



SALDO CARTAO = R$ 58,00
Isso é o saldo que o colaborador tinha no cartão VExpenses pré-pago no momento do corte da quinzena. Não é soma de despesas — é o saldo disponível no cartão.

2. CARGA (recargas feitas pela empresa no cartão do colaborador)
Por que precisa: Compõe o SALDO PRESTAÇÃO = CARGA + TRANSFERENCIA + TARIFA - PRESTAÇÃO_DE_CONTAS

Exemplo real (ABNER, acumulado MAIO 2026):



CARGA = R$ 231.233,70
São os depósitos feitos pela empresa no cartão pré-pago do colaborador ao longo do tempo.

3. TRANSFERÊNCIA (devoluções do colaborador para a empresa)
Por que precisa: Mesmo motivo — compõe o SALDO PRESTAÇÃO

Exemplo real (ABNER, MAIO 2026):



TRANSFERENCIA = -R$ 40.330,14  (valor negativo = saiu do colaborador)
4. TARIFA (taxas cobradas pela VExpenses)
Por que precisa: Idem — compõe o SALDO PRESTAÇÃO

Exemplo real (ABNER, MAIO 2026):



TARIFA = -R$ 1.386,00  (valor negativo = cobrado automaticamente)
São taxas automáticas por operação (ex: R$7 por saque, R$1,50 por PIX).

5. PRESTAÇÃO DE CONTAS (soma de despesas aprovadas — já sabemos como buscar ✅)
Rota confirmada: GET /v2/reports?search=status:3 + GET /v2/reports/{id}?include=expenses

Exemplo real (ABNER, MAIO 2026):



PRESTAÇÃO DE CONTAS = R$ 190.542,57
Com esses 4 dados, tudo se calcula automaticamente:


SALDO PRESTAÇÃO  = CARGA + TRANSFERENCIA + TARIFA - PRESTAÇÃO_DE_CONTAS
                 = 231.233,70 + (-40.330,14) + (-1.386,00) - 190.542,57
                 = -1.025,01  ✅ (bate com o painel)
 
SALDO REEMBOLSAR = |SALDO PRESTAÇÃO| se negativo  → 1.025,01
CARGA PARCIAL    = 1ª QZ - SALDO PRESTAÇÃO - SALDO CARTAO - Adiantamento
                 = 9.840 - 0 - 58 - 0 = 9.782
REEMBOLSO        = SALDO REEMBOLSAR × 0,5 = 541,50
Carga Final      = max(CARGA PARCIAL, 0) + REEMBOLSO = 10.323,50
O que pedir para outras IAs investigarem
Peça para buscarem endpoints que retornem, para um colaborador específico (por user_id):

Saldo atual do cartão pré-pago — provavelmente algo como /v2/cards, /v2/wallets, /v2/balances, /v2/accounts ou dentro de /v2/team-members/{id} com algum include
Histórico de movimentações do cartão — recargas (CARGA), devoluções (TRANSFERÊNCIA) e tarifas (TARIFA) — provavelmente /v2/transactions, /v2/statements, /v2/movements, /v2/card-transactions ou similar
Filtro por período — se existir, se aceita date:between igual ao /v2/expenses
Dados de referência para validar o que encontrarem (ABNER, CPF 02027745203, user_id a confirmar):



CARGA acumulada até MAIO 2026:       R$ 231.233,70
TRANSFERENCIA acumulada até MAIO:    R$ -40.330,14
TARIFA acumulada até MAIO:           R$ -1.386,00
SALDO CARTÃO em MAIO 2026:          R$ 58,00
SALDO CARTÃO em JUNHO 2026:         R$ 5,00
Se a rota encontrada bater com esses valores, está confirmado.

Aqui estão os dados completos de referência para as outras IAs investigarem:

5 usuários de referência para investigar na API
1. JONATAS DA ROSA DE OLIVEIRA


CPF:     06576357907
user_id: 896182
SITUAÇÃO: INATIVO  |  STATUS CARTÃO: Cartão Inativo
CENTRO DE CUSTO: CLARO INFRA SC  |  REGIONAL: REGIONAL CLARO INFRA SUL
 
CARGA:                 R$ 0,00
TRANSFERENCIA:         R$ 0,00
TARIFA:                R$ 0,00
PRESTAÇÃO DE CONTAS:   R$ 0,00
SALDO CARTÃO:          R$ 0,00
2. JONES ALEXANDRE DIAS CARVALHO


CPF:     00546854001
user_id: 1072506
SITUAÇÃO: ATIVO  |  STATUS CARTÃO: Cadastro pendente
CENTRO DE CUSTO: CLARO INFRA RS  |  REGIONAL: REGIONAL RS
 
CARGA:                 R$ 0,00
TRANSFERENCIA:         R$ 0,00
TARIFA:                R$ 0,00
PRESTAÇÃO DE CONTAS:   R$ 0,00
SALDO CARTÃO:          R$ 0,00
3. JORGE AUGUSTO DA SILVA E SILVA


CPF:     49825410000
user_id: 1072499
SITUAÇÃO: INATIVO  |  STATUS CARTÃO: Cartão Inativo
CENTRO DE CUSTO: DEFENSORIA PUBLICA RS  |  REGIONAL: REGIONAL RS
 
CARGA:                 R$ 1.076,00
TRANSFERENCIA:         R$ -14,50
TARIFA:                R$ -11,50
PRESTAÇÃO DE CONTAS:   R$ 0,00
SALDO PRESTAÇÃO:       R$ 1.050,00
SALDO CARTÃO:          R$ 0,00
SALDO FINAL:           R$ 1.050,00
4. JORGE ANTONIO VARGAS DA SILVA


CPF:     01063690080
user_id: 896184
SITUAÇÃO: ATIVO  |  STATUS CARTÃO: Cartão ativo
CENTRO DE CUSTO: NET CENTRO RS  |  REGIONAL: REGIONAL RS
 
CARGA:                 R$ 6.288,62
TRANSFERENCIA:         R$ -550,00
TARIFA:                R$ -77,00
PRESTAÇÃO DE CONTAS:   R$ 5.463,92
SALDO PRESTAÇÃO:       R$ 197,70
SALDO CARTÃO:          R$ 64,00
SALDO FINAL:           R$ 133,70
1ª QZ:                 R$ 500,00
5. JOSE MARCOS PEREIRA VAZ


CPF:     69071934004
user_id: 896191
SITUAÇÃO: ATIVO  |  STATUS CARTÃO: Cartão ativo
CENTRO DE CUSTO: CLARO INFRA RS  |  REGIONAL: REGIONAL CLARO INFRA SUL
 
CARGA:                 R$ 3.723,95
TRANSFERENCIA:         R$ -639,78
TARIFA:                R$ -42,00
PRESTAÇÃO DE CONTAS:   R$ 2.631,78
SALDO PRESTAÇÃO:       R$ 410,39
SALDO CARTÃO:          R$ 300,00
SALDO FINAL:           R$ 110,39
O que pedir para as outras IAs buscarem: endpoints que retornem CARGA, TRANSFERENCIA, TARIFA e SALDO CARTÃO por user_id, com os valores acima como referência de validação. Os valores do JORGE ANTONIO e JOSE MARCOS são os mais úteis por terem dados reais nos 4 campos.