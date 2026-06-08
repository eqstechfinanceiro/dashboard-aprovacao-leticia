import json

def mapear_campos_planilha_api():
    """Mapeia quais campos da planilha correspondem aos dados da API"""
    
    print('🗺️ MAPEAMENTO DE CAMPOS: PLANILHA vs API')
    print('=' * 60)
    
    # Carregar dados da planilha
    with open('converted/carga_maio_2026.json', 'r', encoding='utf-8') as f:
        dados_planilha = json.load(f)
    
    planilha = dados_planilha['Planilha1']
    
    # Encontrar linha do JONAS na planilha
    linha_jonas_planilha = None
    for i, linha in enumerate(planilha):
        if linha and len(linha) > 0 and 'JONAS CAVALCANTI' in str(linha[0]):
            linha_jonas_planilha = linha
            print(f'🔍 JONAS encontrado na linha {i+1} da planilha')
            break
    
    # Carregar dados de validação (que contém os dados da API)
    with open('validacao_colaboradores.json', 'r', encoding='utf-8') as f:
        validation_data = json.load(f)
    
    # Encontrar dados do JONAS na API
    jonas_api_data = None
    for val in validation_data['validacoes']:
        if (val.get('nome_planilha') == 'JONAS CAVALCANTI DE OLIVEIRA' and 
            val.get('cpf_planilha') == '01696239478'):
            jonas_api_data = val['dados_api']
            print('✅ Dados do JONAS encontrados na API')
            break
    
    if not linha_jonas_planilha or not jonas_api_data:
        print('❌ Não foi possível encontrar dados do JONAS')
        return
    
    print()
    print('📊 CAMPOS DA PLANILHA (17 colunas):')
    print('-' * 40)
    
    colunas_planilha = [
        'Colaborador', 'CPF', 'Status', 'Regional', 'Empresa', 
        'Gestor 1', 'Gestor 2', 'Campo 8', 'Valor Total', 
        'Quinzena', 'Percentual', 'Campo 12', 'Campo 13', 
        'Campo 14', 'Campo 15', 'Campo 16', 'Status Cartão'
    ]
    
    mapeamento = {}
    
    for i, (coluna, valor_planilha) in enumerate(zip(colunas_planilha, linha_jonas_planilha)):
        print(f'Coluna {i+1:2} ({coluna:15}): "{valor_planilha}"')
        
        # Tentar encontrar correspondência na API
        correspondencia_api = None
        valor_api = None
        
        # Mapeamentos conhecidos
        if i == 0:  # Colaborador
            correspondencia_api = 'name'
            valor_api = jonas_api_data.get('name')
        elif i == 1:  # CPF
            correspondencia_api = 'cpf'
            valor_api = jonas_api_data.get('cpf')
        elif i == 2:  # Status
            correspondencia_api = 'active'
            valor_api = 'ATIVO' if jonas_api_data.get('active') else 'INATIVO'
        elif i == 8:  # Valor Total - não tem na API
            correspondencia_api = None
        elif i == 9:  # Quinzena - não tem na API
            correspondencia_api = None
        elif i == 10:  # Percentual - não tem na API
            correspondencia_api = None
        
        if correspondencia_api and valor_api:
            mapeamento[i] = {
                'coluna_planilha': coluna,
                'valor_planilha': valor_planilha,
                'campo_api': correspondencia_api,
                'valor_api': valor_api,
                'corresponde': str(valor_planilha).strip().upper() == str(valor_api).strip().upper()
            }
            
            if mapeamento[i]['corresponde']:
                print(f'         ↕️ API: {correspondencia_api} = "{valor_api}" ✅')
            else:
                print(f'         ↕️ API: {correspondencia_api} = "{valor_api}" ⚠️')
        else:
            print(f'         ❌ Sem correspondência na API')
    
    print()
    print('📋 CAMPOS ADICIONAIS DISPONÍVEIS NA API:')
    print('-' * 40)
    
    # Mostrar outros campos interessantes da API
    campos_api_interessantes = {
        'email': jonas_api_data.get('email'),
        'phone1': jonas_api_data.get('phone1'),
        'phone2': jonas_api_data.get('phone2'),
        'birth_date': jonas_api_data.get('birth_date'),
        'bank': jonas_api_data.get('bank'),
        'agency': jonas_api_data.get('agency'),
        'account': jonas_api_data.get('account'),
        'pix_key': jonas_api_data.get('pix_key'),
        'company_id': jonas_api_data.get('company_id'),
        'role_id': jonas_api_data.get('role_id'),
        'user_type': jonas_api_data.get('user_type'),
        'created_at': jonas_api_data.get('created_at'),
        'updated_at': jonas_api_data.get('updated_at')
    }
    
    for campo, valor in campos_api_interessantes.items():
        if valor:
            print(f'{campo:15}: {valor}')
    
    print()
    print('🎯 MAPEAMENTO FINAL PARA VALIDAÇÃO:')
    print('-' * 40)
    
    campos_validar = []
    for idx, mapeamento_item in mapeamento.items():
        if mapeamento_item['corresponde']:
            campos_validar.append({
                'coluna': idx + 1,
                'nome': mapeamento_item['coluna_planilha'],
                'campo_api': mapeamento_item['campo_api']
            })
            print(f'✅ Coluna {mapeamento_item["coluna_planilha"]:15} -> {mapeamento_item["campo_api"]}')
    
    # Salvar mapeamento
    resultado = {
        'mapeamento_completo': mapeamento,
        'campos_para_validar': campos_validar,
        'dados_planilha_jonas': dict(zip(colunas_planilha, linha_jonas_planilha)),
        'dados_api_jonas': jonas_api_data
    }
    
    with open('mapeamento_campos_jonas.json', 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    
    print()
    print(f'💾 Mapeamento salvo em mapeamento_campos_jonas.json')
    print(f'📊 {len(campos_validar)} campos podem ser validados')
    
    return resultado

if __name__ == '__main__':
    mapear_campos_planilha_api()
