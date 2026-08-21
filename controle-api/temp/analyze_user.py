import json
import sys

def analyze_user_expenses(json_data, user_name):
    """Analyze expenses for a specific user"""
    data = json.loads(json_data)
    
    print(f'Analysis for {user_name}:')
    print(f'Total expenses: {len(data["data"])}')
    
    pm_totals = {}
    expense_details = []
    
    for exp in data['data']:
        pm_id = exp.get('payment_method_id')
        pm_desc = exp.get('payment_method', {}).get('data', {}).get('description', 'Unknown')
        
        if pm_id not in pm_totals:
            pm_totals[pm_id] = {'desc': pm_desc, 'total': 0, 'count': 0, 'details': []}
        
        pm_totals[pm_id]['total'] += exp['value']
        pm_totals[pm_id]['count'] += 1
        pm_totals[pm_id]['details'].append({
            'title': exp['title'],
            'value': exp['value'],
            'date': exp['date']
        })
    
    print('\nPayment Method Summary:')
    for pm_id, info in pm_totals.items():
        print(f'PM {pm_id} ({info["desc"]}): R$ {info["total"]:.2f} ({info["count"]} expenses)')
        
        # Show details for interesting payment methods
        if 'VExpenses' in info['desc'] or 'Saque' in info['desc'] or 'Tarifa' in info['desc'] or 'Transfer' in info['desc']:
            print('  Details:')
            for detail in info['details'][:10]:  # Show first 10
                print(f'    R$ {detail["value"]:.2f} - {detail["title"]} ({detail["date"]})')
            if len(info['details']) > 10:
                print(f'    ... and {len(info["details"]) - 10} more')
    
    # Look for patterns that might be CARGA, TRANSFERENCIA, TARIFA
    print('\nPossible CARGA/TRANSFERENCIA/TARIFA patterns:')
    for pm_id, info in pm_totals.items():
        desc = info['desc'].lower()
        if any(keyword in desc for keyword in ['carga', 'recarga', 'transfer', 'tarifa', 'saque', 'pix']):
            print(f'  {info["desc"]}: R$ {info["total"]:.2f}')
    
    return pm_totals

if __name__ == "__main__":
    json_data = sys.stdin.read()
    analyze_user_expenses(json_data, "User")
