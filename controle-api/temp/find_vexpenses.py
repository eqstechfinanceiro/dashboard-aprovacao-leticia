import json
import sys

def find_vexpenses_expenses(json_data):
    """Find expenses with Cartão VExpenses payment method"""
    data = json.loads(json_data)
    vexpenses_expenses = []
    
    for expense in data['data']:
        if expense.get('payment_method'):
            pm = expense['payment_method']['data']
            if 'VExpenses' in pm['description']:
                vexpenses_expenses.append({
                    'id': expense['id'],
                    'user_id': expense['user_id'],
                    'value': expense['value'],
                    'title': expense['title'],
                    'date': expense['date'],
                    'payment_method_id': pm['id'],
                    'payment_method_desc': pm['description']
                })
    
    return vexpenses_expenses

def find_user_expenses(json_data, user_id):
    """Find expenses for specific user"""
    data = json.loads(json_data)
    user_expenses = []
    
    for expense in data['data']:
        if expense['user_id'] == user_id:
            user_expenses.append({
                'id': expense['id'],
                'value': expense['value'],
                'title': expense['title'],
                'date': expense['date'],
                'payment_method_id': expense.get('payment_method_id'),
                'payment_method': expense.get('payment_method', {}).get('data', {}).get('description', 'N/A')
            })
    
    return user_expenses

if __name__ == "__main__":
    # Read from stdin
    json_data = sys.stdin.read()
    
    # Check for VExpenses expenses
    vexpenses = find_vexpenses_expenses(json_data)
    print(f"Found {len(vexpenses)} expenses with Cartão VExpenses:")
    for exp in vexpenses[:10]:  # Show first 10
        print(f"  User {exp['user_id']}: R$ {exp['value']:.2f} - {exp['title']} ({exp['date']})")
    
    # Check for specific users
    users_to_check = [896184, 896191]  # JORGE ANTONIO, JOSE MARCOS
    
    for user_id in users_to_check:
        user_expenses = find_user_expenses(json_data, user_id)
        print(f"\nUser {user_id} expenses ({len(user_expenses)} total):")
        total_by_pm = {}
        for exp in user_expenses:
            pm = exp['payment_method']
            if pm not in total_by_pm:
                total_by_pm[pm] = 0
            total_by_pm[pm] += exp['value']
        
        for pm, total in total_by_pm.items():
            print(f"  {pm}: R$ {total:.2f}")
        
        # Show VExpenses expenses for this user
        vexpenses_user = [exp for exp in user_expenses if 'VExpenses' in exp['payment_method']]
        if vexpenses_user:
            print(f"  VExpenses details:")
            for exp in vexpenses_user[:5]:
                print(f"    R$ {exp['value']:.2f} - {exp['title']} ({exp['date']})")
