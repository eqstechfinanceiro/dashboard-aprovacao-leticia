"""
Fase 1: Confirmar origem de saldo_reembolsar, reembolso e carga_final.
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# ============================================================
# 1. saldo_reembolsar
# Hipótese: abs(controle_painel.saldo_final) quando saldo_final < 0
# ============================================================
print("=" * 60)
print("SALDO_REEMBOLSAR")
print("=" * 60)
rows = conn.execute(
    "SELECT cpf, colaborador, saldo_reembolsar, saldo_final FROM carga_1qz_planilha1 WHERE CAST(saldo_reembolsar AS REAL) != 0 LIMIT 10"
).fetchall()
print(f"Total com saldo_reembolsar != 0: {len(rows)} (mostrando até 10)")
for r in rows:
    cpf = r['cpf']
    p = conn.execute("SELECT saldo_final FROM controle_painel WHERE cpf=?", (cpf,)).fetchone()
    painel_sf = float(p['saldo_final']) if p else None
    carga_sr = float(r['saldo_reembolsar'])
    carga_sf = float(r['saldo_final'] or 0)
    hipotese = abs(painel_sf) if painel_sf and painel_sf < 0 else None
    match = abs(carga_sr - hipotese) < 0.01 if hipotese is not None else False
    print(f"  {r['colaborador'][:25]:25} | carga.saldo_reembolsar={carga_sr:10.2f} | painel.saldo_final={painel_sf!s:12} | abs(painel_sf)={hipotese!s:12} | {'✅ BATE' if match else '❌ NÃO BATE'}")

# ============================================================
# 2. reembolso
# Hipótese A: metade de controle_reembolso somado por CPF
# Hipótese B: vem de controle_quinzenas
# Hipótese C: vem do controle_painel direto
# ============================================================
print("\n" + "=" * 60)
print("REEMBOLSO")
print("=" * 60)
rows2 = conn.execute(
    "SELECT cpf, colaborador, reembolso, saldo_reembolsar FROM carga_1qz_planilha1 WHERE CAST(reembolso AS REAL) != 0 LIMIT 10"
).fetchall()
print(f"Total com reembolso != 0: {len(rows2)} (mostrando até 10)")

# Ver cols de controle_quinzenas
qcols = [r[1] for r in conn.execute("PRAGMA table_info(controle_quinzenas)").fetchall()]
print(f"controle_quinzenas cols: {qcols}")
qsample = conn.execute("SELECT * FROM controle_quinzenas LIMIT 2").fetchall()
for q in qsample:
    print(f"  {dict(q)}")
print()

for r in rows2:
    cpf = r['cpf']
    carga_reimb = float(r['reembolso'])
    # Hipótese: sum controle_reembolso por CPF
    reimb_total = conn.execute("SELECT SUM(CAST(valor AS REAL)) as t FROM controle_reembolso WHERE cpf=?", (cpf,)).fetchone()['t'] or 0
    # Hipótese: metade (1QZ de 2)
    reimb_half = reimb_total / 2
    # Controle_quinzenas por CPF
    qz = conn.execute("SELECT * FROM controle_quinzenas WHERE cpf=? LIMIT 1", (cpf,)).fetchone()

    print(f"  {r['colaborador'][:25]:25} | carga.reembolso={carga_reimb:8.2f} | sum(controle_reembolso)={reimb_total:8.2f} | /2={reimb_half:8.2f}", end="")
    if abs(carga_reimb - reimb_total) < 0.01:
        print(" | ✅ BATE total")
    elif abs(carga_reimb - reimb_half) < 0.01:
        print(" | ✅ BATE metade")
    else:
        print(" | ❌")
        if qz:
            print(f"    controle_quinzenas: {dict(qz)}")

# ============================================================
# 3. carga_final
# ============================================================
print("\n" + "=" * 60)
print("CARGA_FINAL")
print("=" * 60)
rows3 = conn.execute(
    "SELECT cpf, colaborador, carga_final, carga_parcial, col_1ª_qz, adiantamento, saldo_reembolsar, saldo_cartao, reembolso, saldo_final FROM carga_1qz_planilha1 WHERE CAST(carga_final AS REAL) != 0 LIMIT 10"
).fetchall()
print(f"Total com carga_final != 0: {len(rows3)} (mostrando até 10)")
for r in rows3:
    cf = float(r['carga_final'])
    cp = float(r['carga_parcial'] or 0)
    ad = float(r['adiantamento'] or 0)
    sr = float(r['saldo_reembolsar'] or 0)
    reimb = float(r['reembolso'] or 0)
    sc = float(r['saldo_cartao'] or 0)
    qz = float(r['col_1ª_qz'] or 0)
    sf = float(r['saldo_final'] or 0)

    # Hipóteses
    h1 = cp + ad            # carga_parcial + adiantamento
    h2 = -sr + reimb        # quando tem saldo_reembolsar
    h3 = qz - sf - sc + reimb  # sem adiantamento (quando adiantamento=0 e saldo_reembolsar>0)

    print(f"  {r['colaborador'][:25]:25} | cf={cf:8.2f} | cp={cp:8.2f} | ad={ad:6.2f} | sr={sr:8.2f} | reimb={reimb:6.2f}")
    print(f"    h1(cp+ad)={h1:8.2f}{'✅' if abs(cf-h1)<0.01 else '  '} | h2(-sr+reimb)={h2:8.2f}{'✅' if abs(cf-h2)<0.01 else '  '} | h3={h3:8.2f}{'✅' if abs(cf-h3)<0.01 else '  '}")
