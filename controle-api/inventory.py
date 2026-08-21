import os, json
root = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\data'
out = []
for dp, dn, fn in os.walk(root):
    for f in fn:
        if f.startswith('~$'):
            continue
        p = os.path.join(dp, f)
        out.append({'rel': os.path.relpath(p, root), 'size': os.path.getsize(p), 'abs': p})
with open(r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\controle-api\data_inventory.json', 'w', encoding='utf-8') as fh:
    json.dump(out, fh, ensure_ascii=False, indent=2)
print('WROTE', len(out), 'files')
