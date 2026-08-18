"""
Investiga a origem de 'reembolso' na carga_qz.
Não bate com controle_reembolso total nem metade.
Testa: controle_base_prestacoes, controle_painel, controle_extrato filtrado por período.
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

# Pega os 5 primeiros com reembolso != 0
rows = conn.execute(
    "SELECT cpf, colaborador, reembolso, saldo_reembolsar FROM carga_1qz_planilha1 WHERE CAST(reembolso AS REAL) != 0 LIMIT 5"
).fetchall()

# Colunas disponíveis nas tabelas de controle
bp_cols = [r[1] for r in conn.execute("PRAGMA table_info(controle_base_prestacoes)").fetchall()]
ext_cols = [r[1] for r in conn.execute("PRAGMA table_info(controle_extrato)").fetchall()]
print(f"controle_base_prestacoes cols: {bp_cols}")
print(f"controle_extrato cols: {ext_cols}")
print()

for r in rows:
    cpf = r['cpf']
    carga_reimb = float(r['reembolso'])
    print(f"\n{'='*55}")
    print(f"  {r['colaborador']} | reembolso={carga_reimb}")

    # controle_base_prestacoes — tem campo reembolso?
    if 'reembolso' in bp_cols or 'valor_reembolso' in bp_cols:
        campo = 'reembolso' if 'reembolso' in bp_cols else 'valor_reembolso'
        bp = conn.execute(f"SELECT SUM(CAST([{campo}] AS REAL)) FROM controle_base_prestacoes WHERE cpf=?", (cpf,)).fetchone()[0]
        print(f"  sum(controle_base_prestacoes.{campo}) = {bp}")

    # controle_extrato filtrado (pode ter mês específico)
    ext_all = conn.execute("SELECT valor, data, mês FROM controle_extrato WHERE cpf=?", (cpf,)).fetchall()
    ext_sum = sum(float(e['valor'] or 0) for e in ext_all)
    print(f"  sum(controle_extrato.valor) total = {ext_sum:.2f} | linhas={len(ext_all)}")
    # Filtro só maio 2026
    ext_maio = [e for e in ext_all if e['mês'] and 'MAIO' in str(e['mês']).upper()]
    ext_maio_sum = sum(float(e['valor'] or 0) for e in ext_maio)
    print(f"  sum(controle_extrato.valor) maio  = {ext_maio_sum:.2f} | linhas={len(ext_maio)}")

    # controle_reembolso por CPF + mês MAIO
    reimb_all = conn.execute("SELECT valor, mês FROM controle_reembolso WHERE cpf=?", (cpf,)).fetchall()
    reimb_sum_all = sum(float(e['valor'] or 0) for e in reimb_all)
    reimb_maio = [e for e in reimb_all if e['mês'] and 'MAIO' in str(e['mês']).upper()]
    reimb_maio_sum = sum(float(e['valor'] or 0) for e in reimb_maio)
    print(f"  sum(controle_reembolso.valor) total = {reimb_sum_all:.2f} | linhas={len(reimb_all)}")
    print(f"  sum(controle_reembolso.valor) maio  = {reimb_maio_sum:.2f} | linhas={len(reimb_maio)}")
    if reimb_all:
        for e in reimb_all:
            print(f"    reembolso linha: valor={e['valor']} mês={e['mês']}")

    # controle_painel — tem campo reembolso ou relacionado?
    painel_cols = [r2[1] for r2 in conn.execute("PRAGMA table_info(controle_painel)").fetchall()]
    p = conn.execute("SELECT * FROM controle_painel WHERE cpf=?", (cpf,)).fetchone()
    if p:
        p_dict = dict(p)
        for k in ['prestação_de_contas', 'saldo_prestação', 'saldo_cartao', 'saldo_final']:
            print(f"  painel.{k} = {p_dict.get(k)}")

    # controle_base_prestacoes — amostra de linhas do CPF
    bp_rows = conn.execute(
        "SELECT * FROM controle_base_prestacoes WHERE user_cpf=? OR cpf=? LIMIT 3",
        (cpf, cpf)
    ).fetchall()
    if bp_rows:
        print(f"  controle_base_prestacoes ({len(bp_rows)} linhas amostra):")
        for b in bp_rows:
            print(f"    {dict(b)}")
    else:
        # Tentar por nome
        nome = r['colaborador'].split()[0]
        bp_nome = conn.execute(
            "SELECT * FROM controle_base_prestacoes WHERE colaborador LIKE ? LIMIT 2",
            (f"%{nome}%",)
        ).fetchall()
        if bp_nome:
            print(f"  controle_base_prestacoes por nome ({len(bp_nome)} linhas):")
            for b in bp_nome:
                print(f"    {dict(b)}")
        else:
            print("  controle_base_prestacoes: CPF não encontrado")
