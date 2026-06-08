import json

with open('data/expenses.json', 'w') as f:
    json.dump({"data": []}, f)

print("Arquivo expenses.json limpo")
