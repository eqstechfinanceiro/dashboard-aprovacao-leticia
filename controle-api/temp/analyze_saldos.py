"""
Investiga de onde vem saldo_reembolsar e saldo_cartao na carga QZ.
Hipótese: vêm do PAINEL via cálculo, não direto de uma aba.
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

carga = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM carga_1qz_planilha1').fetchall() if r['cpf']}
painel = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM controle_painel').fetchall() if r['cpf']}
sc_resumo = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM controle_saldo_cartao_resumo').fetchall() if r['cpf']}

# Hipótese saldo_reembolsar:
# PAINEL tem: saldo_prestação (negativo = precisa reembolsar)
# Se saldo_prestação < 0 → saldo_reembolsar = abs(saldo_prestação)
print("=== HIPÓTESE: saldo_reembolsar = abs(painel.saldo_prestação) quando negativo ===")
matches, mismatches, skipped = 0, 0, 0
for cpf, c in carga.items():
    p = painel.get(cpf, {})
    carga_val = float(c.get('saldo_reembolsar') or 0)
    saldo_prest = float(p.get('saldo_prestação') or 0)
    
    if carga_val == 0 and saldo_prest >= 0:
        skipped += 1
        continue
    
    expected = abs(saldo_prest) if saldo_prest < 0 else 0
    diff = abs(carga_val - expected)
    if diff < 0.01:
        matches += 1
    else:
        mismatches += 1
        if mismatches <= 5:
            print(f"  CPF {cpf}: carga_remb={carga_val:.4f} | painel_saldo_prest={saldo_prest:.4f} | expected={expected:.4f}")

print(f"  matches={matches}, mismatches={mismatches}, skipped(zero)={skipped}")
print()

# Hipótese saldo_cartao:
# PAINEL tem saldo_cartao
# sc_resumo tem valor = saldo atual do cartão
print("=== HIPÓTESE: saldo_cartao = painel.saldo_cartao ===")
m, mm = 0, 0
for cpf, c in carga.items():
    p = painel.get(cpf, {})
    cv = float(c.get('saldo_cartao') or 0)
    pv = float(p.get('saldo_cartao') or 0)
    if abs(cv - pv) < 0.01:
        m += 1
    else:
        mm += 1
        if mm <= 5:
            print(f"  CPF {cpf}: carga={cv} | painel={pv}")
print(f"  matches={m}, mismatches={mm}")
print()

print("=== HIPÓTESE: saldo_cartao = sc_resumo.valor (mais recente) ===")
m, mm = 0, 0
for cpf, c in carga.items():
    sc = sc_resumo.get(cpf, {})
    cv = float(c.get('saldo_cartao') or 0)
    sv = float(sc.get('valor') or 0)
    if abs(cv - sv) < 0.01:
        m += 1
    else:
        mm += 1
        if mm <= 5:
            print(f"  CPF {cpf}: carga={cv} | sc_resumo={sv} | painel={float(painel.get(cpf,{}).get('saldo_cartao') or 0)}")
print(f"  matches={m}, mismatches={mm}")
print()

# Investigar os mismatches de saldo_final
print("=== PAINEL: de onde vem saldo_final no PAINEL? ===")
# saldo_final = saldo_cartao - saldo_prestação (?)
# ou saldo_final = carga + transferencia + tarifa - prestação_de_contas (?)
print("HIPÓTESE: saldo_final = saldo_cartao - abs(saldo_prestação) quando saldo_prestação < 0")
m, mm = 0, 0
for cpf, p in painel.items():
    sf = float(p.get('saldo_final') or 0)
    sc = float(p.get('saldo_cartao') or 0)
    sp = float(p.get('saldo_prestação') or 0)
    # saldo_final no painel pode ser saldo_cartao + saldo_prestação
    expected = sc + sp
    if abs(sf - expected) < 0.02:
        m += 1
    else:
        mm += 1

print(f"  saldo_final == saldo_cartao + saldo_prestação: matches={m}, mismatches={mm}")

m, mm = 0, 0
for cpf, p in painel.items():
    sf = float(p.get('saldo_final') or 0)
    carga_p = float(p.get('carga') or 0)
    transf = float(p.get('transferencia') or 0)
    tarifa = float(p.get('tarifa') or 0)
    prest = float(p.get('prestação_de_contas') or 0)
    expected = carga_p + transf + tarifa - prest
    if abs(sf - expected) < 0.02:
        m += 1
    else:
        mm += 1
        if mm <= 3:
            print(f"  CPF {cpf}: sf={sf} | calc={expected:.4f} | carga={carga_p} transf={transf} tarifa={tarifa} prest={prest}")
print(f"  saldo_final == carga+transf+tarifa-prest: matches={m}, mismatches={mm}")
print()

# CARGA QZ saldo_final: de onde vem?
print("=== CARGA QZ saldo_final: painel.saldo_final ou calculado? ===")
# Hipótese 1: carga.saldo_final == painel.saldo_final
m1, mm1 = 0, 0
# Hipótese 2: carga.saldo_final == painel.saldo_cartao + abs(painel.saldo_prestação) quando negativo
m2, mm2 = 0, 0
for cpf, c in carga.items():
    p = painel.get(cpf, {})
    cv = float(c.get('saldo_final') or 0)
    pv_sf = float(p.get('saldo_final') or 0)
    pv_sc = float(p.get('saldo_cartao') or 0)
    pv_sp = float(p.get('saldo_prestação') or 0)
    
    if abs(cv - pv_sf) < 0.02:
        m1 += 1
    else:
        mm1 += 1
    
    # hipótese 2: saldo_final na carga = saldo_cartao - saldo_prestação (quando sp < 0)
    if pv_sp < 0:
        expected2 = pv_sc + abs(pv_sp)
    else:
        expected2 = pv_sc
    if abs(cv - expected2) < 0.02:
        m2 += 1
    else:
        mm2 += 1

print(f"  carga.saldo_final == painel.saldo_final: matches={m1}, mismatches={mm1}")
print(f"  carga.saldo_final == sc + abs(sp quando negativo): matches={m2}, mismatches={mm2}")
print()

# Investigar mismatches restantes
print("=== Amostras de mismatch saldo_final carga vs painel ===")
cnt = 0
for cpf, c in carga.items():
    p = painel.get(cpf, {})
    cv = float(c.get('saldo_final') or 0)
    pv = float(p.get('saldo_final') or 0)
    if abs(cv - pv) > 0.02 and cnt < 8:
        sc_v = float(p.get('saldo_cartao') or 0)
        sp_v = float(p.get('saldo_prestação') or 0)
        adic_v = float(p.get('adicionais') or 0)
        print(f"  CPF {cpf}: carga_sf={cv} | painel_sf={pv} | diff={cv-pv:.4f} | sc={sc_v} | sp={sp_v} | adicionais={adic_v}")
        cnt += 1

# ADIANTAMENTO investigation
print("\n=== INVESTIGANDO adiantamento: quais abas têm essa info? ===")
# Os 5 CPFs com adiantamento na carga
adic_cpfs_carga = {cpf: c for cpf, c in carga.items() if c.get('adiantamento') and float(c.get('adiantamento') or 0) != 0}
print(f"CPFs com adiantamento na carga: {len(adic_cpfs_carga)}")

# Checa painel.col_1ª_qz vs painel.adicionais para esses CPFs
# Talvez adiantamento seja um adicional de outra quinzena
adicionais_all = conn.execute('SELECT * FROM controle_adicionais').fetchall()
adic_by_cpf = {}
for r in adicionais_all:
    cpf = r['cpf']
    if cpf not in adic_by_cpf:
        adic_by_cpf[cpf] = []
    adic_by_cpf[cpf].append(dict(r))

for cpf, c in list(adic_cpfs_carga.items())[:8]:
    p = painel.get(cpf, {})
    adic_list = adic_by_cpf.get(cpf, [])
    itau_list = conn.execute("SELECT * FROM controle_adicional_itau WHERE cpf LIKE ?", (f"{cpf}%",)).fetchall()
    print(f"  CPF {cpf} ({c['colaborador']}): carga_adic={c['adiantamento']}")
    print(f"    painel.adicionais={p.get('adicionais')} | painel.adicional_itau={p.get('adicional_itau')} | painel.itau={p.get('itau')}")
    print(f"    controle_adicionais: {[(a['valor'], a['status']) for a in adic_list]}")
    print(f"    controle_adicional_itau: {[dict(i) for i in itau_list[:2]]}")
