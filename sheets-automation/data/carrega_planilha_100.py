import pandas as pd

print('CARREGANDO PLANILHA COM CABEÇALHO CORRETO')
print('=' * 40)

try:
    # Carregar planilha com header na linha 5
    df = pd.read_excel('1QZ ABRIL 2026 - VEXPENSES.xlsx', header=5)
    print(f'Planilha carregada: {len(df)} linhas')
    print(f'Colunas: {list(df.columns)}')
    
    # Mostrar primeiros usuários
    print('\nPRIMEIROS 5 USUÁRIOS:')
    for i, row in df.head(5).iterrows():
        print(f'\nUsuário {i+1}:')
        for col in df.columns:
            if pd.notna(row[col]) and str(row[col]).strip() != '':
                print(f'  {col}: {row[col]}')
    
    # Selecionar 100 usuários com dados
    print(f'\nSELECIONANDO 100 USUÁRIOS...')
    usuarios_com_dados = df.dropna(subset=['PORTADOR'], how='any')
    print(f'Usuários com nome: {len(usuarios_com_dados)}')
    
    if len(usuarios_com_dados) >= 100:
        usuarios_selecionados = usuarios_com_dados.head(100)
    else:
        usuarios_selecionados = usuarios_com_dados
    
    print(f'Usuários selecionados: {len(usuarios_selecionados)}')
    
    # Salvar seleção
    usuarios_selecionados.to_csv('100_usuarios_planilha.csv', index=False)
    print('Seleção salva em: 100_usuarios_planilha.csv')
    
    # Análise das colunas de valores
    print(f'\nANÁLISE DAS COLUNAS DE VALORES:')
    colunas_valor = []
    for col in df.columns:
        if any(keyword in str(col).upper() for keyword in ['SALDO', 'VALOR', 'TOTAL', 'R$']):
            colunas_valor.append(col)
    
    print(f'Colunas de valores: {colunas_valor}')
    
    # Contar valores não nulos
    for col in colunas_valor:
        valores_nao_nulos = usuarios_selecionados[col].notna().sum()
        print(f'{col}: {valores_nao_nulos}/{len(usuarios_selecionados)} usuários')
    
    print(f'\n✅ SELEÇÃO CONCLUÍDA!')
    print(f'✅ {len(usuarios_selecionados)} usuários prontos para análise')
    
except Exception as e:
    print(f'Erro: {e}')
    import traceback
    traceback.print_exc()