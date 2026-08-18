import openpyxl, os
ROOT = r'C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test'
OUT = os.path.join(ROOT, 'controle-api', 'jan_reembolso_analysis.txt')
f = open(OUT, 'w', encoding='utf-8')

path = os.path.join(ROOT, 'data', '01 - JANEIRO', '1QZ JANEIRO 2026 - VEXPENSES.xlsx')
wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
ws = wb["1 QZ VEXPENSES 01_2026"]

# Columns: [8]=SR, [9]=SF, [10]=CQ, [11]=SC, [14]=RE
f.write("Name|SR|SF|CQ|SC|RE|ratio\n")
ratio1_users = []
ratio02_users = []

for row in ws.iter_rows(min_row=7, values_only=True):
    name = str(row[1] or "").strip() if len(row) > 1 else ""
    if not name:
        continue
    sr = float(row[8]) if len(row) > 8 and row[8] is not None else 0
    sf = float(row[9]) if len(row) > 9 and row[9] is not None else 0
    cq = float(row[10]) if len(row) > 10 and row[10] is not None else 0
    sc = float(row[11]) if len(row) > 11 and row[11] is not None else 0
    re = float(row[14]) if len(row) > 14 and row[14] is not None else 0
    
    if sr != 0 and re != 0:
        ratio = re / abs(sr)
        if abs(ratio - 1.0) < 0.01:
            ratio1_users.append((name[:25], sr, sf, re, ratio))
        elif abs(ratio - 0.2) < 0.01:
            ratio02_users.append((name[:25], sr, sf, re, ratio))

f.write(f"\n=== Ratio 1.0 users (count={len(ratio1_users)}) ===\n")
f.write("Name|SR|SF|RE|ratio\n")
for u in ratio1_users[:20]:
    f.write(f"{u[0]}|{u[1]:.2f}|{u[2]:.2f}|{u[3]:.2f}|{u[4]:.4f}\n")

f.write(f"\n=== Ratio 0.2 users (count={len(ratio02_users)}) ===\n")
f.write("Name|SR|SF|RE|ratio\n")
for u in ratio02_users[:20]:
    f.write(f"{u[0]}|{u[1]:.2f}|{u[2]:.2f}|{u[3]:.2f}|{u[4]:.4f}\n")

# Check if ratio correlates with sign of SR
f.write(f"\n=== Analysis ===\n")
pos_sr_ratio1 = sum(1 for u in ratio1_users if u[1] > 0)
neg_sr_ratio1 = sum(1 for u in ratio1_users if u[1] < 0)
pos_sr_ratio02 = sum(1 for u in ratio02_users if u[1] > 0)
neg_sr_ratio02 = sum(1 for u in ratio02_users if u[1] < 0)
f.write(f"Ratio 1.0: SR>0={pos_sr_ratio1}, SR<0={neg_sr_ratio1}\n")
f.write(f"Ratio 0.2: SR>0={pos_sr_ratio02}, SR<0={neg_sr_ratio02}\n")

# Check if ratio correlates with SF
sf0_ratio1 = sum(1 for u in ratio1_users if u[2] == 0)
sf_pos_ratio1 = sum(1 for u in ratio1_users if u[2] > 0)
sf0_ratio02 = sum(1 for u in ratio02_users if u[2] == 0)
sf_pos_ratio02 = sum(1 for u in ratio02_users if u[2] > 0)
f.write(f"Ratio 1.0: SF=0={sf0_ratio1}, SF>0={sf_pos_ratio1}\n")
f.write(f"Ratio 0.2: SF=0={sf0_ratio02}, SF>0={sf_pos_ratio02}\n")

wb.close()
f.close()
print("Done: " + OUT)
