import json

with open(r'c:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\data\analise_planilha_completa.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

formulas = data['abas'][0]['formulas']
print('=== TODAS AS FÓRMULAS ===')
for f in formulas:
    print(f"{f['celula']}: {f['formula_original']}")

# Verificar referências externas
extern_refs = []
for f in formulas:
    formula = f['formula_original']
    if '[' in formula and 'Tabela1' not in formula:
        extern_refs.append((f['celula'], formula))
    if '!' in formula and not formula.startswith('=Tabela1'):
        extern_refs.append((f['celula'], formula))
    if '.xlsx' in formula.lower() or '.xls' in formula.lower() or '.csv' in formula.lower():
        extern_refs.append((f['celula'], formula))

print('\n=== REFERENCIAS EXTERNAS ===')
if extern_refs:
    for cell, formula in extern_refs:
        print(f"{cell}: {formula}")
else:
    print('Nenhuma referencia externa encontrada.')
