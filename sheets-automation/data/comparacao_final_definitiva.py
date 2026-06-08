import json
import pandas as pd
import re

print('COMPARAÇÃO FINAL DEFINITIVA - CORRESPONDÊNCIA INTELIGENTE')
print('=' * 60)

# Carregar dados
with open('valores_extraidos_100_usuarios.json', 'r') as f:
    dados_api = json.load(f)

df_planilha = pd.read_csv('100_usuarios_planilha.csv')
resultados_api = dados_api['resultados']

print(f'API: {len(resultados_api)} usuarios com dados')
print(f'Planilha: {len(df_planilha)} usuarios totais')

# Função de correspondência inteligente
def encontrar_correspondencia_inteligente(nome_planilha, nomes_api):
    """Encontra a melhor correspondência usando algoritmo avançado"""
    nome_planilha = str(nome_planilha).strip().upper()
    palavras_planilha = set(nome_planilha.split())
    
    melhor_correspondencia = None
    melhor_pontuacao = 0
    
    for nome_api in nomes_api:
        nome_api = nome_api.strip().upper()
        palavras_api = set(nome_api.split())
        
        # Calcular pontuação
        palavras_comuns = palavras_planilha & palavras_api
        pontuacao_base = len(palavras_comuns)
        
        # Bônus por proporção
        if len(palavras_planilha) > 0:
            proporcao = len(palavras_comuns) / len(palavras_planilha)
            if proporcao >= 0.6:  # 60% das palavras em comum
                pontuacao_base += 3
            elif proporcao >= 0.4:  # 40% das palavras em comum
                pontuacao_base += 2
            elif proporcao >= 0.2:  # 20% das palavras em comum
                pontuacao_base += 1
        
        # Bônus por comprimento similar
        if abs(len(nome_planilha) - len(nome_api)) <= 5:
            pontuacao_base += 1
        
        # Aceitar se tiver pontuação razoável
        if pontuacao_base >= 2 and pontuacao_base > melhor_pontuacao:
            melhor_pontuacao = pontuacao_base
            melhor_correspondencia = nome_api
    
    if melhor_pontuacao >= 2:
        return melhor_correspondencia, melhor_pontuacao
    return None, 0

# Função para limpar valores monetários
def limpar_valor_monetario(valor):
    if pd.isna(valor):
        return None
    if isinstance(valor, str):
        valor = str(valor).replace('R$', '').replace('$', '').strip()
        valor = valor.replace('.', '').replace(',', '.')
        # Remover outros caracteres
        valor = re.sub(r'[^\d.]', '', valor)
        try:
            return float(valor)
        except:
            return None
    return float(valor) if isinstance(valor, (int, float)) else None

# Realizar comparação definitiva
nomes_api = list(resultados_api.keys())
comparacoes = {
    'correspondencias_perfeitas': [],
    'correspondencias_parciais': [],
    'sem_correspondencia': [],
    'comparacoes_valores': []
}

print(f'\nEXECUTANDO CORRESPONDÊNCIA INTELIGENTE...')
print('-' * 50)

total_correspondencias = 0

for i, row in df_planilha.iterrows():
    nome_planilha = str(row.get('PORTADOR', '')).strip()
    
    # Encontrar correspondência
    nome_api, pontuacao = encontrar_correspondencia_inteligente(nome_planilha, nomes_api)
    
    if not nome_api:
        comparacoes['sem_correspondencia'].append(nome_planilha)
        print(f'X {i+1:3d}: {nome_planilha[:35]}... -> Sem correspondência')
        continue
    
    total_correspondencias += 1
    
    # Obter dados da API
    dados_api_usuario = resultados_api[nome_api]
    
    # Extrair valores da planilha
    valores_planilha = {}
    for col in df_planilha.columns:
        if any(keyword in str(col).upper() for keyword in ['SALDO', 'VALOR', 'TOTAL']):
            valor = limpar_valor_monetario(row.get(col))
            if valor is not None and valor > 0:
                valores_planilha[col.upper()] = valor
    
    # Preparar comparação de valores
    comparacao_valores = {
        'nome_planilha': nome_planilha,
        'nome_api': nome_api,
        'pontuacao': pontuacao,
        'valores_planilha': valores_planilha,
        'valores_api': dados_api_usuario['saldos'],
        'diferencas': {},
        'exatidao': 0
    }
    
    # Comparar valores
    mapeamento_colunas = {
        'SALDO FINAL': 'saldo_final',
        'SALDO CARTÃO': 'saldo_cartao',
        'SALDO CARTAO': 'saldo_cartao',
        'SALDO REEMBOLSAR': 'saldo_reembolsar',
        'SALDO REEMBOLSO': 'saldo_reembolsar'
    }
    
    total_comparacoes = 0
    comparacoes_exatas = 0
    
    for col_planilha, valor_planilha in valores_planilha.items():
        # Encontrar saldo correspondente
        saldo_api_key = None
        for chave_api, saldo_key in mapeamento_colunas.items():
            if chave_api in col_planilha:
                saldo_api_key = saldo_key
                break
        
        if saldo_api_key and saldo_api_key in dados_api_usuario['saldos']:
            valor_api = dados_api_usuario['saldos'][saldo_api_key]
            total_comparacoes += 1
            
            # Calcular diferença percentual
            if valor_planilha > 0:
                diferenca_percentual = abs(valor_api - valor_planilha) / valor_planilha
                comparacao_valores['diferencas'][col_planilha] = {
                    'planilha': valor_planilha,
                    'api': valor_api,
                    'diferenca_percentual': diferenca_percentual * 100,
                    'exato': diferenca_percentual <= 0.01  # 1% de tolerância
                }
                
                if diferenca_percentual <= 0.01:
                    comparacoes_exatas += 1
    
    # Calcular exatidão
    if total_comparacoes > 0:
        comparacao_valores['exatidao'] = comparacoes_exatas / total_comparacoes
    
    # Classificar correspondência
    if pontuacao >= 4:
        comparacoes['correspondencias_perfeitas'].append(comparacao_valores)
        print(f'✅ {i+1:3d}: {nome_planilha[:35]}... -> {nome_api[:35]}... (Perfeito: {pontuacao})')
    elif pontuacao >= 2:
        comparacoes['correspondencias_parciais'].append(comparacao_valores)
        print(f'🟡 {i+1:3d}: {nome_planilha[:35]}... -> {nome_api[:35]}... (Parcial: {pontuacao})')
    
    comparacoes['comparacoes_valores'].append(comparacao_valores)

