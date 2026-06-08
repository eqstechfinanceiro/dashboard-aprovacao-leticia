import json
import pandas as pd

print('COMPARAÇÃO INTELIGENTE - CORRESPONDÊNCIA POR PALAVRAS')
print('=' * 55)

# Carregar dados
df_planilha = pd.read_csv('100_usuarios_planilha.csv')
with open('valores_extraidos_100_usuarios.json', 'r') as f:
    dados_api = json.load(f)

resultados_api = dados_api['resultados']

print(f'Planilha: {len(df_planilha)} usuários')
print(f'API: {len(resultados_api)} usuários com dados')

# Função para correspondência inteligente de nomes
def encontrar_correspondencia(nome_planilha, nomes_api):
    """Encontra a melhor correspondência para um nome da planilha"""
    nome_planilha = str(nome_planilha).strip().upper()
    palavras_planilha = set(nome_planilha.split())
    
    melhor_correspondencia = None
    melhor_pontuacao = 0
    
    for nome_api in nomes_api:
        nome_api = nome_api.strip().upper()
        palavras_api = set(nome_api.split())
        
        # Calcular pontuação de correspondência
        palavras_comuns = palavras_planilha & palavras_api
        
        # Pontuação baseada em:
        # 1. Número de palavras em comum
        # 2. Proporção de palavras em comum
        # 3. Ordem das palavras (bônus)
        
        pontuacao = len(palavras_comuns)
        
        # Bônus se tiver mais de 50% das palavras em comum
        if len(palavras_planilha) > 0:
            proporcao = len(palavras_comuns) / len(palavras_planilha)
            if proporcao >= 0.5:
                pontuacao += 2
        
        # Bônus se os nomes tiverem comprimento similar
        if abs(len(nome_planilha) - len(nome_api)) <= 5:
            pontuacao += 1
        
        if pontuacao > melhor_pontuacao:
            melhor_pontuacao = pontuacao
            melhor_correspondencia = nome_api
    
    # Aceitar correspondência se tiver pelo menos 2 pontos
    if melhor_pontuacao >= 2:
        return melhor_correspondencia, melhor_pontuacao
    else:
        return None, 0

# Função para limpar valores monetários
def limpar_valor_monetario(valor):
    if pd.isna(valor):
        return None
    if isinstance(valor, str):
        valor = str(valor).replace('R$', '').replace('$', '').strip()
        valor = valor.replace('.', '').replace(',', '.')
        try:
            return float(valor)
        except:
            return None
    return float(valor) if isinstance(valor, (int, float)) else None

# Realizar comparação inteligente
nomes_api = list(resultados_api.keys())
correspondencias = []
comparacoes = {
    'exatos': [],
    'proximos': [],
    'diferentes': [],
    'sem_correspondencia': [],
    'sem_dados_planilha': []
}

print(f'\nREALIZANDO COMPARAÇÃO INTELIGENTE...')
print('-' * 40)

for i, row in df_planilha.iterrows():
    nome_planilha = str(row.get('PORTADOR', '')).strip()
    
    # Encontrar correspondência na API
    nome_api, pontuacao = encontrar_correspondencia(nome_planilha, nomes_api)
    
    if not nome_api:
        comparacoes['sem_correspondencia'].append(nome_planilha)
        print(f'❌ {i+1:3d}: {nome_planilha[:30]}... -> Sem correspondência')
        continue
    
    # Obter dados da API
    dados_api_usuario = resultados_api[nome_api]
    
    # Buscar valores na planilha
    valores_planilha = {}
    for col in df_planilha.columns:
        if any(keyword in str(col).upper() for keyword in ['SALDO', 'VALOR', 'TOTAL']):
            valor = limpar_valor_monetario(row.get(col))
            if valor is not None and valor > 0:
                valores_planilha[col.upper()] = valor
    
    if not valores_planilha:
        comparacoes['sem_dados_planilha'].append(nome_planilha)
        print(f'⚠️  {i+1:3d}: {nome_planilha[:30]}... -> Sem dados na planilha')
        continue
    
    # Comparar valores
    saldos_api = dados_api_usuario['saldos']
    correspondencias_valores = 0
    total_comparacoes_valores = 0
    
    detalhe_comparacao = {
        'nome_planilha': nome_planilha,
        'nome_api': nome_api,
        'pontuacao_correspondencia': pontuacao,
        'valores_planilha': valores_planilha,
        'valores_api': saldos_api,
        'diferencas': {}
    }
    
    # Mapear colunas e comparar
    mapeamento_colunas = {
        'SALDO FINAL': 'saldo_final',
        'SALDO CARTÃO': 'saldo_cartao',
        'SALDO CARTAO': 'saldo_cartao',
        'SALDO REEMBOLSAR': 'saldo_reembolsar',
        'SALDO REEMBOLSO': 'saldo_reembolsar'
    }
    
    for col_planilha, valor_planilha in valores_planilha.items():
        # Encontrar saldo correspondente
        saldo_api_key = None
        for chave_api, saldo_key in mapeamento_colunas.items():
            if chave_api in col_planilha:
                saldo_api_key = saldo_key
                break
        
        if saldo_api_key and saldo_api_key in saldos_api:
            valor_api = saldos_api[saldo_api_key]
            total_comparacoes_valores += 1
            
            # Calcular diferença percentual
            diferenca_percentual = abs(valor_api - valor_planilha) / valor_planilha
            detalhe_comparacao['diferencas'][col_planilha] = {
                'planilha': valor_planilha,
                'api': valor_api,
                'diferenca_percentual': diferenca_percentual * 100
            }
            
            if diferenca_percentual <= 0.01:  # 1% de tolerância
                correspondencias_valores += 1
            elif diferenca_percentual <= 0.05:  # 5% para "próximo"
                correspondencias_valores += 0.5
    
    # Classificar resultado
    if total_comparacoes_valores == 0:
        comparacoes['sem_dados_planilha'].append(nome_planilha)
        print(f'⚠️  {i+1:3d}: {nome_planilha[:30]}... -> Sem valores comparáveis')
    elif correspondencias_valores == total_comparacoes_valores:
        comparacoes['exatos'].append(detalhe_comparacao)
        print(f'✅ {i+1:3d}: {nome_planilha[:30]}... -> EXATO (Pont: {pontuacao})')
    elif correspondencias_valores / total_comparacoes_valores >= 0.8:
        comparacoes['proximos'].append(detalhe_comparacao)
        print(f'🟡 {i+1:3d}: {nome_planilha[:30]}... -> PRÓXIMO (Pont: {pontuacao})')
    else:
        comparacoes['diferentes'].append(detalhe_comparacao)
        print(f'❌ {i+1:3d}: {nome_planilha[:30]}... -> DIFERENTE (Pont: {pontuacao})')

