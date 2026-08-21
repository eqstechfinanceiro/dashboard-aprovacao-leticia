import urllib.request, json
data = json.loads(urllib.request.urlopen("http://localhost:8000/api/sheets/mapping-status").read())
for k, v in data.items():
    mapped = v['total_checks'] - v['yellow_count']
    denom = v['effective_cols'] or 1
    pct = round(mapped / denom * 100)
    print(f"{k:<45} total={v['total_cols']} empty={v['empty_cols']} effective={v['effective_cols']} checks={v['total_checks']} yellow={v['yellow_count']} => {pct}%  fully={v['fully_mapped']}")
