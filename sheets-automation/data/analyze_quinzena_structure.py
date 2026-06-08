import pandas as pd
import openpyxl
import json
from datetime import datetime

print('ANALISANDO ESTRUTURA COMPLETA DA PLANILHA DE QUINZENA')
print('='*60)

# Analisar planilha CARGA 1 QZ MAIO 26
file_path = 'CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx'

try:
    # Carregar com pandas para análise básica
    xls = pd.ExcelFile(file_path)
    print(f'Abas disponíveis: {xls.sheet_names}')
    
    # Analisar primeira aba
    df = pd.read_excel(file_path, sheet_name=0)
    print(f'\nAnalisando aba: {xls.sheet_names[0]}')
    print(f'Total de linhas: {len(df)}')
    print(f'Total de colunas: {len(df.columns)}')
    
    print(f'\nCabeçalhos encontrados ({len(df.columns)}):')
    for i, col in enumerate(df.columns, 1):
        print(f'  {i:2d}. {col}')
    
    # Mostrar primeiras linhas
    print(f'\nPrimeiras 3 linhas de dados:')
    print(df.head(3).to_string())
    
    # Analisar campos financeiros
    print(f'\nCampos financeiros identificados:')
    financial_keywords = ['1QZ', 'SALDO', 'CARGA', 'REEMBOLSO', 'ADIANTAMENTO', 'VALOR', 'FINAL']
    
    for col in df.columns:
        if any(keyword in col.upper() for keyword in financial_keywords):
            print(f'  - {col}')
    
    # Estatísticas dos campos financeiros
    print(f'\nEstatísticas dos campos financeiros:')
    for col in df.columns:
        if any(keyword in col.upper() for keyword in financial_keywords):
            if pd.api.types.is_numeric_dtype(df[col]):
                non_null = df[col].notna().sum()
                if non_null > 0:
                    print(f'  {col}:')
                    print(f'    Não nulos: {non_null}/{len(df)}')
                    print(f'    Soma: R$ {df[col].sum():.2f}')
                    print(f'    Média: R$ {df[col].mean():.2f}')
    
    # Salvar estrutura completa
    structure = {
        'file': file_path,
        'sheets': xls.sheet_names,
        'main_sheet': {
            'name': xls.sheet_names[0],
            'rows': len(df),
            'columns': list(df.columns),
            'sample_data': df.head(3).to_dict('records'),
            'financial_columns': [col for col in df.columns if any(keyword in col.upper() for keyword in financial_keywords)]
        }
    }
    
    with open('quinzena_structure_analysis.json', 'w', encoding='utf-8') as f:
        json.dump(structure, f, ensure_ascii=False, indent=2, default=str)
    
    print(f'\nEstrutura salva em: quinzena_structure_analysis.json')
    
except Exception as e:
    print(f'Erro: {e}')
    import traceback
    traceback.print_exc()