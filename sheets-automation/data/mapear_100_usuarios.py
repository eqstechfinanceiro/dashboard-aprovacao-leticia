import pandas as pd
import json
import requests

print('MAPEANDO 100 USUÁRIOS - BUSCANDO IDS VEXPENSES')
print('=' * 50)

# Carregar usuários selecionados
try:
    df_usuarios = pd.read_csv('100_usuarios_planilha.csv')
    print(f'✅ {len(df_usuarios)} usuários carregados')
except Exception as e:
    print(f'Erro ao carregar usuários: {e}')
    exit(1)

# Mostrar primeiros usuários
print('\nPrimeiros 10 usuários da planilha:')
for i, row in df_usuarios.head(10).iterrows():
    nome = row.get('PORTADOR', 'N/A')
    print(f'{i+1:2d}. {nome}')

# Carregar dados completos do team-members
print('\nCarregando dados completos do team-members...')
try:
    with open('team_members_completo.json', 'r') as f:
        team_members = json.load(f)
    
    if 'data' in team_members:
        members_list = team_members['data']
    else:
        members_list = team_members
    
    print(f'✅ {len(members_list)} team-members carregados')
except Exception as e:
    print(f'Erro ao carregar team-members: {e}')
    print('Buscando dados da API...')
    
    headers = {
        'Authorization': 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    
    response = requests.get('https://api.vexpenses.com/v2/team-members?include=all', headers=headers)
    team_members = response.json()
    members_list = team_members.get('data', [])
    
    with open('team_members_completo.json', 'w') as f:
        json.dump(team_members, f, indent=2)
    
    print(f'✅ {len(members_list)} team-members baixados e salvos')

# Mapear usuários
print('\nMAPEANDO USUÁRIOS...')
mapeamento = {}
nao_encontrados = []

for i, row in df_usuarios.iterrows():
    nome_planilha = row.get('PORTADOR', '').strip().upper()
    
    # Buscar correspondência no team-members
    encontrado = None
    
    for member in members_list:
        nome_vexpenses = member.get('name', '').strip().upper()
        
        # Verificar correspondência exata
        if nome_planilha == nome_vexpenses:
            encontrado = member
            break
        
        # Verificar correspondência parcial (contém)
        if nome_planilha in nome_vexpenses or nome_vexpenses in nome_planilha:
            # Se for correspondência parcial, verificar se é boa
            palavras_planilha = nome_planilha.split()
            palavras_vexpenses = nome_vexpenses.split()
            
            # Se tiver pelo menos 2 palavras em comum
            palavras_comuns = set(palavras_planilha) & set(palavras_vexpenses)
            if len(palavras_comuns) >= 2:
                encontrado = member
                break
    
    if encontrado:
        mapeamento[nome_planilha] = {
            'id': encontrado.get('id'),
            'nome_vexpenses': encontrado.get('name'),
            'email': encontrado.get('email'),
            'status': encontrado.get('status'),
            'linha_planilha': i + 1
        }
        print(f'✅ {nome_planilha} -> {encontrado.get("name")} (ID: {encontrado.get("id")})')
    else:
        nao_encontrados.append(nome_planilha)
        print(f'❌ {nome_planilha} -> Não encontrado')

# Salvar mapeamento
with open('mapeamento_100_usuarios.json', 'w') as f:
    json.dump({
        'mapeamento': mapeamento,
        'nao_encontrados': nao_encontrados,
        'estatisticas': {
            'total_planilha': len(df_usuarios),
            'mapeados': len(mapeamento),
            'nao_encontrados': len(nao_encontrados),
            'taxa_sucesso': len(mapeamento) / len(df_usuarios) * 100
        }
    }, f, indent=2)

print(f'\n📊 ESTATÍSTICAS DO MAPEAMENTO:')
print(f'Total de usuários na planilha: {len(df_usuarios)}')
print(f'Usuários mapeados: {len(mapeamento)}')
print(f'Usuários não encontrados: {len(nao_encontrados)}')
print(f'Taxa de sucesso: {len(mapeamento) / len(df_usuarios) * 100:.1f}%')

if len(mapeamento) >= 95:
    print(f'✅ META ATINGIDA! {len(mapeamento)} usuários mapeados (>95%)')
else:
    print(f'⚠️  Meta não atingida. Apenas {len(mapeamento)} usuários mapeados')

print(f'\n📁 Mapeamento salvo em: mapeamento_100_usuarios.json')
print(f'🚀 Próximo passo: buscar relatórios de Abril 2026')