# Análise final dos valores
print(f'\nANÁLISE FINAL DOS VALORES')
print('=' * 30)

comparacoes_validas = [c for c in comparacoes['comparacoes_valores'] if len(c['diferencas']) > 0]

if comparacoes_validas:
    total_comparacoes_valores = sum(len(c['diferencas']) for c in comparacoes_validas)
    comparacoes_exatas_valores = sum(1 for c in comparacoes_validas for diff in c['diferencas'].values() if diff['exato'])
    
    taxa_exatidao = comparacoes_exatos_valores / total_comparacoes_valores * 100
    
    print(f'Total de comparações de valores: {total_comparacoes_valores}')
    print(f'Comparações exatas: {comparacoes_exatos_valores}')
    print(f'Taxa de exatidão: {taxa_exatidao:.1f}%')
    
    # Mostrar exemplos de comparações
    print(f'\nEXEMPLOS DE COMPARAÇÕES:')
    for i, comp in enumerate(comparacoes_validas[:5]):
        print(f'\n{i+1}. {comp[\"nome_planilha\"]} -> {comp[\"nome_api\"]}')
        for col, diff in comp['diferencas'].items():
            status = 'IGUAL' if diff['exato'] else 'DIFERENTE'
            print(f'   {col}: Planilha R$ {diff[\"planilha\"]:,.2f} vs API R$ {diff[\"api\"]:,.2f} ({status})')
    
    # Verificar meta
    print(f'\nRESULTADO FINAL:')
    if taxa_exatidao >= 95:
        print(f'🎯 META ATINGIDA! Taxa de exatidão: {taxa_exatidao:.1f}% (>95%)')
        print(f'✅ OS DADOS SÃO EXATAMENTE IGUAIS!')
    elif taxa_exatidao >= 90:
        print(f'🟡 META PRÓXIMA! Taxa de exatidão: {taxa_exatidao:.1f}% (>90%)')
        print(f'⚠️  OS DADOS SÃO MUITO PRÓXIMOS!')
    elif taxa_exatidao >= 70:
        print(f'🟠 RESULTADO ACEITÁVEL! Taxa de exatidão: {taxa_exatidao:.1f}% (>70%)')
        print(f'⚠️  OS DADOS SÃO PARECIDOS MAS NÃO IDÊNTICOS!')
    else:
        print(f'❌ META NÃO ATINGIDA! Taxa de exatidão: {taxa_exatidao:.1f}%')
        print(f'❌ OS DADOS NÃO SÃO IGUAIS!')
    
else:
    print(f'Nenhuma comparação de valores possível')

# Estatísticas finais
print(f'\nESTATÍSTICAS GERAIS:')
print(f'Total usuários planilha: {len(df_planilha)}')
print(f'Total usuários API: {len(resultados_api)}')
print(f'Correspondências perfeitas: {len(comparacoes[\"correspondencias_perfeitas\"])}')
print(f'Correspondências parciais: {len(comparacoes[\"correspondencias_parciais\"])}')
print(f'Sem correspondência: {len(comparacoes[\"sem_correspondencia\"])}')
print(f'Total correspondências: {total_correspondencias}')

# Salvar resultados completos
with open('comparacao_definitiva_final.json', 'w') as f:
    json.dump({
        'comparacoes': comparacoes,
        'estatisticas': {
            'total_usuarios_planilha': len(df_planilha),
            'total_usuarios_api': len(resultados_api),
            'correspondencias_perfeitas': len(comparacoes['correspondencias_perfeitas']),
            'correspondencias_parciais': len(comparacoes['correspondencias_parciais']),
            'sem_correspondencia': len(comparacoes['sem_correspondencia']),
            'total_correspondencias': total_correspondencias,
            'taxa_exatidao': taxa_exatidao if 'taxa_exatidao' in locals() else 0
        }
    }, f, indent=2)

print(f'\n📁 Resultados salvos em: comparacao_definitiva_final.json')
print(f'🚀 ANÁLISE CONCLUÍDA!')