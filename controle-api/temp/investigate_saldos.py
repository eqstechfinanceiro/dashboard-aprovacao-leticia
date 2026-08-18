"""
Fase 1: Confirmar origem de saldo_reembolsar, reembolso e carga_final.
Pega todos os CPFs com valor != 0 e cruza com tabelas de controle.
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# ============================================================
# 1. saldo_reembolsar — quais linhas têm valor != 0?
# ============================================================
print("=" * 60)
print("SALDO_REEMBOLSAR")
print("=" * 60)
rows = conn.execute(
    "SELECT cpf, colaborador, saldo_reembolsar, reembolso, saldo_final, carga_final FROM carga_1qz_planilha1 WHERE CAST(saldo_reembolsar AS REAL) != 0 LIMIT 10"
).fetchall()
print(f"Linhas com saldo_reembolsar != 0: {len(rows)}")
for r in rows:
    cpf = r['cpf']
    print(f"\n  CPF={cpf}  colaborador={r['colaborador']}")
    print(f"  carga.saldo_reembolsar = {r['saldo_reembolsar']}")
    print(f"  carga.reembolso        = {r['reembolso']}")
    print(f"  carga.saldo_final      = {r['saldo_final']}")

    # Verificar controle_painel
    p = conn.execute("SELECT saldo_prestação, saldo_cartao, saldo_final FROM controle_painel WHERE cpf=?", (cpf,)).fetchone()
    if p:
        print(f"  painel.saldo_prestação = {p['saldo_prestação']}")
        print(f"  painel.saldo_cartao    = {p['saldo_cartao']}")
        print(f"  painel.saldo_final     = {p['saldo_final']}")

    # Verificar controle_reembolso (soma por CPF)
    reimb = conn.execute("SELECT SUM(CAST(valor AS REAL)) as total FROM controle_reembolso WHERE cpf=?", (cpf,)).fetchone()
    print(f"  sum(controle_reembolso.valor) por CPF = {reimb['total']}")

    # Verificar controle_aux
    aux = conn.execute("SELECT * FROM controle_aux WHERE cpf=? LIMIT 1", (cpf,)).fetchone()
    if aux:
        print(f"  controle_aux: {dict(aux)}")

# ============================================================
# 2. reembolso — quais linhas têm valor != 0?
# ============================================================
print("\n" + "=" * 60)
print("REEMBOLSO")
print("=" * 60)
rows2 = conn.execute(
    "SELECT cpf, colaborador, reembolso, saldo_reembolsar, saldo_final FROM carga_1qz_planilha1 WHERE CAST(reembolso AS REAL) != 0 LIMIT 10"
).fetchall()
print(f"Linhas com reembolso != 0: {len(rows2)}")
for r in rows2:
    cpf = r['cpf']
    print(f"\n  CPF={cpf}  colaborador={r['colaborador']}")
    print(f"  carga.reembolso        = {r['reembolso']}")
    print(f"  carga.saldo_reembolsar = {r['saldo_reembolsar']}")

    reimb = conn.execute("SELECT SUM(CAST(valor AS REAL)) as total FROM controle_reembolso WHERE cpf=?", (cpf,)).fetchone()
    print(f"  sum(controle_reembolso.valor) por CPF = {reimb['total']}")

    ext = conn.execute("SELECT SUM(CAST(valor AS REAL)) as total FROM controle_extrato WHERE cpf=?", (cpf,)).fetchone()
    print(f"  sum(controle_extrato.valor) por CPF   = {ext['total']}")

# ============================================================
# 3. carga_final — quais linhas têm valor != 0?
# ============================================================
print("\n" + "=" * 60)
print("CARGA_FINAL")
print("=" * 60)
rows3 = conn.execute(
    "SELECT cpf, colaborador, carga_final, carga_parcial, col_1ª_qz, adiantamento, saldo_final, saldo_cartao, reembolso FROM carga_1qz_planilha1 WHERE CAST(carga_final AS REAL) != 0 LIMIT 10"
).fetchall()
print(f"Linhas com carga_final != 0: {len(rows3)}")
for r in rows3:
    print(f"\n  CPF={r['cpf']}  colaborador={r['colaborador']}")
    print(f"  carga.carga_final   = {r['carga_final']}")
    print(f"  carga.carga_parcial = {r['carga_parcial']}")
    print(f"  carga.col_1ª_qz    = {r['col_1ª_qz']}")
    print(f"  carga.adiantamento  = {r['adiantamento']}")
    print(f"  carga.saldo_final   = {r['saldo_final']}")
    print(f"  carga.saldo_cartao  = {r['saldo_cartao']}")
    print(f"  carga.reembolso     = {r['reembolso']}")

    # Testar fórmula: carga_final = carga_parcial + adiantamento?
    try:
        cp = float(r['carga_parcial'] or 0)
        ad = float(r['adiantamento'] or 0)
        cf_real = float(r['carga_final'] or 0)
        calc1 = cp + ad
        print(f"  Hipótese carga_final = carga_parcial + adiantamento = {cp} + {ad} = {calc1:.2f}  (real={cf_real})")
    except Exception as e:
        print(f"  Erro: {e}")
