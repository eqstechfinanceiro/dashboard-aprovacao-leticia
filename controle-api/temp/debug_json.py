import json
import sys

def debug_json_structure(json_data):
    """Debug the JSON structure to understand payment_method format"""
    data = json.loads(json_data)
    
    print("JSON structure analysis:")
    print(f"Total expenses: {len(data['data'])}")
    
    # Check first few expenses
    for i, expense in enumerate(data['data'][:5]):
        print(f"\nExpense {i+1}:")
        print(f"  ID: {expense['id']}")
        print(f"  User ID: {expense['user_id']}")
        print(f"  Value: {expense['value']}")
        print(f"  Payment Method ID: {expense.get('payment_method_id')}")
        
        if 'payment_method' in expense:
            pm = expense['payment_method']
            print(f"  payment_method type: {type(pm)}")
            if isinstance(pm, dict) and 'data' in pm:
                pm_data = pm['data']
                print(f"  payment_method.data type: {type(pm_data)}")
                if isinstance(pm_data, dict):
                    print(f"  payment_method.data.id: {pm_data.get('id')}")
                    print(f"  payment_method.data.description: {pm_data.get('description')}")
                elif isinstance(pm_data, list):
                    print(f"  payment_method.data is list with {len(pm_data)} items")
                    for j, item in enumerate(pm_data):
                        print(f"    Item {j}: {item}")
                else:
                    print(f"  payment_method.data is unexpected type: {pm_data}")
            else:
                print(f"  payment_method structure: {pm}")
        else:
            print(f"  No payment_method field")

if __name__ == "__main__":
    # Read from stdin
    json_data = sys.stdin.read()
    debug_json_structure(json_data)
