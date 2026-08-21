"""
Hipótese final: reembolso = saldo_reembolsar / 2 (metade para 1QZ).
Também verifica painel.prestação_de_contas e outros campos.
"""
import sqlite3

def sf(v): return float(v or 0)

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

rows = conn.execute(
    "SELECT cpf, colaborador, reembolso, saldo_reembolsar, saldo_final, carga_parcial FROM carga_1qz_planilha1 WHERE CAST(reembolso AS REAL) != 0"
).fetchall()

print(f"Total linhas com reembolso != 0: {len(rows)}\n")

match_half = 0
match_equal = 0
no_match = 0

for r in rows:
    cpf = r['cpf']
    carga_reimb = sf(r['reembolso'])
    saldo_reimb = sf(r['saldo_reembolsar'])

    p = conn.execute("SELECT * FROM controle_painel WHERE cpf=?", (cpf,)).fetchone()
    painel_prestacao = sf(p['prestação_de_contas']) if p else 0
    painel_saldo_prest = sf(p['saldo_prestação']) if p else 0

    # Hipóteses
    h_half_sr = saldo_reimb / 2                  # metade do saldo_reembolsar
    h_equal_sr = saldo_reimb                     # igual ao saldo_reembolsar
    h_painel_prest_half = abs(painel_saldo_prest) / 2  # metade do saldo_prestação do painel

    matched = None
    if abs(carga_reimb - h_half_sr) < 0.02:
        matched = f"✅ saldo_reembolsar/2 ({h_half_sr:.4f})"
        match_half += 1
    elif abs(carga_reimb - h_equal_sr) < 0.02:
        matched = f"✅ saldo_reembolsar igual ({h_equal_sr:.4f})"
        match_equal += 1
    elif abs(carga_reimb - h_painel_prest_half) < 0.02:
        matched = f"✅ abs(saldo_prestação)/2 ({h_painel_prest_half:.4f})"
    else:
        matched = f"❌ reembolso={carga_reimb:.4f} sr={saldo_reimb:.4f} sr/2={h_half_sr:.4f} |saldo_prest|/2={h_painel_prest_half:.4f}"
        no_match += 1

    print(f"  {r['colaborador'][:30]:30} | {matched}")

print(f"\nResultado: saldo_reembolsar/2={match_half} | igual={match_equal} | sem match={no_match} de {len(rows)}")
