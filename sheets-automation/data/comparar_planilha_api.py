import json
import pandas as pd
import numpy as np

print('COMPARANDO RESULTADOS API vs PLANILHA')
print('=' * 40)

# Carregar dados da API
with open('valores_extraidos_100_usuarios.json', 'r') as f:
    dados_api = json.load(f)

resultados_api = dados_api['resultados']
print(f'Usuários com dados da API: {len(resultados_api)}')

# Carregar dados da planilha
df_planilha = pd.read_csv('100_usuarios_planilha.csv')
print(f'Usuários na planilha: {len(df_planilha)}')

# Identificar colunas de valores na planilha
colunas_valor = []
for col in df_planilha.columns:
    if any(keyword in str(col).upper() for keyword in ['SALDO', 'VALOR', 'TOTAL']):
        colunas_valor.append(col)

print(f'Colunas de valor encontradas: {colunas_valor}')

# Função para limpar valores monetários
def limpar_valor_monetario(valor):
    if pd.isna(valor):
        return None
    if isinstance(valor, str):
        # Remover R$, espaços, pontos e vírgulas
        valor = str(valor).replace('R$', '').replace('$', '').strip()
        valor = valor.replace('.', '').replace(',', '.')
        try:
            return float(valor)
        except:
            return None
    return float(valor) if isinstance(valor, (int, float)) else None

# Comparar resultados
comparacoes = {
    'exatos': [],
    'proximos': [],
    'diferentes': [],
    'sem_dados_planilha': [],
    'sem_dados_api': []
}

tolerancia = 0.01  # 1% de tolerância

print(f'\nCOMPARANDO USUÁRIOS...')
print('-' * 25)

for i, row in df_planilha.iterrows():
    nome_planilha = str(row.get('PORTADOR', '')).strip().upper()
    
    # Buscar dados da API
    dados_usuario_api = resultados_api.get(nome_planilha)
    
    if not dados_usuario_api:
        comparacoes['sem_dados_api'].append(nome_planilha)
        continue
    
    # Extrair valores da planilha
    valores_planilha = {}
    for col in colunas_valor:
        valor = limpar_valor_monetario(row.get(col))
        if valor is not None and valor > 0:
            valores_planilha[col.upper()] = valor
    
    if not valores_planilha:
        comparacoes['sem_dados_planilha'].append(nome_planilha)
        continue
    
    # Comparar valores
    saldos_api = dados_usuario_api['saldos']
    
    # Verificar correspondências
    correspondencias = 0
    total_comparacoes = 0
    
    # Mapear colunas da planilha para saldos da API
    mapeamento_colunas = {
        'SALDO FINAL': 'saldo_final',
        'SALDO CARTÃO': 'saldo_cartao',
        'SALDO CARTAO': 'saldo_cartao',
        'SALDO REEMBOLSAR': 'saldo_reembolsar',
        'SALDO REEMBOLSO': 'saldo_reembolsar'
    }
    
    detalhes_comparacao = {
        'nome': nome_planilha,
        'valores_planilha': valores_planilha,
        'valores_api': saldos_api,
        'diferencas': {}
    }
    
    for col_planilha, valor_planilha in valores_planilha.items():
        # Encontrar saldo correspondente na API
        saldo_api_key = None
        for chave_api, saldo_key in mapeamento_colunas.items():
            if chave_api in col_planilha:
                saldo_api_key = saldo_key
                break
        
        if saldo_api_key and saldo_api_key in saldos_api:
            valor_api = saldos_api[saldo_api_key]
            total_comparacoes += 1
            
            # Calcular diferença percentual
            if valor_planilha > 0:
                diferenca_percentual = abs(valor_api - valor_planilha) / valor_planilha
                detalhes_comparacao['diferencas'][col_planilha] = {
                    'planilha': valor_planilha,
                    'api': valor_api,
                    'diferenca_percentual': diferenca_percentual * 100
                }
                
                if diferenca_percentual <= tolerancia:
                    correspondencias += 1
                elif diferenca_percentual <= 0.05:  # 5% de tolerância para "próximos"
                    correspondencias += 0.5
    
    # Classificar resultado
    if total_comparacoes == 0:
        comparacoes['sem_dados_planilha'].append(nome_planilha)
    elif correspondencias == total_comparacoes:
        comparacoes['exatos'].append(detalhes_comparacao)
        print(f'✅ {i+1:3d}: {nome_planilha[:25]}... -> EXATO')
    elif correspondencias / total_comparacoes >= 0.8:
        comparacoes['proximos'].append(detalhes_comparacao)
        print(f'🟡 {i+1:3d}: {nome_planilha[:25]}... -> PRÓXIMO')
    else:
        comparacoes['diferentes'].append(detalhes_comparacao)
        print(f'❌ {i+1:3d}: {nome_planilha[:25]}... -> DIFERENTE')

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

print(f'\n📊 ESTATÍSTICAS DE COMPARAÇÃO:')
print(f'Total de usuários: {total_usuarios}')
print(f'Comparáveis: {total_comparavel}')
print(f'Exatos: {len(comparacoes["exatos"])} ({taxa_exatos:.1f}%)')
print(f'Próximos: {len(comparacoes["proximos"])} ({taxa_proximos:.1f}%)')
print(f'Diferentes: {len(comparacoes["diferentes"])} ({taxa_diferentes:.1f}%)')
print(f'Sem dados API: {len(comparacoes["sem_dados_api"])}')
print(f'Sem dados planilha: {len(comparacoes["sem_dados_planilha"])}')
print(f'Taxa de sucesso: {taxa_sucesso:.1f}%')

# Salvar resultados detalhados
with open('comparacao_api_planilha.json', 'w') as f:
    json.dump({
        'comparacoes': comparacoes,
        'estatisticas': {
            'total_usuarios': total_usuarios,
            'total_comparavel': total_comparavel,
            'exatos': len(comparacoes['exatos']),
            'proximos': len(comparacoes['proximos']),
            'diferentes': len(comparacoes['diferentes']),
            'sem_dados_api': len(comparacoes['sem_dados_api']),
            'sem_dados_planilha': len(comparacoes['sem_dados_planilha']),
            'taxa_sucesso': taxa_sucesso,
            'tolerancia': tolerancia * 100
        }
    }, f, indent=2)

print(f'\n📁 Resultados salvos em: comparacao_api_planilha.json')

# Mostrar exemplos de resultados exatos
if comparacoes['exatos']:
    print(f'\n📋 EXEMPLOS DE COMPARAÇÕES EXATAS:')
    for i, detalhe in enumerate(comparacoes['exatos'][:3]):
        print(f'{i+1}. {detalhe["nome"][:30]}...')
        for col, diff in detalhe['diferencas'].items():
            print(f'   {col}: Planilha R$ {diff["planilha"]:,.2f} = API R$ {diff["api"]:,.2f}')

if taxa_sucesso >= 95:
    print(f'\n🎯 META ATINGIDA! Taxa de sucesso: {taxa_sucesso:.1f}% (>95%)')
    print(f'✅ Automação validada com sucesso!')
elif taxa_sucesso >= 90:
    print(f'\n🟡 META PRÓXIMA! Taxa de sucesso: {taxa_sucesso:.1f}% (>90%)')
    print(f'⚠️  Automação funciona, mas precisa de ajustes finos')
else:
    print(f'\n❌ META NÃO ATINGIDA! Taxa de sucesso: {taxa_sucesso:.1f}%')
    print(f'🔧 Automação precisa de melhorias significativas')

print(f'\n🚀 Próximo passo: Calcular precisão final e gerar relatório')