import json

# Carregar dados da planilha
with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
    dados = json.load(f)

planilha = dados['Planilha1']

print('📊 ANÁLISE COMPLETA DAS COLUNAS DA PLANILHA CARGA MAIO 2026')
print('=' * 60)

# Encontrar primeira linha com dados para identificar colunas reais
primeira_linha_dados = None
linha_jonas = None

for i, linha in enumerate(planilha):
    if linha and any(linha) and i > 0:
        if not primeira_linha_dados:
            primeira_linha_dados = linha
        
        # Procurar linha do JONAS
        if linha and len(linha) > 0 and 'JONAS CAVALCANTI' in str(linha[0]):
            linha_jonas = linha
            print(f'🔍 JONAS encontrado na linha {i+1}')
            break

print()
print('📋 COLUNAS IDENTIFICADAS:')
colunas_identificadas = [
    'Colaborador', 'CPF', 'Status', 'Regional', 'Empresa', 
    'Gestor 1', 'Gestor 2', 'Campo 8', 'Valor Total', 
    'Quinzena', 'Percentual', 'Campo 12', 'Campo 13', 
    'Campo 14', 'Campo 15', 'Campo 16', 'Status Cartão'
]

for i, (coluna, valor) in enumerate(zip(colunas_identificadas, primeira_linha_dados)):
    if i < len(primeira_linha_dados):
        print(f'  Coluna {i+1} ({coluna}): "{valor}"')

print()
print('👤 DADOS COMPLETOS DO JONAS NA PLANILHA:')
if linha_jonas:
    for i, valor in enumerate(linha_jonas):
        if i < len(colunas_identificadas):
            nome_coluna = colunas_identificadas[i]
            print(f'  {nome_coluna:15}: "{valor}"')
        else:
            print(f'  Coluna {i+1:15}: "{valor}"')
else:
    print('JONAS não encontrado na planilha')

print()
print('🔍 PRÓXIMO PASSO: Puxar dados completos do JONAS da API...')
