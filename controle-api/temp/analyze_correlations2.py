"""
Análise profunda de correlações entre carga_1qz e abas do controle.
Foco: de onde vem cada coluna da CARGA QZ?
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

carga = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM carga_1qz_planilha1').fetchall() if r['cpf']}
painel = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM controle_painel').fetchall() if r['cpf']}
sc_resumo = {r['cpf']: dict(r) for r in conn.execute('SELECT * FROM controle_saldo_cartao_resumo').fetchall() if r['cpf']}
aux_rows = conn.execute('SELECT * FROM controle_aux').fetchall()
aux = {r['regional']: dict(r) for r in aux_rows}

# Quinzenas: pegar ultima 1QZ MAIO por CPF
qz_rows = conn.execute("SELECT * FROM controle_quinzenas WHERE quinzena='1ª QZ' AND mês='MAIO' AND ano='2026.0'").fetchall()
qz_maio_1 = {r['cpf']: dict(r) for r in qz_rows}
print(f"Quinzenas 1QZ MAIO 2026: {len(qz_maio_1)} registros")

# Amostrar 5 CPFs e checar correspondências
sample_cpfs = list(carga.keys())[:5]

print("\n=== CORRELAÇÃO CPF A CPF (5 amostras) ===\n")
for cpf in sample_cpfs:
    c = carga[cpf]
    p = painel.get(cpf, {})
    sc = sc_resumo.get(cpf, {})
    q = qz_maio_1.get(cpf, {})
    aux_regional = aux.get(c.get('regional', ''), {})

    print(f"CPF: {cpf} | {c['colaborador']}")
    print(f"  CARGA QZ:")
    print(f"    colaborador     = '{c['colaborador']}'")
    print(f"    situação        = '{c['situacao' if 'situacao' in c else 'situação']}'")
    print(f"    regional        = '{c['regional']}'")
    print(f"    centro_de_custo = '{c['centro_de_custo']}'")
    print(f"    gestor          = '{c['gestor']}'")
    print(f"    diretor         = '{c['diretor']}'")
    print(f"    saldo_reembolsar= '{c['saldo_reembolsar']}'")
    print(f"    saldo_final     = '{c['saldo_final']}'")
    print(f"    1ª QZ           = '{c['col_1ª_qz']}'")
    print(f"    saldo_cartao    = '{c['saldo_cartao']}'")
    print(f"    adiantamento    = '{c['adiantamento']}'")
    print(f"    status_do_cartão= '{c['status_do_cartão']}'")
    print()
    print(f"  PAINEL (match?):")
    print(f"    colaborador     = '{p.get('colaborador','-')}'  MATCH={c['colaborador']==p.get('colaborador')}")
    print(f"    situação        = '{p.get('situação','-')}'     MATCH={c.get('situação')==p.get('situação')}")
    print(f"    regional        = '{p.get('regional','-')}'     MATCH={c['regional']==p.get('regional')}")
    print(f"    centro_de_custo = '{p.get('centro_de_custo','-')}'  MATCH={c['centro_de_custo']==p.get('centro_de_custo')}")
    print(f"    gestor          = '{p.get('gestor','-')}'       MATCH={c['gestor']==p.get('gestor')}")
    print(f"    diretor         = '{p.get('diretor','-')}'      MATCH={c['diretor']==p.get('diretor')}")
    print(f"    saldo_reembolsar: não existe no PAINEL")
    print(f"    saldo_final     = '{p.get('saldo_final','-')}'  MATCH={str(c['saldo_final'])==str(p.get('saldo_final'))}")
    print(f"    saldo_cartao    = '{p.get('saldo_cartao','-')}' MATCH={str(c['saldo_cartao'])==str(p.get('saldo_cartao'))}")
    print(f"    1ª QZ (painel)  = '{p.get('col_1ª_qz','-')}'")
    print(f"    adicionais      = '{p.get('adicionais','-')}'")
    print(f"    status_do_cartão= '{p.get('status_do_cartão','-')}' MATCH={c.get('status_do_cartão')==p.get('status_do_cartão')}")
    print()
    print(f"  SALDO CARTAO RESUMO:")
    print(f"    valor           = '{sc.get('valor','-')}'  MATCH com carga saldo_cartao={str(c['saldo_cartao'])==str(sc.get('valor'))}")
    print()
    print(f"  QUINZENAS 1QZ MAIO:")
    print(f"    valor           = '{q.get('valor','-')}'  == carga 1ª QZ '{c['col_1ª_qz']}'  MATCH={str(c['col_1ª_qz'])==str(q.get('valor'))}")
    print()
    print(f"  AUX (por regional '{c['regional']}'):")
    print(f"    gestor          = '{aux_regional.get('gestor','-')}'  MATCH={c['gestor']==aux_regional.get('gestor')}")
    print(f"    diretor         = '{aux_regional.get('diretor','-')}' MATCH={c['diretor']==aux_regional.get('diretor')}")
    print("  " + "-"*60)
    print()

# --- SALDO REEMBOLSAR: de onde vem? ---
print("\n=== INVESTIGANDO saldo_reembolsar ===")
print("CARGA tem saldo_reembolsar. PAINEL não tem. Onde está?")
# Checa se existe em REEMBOLSO
remb = conn.execute('SELECT * FROM controle_reembolso').fetchall()
remb_by_cpf = {}
for r in remb:
    cpf = r['cpf']
    if cpf not in remb_by_cpf:
        remb_by_cpf[cpf] = []
    remb_by_cpf[cpf].append(dict(r))

print(f"REEMBOLSO: {len(remb)} linhas, {len(remb_by_cpf)} CPFs únicos")
sample_with_saldo = [(cpf, c) for cpf, c in carga.items() if c['saldo_reembolsar'] and float(c['saldo_reembolsar'] or 0) > 0][:5]
print(f"Amostras com saldo_reembolsar > 0: {len([c for c in carga.values() if float(c['saldo_reembolsar'] or 0) > 0])}")
for cpf, c in sample_with_saldo:
    r_list = remb_by_cpf.get(cpf, [])
    total_remb = sum(float(r['valor'] or 0) for r in r_list)
    print(f"  CPF {cpf}: carga_saldo_remb={c['saldo_reembolsar']} | reembolso_soma={total_remb} | entradas={len(r_list)}")

# --- ADIANTAMENTO: de onde vem? ---
print("\n=== INVESTIGANDO adiantamento ===")
adic = conn.execute('SELECT * FROM controle_adicionais').fetchall()
adic_by_cpf = {}
for r in adic:
    cpf = r['cpf']
    if cpf not in adic_by_cpf:
        adic_by_cpf[cpf] = []
    adic_by_cpf[cpf].append(dict(r))

itau = conn.execute('SELECT * FROM controle_adicional_itau').fetchall()
itau_by_cpf = {}
for r in itau:
    cpf = str(r['cpf']).split('.')[0]
    if cpf not in itau_by_cpf:
        itau_by_cpf[cpf] = []
    itau_by_cpf[cpf].append(dict(r))

sample_with_adic = [(cpf, c) for cpf, c in carga.items() if c['adiantamento'] and float(c['adiantamento'] or 0) != 0][:5]
print(f"Amostras com adiantamento != 0: {len(sample_with_adic)}")
for cpf, c in sample_with_adic[:5]:
    a_list = adic_by_cpf.get(cpf, [])
    soma_adic = sum(float(r['valor'] or 0) for r in a_list)
    p_adic = painel.get(cpf, {}).get('adicionais')
    print(f"  CPF {cpf}: carga_adiant={c['adiantamento']} | soma_adicionais={soma_adic} | painel_adicionais={p_adic}")

print("\n=== VERIFICANDO: painel.adicionais == carga.adiantamento? ===")
matches = 0
mismatches = 0
for cpf, c in carga.items():
    p = painel.get(cpf, {})
    carga_val = str(c.get('adiantamento') or '')
    painel_val = str(p.get('adicionais') or '')
    if carga_val and painel_val:
        if carga_val == painel_val:
            matches += 1
        else:
            mismatches += 1
            if mismatches <= 3:
                print(f"  CPF {cpf}: carga={carga_val} | painel={painel_val}")
print(f"  matches={matches}, mismatches={mismatches}")

print("\n=== EXTRATO: tipos de transação ===")
ext_tipos = conn.execute("SELECT tipo, COUNT(*) as cnt, SUM(CAST(valor AS REAL)) as total FROM controle_extrato GROUP BY tipo").fetchall()
for t in ext_tipos:
    print(f"  tipo={t['tipo']}: {t['cnt']} transações, total={t['total']:.2f}")

print("\n=== VERIFICANDO: painel.saldo_final vs carga.saldo_final ===")
m, mm = 0, 0
for cpf, c in carga.items():
    p = painel.get(cpf, {})
    cv = str(c.get('saldo_final') or '')
    pv = str(p.get('saldo_final') or '')
    if cv and pv:
        if cv == pv:
            m += 1
        else:
            mm += 1
            if mm <= 3:
                print(f"  CPF {cpf}: carga={cv} | painel={pv}")
print(f"  matches={m}, mismatches={mm}")

print("\n=== VERIFICANDO: sc_resumo.valor vs carga.saldo_cartao ===")
m, mm = 0, 0
for cpf, c in carga.items():
    sc = sc_resumo.get(cpf, {})
    cv = str(c.get('saldo_cartao') or '')
    sv = str(sc.get('valor') or '')
    if cv and sv:
        if cv == sv:
            m += 1
        else:
            mm += 1
            if mm <= 3:
                print(f"  CPF {cpf}: carga={cv} | sc_resumo={sv}")
print(f"  matches={m}, mismatches={mm}")
