"""
Investiga reembolso v3 — foco em expenses reimbursable=1 por quinzena (1-15 maio 2026).
"""
import sqlite3

def sf(v): return float(v) if v else 0.0

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

rows = conn.execute(
    "SELECT cpf, colaborador, reembolso FROM carga_1qz_planilha1 WHERE CAST(reembolso AS REAL) != 0 LIMIT 8"
).fetchall()

print("Testando filtros de data em expenses para 1QZ maio (01-15/05/2026)\n")

for r in rows:
    cpf = r['cpf']
    carga_reimb = sf(r['reembolso'])
    print(f"{'='*60}")
    print(f"{r['colaborador']} | carga.reembolso={carga_reimb:.4f}")

    # Expenses reembolsáveis por períodos
    periodos = [
        ("maio1qz 01-15", "2026-05-01", "2026-05-15"),
        ("maio todo",     "2026-05-01", "2026-05-31"),
        ("abr-maio",      "2026-04-01", "2026-05-31"),
        ("todo período",  "2000-01-01", "2099-12-31"),
    ]
    for label, d1, d2 in periodos:
        v = conn.execute(
            "SELECT SUM(CAST(value AS REAL)) FROM expenses WHERE user_cpf=? AND reimbursable=1 AND data BETWEEN ? AND ?",
            (cpf, d1, d2)
        ).fetchone()[0]
        match = abs(sf(v) - carga_reimb) < 0.02
        print(f"  {'✅' if match else '  '} exp reimbursable=1 {label}: {sf(v):.4f}")

    # base_prestacoes por mês/reembolsável
    for mes in ['MAIO', None]:
        q = "SELECT SUM(CAST(valor AS REAL)) FROM controle_base_prestacoes WHERE cpf=? AND LOWER(reembolsável) LIKE '%sim%'"
        params = [cpf]
        label = "bp reembolsável=Sim"
        if mes:
            q += " AND mês=?"
            params.append(mes)
            label += f" mês={mes}"
        v = conn.execute(q, params).fetchone()[0]
        match = abs(sf(v) - carga_reimb) < 0.02
        print(f"  {'✅' if match else '  '} {label}: {sf(v):.4f}")
