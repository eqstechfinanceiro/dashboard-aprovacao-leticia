import zipfile
import xml.etree.ElementTree as ET

path = "C:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/data/CARGA 1 QZ MAIO 26 VEXPENSES EQS.xlsx"
out_path = "C:/Users/italo.medrado/Desktop/Projects/Análise de dados/Leticia/dashboard-test/controle-api/excel_analysis.txt"

with zipfile.ZipFile(path, "r") as z:
    with z.open("xl/sharedStrings.xml") as f:
        ss_content = f.read().decode("utf-8")
    with z.open("xl/worksheets/sheet1.xml") as f:
        sheet_content = f.read().decode("utf-8")
    with z.open("xl/tables/table1.xml") as f:
        table_content = f.read().decode("utf-8")

# Parse shared strings
ns_main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
ss_root = ET.fromstring(ss_content)
shared_strings = []
for si in ss_root.findall(f"{{{ns_main}}}si"):
    texts = [t.text or "" for t in si.iter(f"{{{ns_main}}}t")]
    shared_strings.append("".join(texts))

lines = []
lines.append("=" * 70)
lines.append(f"TOTAL SHARED STRINGS: {len(shared_strings)}")
lines.append("SHARED STRINGS (todas):")
for i, s in enumerate(shared_strings):
    lines.append(f"  [{i}] {repr(s)}")
lines.append("")

# Parse table - coluna headers
lines.append("=" * 70)
lines.append("TABLE COLUMNS (table1.xml):")
table_root = ET.fromstring(table_content)
table_ref = table_root.get("ref", "?")
lines.append(f"  Table ref: {table_ref}")
table_name = table_root.get("displayName", "?")
lines.append(f"  Table name: {table_name}")
cols_el = table_root.find(f"{{{ns_main}}}tableColumns")
if cols_el is not None:
    for col_el in cols_el.findall(f"{{{ns_main}}}tableColumn"):
        col_id = col_el.get("id")
        col_name = col_el.get("name")
        lines.append(f"  Col {col_id}: {col_name}")
lines.append("")
lines.append("TABLE XML COMPLETO:")
lines.append(table_content)
lines.append("")

# Parse sheet - células com fórmula ou valor
lines.append("=" * 70)
lines.append("CÉLULAS (primeiras 200 não-vazias):")
sheet_root = ET.fromstring(sheet_content)
count = 0
for row_el in sheet_root.iter(f"{{{ns_main}}}row"):
    row_num = row_el.get("r")
    for c_el in row_el:
        ref = c_el.get("r", "?")
        t = c_el.get("t", "")
        f_el = c_el.find(f"{{{ns_main}}}f")
        v_el = c_el.find(f"{{{ns_main}}}v")

        formula = f_el.text if f_el is not None else None
        raw_val = v_el.text if v_el is not None else None

        if t == "s" and raw_val is not None:
            try:
                display_val = shared_strings[int(raw_val)]
            except Exception:
                display_val = raw_val
        else:
            display_val = raw_val

        if formula is not None:
            lines.append(f"  {ref} [t={t}] FORMULA: ={formula}  (cached={display_val})")
            count += 1
        elif display_val is not None:
            lines.append(f"  {ref} [t={t}] VALUE: {display_val}")
            count += 1

        if count >= 200:
            break
    if count >= 200:
        break

with open(out_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Arquivo salvo: {out_path}")
print(f"Shared strings: {len(shared_strings)}")
