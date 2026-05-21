import requests
import json
from datetime import datetime

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com/v2"

headers = {
    "Authorization": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def get_all_team_members():
    """Obtém todos os team members"""
    print("OBTENDO TODOS OS TEAM MEMBERS")
    print("="*60)
    
    params = {"paginate": "false", "per_page": 1000}
    
    try:
        url = f"{BASE_URL}/team-members"
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if 'data' in data:
                members = data['data']
                print(f"Total de members: {len(members)}")
                return members
    except Exception as e:
        print(f"Erro: {e}")
    
    return []

def analyze_member_parameters(members):
    """Analisa os parâmetros dos members para encontrar dados financeiros"""
    print(f"\nANALISANDO PARÂMETROS DOS MEMBERS")
    print("="*60)
    
    financial_parameters = []
    
    for i, member in enumerate(members[:100]):  # Primeiros 100
        member_id = member.get('id')
        name = member.get('name', '')
        parameters = member.get('parameters', {})
        
        if parameters:
            print(f"\nMember {i+1}: {name} (ID: {member_id})")
            print(f"  Parâmetros: {json.dumps(parameters, indent=4, ensure_ascii=False)}")
            
            # Procurar por campos numéricos nos parâmetros
            for key, value in parameters.items():
                if isinstance(value, (int, float)) and abs(value) > 10:
                    financial_parameters.append({
                        'member_id': member_id,
                        'name': name,
                        'param_key': key,
                        'param_value': value
                    })
                    print(f"    ✅ {key}: R$ {value:.2f}")
    
    print(f"\nTotal de parâmetros financeiros encontrados: {len(financial_parameters)}")
    
    return financial_parameters

def analyze_expense_limit_policy(members):
    """Analisa o expense_limit_policy_id"""
    print(f"\nANALISANDO EXPENSE LIMIT POLICY")
    print("="*60)
    
    # Contar quantos membros têm policy
    members_with_policy = [m for m in members if m.get('expense_limit_policy_id')]
    
    print(f"Members com policy: {len(members_with_policy)}")
    
    # Mostrar exemplos de policy IDs
    policy_ids = set(m.get('expense_limit_policy_id') for m in members_with_policy)
    print(f"Policy IDs únicos: {len(policy_ids)}")
    
    # Tentar acessar endpoint de policies
    if policy_ids:
        first_policy_id = list(policy_ids)[0]
        print(f"\nTentando acessar policy {first_policy_id}...")
        
        try:
            policy_url = f"{BASE_URL}/expense-limit-policies/{first_policy_id}"
            policy_response = requests.get(policy_url, headers=headers, timeout=30)
            
            print(f"Status: {policy_response.status_code}")
            
            if policy_response.status_code == 200:
                policy_data = policy_response.json()
                print(f"Policy data: {json.dumps(policy_data, indent=4, ensure_ascii=False)}")
            else:
                print(f"Erro ao acessar policy")
        except Exception as e:
            print(f"Exceção: {e}")

def search_for_saldo_values(members):
    """Procura por valores que correspondam aos saldos da planilha"""
    print(f"\nPROCURANDO VALORES DE SALDO")
    print("="*60)
    
    # Valores que procuramos da planilha
    target_values = [6945.16, 6626.04, 6504.20, -98.92, -428.82, 291.66, 18329.5, 20, 5, 1154.94]
    
    matches = []
    
    for member in members:
        member_id = member.get('id')
        name = member.get('name', '')
        
        # Verificar todos os campos numéricos
        for key, value in member.items():
            if isinstance(value, (int, float)):
                for target in target_values:
                    if abs(value - target) < 1:
                        matches.append({
                            'member_id': member_id,
                            'name': name,
                            'field': key,
                            'value': value,
                            'target': target
                        })
                        
                        print(f"✅ ENCONTRADO: {value:.2f} em {name} - {key}")
        
        # Verificar parâmetros
        parameters = member.get('parameters', {})
        if isinstance(parameters, dict):
            for key, value in parameters.items():
                if isinstance(value, (int, float)):
                    for target in target_values:
                        if abs(value - target) < 1:
                            matches.append({
                                'member_id': member_id,
                                'name': name,
                                'field': f"parameters.{key}",
                                'value': value,
                                'target': target
                            })
                            
                            print(f"✅ ENCONTRADO: {value:.2f} em {name} - parameters.{key}")
    
    print(f"\nTotal de correspondências: {len(matches)}")
    
    return matches

def main():
    """Função principal"""
    print("INVESTIGAÇÃO DE TEAM MEMBERS - DADOS FINANCEIROS")
    print("="*80)
    
    # 1. Obter todos os team members
    members = get_all_team_members()
    
    if not members:
        print("Nenhum member encontrado")
        return
    
    # 2. Analisar parâmetros
    financial_parameters = analyze_member_parameters(members)
    
    # 3. Analisar expense limit policy
    analyze_expense_limit_policy(members)
    
    # 4. Procurar valores de saldo
    saldo_matches = search_for_saldo_values(members)
    
    # 5. Salvar resultados
    results = {
        'investigation_date': datetime.now().isoformat(),
        'total_members': len(members),
        'financial_parameters': financial_parameters,
        'saldo_matches': saldo_matches,
        'conclusion': ''
    }
    
    if saldo_matches:
        results['conclusion'] = f'VALORES DE SALDO ENCONTRADOS: {len(saldo_matches)} correspondências'
    elif financial_parameters:
        results['conclusion'] = 'PARÂMETROS FINANCEIROS ENCONTRADOS, MAS SEM VALORES DE SALDO'
    else:
        results['conclusion'] = 'NENHUM DADO FINANCEIRO RELEVANTE ENCONTRADO'
    
    output_file = '/home/haumea/Projects/dashboard-aprovacao-leticia/investigation-docs/team_members_financial_data.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n\nSalvo em: {output_file}")
    
    print("\n" + "="*80)
    print("INVESTIGAÇÃO CONCLUÍDA!")
    print("="*80)

if __name__ == "__main__":
    main()
