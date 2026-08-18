"""
Investiga de onde vem saldo_reembolsar na carga QZ.
Sabemos que painel.saldo_prestação não bate diretamente.
Hipótese: vem do EXTRATO (soma de reembolsos por CPF no período).
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

carga = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM carga_1qz_planilha1').fetchall() if r['cpf']}
painel = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM controle_painel').fetchall() if r['cpf']}

# REEMBOLSO aba: soma de valor por CPF
remb_rows = conn.execute('SELECT * FROM controle_reembolso').fetchall()
remb_by_cpf = {}
for r in remb_rows:
    cpf = r['cpf']
    if cpf not in remb_by_cpf:
        remb_by_cpf[cpf] = []
    remb_by_cpf[cpf].append(float(r['valor'] or 0))

# EXTRATO: tipos - temos TRANSFERÊNCIA (reembolsos ao colaborador)
# Vamos checar EXTRATO TRANSFERÊNCIA por CPF
ext_transf = conn.execute("SELECT * FROM controle_extrato WHERE tipo='TRANSFERÊNCIA'").fetchall()
ext_transf_by_cpf = {}
for r in ext_transf:
    cpf = r['cpf']
    if cpf not in ext_transf_by_cpf:
        ext_transf_by_cpf[cpf] = []
    ext_transf_by_cpf[cpf].append(float(r['valor'] or 0))

# CPFs com saldo_reembolsar > 0
sample = [(cpf, c) for cpf, c in carga.items() if float(c.get('saldo_reembolsar') or 0) > 0]
print(f"Total CPFs com saldo_reembolsar > 0: {len(sample)}")
print()
print("CPF | carga_saldo_remb | painel_saldo_prest | soma_reembolso_aba | soma_extrato_transf")
for cpf, c in sample[:15]:
    p = painel.get(cpf, {})
    remb_soma = sum(remb_by_cpf.get(cpf, []))
    transf_soma = abs(sum(ext_transf_by_cpf.get(cpf, [])))
    carga_val = float(c.get('saldo_reembolsar') or 0)
    prest_val = float(p.get('saldo_prestação') or 0)
    print(f"  {cpf}: carga={carga_val:.2f} | painel_prest={prest_val:.2f} | remb_aba={remb_soma:.2f} | ext_transf={transf_soma:.2f}")

print()
# Hipótese: saldo_reembolsar = painel.saldo_prestação quando positivo (crédito que o colaborador tem a receber)
# E quando negativo? Negativo = colaborador deve → saldo_final = saldo_cartao + abs(sp)
print("=== INVESTIGANDO: saldo_reembolsar via expenses (BASE PREST) ===")
# Checar se saldo_reembolsar vem de despesas reimbursable do período

# Hipótese mais simples: painel tem uma coluna que é o saldo a reembolsar?
# Vamos ver TODAS as colunas do PAINEL novamente
cols = conn.execute("SELECT column_name, table_column_name FROM column_info WHERE spreadsheet_id=(SELECT id FROM spreadsheet_info WHERE table_name='controle_painel')").fetchall()
print("Colunas PAINEL completo:")
for c in cols:
    print(f"  {c['column_name']} -> {c['table_column_name']}")

print()
# Checar valores do PAINEL para os CPFs com saldo_remb > 0
print("Amostra PAINEL para CPFs com saldo_reembolsar > 0:")
for cpf, c in sample[:5]:
    p = painel.get(cpf, {})
    print(f"  CPF {cpf}: carga_remb={c['saldo_reembolsar']}")
    for k, v in p.items():
        if v and str(v) != '0.0' and str(v) != '0':
            print(f"    painel.{k}={v}")
    print()

# Hipótese: saldo_reembolsar = expenses reimbursable aprovadas NÃO pagas ainda
# Vamos verificar na tabela expenses
print("=== VERIFICANDO expenses reimbursable por CPF ===")
for cpf, c in sample[:5]:
    exp = conn.execute("""
        SELECT SUM(CAST(value AS REAL)) as total, COUNT(*) as cnt
        FROM expenses 
        WHERE cpf=? AND reimbursable=1 AND report_status='APROVADO'
    """, (cpf,)).fetchone()
    print(f"  CPF {cpf}: carga_remb={c['saldo_reembolsar']} | expenses_reimb_approved={exp['total']} ({exp['cnt']} despesas)")

print()
# Checa se saldo_reembolsar = painel.saldo_prestação quando > 0
print("=== HIPÓTESE FINAL: saldo_reembolsar = painel.saldo_prestação quando > 0 ===")
m, mm, skip = 0, 0, 0
for cpf, c in carga.items():
    p = painel.get(cpf, {})
    cv = float(c.get('saldo_reembolsar') or 0)
    sp = float(p.get('saldo_prestação') or 0)
    if cv == 0 and sp <= 0:
        skip += 1; continue
    expected = sp if sp > 0 else 0
    if abs(cv - expected) < 0.02:
        m += 1
    else:
        mm += 1
        if mm <= 5:
            print(f"  CPF {cpf}: carga_remb={cv} | painel_sp={sp:.4f} | expected={expected:.4f}")
print(f"  matches={m}, mismatches={mm}, skipped={skip}")

print()
# SALDO_FINAL na carga QZ: de onde vem?
# Sabemos que: carga.saldo_final == painel.saldo_final em 260/340 casos
# Mismatches têm diff que são valores redondos (1000, 2000, 5000...)
# Hipótese: carga.saldo_final = painel.saldo_final - adicionais (desse periodo)
print("=== HIPÓTESE: carga.saldo_final = painel.saldo_final - painel.adicionais ===")
m, mm = 0, 0
for cpf, c in carga.items():
    p = painel.get(cpf, {})
    cv = float(c.get('saldo_final') or 0)
    pv_sf = float(p.get('saldo_final') or 0)
    pv_adic = float(p.get('adicionais') or 0)
    expected = pv_sf - pv_adic
    if abs(cv - expected) < 0.02:
        m += 1
    else:
        mm += 1
        if mm <= 5:
            print(f"  CPF {cpf}: carga_sf={cv} | painel_sf={pv_sf} | painel_adic={pv_adic} | expected={expected:.4f}")
print(f"  matches={m}, mismatches={mm}")