# Calcular estatísticas finais
total_comparavel = len(comparacoes['exatos']) + len(comparacoes['proximos']) + len(comparacoes['diferentes'])
total_usuarios = len(df_planilha)

if total_comparavel > 0:
    taxa_exatos = len(comparacoes['exatos']) / total_comparavel * 100
    taxa_proximos = len(comparacoes['proximos']) / total_comparavel * 100
    taxa_diferentes = len(comparacoes['diferentes']) / total_comparavel * 100
    
    # Taxa de sucesso (exatos + próximos)
    taxa_sucesso = (len(comparacoes['exatos']) + len(comparacoes['proximos'])) / total_comparavel * 100
else:
    taxa_sucesso = 0

print(f'\n📊 ESTATÍSTICAS FINAIS - COMPARAÇÃO INTELIGENTE:')
print(f'Total de usuários: {total_usuarios}')
print(f'Com correspondência: {total_comparavel}')
print(f'Exatos: {len(comparacoes["exatos"])} ({taxa_exatos:.1f}%)')
print(f'Próximos: {len(comparacoes["proximos"])} ({taxa_proximos:.1f}%)')
print(f'Diferentes: {len(comparacoes["diferentes"])} ({taxa_diferentes:.1f}%)')
print(f'Sem correspondência: {len(comparacoes["sem_correspondencia"])}')
print(f'Sem dados planilha: {len(comparacoes["sem_dados_planilha"])}')
print(f'Taxa de sucesso: {taxa_sucesso:.1f}%')

# Salvar resultados
with open('comparacao_inteligente_final.json', 'w') as f:
    json.dump({
        'comparacoes': comparacoes,
        'estatisticas': {
            'total_usuarios': total_usuarios,
            'total_comparavel': total_comparavel,
            'exatos': len(comparacoes['exatos']),
            'proximos': len(comparacoes['proximos']),
            'diferentes': len(comparacoes['diferentes']),
            'sem_correspondencia': len(comparacoes['sem_correspondencia']),
            'sem_dados_planilha': len(comparacoes['sem_dados_planilha']),
            'taxa_sucesso': taxa_sucesso
        }
    }, f, indent=2)

print(f'\n📁 Resultados salvos em: comparacao_inteligente_final.json')

# Mostrar exemplos de sucesso
if comparacoes['exatos']:
    print(f'\n📋 EXEMPLOS DE COMPARAÇÕES EXATAS:')
    for i, detalhe in enumerate(comparacoes['exatos'][:3]):
        print(f'{i+1}. {detalhe["nome_planilha"][:30]}...')
        print(f'   API: {detalhe["nome_api"][:30]}... (Pont: {detalhe["pontuacao_correspondencia"]})')
        for col, diff in detalhe['diferencas'].items():
            print(f'   {col}: Planilha R$ {diff["planilha"]:,.2f} = API R$ {diff["api"]:,.2f}')

# Verificar meta
if taxa_sucesso >= 95:
    print(f'\n🎯 META ATINGIDA! Taxa de sucesso: {taxa_sucesso:.1f}% (>95%)')
    print(f'✅ Automação validada com sucesso!')
elif taxa_sucesso >= 90:
    print(f'\n🟡 META PRÓXIMA! Taxa de sucesso: {taxa_sucesso:.1f}% (>90%)')
    print(f'⚠️  Automação funciona, mas precisa de ajustes finos')
else:
    print(f'\n❌ META NÃO ATINGIDA! Taxa de sucesso: {taxa_sucesso:.1f}%')
    print(f'🔧 Automação precisa de melhorias significativas')

print(f'\n🚀 Próximo passo: Gerar relatório final de validação')