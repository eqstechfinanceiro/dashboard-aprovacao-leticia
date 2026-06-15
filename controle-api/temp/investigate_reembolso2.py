"""
Investiga reembolso focando em controle_base_prestacoes (reembolsável=Sim) e expenses filtradas.
A chave em base_prestacoes é 'cpf' (CPF do usuário, não do estabelecimento).
"""
import sqlite3

conn = sqlite3.connect('data/spreadsheets.db')
conn.row_factory = sqlite3.Row

rows = conn.execute(
    "SELECT cpf, colaborador, reembolso FROM carga_1qz_planilha1 WHERE CAST(reembolso AS REAL) != 0 LIMIT 5"
).fetchall()

for r in rows:
    cpf = r['cpf']
    carga_reimb = float(r['reembolso'])
    print(f"\n{'='*60}")
    print(f"  {r['colaborador']} | carga.reembolso = {carga_reimb:.4f}")

    # 1. controle_base_prestacoes onde reembolsável = 'Sim' por CPF
    bp_sim = conn.execute(
        "SELECT SUM(CAST(valor AS REAL)) as t, COUNT(*) as n FROM controle_base_prestacoes WHERE cpf=? AND LOWER(reembolsável) LIKE '%sim%'",
        (cpf,)
    ).fetchone()
    bp_nao = conn.execute(
        "SELECT SUM(CAST(valor AS REAL)) as t, COUNT(*) as n FROM controle_base_prestacoes WHERE cpf=? AND (LOWER(reembolsável) LIKE '%n%o%' OR reembolsável='0')",
        (cpf,)
    ).fetchone()
    bp_all = conn.execute(
        "SELECT SUM(CAST(valor AS REAL)) as t, COUNT(*) as n FROM controle_base_prestacoes WHERE cpf=?",
        (cpf,)
    ).fetchone()
    print(f"  base_prestacoes total: sum={bp_all['t']:.4f if bp_all['t'] else 0} n={bp_all['n']}")
    print(f"  base_prestacoes reembolsável=Sim: sum={bp_sim['t']:.4f if bp_sim['t'] else 0} n={bp_sim['n']}")
    print(f"  base_prestacoes reembolsável=Não: sum={bp_nao['t']:.4f if bp_nao['t'] else 0} n={bp_nao['n']}")

    # Ver amostra de linhas para entender reembolsável
    bp_sample = conn.execute(
        "SELECT valor, reembolsável, mês, tipo_de_despesa FROM controle_base_prestacoes WHERE cpf=? LIMIT 3",
        (cpf,)
    ).fetchall()
    for b in bp_sample:
        print(f"    amostra: valor={b['valor']} reembolsável={b['reembolsável']} mês={b['mês']} tipo={b['tipo_de_despesa']}")

    # 2. expenses reembolsável=1 por CPF
    exp_reimb = conn.execute(
        "SELECT SUM(CAST(value AS REAL)) as t, COUNT(*) as n FROM expenses WHERE user_cpf=? AND reimbursable=1",
        (cpf,)
    ).fetchone()
    exp_all = conn.execute(
        "SELECT SUM(CAST(value AS REAL)) as t FROM expenses WHERE user_cpf=?",
        (cpf,)
    ).fetchone()
    print(f"  expenses reimbursable=1: sum={exp_reimb['t']:.4f if exp_reimb['t'] else 0} n={exp_reimb['n']}")
    print(f"  expenses total: sum={exp_all['t']:.4f if exp_all['t'] else 0}")

    # 3. Hipótese: soma de expenses NÃO reembolsáveis = o que vai pro cartão = o "reembolso" seria o reembolsável
    exp_nao = conn.execute(
        "SELECT SUM(CAST(value AS REAL)) as t FROM expenses WHERE user_cpf=? AND reimbursable=0",
        (cpf,)
    ).fetchone()
    print(f"  expenses reimbursable=0: sum={exp_nao['t']:.4f if exp_nao['t'] else 0}")

    # 4. Check direto: base_prestacoes reembolsável=Sim filtrado por maio 2026
    bp_maio = conn.execute(
        "SELECT SUM(CAST(valor AS REAL)) as t, COUNT(*) as n FROM controle_base_prestacoes WHERE cpf=? AND LOWER(reembolsável) LIKE '%sim%' AND mês='MAIO'",
        (cpf,)
    ).fetchone()
    print(f"  base_prestacoes reembolsável=Sim+MAIO: sum={bp_maio['t']:.4f if bp_maio['t'] else 0} n={bp_maio['n']}")

    # 5. expenses reimbursable=1 filtrado por maio 2026
    exp_maio = conn.execute(
        "SELECT SUM(CAST(value AS REAL)) as t, COUNT(*) as n FROM expenses WHERE user_cpf=? AND reimbursable=1 AND data LIKE '2026-05%'",
        (cpf,)
    ).fetchone()
    print(f"  expenses reimbursable=1+maio2026: sum={exp_maio['t']:.4f if exp_maio['t'] else 0} n={exp_maio['n']}")

    # Diagnóstico
    candidates = {
        'bp_sim_total': bp_sim['t'] or 0,
        'bp_sim_maio': bp_maio['t'] or 0,
        'exp_reimb_total': exp_reimb['t'] or 0,
        'exp_reimb_maio': exp_maio['t'] or 0,
    }
    for label, val in candidates.items():
        match = abs(float(val) - carga_reimb) < 0.02
        print(f"  {'✅' if match else '  '} {label} = {val:.4f}")
