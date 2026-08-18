"""
Analisa correlações entre colunas da CARGA QZ e abas da planilha CONTROLE.
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Pegar todos os CPFs da carga QZ
carga_rows = conn.execute('SELECT * FROM carga_1qz_planilha1').fetchall()
carga_cpfs = {r['cpf'] for r in carga_rows if r['cpf']}
print(f"CARGA QZ: {len(carga_rows)} linhas, {len(carga_cpfs)} CPFs únicos\n")

# --- PAINEL ---
painel_rows = conn.execute('SELECT * FROM controle_painel').fetchall()
painel_cpfs = {r['cpf'] for r in painel_rows if r['cpf']}
print(f"PAINEL: {len(painel_rows)} linhas, {len(painel_cpfs)} CPFs únicos")
print(f"  CPFs em comum com CARGA QZ: {len(carga_cpfs & painel_cpfs)}")
cols_painel = [k for k in dict(painel_rows[0]).keys()]
print(f"  Colunas: {cols_painel}")
if painel_rows:
    print(f"  Amostra: {dict(painel_rows[0])}")
print()

# --- SALDO CARTAO RESUMO ---
sc_rows = conn.execute('SELECT * FROM controle_saldo_cartao_resumo LIMIT 5').fetchall()
sc_all = conn.execute('SELECT * FROM controle_saldo_cartao_resumo').fetchall()
sc_cpfs = {r['cpf'] for r in sc_all if r['cpf']}
print(f"SALDO CARTAO RESUMO: {len(sc_all)} linhas, {len(sc_cpfs)} CPFs únicos")
print(f"  CPFs em comum com CARGA QZ: {len(carga_cpfs & sc_cpfs)}")
if sc_rows:
    print(f"  Colunas: {list(dict(sc_rows[0]).keys())}")
    print(f"  Amostra: {dict(sc_rows[0])}")
print()

# --- SALDO CARTAO (tabela 1 - extrato) ---
sc1_rows = conn.execute('SELECT * FROM controle_saldo_cartao LIMIT 3').fetchall()
sc1_all = conn.execute('SELECT * FROM controle_saldo_cartao').fetchall()
print(f"SALDO CARTAO (extrato): {len(sc1_all)} linhas")
if sc1_rows:
    print(f"  Colunas: {list(dict(sc1_rows[0]).keys())}")
    print(f"  Amostra: {dict(sc1_rows[0])}")
print()

# --- QUINZENAS ---
qz_rows = conn.execute('SELECT * FROM controle_quinzenas LIMIT 5').fetchall()
qz_all = conn.execute('SELECT * FROM controle_quinzenas').fetchall()
qz_cpfs = {r['cpf'] for r in qz_all if r['cpf']}
print(f"QUINZENAS: {len(qz_all)} linhas, {len(qz_cpfs)} CPFs únicos")
print(f"  CPFs em comum com CARGA QZ: {len(carga_cpfs & qz_cpfs)}")
if qz_rows:
    print(f"  Colunas: {list(dict(qz_rows[0]).keys())}")
    print(f"  Amostra linha 1: {dict(qz_rows[0])}")
    print(f"  Amostra linha 2: {dict(qz_rows[1])}")
    print(f"  Amostra linha 3: {dict(qz_rows[2])}")
print()

# --- ADICIONAIS ---
adic_rows = conn.execute('SELECT * FROM controle_adicionais LIMIT 3').fetchall()
adic_all = conn.execute('SELECT * FROM controle_adicionais').fetchall()
adic_cpfs = {r['cpf'] for r in adic_all if r['cpf']}
print(f"ADICIONAIS: {len(adic_all)} linhas, {len(adic_cpfs)} CPFs únicos")
if adic_rows:
    print(f"  Colunas: {list(dict(adic_rows[0]).keys())}")
    print(f"  Amostra: {dict(adic_rows[0])}")
print()

# --- ADICIONAL ITAU ---
itau_rows = conn.execute('SELECT * FROM controle_adicional_itau LIMIT 3').fetchall()
if itau_rows:
    print(f"ADICIONAL ITAU: Colunas: {list(dict(itau_rows[0]).keys())}")
    print(f"  Amostra: {dict(itau_rows[0])}")
print()

# --- REEMBOLSO ---
remb_rows = conn.execute('SELECT * FROM controle_reembolso LIMIT 3').fetchall()
remb_all = conn.execute('SELECT * FROM controle_reembolso').fetchall()
remb_cpfs = {r['cpf'] for r in remb_all if r['cpf']}
print(f"REEMBOLSO: {len(remb_all)} linhas, {len(remb_cpfs)} CPFs únicos")
print(f"  CPFs em comum com CARGA QZ: {len(carga_cpfs & remb_cpfs)}")
if remb_rows:
    print(f"  Colunas: {list(dict(remb_rows[0]).keys())}")
    print(f"  Amostra: {dict(remb_rows[0])}")
print()

# --- EXTRATO ---
ext_rows = conn.execute('SELECT * FROM controle_extrato LIMIT 3').fetchall()
ext_all = conn.execute('SELECT * FROM controle_extrato').fetchall()
print(f"EXTRATO: {len(ext_all)} linhas")
if ext_rows:
    print(f"  Colunas: {list(dict(ext_rows[0]).keys())}")
    print(f"  Amostra: {dict(ext_rows[0])}")
print()

# --- AUX ---
aux_rows = conn.execute('SELECT * FROM controle_aux LIMIT 5').fetchall()
aux_all = conn.execute('SELECT * FROM controle_aux').fetchall()
print(f"AUX: {len(aux_all)} linhas")
if aux_rows:
    print(f"  Colunas: {list(dict(aux_rows[0]).keys())}")
    for r in aux_rows:
        print(f"  {dict(r)}")
print()

# --- SALDOS ADM ---
adm_rows = conn.execute('SELECT * FROM controle_saldos_adm LIMIT 3').fetchall()
adm_all = conn.execute('SELECT * FROM controle_saldos_adm').fetchall()
print(f"SALDOS ADM: {len(adm_all)} linhas")
if adm_rows:
    print(f"  Colunas: {list(dict(adm_rows[0]).keys())}")
    print(f"  Amostra: {dict(adm_rows[0])}")
