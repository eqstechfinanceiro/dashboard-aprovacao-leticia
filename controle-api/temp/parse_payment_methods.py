import json
import sys

def parse_payment_methods(json_data):
    """Parse payment methods from expenses JSON"""
    data = json.loads(json_data)
    payment_methods = {}
    
    for expense in data['data']:
        if expense.get('payment_method'):
            pm = expense['payment_method']['data']
            pm_id = pm['id']
            pm_desc = pm['description']
            
            if pm_id not in payment_methods:
                payment_methods[pm_id] = {
                    'description': pm_desc,
                    'count': 0,
                    'total_value': 0,
                    'expenses': []
                }
            
            payment_methods[pm_id]['count'] += 1
            payment_methods[pm_id]['total_value'] += expense['value']
            payment_methods[pm_id]['expenses'].append({
                'title': expense['title'],
                'value': expense['value'],
                'date': expense['date']
            })
    
    return payment_methods

if __name__ == "__main__":
    # Read from stdin
    json_data = sys.stdin.read()
    payment_methods = parse_payment_methods(json_data)
    
    print("Payment Methods encontrados:")
    print("=" * 50)
    
    for pm_id, pm_data in payment_methods.items():
        print(f"\nID: {pm_id}")
        print(f"Descrição: {pm_data['description']}")
        print(f"Quantidade: {pm_data['count']}")
        print(f"Valor Total: R$ {pm_data['total_value']:.2f}")
        
        # Show first few expenses as examples
        print("Exemplos de despesas:")
        for expense in pm_data['expenses'][:3]:
            print(f"  - {expense['title']}: R$ {expense['value']:.2f}")
        
        if len(pm_data['expenses']) > 3:
            print(f"  ... e mais {len(pm_data['expenses']) - 3} despesas")
