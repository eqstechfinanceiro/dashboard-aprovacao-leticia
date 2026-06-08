import pandas as pd
import numpy as np

print('ANALISANDO PLANILHA PARA SELEÇÃO DE 100 USUÁRIOS')
print('=' * 50)

try:
    # Carregar planilha
    df = pd.read_excel('1QZ ABRIL 2026 - VEXPENSES.xlsx')
    print(f'Planilha carregada: {len(df)} linhas')
    print(f'Colunas: {list(df.columns)}')
    
    # Análise inicial
    print(f'\nESTRUTURA DOS DADOS:')
    print(f'Total de usuários: {len(df)}')
    
    # Identificar colunas de valores
    colunas_valor = []
    for col in df.columns:
        if any(keyword in str(col).upper() for keyword in ['SALDO', 'VALOR', 'TOTAL', 'R$']):
            colunas_valor.append(col)
    
    print(f'Colunas de valores: {colunas_valor}')
    
    # Mostrar primeiras linhas
    print(f'\nPRIMEIROS 10 USUÁRIOS:')
    for i, row in df.head(10).iterrows():
        print(f'\nUsuário {i+1}:')
        for col in df.columns:
            if pd.notna(row[col]) and str(row[col]).strip() != '':
                print(f'  {col}: {row[col]}')
    
    # Selecionar 100 usuários com dados completos
    print(f'\nSELECIONANDO 100 USUÁRIOS COM DADOS COMPLETOS...')
    
    # Filtrar usuários com dados importantes
    usuarios_com_dados = df.dropna(subset=colunas_valor, how='all')
    print(f'Usuários com algum dado de valor: {len(usuarios_com_dados)}')
    
    # Selecionar 100 usuários
    if len(usuarios_com_dados) >= 100:
        usuarios_selecionados = usuarios_com_dados.head(100)
    else:
        usuarios_selecionados = usuarios_com_dados
    
    print(f'Usuários selecionados para análise: {len(usuarios_selecionados)}')
    
    # Salvar seleção
    usuarios_selecionados.to_csv('100_usuarios_selecionados.csv', index=False)
    print(f'Seleção salva em: 100_usuarios_selecionados.csv')
    
    # Análise dos dados selecionados
    print(f'\nANÁLISE DOS USUÁRIOS SELECIONADOS:')
    
    # Contar valores por coluna
    for col in colunas_valor:
        valores_nao_nulos = usuarios_selecionados[col].notna().sum()
        print(f'{col}: {valores_nao_nulos}/{len(usuarios_selecionados)} usuários')
    
    # Mostrar exemplos de valores
    print(f'\nEXEMPLOS DE VALORES:')
    for col in colunas_valor[:3]:  # Primeiras 3 colunas
        print(f'\n{col}:')
        valores_exemplo = usuarios_selecionados[col].dropna().head(5)
        for i, valor in enumerate(valores_exemplo):
            print(f'  Exemplo {i+1}: {valor}')
    
    print(f'\n✅ SELEÇÃO CONCLUÍDA!')
    print(f'✅ {len(usuarios_selecionados)} usuários prontos para análise')
    print(f'✅ Dados salvos em 100_usuarios_selecionados.csv')
    
except Exception as e:
    print(f'Erro: {e}')
    import traceback
    traceback.print_exc()